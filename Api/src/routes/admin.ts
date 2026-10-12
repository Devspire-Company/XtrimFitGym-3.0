import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  Account, Announcement, AttendanceLock, AttendanceRecord, AttendanceStation, AuditLog, AuthSession, CashClosing, Coach, CoachAttendance, CoachNfcCard, GymSettings,
  Member, Membership, MembershipLock, MembershipPlan, NfcCard, Notification, Payment, WalkInProfile, WalkInVisit,
} from '../models.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { asyncRoute, HttpError } from '../http.js';
import { calculatePausedTime, calculateResumedExpiry, extendActiveMembership } from '../membership-lifecycle.js';
import { membershipPricing, planIsEligible, type MemberType, type PlanEligibility } from '../membership-pricing.js';
import { requireReadyAccount, requireRoles } from '../middleware.js';
import { addDays, hashPassword, memberNumber, normalizeCardUid, normalizeUsername, portalTokenHash, randomToken, reference, temporaryPassword } from '../security.js';
import { DAY_MILLISECONDS, DEFAULT_WEEKLY_HOURS, WEEKDAYS, manilaDateKey, manilaDayBounds, manilaMonthBounds, manilaWeekBounds, resolveGymAvailability } from '../manila-time.js';
import { createNotification, notifyOwners, syncOperationalNotifications } from '../notifications.js';
import { calculateCashClosing, cashCollectionSummary, lockCashDay, lockOpenCashDay } from '../cash-closing.js';

export const adminRouter = Router();
adminRouter.use(requireRoles('OWNER', 'ADMIN'), requireReadyAccount);

const id = z.string().regex(/^[a-f\d]{24}$/i);
const mobileNumber = z.string().trim().transform((value) => value.replace(/\D/g, '')).refine((value) => /^09\d{9}$/.test(value), 'Enter a valid 11-digit Philippine mobile number.');
const optionalMobileNumber = z.string().trim().transform((value) => value.replace(/\D/g, '')).refine((value) => !value || /^09\d{9}$/.test(value), 'Enter a valid 11-digit Philippine mobile number.').optional();
const emergencyContact = z.object({ name: z.string().trim().min(1).max(120), relationship: z.string().trim().min(1).max(40), phone: mobileNumber });
const person = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: optionalMobileNumber, email: z.string().trim().email().optional() });
const lifecycleReason = z.object({ reason: z.string().trim().min(3).max(300) });
const memberType = z.enum(['STUDENT', 'REGULAR']);
const planEligibility = z.enum(['ALL', 'STUDENT', 'REGULAR']);
const coachDay = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
const coachTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid time.');
const coachScheduleEntry = z.object({ day: coachDay, startTime: coachTime, endTime: coachTime })
  .refine((entry) => entry.endTime > entry.startTime, { message: 'End time must be later than start time.', path: ['endTime'] });
const coachProfile = person.extend({
  specialties: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  availabilitySchedule: z.array(coachScheduleEntry).min(1).max(7)
    .refine((entries) => new Set(entries.map((entry) => entry.day)).size === entries.length, 'Choose each availability day only once.'),
  isPublished: z.boolean().default(true),
});
const coachDayLabels: Record<z.infer<typeof coachDay>, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};
function coachTimeLabel(value: string) {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function coachAvailabilityLabel(entries: z.infer<typeof coachScheduleEntry>[]) {
  return entries.map((entry) => `${coachDayLabels[entry.day]} ${coachTimeLabel(entry.startTime)}–${coachTimeLabel(entry.endTime)}`).join('; ');
}
function assertPlanEligibility(plan: any, type: MemberType, studentVerified: boolean) {
  if (!planIsEligible((plan.eligibility ?? 'ALL') as PlanEligibility, type)) throw new HttpError(409, 'The selected membership plan is not available for this member type.');
  if (type === 'STUDENT' && !studentVerified) throw new HttpError(400, 'Verify the member\'s student ID before using student pricing.');
}

async function expireDueMemberships(memberId?: string) {
  const filter: Record<string, unknown> = { status: 'ACTIVE', expiresAt: { $lte: new Date() } };
  if (memberId) filter.memberId = memberId;
  await Membership.updateMany(filter, { $set: { status: 'EXPIRED', statusChangedAt: new Date(), statusReason: 'Membership term completed.' } });
}

function membershipResponse(row: any) {
  return {
    id: String(row._id), planId: String(row.planId), planName: row.planName, pricePaid: row.pricePaid,
    startsAt: row.startsAt, expiresAt: row.expiresAt, status: row.status, pausedAt: row.pausedAt ?? undefined,
    remainingMillisecondsAtPause: row.remainingMillisecondsAtPause ?? undefined,
    statusReason: row.statusReason ?? undefined, createdAt: row.createdAt,
  };
}
function regexLiteral(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function notificationResponse(row: any) {
  return {
    id: String(row._id), type: row.type, tone: row.tone, title: row.title, message: row.message,
    actionUrl: row.actionUrl ?? undefined, readAt: row.readAt ?? undefined, createdAt: row.createdAt,
  };
}

function cashClosingResponse(row: any) {
  const actorName = (actor: any) => actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown';
  return {
    id: String(row._id), businessDate: row.businessDate, status: row.status,
    openingCash: row.openingCash, cashCollected: row.cashCollected, expectedCash: row.expectedCash,
    countedCash: row.countedCash, variance: row.variance, paymentCount: row.paymentCount,
    notes: row.notes ?? '', closedAt: row.closedAt, closedBy: actorName(row.closedBy),
    voidedAt: row.voidedAt ?? undefined, voidedBy: row.voidedBy ? actorName(row.voidedBy) : undefined,
    voidReason: row.voidReason ?? undefined,
  };
}

adminRouter.get('/notifications', asyncRoute(async (req, res) => {
  await syncOperationalNotifications(req.auth!.accountId);
  const [rows, unread] = await Promise.all([
    Notification.find({ recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null }).sort({ createdAt: -1 }).limit(40).lean<any[]>(),
    Notification.countDocuments({ recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null, readAt: null }),
  ]);
  res.json({ unread, items: rows.map(notificationResponse) });
}));

adminRouter.patch('/notifications/read-all', asyncRoute(async (req, res) => {
  await Notification.updateMany({ recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null, readAt: null }, { $set: { readAt: new Date() } });
  res.status(204).end();
}));

adminRouter.delete('/notifications/read', asyncRoute(async (req, res) => {
  await Notification.updateMany({ recipientAccountId: req.auth!.accountId, readAt: { $ne: null }, deletedAt: null }, { $set: { deletedAt: new Date() } });
  res.status(204).end();
}));

adminRouter.patch('/notifications/:notificationId/read', asyncRoute(async (req, res) => {
  const notificationId = id.parse(req.params.notificationId);
  const row = await Notification.findOneAndUpdate({ _id: notificationId, recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null }, { $set: { readAt: new Date() } }, { new: true });
  if (!row) throw new HttpError(404, 'Notification not found.');
  res.json(notificationResponse(row));
}));

adminRouter.delete('/notifications/:notificationId', asyncRoute(async (req, res) => {
  const notificationId = id.parse(req.params.notificationId);
  const row = await Notification.findOneAndUpdate({ _id: notificationId, recipientAccountId: req.auth!.accountId, deletedAt: null }, { $set: { deletedAt: new Date() } });
  if (!row) throw new HttpError(404, 'Notification not found.');
  res.status(204).end();
}));

adminRouter.get('/dashboard', asyncRoute(async (_req, res) => {
  const now = new Date();
  const today = manilaDayBounds(manilaDateKey(now));
  const soon = addDays(now, 7);
  const [activeMembers, attendanceToday, walkInsToday, payments, expiringSoon, cardsPending, activity] = await Promise.all([
    Membership.countDocuments({ status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }),
    AttendanceRecord.countDocuments({ recordedAt: { $gte: today.start, $lt: today.end } }),
    WalkInVisit.countDocuments({ visitedAt: { $gte: today.start, $lt: today.end } }),
    Payment.aggregate([{ $match: { status: 'COMPLETED', receivedAt: { $gte: today.start, $lt: today.end } } }, { $group: { _id: null, total: { $sum: '$amountDue' } } }]),
    Membership.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: now, $lte: soon } }),
    Member.aggregate([{ $match: { status: 'ACTIVE' } }, { $lookup: { from: 'nfccards', let: { mid: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$memberId', '$$mid'] }, { $eq: ['$status', 'ACTIVE'] }] } } }], as: 'cards' } }, { $match: { cards: { $size: 0 } } }, { $count: 'count' }]),
    AuditLog.find().sort({ occurredAt: -1 }).limit(8).lean<any[]>(),
  ]);
  res.json({ activeMembers, attendanceToday, walkInsToday, cashToday: payments[0]?.total ?? 0, cardsPending: cardsPending[0]?.count ?? 0, expiringSoon,
    recentActivity: activity.map((row) => ({ id: String(row._id), label: String(row.action).replaceAll('_', ' '), detail: `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ''}`, occurredAt: row.occurredAt })) });
}));

adminRouter.get('/reports', asyncRoute(async (req, res) => {
  await expireDueMemberships();
  const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00+08:00`);
    return !Number.isNaN(parsed.getTime()) && manilaDateKey(parsed) === value;
  }, 'Choose a valid date.');
  const reportQuery = z.object({
    days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), 'Choose a 7, 30, or 90 day report.').optional(),
    from: reportDate.optional(),
    to: reportDate.optional(),
  }).refine((value) => Boolean(value.from) === Boolean(value.to), 'Choose both a start and end date.').parse(req.query);
  const todayStart = manilaDayBounds(manilaDateKey()).start;
  const presetDays = reportQuery.from ? undefined : (reportQuery.days ?? 30);
  const fromKey = reportQuery.from ?? manilaDateKey(new Date(todayStart.getTime() - (((presetDays ?? 30) - 1) * DAY_MILLISECONDS)));
  const toKey = reportQuery.to ?? manilaDateKey(todayStart);
  if (fromKey > toKey) throw new HttpError(400, 'The report start date must be before the end date.');
  if (toKey > manilaDateKey()) throw new HttpError(400, 'Reports cannot include future dates.');
  const start = manilaDayBounds(fromKey).start;
  const end = manilaDayBounds(toKey).end;
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MILLISECONDS);
  if (days < 1 || days > 366) throw new HttpError(400, 'Choose a report range of 1 to 366 days.');
  const currentMonth = manilaMonthBounds();
  const currentMonthKey = manilaDateKey(currentMonth.start);
  const currentYear = Number(currentMonthKey.slice(0, 4)); const currentMonthNumber = Number(currentMonthKey.slice(5, 7));
  const monthlyStartIndex = (currentYear * 12) + currentMonthNumber - 12;
  const monthlyStartYear = Math.floor(monthlyStartIndex / 12); const monthlyStartMonth = (monthlyStartIndex % 12) + 1;
  const monthlyStart = new Date(`${monthlyStartYear}-${String(monthlyStartMonth).padStart(2, '0')}-01T00:00:00+08:00`);
  const dateExpression = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: 'Asia/Manila' } });
  const monthExpression = (field: string) => ({ $dateToString: { format: '%Y-%m', date: field, timezone: 'Asia/Manila' } });
  const [paymentsByDay, attendanceByDay, walkInsByDay, membersByDay, paymentTypes, membershipStatuses, topPlans, activeMemberships, membershipsByMonth, walkInsByMonth] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'COMPLETED', receivedAt: { $gte: start, $lt: end } } },
      { $group: { _id: dateExpression('$receivedAt'), revenue: { $sum: '$amountDue' }, transactions: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AttendanceRecord.aggregate([
      { $match: { recordedAt: { $gte: start, $lt: end } } },
      { $group: { _id: dateExpression('$recordedAt'), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    WalkInVisit.aggregate([
      { $match: { status: 'ACTIVE', visitedAt: { $gte: start, $lt: end } } },
      { $group: { _id: dateExpression('$visitedAt'), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Member.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: dateExpression('$createdAt'), count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { status: 'COMPLETED', receivedAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$type', amount: { $sum: '$amountDue' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Membership.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Membership.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$planName', count: { $sum: 1 }, value: { $sum: '$pricePaid' } } },
      { $sort: { count: -1, value: -1 } },
      { $limit: 5 },
    ]),
    Membership.countDocuments({ status: 'ACTIVE', startsAt: { $lte: new Date() }, expiresAt: { $gt: new Date() } }),
    Membership.aggregate([{ $match: { createdAt: { $gte: monthlyStart, $lt: currentMonth.end } } }, { $group: { _id: monthExpression('$createdAt'), count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    WalkInVisit.aggregate([{ $match: { status: 'ACTIVE', visitedAt: { $gte: monthlyStart, $lt: currentMonth.end } } }, { $group: { _id: monthExpression('$visitedAt'), count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  const paymentDayMap = new Map(paymentsByDay.map((row) => [String(row._id), row]));
  const attendanceDayMap = new Map(attendanceByDay.map((row) => [String(row._id), Number(row.count)]));
  const walkInDayMap = new Map(walkInsByDay.map((row) => [String(row._id), Number(row.count)]));
  const memberDayMap = new Map(membersByDay.map((row) => [String(row._id), Number(row.count)]));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = manilaDateKey(new Date(start.getTime() + (index * DAY_MILLISECONDS)));
    const payment = paymentDayMap.get(date);
    return { date, revenue: Number(payment?.revenue ?? 0), transactions: Number(payment?.transactions ?? 0), attendance: attendanceDayMap.get(date) ?? 0, walkIns: walkInDayMap.get(date) ?? 0, newMembers: memberDayMap.get(date) ?? 0 };
  });
  const revenueBreakdown = ['MEMBERSHIP', 'WALK_IN', 'CARD_REPLACEMENT'].map((type) => {
    const row = paymentTypes.find((item) => item._id === type);
    return { type, amount: Number(row?.amount ?? 0), count: Number(row?.count ?? 0) };
  });
  const statusCounts = Object.fromEntries(['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'].map((status) => [status.toLowerCase(), Number(membershipStatuses.find((row) => row._id === status)?.count ?? 0)]));
  const membershipMonthMap = new Map(membershipsByMonth.map((row) => [String(row._id), Number(row.count)]));
  const walkInMonthMap = new Map(walkInsByMonth.map((row) => [String(row._id), Number(row.count)]));
  const monthlyActivity = Array.from({ length: 12 }, (_, index) => {
    const absoluteMonth = monthlyStartIndex + index; const year = Math.floor(absoluteMonth / 12); const month = (absoluteMonth % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { month: key, memberships: membershipMonthMap.get(key) ?? 0, walkIns: walkInMonthMap.get(key) ?? 0 };
  });
  res.json({
    period: { days, preset: presetDays, from: fromKey, to: toKey },
    summary: {
      revenue: daily.reduce((total, row) => total + row.revenue, 0), transactions: daily.reduce((total, row) => total + row.transactions, 0),
      attendance: daily.reduce((total, row) => total + row.attendance, 0), walkIns: daily.reduce((total, row) => total + row.walkIns, 0),
      newMembers: daily.reduce((total, row) => total + row.newMembers, 0), activeMemberships,
    },
    daily, monthlyActivity, revenueBreakdown, membershipStatus: statusCounts,
    topPlans: topPlans.map((row) => ({ name: row._id || 'Unnamed plan', count: Number(row.count), value: Number(row.value) })),
  });
}));

adminRouter.get('/members', asyncRoute(async (req, res) => {
  await expireDueMemberships();
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(10).max(100).default(25), search: z.string().trim().max(100).default(''), status: z.enum(['ACTIVE', 'DISABLED']).optional() }).parse(req.query);
  const escapedSearch = regexLiteral(input.search);
  const filter: Record<string, any> = input.search ? { $or: [
    { firstName: { $regex: escapedSearch, $options: 'i' } }, { lastName: { $regex: escapedSearch, $options: 'i' } },
    { memberNumber: { $regex: escapedSearch, $options: 'i' } }, { phone: { $regex: escapedSearch, $options: 'i' } },
  ] } : {};
  if (input.status) filter.status = input.status;
  const [members, total] = await Promise.all([Member.find(filter).sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(), Member.countDocuments(filter)]);
  const memberIds = members.map((row) => row._id);
  const [memberships, cards] = await Promise.all([
    Membership.find({ memberId: { $in: memberIds } }).sort({ startsAt: -1 }).lean<any[]>(),
    NfcCard.find({ memberId: { $in: memberIds }, status: 'ACTIVE' }).lean<any[]>(),
  ]);
  const latest = new Map<string, any>(); memberships.forEach((row) => { if (!latest.has(String(row.memberId))) latest.set(String(row.memberId), row); });
  const cardMap = new Map(cards.map((row) => [String(row.memberId), row.status]));
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: members.map((row) => { const membership = latest.get(String(row._id)); return { id: String(row._id), memberNumber: row.memberNumber, fullName: `${row.firstName} ${row.lastName}`, phone: row.phone ?? undefined, status: row.status, membership: membership ? { plan: membership.planName, status: membership.status, expiresAt: membership.expiresAt } : undefined, cardStatus: cardMap.get(String(row._id)) ?? 'UNASSIGNED' }; }) });
}));

adminRouter.get('/members/:memberId', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId);
  await expireDueMemberships(memberId);
  const [member, account, memberships, payments, attendance, cards] = await Promise.all([
    Member.findById(memberId).lean<any>(),
    Account.findOne({ memberId }).lean<any>(),
    Membership.find({ memberId }).sort({ startsAt: -1, createdAt: -1 }).lean<any[]>(),
    Payment.find({ memberId }).sort({ receivedAt: -1 }).limit(100).lean<any[]>(),
    AttendanceRecord.find({ memberId }).sort({ recordedAt: -1 }).limit(100).lean<any[]>(),
    NfcCard.find({ memberId }).sort({ assignedAt: -1 }).lean<any[]>(),
  ]);
  if (!member) throw new HttpError(404, 'Member not found.');
  res.json({
    member: {
      id: String(member._id), memberNumber: member.memberNumber, firstName: member.firstName, lastName: member.lastName,
      phone: member.phone ?? '', email: member.email ?? '', birthDate: member.birthDate ?? undefined,
      emergencyContact: member.emergencyContact ?? '', status: member.status, sourceWalkInProfileId: member.sourceWalkInProfileId ? String(member.sourceWalkInProfileId) : undefined,
      memberType: member.memberType ?? 'REGULAR', studentIdVerified: Boolean(member.studentVerifiedAt),
      createdAt: member.createdAt,
    },
    account: account ? { id: String(account._id), username: account.username, isActive: account.isActive, mustChangePassword: account.mustChangePassword, lastLoginAt: account.lastLoginAt ?? undefined } : undefined,
    memberships: memberships.map(membershipResponse),
    payments: payments.map((row) => ({ id: String(row._id), reference: row.reference, type: row.type, amountDue: row.amountDue, planAmount: row.planAmount ?? row.amountDue, membershipFee: row.membershipFee ?? 0, amountReceived: row.amountReceived, change: row.change, status: row.status, notes: row.notes, receivedAt: row.receivedAt })),
    attendance: attendance.map((row) => ({ id: String(row._id), status: !row.attendanceDate ? 'VISIT RECORDED' : row.checkedOutAt ? 'CHECKED OUT' : 'CHECKED IN', stationId: row.stationId, recordedAt: row.recordedAt, checkedOutAt: row.checkedOutAt ?? undefined })),
    cards: cards.map((row) => ({ id: String(row._id), uid: row.uid, status: row.status, assignedAt: row.assignedAt, revokedAt: row.revokedAt ?? undefined, revokeReason: row.revokeReason ?? undefined })),
  });
}));

adminRouter.put('/members/:memberId', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId);
  const input = person.extend({ birthDate: z.coerce.date().nullable().optional(), emergencyContact, memberType: memberType.optional(), studentIdVerified: z.boolean().optional() }).parse(req.body);
  if (input.memberType === 'STUDENT' && !input.studentIdVerified) throw new HttpError(400, 'Verify the member\'s student ID before assigning student status.');
  const duplicateFilters: Record<string, unknown>[] = [];
  if (input.phone) duplicateFilters.push({ phone: input.phone });
  if (input.email) duplicateFilters.push({ email: input.email.toLowerCase() });
  if (duplicateFilters.length && await Member.exists({ _id: { $ne: memberId }, $or: duplicateFilters })) throw new HttpError(409, 'Another member already uses that phone number or email address.');
  const session = await mongoose.startSession();
  let member: any;
  try {
    await session.withTransaction(async () => {
      const memberTypeUpdate = input.memberType ? { memberType: input.memberType, studentVerifiedAt: input.memberType === 'STUDENT' ? new Date() : null, studentVerifiedBy: input.memberType === 'STUDENT' ? req.auth!.accountId : null } : {};
      member = await Member.findByIdAndUpdate(memberId, { firstName: input.firstName, lastName: input.lastName, phone: input.phone || null, email: input.email?.toLowerCase() || null, birthDate: input.birthDate ?? null, emergencyContact: input.emergencyContact, ...memberTypeUpdate }, { new: true, session });
      if (!member) throw new HttpError(404, 'Member not found.');
      await Account.updateOne({ memberId }, { firstName: input.firstName, lastName: input.lastName }, { session });
      await audit(req.auth!.accountId, 'MEMBER_PROFILE_UPDATED', 'Member', memberId, input.memberType ? { memberType: input.memberType, studentIdVerified: input.studentIdVerified } : {}, session);
    });
  } finally { await session.endSession(); }
  res.json({ id: String(member._id), firstName: member.firstName, lastName: member.lastName });
}));

adminRouter.patch('/members/:memberId/status', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId);
  const { status, reason } = z.object({ status: z.enum(['ACTIVE', 'DISABLED']), reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const session = await mongoose.startSession();
  let member: any;
  try {
    await session.withTransaction(async () => {
      member = await Member.findByIdAndUpdate(memberId, { status }, { new: true, session });
      if (!member) throw new HttpError(404, 'Member not found.');
      const account = await Account.findOneAndUpdate({ memberId }, { isActive: status === 'ACTIVE' }, { new: true, session });
      if (account && status === 'DISABLED') await AuthSession.deleteMany({ accountId: account._id }, { session });
      await audit(req.auth!.accountId, status === 'ACTIVE' ? 'MEMBER_ENABLED' : 'MEMBER_DISABLED', 'Member', memberId, { reason }, session);
    });
  } finally { await session.endSession(); }
  res.json({ id: memberId, status: member.status });
}));

adminRouter.post('/members/:memberId/reset-password', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId);
  const member = await Member.findById(memberId).lean<any>();
  if (!member) throw new HttpError(404, 'Member not found.');
  if (member.status !== 'ACTIVE') throw new HttpError(409, 'Enable the member before resetting their password.');
  const account = await Account.findOne({ memberId, role: 'MEMBER' }).select('+passwordHash');
  if (!account) throw new HttpError(404, 'Member login account not found.');
  const password = temporaryPassword();
  account.passwordHash = await hashPassword(password); account.mustChangePassword = true; account.isActive = true;
  await account.save(); await AuthSession.deleteMany({ accountId: account._id });
  await audit(req.auth!.accountId, 'MEMBER_PASSWORD_RESET', 'Account', String(account._id), { memberId });
  res.json({ username: account.username, temporaryPassword: password });
}));

adminRouter.post('/members/:memberId/memberships/renew', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId);
  const input = z.object({ planId: id, amountReceived: z.number().nonnegative(), notes: z.string().trim().max(500).optional() }).parse(req.body);
  await expireDueMemberships(memberId);
  const [member, plan] = await Promise.all([Member.findById(memberId).lean<any>(), MembershipPlan.findOne({ _id: input.planId, isActive: true }).lean<any>()]);
  if (!member) throw new HttpError(404, 'Member not found.');
  if (!plan) throw new HttpError(404, 'The selected membership plan is not available.');
  assertPlanEligibility(plan, (member.memberType ?? 'REGULAR') as MemberType, Boolean(member.studentVerifiedAt));
  const settings = await GymSettings.findOne({ key: 'primary' }).lean<any>();
  const session = await mongoose.startSession();
  let output: any;
  try {
    await session.withTransaction(async () => {
      await lockOpenCashDay(session);
      await MembershipLock.findOneAndUpdate({ _id: member._id }, { $set: { touchedAt: new Date() } }, { upsert: true, new: true, session });
      const hasMembershipHistory = Boolean(await Membership.exists({ memberId }).session(session));
      const pricing = membershipPricing(plan.price, settings?.firstMembershipFee ?? 100, !hasMembershipHistory);
      if (input.amountReceived < pricing.totalDue) throw new HttpError(400, 'Cash received is below the total amount due.');
      let membership: any = await Membership.findOne({ memberId, status: { $in: ['ACTIVE', 'PAUSED'] } }).session(session);
      if (membership && String(membership.planId) !== String(plan._id)) throw new HttpError(409, 'Cancel the current membership before switching to a different plan. Renewals of an open membership must use its current plan.');
      if (membership?.status === 'ACTIVE') membership.expiresAt = extendActiveMembership(membership.expiresAt, plan.durationDays);
      else if (membership?.status === 'PAUSED') membership.remainingMillisecondsAtPause = (membership.remainingMillisecondsAtPause ?? 0) + plan.durationDays * DAY_MILLISECONDS;
      else {
        [membership] = await Membership.create([{ memberId, planId: plan._id, planName: plan.name, pricePaid: plan.price, startsAt: new Date(), expiresAt: addDays(new Date(), plan.durationDays), status: 'ACTIVE', activatedBy: req.auth!.accountId }], { session });
      }
      membership.pricePaid = plan.price; membership.statusChangedAt = new Date(); membership.statusChangedBy = new mongoose.Types.ObjectId(req.auth!.accountId); membership.statusReason = 'Membership renewed.'; await membership.save({ session });
      const paymentReference = reference('PAY');
      await Payment.create([{ reference: paymentReference, memberId, membershipId: membership._id, type: 'MEMBERSHIP', amountDue: pricing.totalDue, planAmount: pricing.planAmount, membershipFee: pricing.membershipFee, amountReceived: input.amountReceived, change: input.amountReceived - pricing.totalDue, receivedBy: req.auth!.accountId, notes: input.notes ?? 'Membership renewal' }], { session });
      await audit(req.auth!.accountId, 'MEMBERSHIP_RENEWED', 'Membership', String(membership._id), { plan: plan.name, paymentReference, ...pricing }, session);
      output = { membership: membershipResponse(membership), paymentReference, change: input.amountReceived - pricing.totalDue, ...pricing };
    });
  } finally { await session.endSession(); }
  res.status(201).json(output);
}));

adminRouter.post('/members/:memberId/memberships/:membershipId/pause', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId); const membershipId = id.parse(req.params.membershipId); const { reason } = lifecycleReason.parse(req.body); const now = new Date();
  const row = await Membership.findOne({ _id: membershipId, memberId, status: 'ACTIVE', expiresAt: { $gt: now } });
  if (!row) throw new HttpError(409, 'Only a current active membership can be paused.');
  row.status = 'PAUSED'; row.pausedAt = now; row.remainingMillisecondsAtPause = calculatePausedTime(row.expiresAt, now); row.statusChangedAt = now; row.statusChangedBy = new mongoose.Types.ObjectId(req.auth!.accountId); row.statusReason = reason; await row.save();
  await audit(req.auth!.accountId, 'MEMBERSHIP_PAUSED', 'Membership', membershipId, { memberId, reason }); res.json(membershipResponse(row));
}));

adminRouter.post('/members/:memberId/memberships/:membershipId/resume', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId); const membershipId = id.parse(req.params.membershipId); const { reason } = lifecycleReason.parse(req.body); const now = new Date();
  const row = await Membership.findOne({ _id: membershipId, memberId, status: 'PAUSED' });
  if (!row) throw new HttpError(409, 'Only a paused membership can be resumed.');
  if (await Membership.exists({ memberId, status: 'ACTIVE', _id: { $ne: row._id } })) throw new HttpError(409, 'This member already has another active membership.');
  row.status = 'ACTIVE'; row.expiresAt = calculateResumedExpiry(now, row.remainingMillisecondsAtPause ?? 0); row.pausedAt = null; row.remainingMillisecondsAtPause = null; row.statusChangedAt = now; row.statusChangedBy = new mongoose.Types.ObjectId(req.auth!.accountId); row.statusReason = reason; await row.save();
  await audit(req.auth!.accountId, 'MEMBERSHIP_RESUMED', 'Membership', membershipId, { memberId, reason }); res.json(membershipResponse(row));
}));

adminRouter.post('/members/:memberId/memberships/:membershipId/cancel', asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId); const membershipId = id.parse(req.params.membershipId); const { reason } = lifecycleReason.parse(req.body); const now = new Date();
  const row = await Membership.findOne({ _id: membershipId, memberId, status: { $in: ['ACTIVE', 'PAUSED'] } });
  if (!row) throw new HttpError(409, 'Only an active or paused membership can be cancelled.');
  row.status = 'CANCELLED'; row.pausedAt = null; row.remainingMillisecondsAtPause = null; row.statusChangedAt = now; row.statusChangedBy = new mongoose.Types.ObjectId(req.auth!.accountId); row.statusReason = reason; await row.save();
  await audit(req.auth!.accountId, 'MEMBERSHIP_CANCELLED', 'Membership', membershipId, { memberId, reason }); res.json(membershipResponse(row));
}));

adminRouter.put('/members/:memberId/memberships/:membershipId/dates', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const memberId = id.parse(req.params.memberId); const membershipId = id.parse(req.params.membershipId);
  const input = z.object({ startsAt: z.coerce.date(), expiresAt: z.coerce.date(), reason: z.string().trim().min(3).max(300) }).refine((value) => value.expiresAt > value.startsAt, { message: 'Expiry must be after the start date.' }).parse(req.body);
  const row = await Membership.findOne({ _id: membershipId, memberId, status: { $ne: 'PAUSED' } });
  if (!row) throw new HttpError(409, 'Paused membership dates cannot be corrected until the membership is resumed or cancelled.');
  row.startsAt = input.startsAt; row.expiresAt = input.expiresAt; row.status = input.expiresAt <= new Date() ? 'EXPIRED' : row.status === 'EXPIRED' ? 'ACTIVE' : row.status; row.statusChangedAt = new Date(); row.statusChangedBy = new mongoose.Types.ObjectId(req.auth!.accountId); row.statusReason = input.reason; await row.save();
  await audit(req.auth!.accountId, 'MEMBERSHIP_DATES_CORRECTED', 'Membership', membershipId, { memberId, reason: input.reason, startsAt: input.startsAt, expiresAt: input.expiresAt }); res.json(membershipResponse(row));
}));

adminRouter.post('/enrollments', asyncRoute(async (req, res) => {
  const input = person.extend({ birthDate: z.coerce.date(), emergencyContact, memberType, studentIdVerified: z.boolean(), username: z.string().trim().min(3).max(100), planId: id, amountReceived: z.number().nonnegative(), startsAt: z.coerce.date().optional(), sourceWalkInProfileId: id.optional() }).parse(req.body);
  const [plan, settings] = await Promise.all([MembershipPlan.findOne({ _id: input.planId, isActive: true }).lean<any>(), GymSettings.findOne({ key: 'primary' }).lean<any>()]);
  if (!plan) throw new HttpError(404, 'The selected membership plan is not available.');
  assertPlanEligibility(plan, input.memberType, input.studentIdVerified);
  const pricing = membershipPricing(plan.price, settings?.firstMembershipFee ?? 100, true);
  if (input.amountReceived < pricing.totalDue) throw new HttpError(400, 'Cash received is below the total amount due.');
  const duplicateFilters: Record<string, unknown>[] = [];
  if (input.phone) duplicateFilters.push({ phone: input.phone });
  if (input.email) duplicateFilters.push({ email: input.email.toLowerCase() });
  if (duplicateFilters.length && await Member.exists({ $or: duplicateFilters })) throw new HttpError(409, 'A member with that phone number or email already exists. Open the existing member record instead.');
  if (await Account.exists({ username: normalizeUsername(input.username) })) throw new HttpError(409, 'That login username is already in use.');
  if (input.sourceWalkInProfileId && !await WalkInProfile.exists({ _id: input.sourceWalkInProfileId, convertedMemberId: null })) throw new HttpError(409, 'That walk-in profile was already converted or no longer exists.');
  const password = temporaryPassword();
  const transaction = await mongoose.startSession();
  let result: { memberId: string; memberNumber: string; username: string; temporaryPassword: string; paymentReference: string } | undefined;
  try {
    await transaction.withTransaction(async () => {
      await lockOpenCashDay(transaction);
      const number = memberNumber(); const username = normalizeUsername(input.username); const start = input.startsAt ?? new Date(); const verifiedAt = new Date();
      const [member] = await Member.create([{ memberNumber: number, firstName: input.firstName, lastName: input.lastName, phone: input.phone || null, email: input.email || null, birthDate: input.birthDate, emergencyContact: input.emergencyContact, memberType: input.memberType, studentVerifiedAt: input.memberType === 'STUDENT' ? verifiedAt : null, studentVerifiedBy: input.memberType === 'STUDENT' ? req.auth!.accountId : null, sourceWalkInProfileId: input.sourceWalkInProfileId ?? null }], { session: transaction });
      await Account.create([{ username, passwordHash: await hashPassword(password), role: 'MEMBER', firstName: input.firstName, lastName: input.lastName, memberId: member!._id, mustChangePassword: true }], { session: transaction });
      const [membership] = await Membership.create([{ memberId: member!._id, planId: plan._id, planName: plan.name, pricePaid: plan.price, startsAt: start, expiresAt: addDays(start, plan.durationDays), status: 'ACTIVE', activatedBy: req.auth!.accountId }], { session: transaction });
      const paymentReference = reference('PAY');
      await Payment.create([{ reference: paymentReference, memberId: member!._id, membershipId: membership!._id, type: 'MEMBERSHIP', amountDue: pricing.totalDue, planAmount: pricing.planAmount, membershipFee: pricing.membershipFee, amountReceived: input.amountReceived, change: input.amountReceived - pricing.totalDue, receivedBy: req.auth!.accountId }], { session: transaction });
      if (input.sourceWalkInProfileId) await WalkInProfile.updateOne({ _id: input.sourceWalkInProfileId, convertedMemberId: null }, { convertedMemberId: member!._id }, { session: transaction });
      await audit(req.auth!.accountId, 'MEMBER_ENROLLED', 'Member', String(member!._id), { plan: plan.name, memberType: input.memberType, studentIdVerified: input.studentIdVerified, paymentReference, agreementHandling: 'PAPER_OUTSIDE_SYSTEM', ...pricing }, transaction);
      result = { memberId: String(member!._id), memberNumber: number, username, temporaryPassword: password, paymentReference };
    });
  } finally { await transaction.endSession(); }
  res.status(201).json(result);
}));

adminRouter.get('/attendance', asyncRoute(async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(10).max(100).default(25), search: z.string().trim().max(100).default(''), personType: z.enum(['MEMBER', 'COACH']).optional(), status: z.enum(['ACCEPTED', 'MANUAL', 'CHECKED_IN', 'CHECKED_OUT']).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const memberFilter: Record<string, any> = {}; const coachFilter: Record<string, any> = {};
  if (input.from || input.to) {
    const range = { ...(input.from ? { $gte: manilaDayBounds(input.from).start } : {}), ...(input.to ? { $lt: manilaDayBounds(input.to).end } : {}) };
    memberFilter.recordedAt = range; coachFilter.checkedInAt = range;
  }
  if (input.status === 'ACCEPTED' || input.status === 'MANUAL') memberFilter.status = input.status;
  if (input.status === 'CHECKED_IN') { memberFilter.attendanceDate = { $type: 'string' }; memberFilter.checkedOutAt = null; coachFilter.checkedOutAt = null; }
  if (input.status === 'CHECKED_OUT') { memberFilter.checkedOutAt = { $ne: null }; coachFilter.checkedOutAt = { $ne: null }; }
  if (input.search) {
    const search = regexLiteral(input.search);
    const [memberIds, coachIds] = await Promise.all([
      Member.find({ $or: [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { memberNumber: { $regex: search, $options: 'i' } }] }).distinct('_id'),
      Coach.find({ $or: [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { fullName: { $regex: search, $options: 'i' } }, { coachNumber: { $regex: search, $options: 'i' } }] }).distinct('_id'),
    ]);
    memberFilter.memberId = { $in: memberIds }; coachFilter.coachId = { $in: coachIds };
  }
  const includeMembers = input.personType !== 'COACH';
  const includeCoaches = input.personType !== 'MEMBER' && !['ACCEPTED', 'MANUAL'].includes(input.status ?? '');
  const fetchLimit = input.page * input.limit;
  const [memberRows, coachRows, memberTotal, coachTotal] = await Promise.all([
    includeMembers ? AttendanceRecord.find(memberFilter).sort({ recordedAt: -1 }).limit(fetchLimit).populate('memberId', 'firstName lastName memberNumber').lean<any[]>() : [],
    includeCoaches ? CoachAttendance.find(coachFilter).sort({ checkedInAt: -1 }).limit(fetchLimit).populate('coachId', 'firstName lastName fullName coachNumber').lean<any[]>() : [],
    includeMembers ? AttendanceRecord.countDocuments(memberFilter) : 0,
    includeCoaches ? CoachAttendance.countDocuments(coachFilter) : 0,
  ]);
  const items = [
    ...memberRows.map((row) => {
      const legacy = !row.attendanceDate;
      const checkInMethod = row.checkInMethod ?? (row.status === 'MANUAL' ? 'MANUAL' : 'NFC');
      const method = row.checkOutMethod && row.checkOutMethod !== checkInMethod ? `${checkInMethod} / ${row.checkOutMethod}` : checkInMethod;
      return { id: `member-${row._id}`, personName: `${row.memberId?.firstName ?? ''} ${row.memberId?.lastName ?? ''}`.trim(), personNumber: row.memberId?.memberNumber ?? 'Unknown', personType: 'MEMBER', status: legacy ? 'VISIT RECORDED' : row.checkedOutAt ? 'CHECKED OUT' : 'CHECKED IN', method, reason: [row.reason, row.checkOutReason].filter(Boolean).join(' / ') || undefined, checkedInAt: row.recordedAt, checkedOutAt: row.checkedOutAt ?? undefined, recordedAt: row.checkedOutAt ?? row.recordedAt };
    }),
    ...coachRows.map((row) => ({ id: `coach-${row._id}`, personName: row.coachId?.fullName || `${row.coachId?.firstName ?? ''} ${row.coachId?.lastName ?? ''}`.trim(), personNumber: row.coachId?.coachNumber ?? 'Unknown', personType: 'COACH', status: row.checkedOutAt ? 'CHECKED OUT' : 'CHECKED IN', method: row.method, reason: row.reason ?? undefined, checkedInAt: row.checkedInAt, checkedOutAt: row.checkedOutAt ?? undefined, recordedAt: row.checkedOutAt ?? row.checkedInAt })),
  ].sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()).slice((input.page - 1) * input.limit, input.page * input.limit);
  const total = memberTotal + coachTotal;
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items });
}));

adminRouter.post('/attendance/scan', asyncRoute(async (req, res) => {
  const { cardUid } = z.object({ cardUid: z.string().min(4).max(100) }).parse(req.body);
  const stationId = req.get('x-attendance-station');
  if (!stationId) throw new HttpError(400, 'This device is not configured as an attendance station.');
  const station = await AttendanceStation.findOne({ stationId, isActive: true }).lean<any>();
  if (!station) throw new HttpError(403, 'This attendance station is not registered or has been disabled.');
  const normalizedUid = normalizeCardUid(cardUid);
  const [card, coachCard] = await Promise.all([
    NfcCard.findOne({ uid: normalizedUid, status: 'ACTIVE' }).populate('memberId', 'firstName lastName status').lean<any>(),
    CoachNfcCard.findOne({ uid: normalizedUid, status: 'ACTIVE' }).populate('coachId', 'firstName lastName fullName status').lean<any>(),
  ]);
  if (!card && coachCard) {
    const coach = coachCard.coachId;
    if (!coach || coach.status !== 'ACTIVE') throw new HttpError(404, 'This NFC card is not assigned to an active coach.');
    const now = new Date();
    const attendanceDate = manilaDateKey(now);
    const current = await CoachAttendance.findOne({ coachId: coach._id, attendanceDate });
    const coachName = coach.fullName || `${coach.firstName ?? ''} ${coach.lastName ?? ''}`.trim();
    if (!current) {
      try {
        const row = await CoachAttendance.create({ coachId: coach._id, attendanceDate, checkedInAt: now, method: 'NFC', stationId, recordedBy: req.auth!.accountId });
        await audit(req.auth!.accountId, 'COACH_CHECKED_IN_NFC', 'CoachAttendance', String(row._id), { coachId: String(coach._id), stationId });
        res.status(201).json({ accepted: true, subjectType: 'COACH', action: 'CHECK_IN', message: `${coachName} checked in successfully.`, personName: coachName });
        return;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'This coach was already checked in today.');
        throw error;
      }
    }
    if (current.checkedOutAt) throw new HttpError(409, `${coachName}'s attendance is already completed for today.`);
    const earliestCheckout = new Date(current.checkedInAt).getTime() + config().ATTENDANCE_DUPLICATE_SECONDS * 1000;
    if (now.getTime() < earliestCheckout) throw new HttpError(409, `${coachName} is already checked in. Scan again when leaving to check out.`, 'DUPLICATE_SCAN');
    current.checkedOutAt = now; current.method = 'NFC'; current.stationId = stationId; await current.save();
    await audit(req.auth!.accountId, 'COACH_CHECKED_OUT_NFC', 'CoachAttendance', String(current._id), { coachId: String(coach._id), stationId });
    res.json({ accepted: true, subjectType: 'COACH', action: 'CHECK_OUT', message: `${coachName} checked out successfully.`, personName: coachName });
    return;
  }
  if (!card || card.memberId?.status !== 'ACTIVE') throw new HttpError(404, 'This NFC card is not assigned to an active member or coach.');
  const now = new Date();
  const attendanceDate = manilaDateKey(now);
  const memberName = `${card.memberId.firstName} ${card.memberId.lastName}`;
  const current = await AttendanceRecord.findOne({ memberId: card.memberId._id, attendanceDate });
  if (current) {
    if (current.checkedOutAt) throw new HttpError(409, `${memberName}'s attendance is already completed for today.`);
    const earliestCheckout = new Date(current.recordedAt).getTime() + config().ATTENDANCE_DUPLICATE_SECONDS * 1000;
    if (now.getTime() < earliestCheckout) throw new HttpError(409, `${memberName} is already checked in. Scan again when leaving to check out.`, 'DUPLICATE_SCAN');
    const checkedOut = await AttendanceRecord.findOneAndUpdate({ _id: current._id, checkedOutAt: null }, { checkedOutAt: now, checkOutMethod: 'NFC' }, { new: true });
    if (!checkedOut) throw new HttpError(409, `${memberName}'s attendance was already updated.`);
    await audit(req.auth!.accountId, 'MEMBER_CHECKED_OUT_NFC', 'AttendanceRecord', String(current._id), { memberId: String(card.memberId._id), stationId });
    res.json({ accepted: true, subjectType: 'MEMBER', action: 'CHECK_OUT', message: `${memberName} checked out successfully.`, personName: memberName, memberName });
    return;
  }
  const membership = await Membership.findOne({ memberId: card.memberId._id, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }).lean<any>();
  if (!membership) throw new HttpError(403, 'This member does not have an active membership.');
  const cutoff = new Date(now.getTime() - config().ATTENDANCE_DUPLICATE_SECONDS * 1000);
  const transaction = await mongoose.startSession();
  let record: any;
  try {
    await transaction.withTransaction(async () => {
      await AttendanceLock.findOneAndUpdate({ _id: card.memberId._id, $or: [{ lastAcceptedAt: { $lte: cutoff } }, { lastAcceptedAt: { $exists: false } }] }, { $set: { lastAcceptedAt: now } }, { upsert: true, session: transaction });
      [record] = await AttendanceRecord.create([{ memberId: card.memberId._id, cardId: card._id, stationId, attendanceDate, recordedAt: now, checkInMethod: 'NFC', recordedBy: req.auth!.accountId }], { session: transaction });
      await audit(req.auth!.accountId, 'MEMBER_CHECKED_IN_NFC', 'AttendanceRecord', String(record!._id), { stationId }, transaction);
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'Attendance was already recorded moments ago.', 'DUPLICATE_SCAN');
    throw error;
  } finally { await transaction.endSession(); }
  res.status(201).json({ accepted: true, subjectType: 'MEMBER', action: 'CHECK_IN', message: `${memberName} checked in successfully.`, personName: memberName, memberName });
}));

adminRouter.post('/attendance/manual', asyncRoute(async (req, res) => {
  const { memberId, reason } = z.object({ memberId: id, reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const now = new Date();
  const attendanceDate = manilaDateKey(now);
  const member = await Member.findOne({ _id: memberId, status: 'ACTIVE' }).lean<any>();
  if (!member) throw new HttpError(404, 'Active member not found.');
  const memberName = `${member.firstName} ${member.lastName}`;
  const current = await AttendanceRecord.findOne({ memberId, attendanceDate });
  if (current) {
    if (current.checkedOutAt) throw new HttpError(409, `${memberName}'s attendance is already completed for today.`);
    const checkedOut = await AttendanceRecord.findOneAndUpdate({ _id: current._id, checkedOutAt: null }, { checkedOutAt: now, checkOutMethod: 'MANUAL', checkOutReason: reason }, { new: true });
    if (!checkedOut) throw new HttpError(409, `${memberName}'s attendance was already updated.`);
    await audit(req.auth!.accountId, 'MEMBER_CHECKED_OUT_MANUALLY', 'AttendanceRecord', String(current._id), { memberId, reason });
    res.json({ accepted: true, action: 'CHECK_OUT', message: `${memberName} checked out manually.`, memberName });
    return;
  }
  const membership = await Membership.findOne({ memberId, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }).lean<any>();
  if (!membership) throw new HttpError(403, 'This member does not have a current active membership.');
  const cutoff = new Date(now.getTime() - config().ATTENDANCE_DUPLICATE_SECONDS * 1000);
  const session = await mongoose.startSession();
  let record: any;
  try {
    await session.withTransaction(async () => {
      await AttendanceLock.findOneAndUpdate({ _id: member._id, $or: [{ lastAcceptedAt: { $lte: cutoff } }, { lastAcceptedAt: { $exists: false } }] }, { $set: { lastAcceptedAt: now } }, { upsert: true, session });
      [record] = await AttendanceRecord.create([{ memberId: member._id, cardId: null, stationId: 'ADMIN_MANUAL', status: 'MANUAL', reason, attendanceDate, recordedAt: now, checkInMethod: 'MANUAL', recordedBy: req.auth!.accountId }], { session });
      await audit(req.auth!.accountId, 'MEMBER_CHECKED_IN_MANUALLY', 'AttendanceRecord', String(record!._id), { memberId, reason }, session);
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'Attendance was already recorded moments ago.', 'DUPLICATE_ATTENDANCE');
    throw error;
  } finally { await session.endSession(); }
  res.status(201).json({ accepted: true, action: 'CHECK_IN', message: `${memberName} checked in manually.`, memberName });
}));

adminRouter.get('/walk-ins', asyncRoute(async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(10).max(100).default(25), search: z.string().trim().max(100).default('') }).parse(req.query);
  const filter: Record<string, any> = {};
  if (input.search) { const search = regexLiteral(input.search); filter.$or = [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }, { $expr: { $regexMatch: { input: { $concat: ['$firstName', ' ', '$lastName'] }, regex: search, options: 'i' } } }]; }
  const [rows, total] = await Promise.all([WalkInProfile.find(filter).sort({ lastVisitAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(), WalkInProfile.countDocuments(filter)]);
  const today = manilaDateKey();
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map((row) => ({
    id: String(row._id),
    fullName: `${row.firstName} ${row.lastName}`,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    visits: row.totalVisits,
    lastVisitAt: row.lastVisitAt,
    visitedToday: Boolean(row.lastVisitAt && manilaDateKey(new Date(row.lastVisitAt)) === today),
  })) });
}));

adminRouter.post('/walk-ins', asyncRoute(async (req, res) => {
  const input = person.extend({ profileId: id.optional(), amountReceived: z.number().nonnegative(), notes: z.string().max(500).optional() }).superRefine((value, context) => {
    if (!value.profileId && !value.phone) context.addIssue({ code: 'custom', path: ['phone'], message: 'A mobile number is required for a new walk-in.' });
  }).parse(req.body);
  const settings = await GymSettings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { defaultWalkInFee: 70 } }, { upsert: true, new: true }).lean<any>();
  const fee = settings.defaultWalkInFee;
  if (input.amountReceived < fee) throw new HttpError(400, 'Cash received is below the walk-in fee.');
  const visitDate = manilaDateKey();
  const { start: todayStart, end: tomorrowStart } = manilaDayBounds(visitDate);
  const transaction = await mongoose.startSession();
  let output: any;
  try {
    await transaction.withTransaction(async () => {
      await lockOpenCashDay(transaction);
      let profile: any;
      if (input.profileId) profile = await WalkInProfile.findById(input.profileId).session(transaction);
      else {
        const existingProfile = await WalkInProfile.findOne({ phone: input.phone }).session(transaction);
        if (existingProfile) throw new HttpError(409, 'This mobile number already belongs to a walk-in profile. Search for the visitor and record a return visit.');
        [profile] = await WalkInProfile.create([{ firstName: input.firstName, lastName: input.lastName, phone: input.phone, email: input.email || null }], { session: transaction });
      }
      if (!profile) throw new HttpError(404, 'Walk-in profile not found.');
      const alreadyRecorded = await WalkInVisit.exists({ profileId: profile._id, $or: [{ visitDate }, { visitedAt: { $gte: todayStart, $lt: tomorrowStart } }] }).session(transaction);
      if (alreadyRecorded) throw new HttpError(409, 'This visitor already has a paid walk-in visit recorded today.');
      const paymentReference = reference('WALK');
      const [payment] = await Payment.create([{ reference: paymentReference, walkInProfileId: profile._id, type: 'WALK_IN', amountDue: fee, amountReceived: input.amountReceived, change: input.amountReceived - fee, receivedBy: req.auth!.accountId, notes: input.notes ?? '' }], { session: transaction });
      const [visit] = await WalkInVisit.create([{ profileId: profile._id, paymentId: payment!._id, visitDate, recordedBy: req.auth!.accountId }], { session: transaction });
      profile.totalVisits += 1; profile.lastVisitAt = visit!.visitedAt; await profile.save({ session: transaction });
      await audit(req.auth!.accountId, 'WALK_IN_RECORDED', 'WalkInVisit', String(visit!._id), { paymentReference }, transaction);
      output = { id: String(visit!._id), paymentReference, amountDue: fee, change: input.amountReceived - fee };
    });
  } catch (error) {
    const duplicate = error as { code?: number; keyPattern?: Record<string, number> };
    if (duplicate.code === 11000 && duplicate.keyPattern?.phone) throw new HttpError(409, 'This mobile number already belongs to a walk-in profile. Search for the visitor and record a return visit.');
    if (duplicate.code === 11000) throw new HttpError(409, 'This visitor already has a paid walk-in visit recorded today.');
    throw error;
  } finally { await transaction.endSession(); }
  res.status(201).json(output);
}));

adminRouter.get('/nfc-cards', asyncRoute(async (_req, res) => {
  const [memberCards, coachCards] = await Promise.all([
    NfcCard.find().sort({ assignedAt: -1 }).populate('memberId', 'firstName lastName').lean<any[]>(),
    CoachNfcCard.find().sort({ assignedAt: -1 }).populate('coachId', 'firstName lastName fullName').lean<any[]>(),
  ]);
  const items = [
    ...memberCards.map((row) => ({ id: String(row._id), uid: row.uid, assigneeName: row.memberId ? `${row.memberId.firstName} ${row.memberId.lastName}` : undefined, assigneeType: 'MEMBER', status: row.status, assignedAt: row.assignedAt })),
    ...coachCards.map((row) => ({ id: String(row._id), uid: row.uid, assigneeName: row.coachId ? row.coachId.fullName || `${row.coachId.firstName} ${row.coachId.lastName}` : undefined, assigneeType: 'COACH', status: row.status, assignedAt: row.assignedAt })),
  ].sort((left, right) => new Date(right.assignedAt).getTime() - new Date(left.assignedAt).getTime());
  res.json({ items });
}));

adminRouter.post('/nfc-cards', asyncRoute(async (req, res) => {
  const input = z.object({ memberId: id, uid: z.string().min(4).max(100) }).parse(req.body);
  const now = new Date();
  const [member, membership] = await Promise.all([Member.findOne({ _id: input.memberId, status: 'ACTIVE' }), Membership.findOne({ memberId: input.memberId, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } })]);
  if (!member) throw new HttpError(404, 'Member not found.');
  if (!membership) throw new HttpError(400, 'Assign a card only after activating the membership.');
  if (await CoachNfcCard.exists({ uid: normalizeCardUid(input.uid) })) throw new HttpError(409, 'This NFC card is already registered to a coach.');
  const token = randomToken();
  const card = await NfcCard.create({ uid: normalizeCardUid(input.uid), portalTokenHash: portalTokenHash(token), memberId: member._id, assignedBy: req.auth!.accountId });
  await audit(req.auth!.accountId, 'NFC_CARD_ASSIGNED', 'NfcCard', String(card._id), { memberId: input.memberId });
  res.status(201).json({ id: String(card._id), uid: card.uid, portalUrl: `${config().MEMBER_APP_ORIGIN}/c/${token}`, note: 'Save or encode this URL now. The API does not store the readable token.' });
}));

adminRouter.post('/nfc-cards/:cardId/revoke', asyncRoute(async (req, res) => {
  const cardId = id.parse(req.params.cardId); const { reason, status } = z.object({ reason: z.string().trim().min(3).max(300), status: z.enum(['REVOKED', 'LOST', 'REPLACED']).default('REVOKED') }).parse(req.body);
  const card = await NfcCard.findOneAndUpdate({ _id: cardId, status: 'ACTIVE' }, { status, revokedAt: new Date(), revokeReason: reason }, { new: true })
    ?? await CoachNfcCard.findOneAndUpdate({ _id: cardId, status: 'ACTIVE' }, { status, revokedAt: new Date(), revokeReason: reason }, { new: true });
  if (!card) throw new HttpError(404, 'Active card not found.');
  await audit(req.auth!.accountId, 'NFC_CARD_REVOKED', 'NfcCard', cardId, { reason, status }); res.status(204).end();
}));

const cashAmount = z.number().finite().min(0).max(100_000_000).transform((value) => Math.round((value + Number.EPSILON) * 100) / 100);
const cashClosingInput = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: cashAmount,
  countedCash: cashAmount,
  notes: z.string().trim().max(500).default(''),
});

adminRouter.get('/cash-closings/summary', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(manilaDateKey()).parse(req.query.date);
  if (businessDate > manilaDateKey()) throw new HttpError(400, 'A future cash day cannot be reviewed.');
  const [summary, closing] = await Promise.all([
    cashCollectionSummary(businessDate),
    CashClosing.findOne({ businessDate, status: 'CLOSED' }).populate('closedBy', 'firstName lastName').lean<any>(),
  ]);
  res.json({ businessDate, ...summary, closing: closing ? cashClosingResponse(closing) : null });
}));

adminRouter.get('/cash-closings', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(5).max(50).default(10) }).parse(req.query);
  const [rows, total] = await Promise.all([
    CashClosing.find().sort({ businessDate: -1, closedAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit)
      .populate('closedBy', 'firstName lastName').populate('voidedBy', 'firstName lastName').lean<any[]>(),
    CashClosing.countDocuments(),
  ]);
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map(cashClosingResponse) });
}));

adminRouter.post('/cash-closings', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const input = cashClosingInput.parse(req.body);
  if (input.businessDate !== manilaDateKey()) throw new HttpError(400, 'Only today’s cash can be closed.');
  const session = await mongoose.startSession();
  let closingId = '';
  try {
    await session.withTransaction(async () => {
      await lockOpenCashDay(session, input.businessDate);
      const summary = await cashCollectionSummary(input.businessDate, session);
      const calculated = calculateCashClosing(input.openingCash, summary.cashCollected, input.countedCash);
      const [closing] = await CashClosing.create([{
        ...input, ...summary, ...calculated, status: 'CLOSED', closedBy: req.auth!.accountId, closedAt: new Date(),
      }], { session });
      if (!closing) throw new HttpError(500, 'Cash closing could not be created.');
      closingId = String(closing._id);
      await audit(req.auth!.accountId, 'CASH_DAY_CLOSED', 'CashClosing', closingId, {
        businessDate: input.businessDate, expectedCash: calculated.expectedCash, countedCash: input.countedCash, variance: calculated.variance,
      }, session);
    });
  } finally { await session.endSession(); }
  const row = await CashClosing.findById(closingId).populate('closedBy', 'firstName lastName').lean<any>();
  res.status(201).json(cashClosingResponse(row));
}));

adminRouter.post('/cash-closings/:closingId/void', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const closingId = id.parse(req.params.closingId);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await CashClosing.findOne({ _id: closingId, status: 'CLOSED' }).session(session);
      if (!existing) throw new HttpError(409, 'Only an active cash closing can be voided.');
      await lockCashDay(session, existing.businessDate);
      const row = await CashClosing.findOneAndUpdate(
        { _id: closingId, status: 'CLOSED' },
        { $set: { status: 'VOID', voidedBy: req.auth!.accountId, voidedAt: new Date(), voidReason: reason } },
        { new: true, session },
      );
      if (!row) throw new HttpError(409, 'This cash closing was already changed.');
      await audit(req.auth!.accountId, 'CASH_CLOSING_VOIDED', 'CashClosing', closingId, { businessDate: row.businessDate, reason }, session);
    });
  } finally { await session.endSession(); }
  res.status(204).end();
}));

adminRouter.get('/payments', asyncRoute(async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(10).max(100).default(25), search: z.string().trim().max(100).default(''), type: z.enum(['MEMBERSHIP', 'WALK_IN', 'CARD_REPLACEMENT']).optional(), status: z.enum(['COMPLETED', 'VOID']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  const now = new Date();
  const today = manilaDayBounds(manilaDateKey(now));
  const week = manilaWeekBounds(now);
  const filter: Record<string, any> = {};
  if (input.type) filter.type = input.type;
  if (input.status) filter.status = input.status;
  if (input.from || input.to) filter.receivedAt = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lt: new Date(input.to.getTime() + DAY_MILLISECONDS) } : {}) };
  if (input.search) {
    const value = regexLiteral(input.search);
    const [memberIds, walkInIds] = await Promise.all([
      Member.find({ $or: [{ firstName: { $regex: value, $options: 'i' } }, { lastName: { $regex: value, $options: 'i' } }, { memberNumber: { $regex: value, $options: 'i' } }] }).distinct('_id'),
      WalkInProfile.find({ $or: [{ firstName: { $regex: value, $options: 'i' } }, { lastName: { $regex: value, $options: 'i' } }] }).distinct('_id'),
    ]);
    filter.$or = [{ reference: { $regex: value, $options: 'i' } }, { memberId: { $in: memberIds } }, { walkInProfileId: { $in: walkInIds } }];
  }
  const [rows, total, totals] = await Promise.all([
    Payment.find(filter).sort({ receivedAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).populate('memberId', 'firstName lastName').populate('walkInProfileId', 'firstName lastName').lean<any[]>(),
    Payment.countDocuments(filter),
    Payment.aggregate<{ today: number; thisWeek: number }>([
      { $match: { status: 'COMPLETED', receivedAt: { $gte: week.start, $lt: week.end } } },
      { $group: {
        _id: null,
        thisWeek: { $sum: '$amountDue' },
        today: { $sum: { $cond: [{ $and: [{ $gte: ['$receivedAt', today.start] }, { $lt: ['$receivedAt', today.end] }] }, '$amountDue', 0] } },
      } },
      { $project: { _id: 0, today: 1, thisWeek: 1 } },
    ]),
  ]);
  res.json({
    summary: totals[0] ?? { today: 0, thisWeek: 0 },
    page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)),
    items: rows.map((row) => { const payer = row.memberId ?? row.walkInProfileId; return { id: String(row._id), reference: row.reference, payerName: payer ? `${payer.firstName} ${payer.lastName}` : 'Unknown', amount: row.amountDue, type: row.type, status: row.status, receivedAt: row.receivedAt }; }),
  });
}));

adminRouter.get('/payments/:paymentId', asyncRoute(async (req, res) => {
  const paymentId = id.parse(req.params.paymentId);
  const row = await Payment.findById(paymentId).populate('memberId', 'firstName lastName memberNumber').populate('walkInProfileId', 'firstName lastName').populate('receivedBy', 'firstName lastName').populate('voidedBy', 'firstName lastName').lean<any>();
  if (!row) throw new HttpError(404, 'Payment not found.');
  const payer = row.memberId ?? row.walkInProfileId;
  res.json({ id: String(row._id), reference: row.reference, payerName: payer ? `${payer.firstName} ${payer.lastName}` : 'Unknown', payerReference: row.memberId?.memberNumber, type: row.type, status: row.status, amountDue: row.amountDue, planAmount: row.planAmount ?? 0, membershipFee: row.membershipFee ?? 0, amountReceived: row.amountReceived, change: row.change, method: row.method, notes: row.notes, receivedAt: row.receivedAt, receivedBy: row.receivedBy ? `${row.receivedBy.firstName} ${row.receivedBy.lastName}` : 'Unknown', voidedAt: row.voidedAt ?? undefined, voidedBy: row.voidedBy ? `${row.voidedBy.firstName} ${row.voidedBy.lastName}` : undefined, voidReason: row.voidReason ?? undefined, relatedRecordAction: row.relatedRecordAction ?? undefined });
}));

adminRouter.post('/payments/:paymentId/void', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const paymentId = id.parse(req.params.paymentId);
  const input = z.object({ reason: z.string().trim().min(5).max(500), relatedAction: z.enum(['KEEP', 'CANCEL_MEMBERSHIP', 'VOID_VISIT']) }).parse(req.body);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ _id: paymentId, status: 'COMPLETED' }).session(session);
      if (!payment) throw new HttpError(409, 'Only a completed payment can be voided.');
      await lockOpenCashDay(session, manilaDateKey(payment.receivedAt));
      if (input.relatedAction === 'CANCEL_MEMBERSHIP' && payment.type !== 'MEMBERSHIP') throw new HttpError(400, 'This payment is not linked to a membership.');
      if (input.relatedAction === 'VOID_VISIT' && payment.type !== 'WALK_IN') throw new HttpError(400, 'This payment is not linked to a walk-in visit.');
      let relatedRecordAction: 'KEPT' | 'MEMBERSHIP_CANCELLED' | 'VISIT_VOIDED' = 'KEPT';
      if (input.relatedAction === 'CANCEL_MEMBERSHIP') {
        const membership = await Membership.findOneAndUpdate({ _id: payment.membershipId, status: { $in: ['ACTIVE', 'PAUSED'] } }, { status: 'CANCELLED', pausedAt: null, remainingMillisecondsAtPause: null, statusChangedAt: new Date(), statusChangedBy: req.auth!.accountId, statusReason: `Payment ${payment.reference} voided: ${input.reason}` }, { new: true, session });
        if (!membership) throw new HttpError(409, 'The linked membership is no longer open. Choose Keep related record and review it manually.');
        relatedRecordAction = 'MEMBERSHIP_CANCELLED';
      }
      if (input.relatedAction === 'VOID_VISIT') {
        const visit = await WalkInVisit.findOneAndUpdate({ paymentId: payment._id, status: { $ne: 'VOID' } }, { status: 'VOID', voidedAt: new Date(), voidedBy: req.auth!.accountId, voidReason: input.reason }, { new: true, session });
        if (!visit) throw new HttpError(409, 'The linked walk-in visit is missing or already voided.');
        const latest = await WalkInVisit.findOne({ profileId: visit.profileId, status: { $ne: 'VOID' } }).sort({ visitedAt: -1 }).session(session).lean<any>();
        await WalkInProfile.updateOne({ _id: visit.profileId }, { $inc: { totalVisits: -1 }, $set: { lastVisitAt: latest?.visitedAt ?? null } }, { session });
        relatedRecordAction = 'VISIT_VOIDED';
      }
      payment.status = 'VOID'; payment.voidedAt = new Date(); payment.voidedBy = new mongoose.Types.ObjectId(req.auth!.accountId); payment.voidReason = input.reason; payment.relatedRecordAction = relatedRecordAction; await payment.save({ session });
      await audit(req.auth!.accountId, 'PAYMENT_VOIDED', 'Payment', paymentId, { reference: payment.reference, reason: input.reason, relatedRecordAction }, session);
      await notifyOwners({ type: 'PAYMENT_VOIDED', tone: 'WARNING', dedupeKey: `payment-voided:${paymentId}`, sourceId: paymentId, title: `Payment ${payment.reference} was voided`, message: `${payment.type.replaceAll('_', ' ')} payment worth PHP ${payment.amountDue.toLocaleString('en-PH')} was voided. Review the receipt and audit reason.`, actionUrl: '/admin/payments' }, undefined, session);
    });
  } finally { await session.endSession(); }
  res.status(204).end();
}));

adminRouter.get('/audit', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(10).max(100).default(25), search: z.string().trim().max(100).default(''), actor: z.string().trim().max(100).default(''), action: z.string().trim().max(100).default(''), targetType: z.string().trim().max(100).default(''), from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
  const filter: Record<string, any> = {};
  if (input.action) filter.action = input.action;
  if (input.targetType) filter.targetType = input.targetType;
  if (input.actor) {
    const actorSearch = regexLiteral(input.actor);
    const actorIds = await Account.find({ $or: [{ firstName: { $regex: actorSearch, $options: 'i' } }, { lastName: { $regex: actorSearch, $options: 'i' } }, { username: { $regex: actorSearch, $options: 'i' } }] }).distinct('_id');
    filter.actorAccountId = { $in: actorIds };
  }
  if (input.search) filter.$or = [{ action: { $regex: regexLiteral(input.search), $options: 'i' } }, { targetType: { $regex: regexLiteral(input.search), $options: 'i' } }, { targetId: { $regex: regexLiteral(input.search), $options: 'i' } }];
  if (input.from || input.to) filter.occurredAt = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lt: new Date(input.to.getTime() + DAY_MILLISECONDS) } : {}) };
  const [rows, total] = await Promise.all([AuditLog.find(filter).sort({ occurredAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).populate('actorAccountId', 'firstName lastName username').lean<any[]>(), AuditLog.countDocuments(filter)]);
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map((row) => ({ id: String(row._id), actor: row.actorAccountId ? `${row.actorAccountId.firstName} ${row.actorAccountId.lastName}` : 'System', actorUsername: row.actorAccountId?.username, action: row.action, targetType: row.targetType, targetId: row.targetId, metadata: row.metadata ?? {}, occurredAt: row.occurredAt })) });
}));

adminRouter.get('/plans', asyncRoute(async (_req, res) => {
  const [items, settings, usage] = await Promise.all([
    MembershipPlan.find().sort({ archivedAt: 1, price: 1 }).lean<any[]>(),
    GymSettings.findOne({ key: 'primary' }).lean<any>(),
    Membership.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([{ $group: { _id: '$planId', count: { $sum: 1 } } }]),
  ]);
  const usageByPlan = new Map(usage.map((row) => [String(row._id), row.count]));
  res.json({
    items: items.map((row) => {
      const usageCount = usageByPlan.get(String(row._id)) ?? 0;
      const isArchived = Boolean(row.archivedAt);
      return {
        ...row,
        eligibility: row.eligibility ?? 'ALL',
        isPromo: Boolean(row.isPromo),
        isActive: Boolean(row.isActive) && !isArchived,
        isArchived,
        usageCount,
        canDelete: isArchived && usageCount === 0,
      };
    }),
    firstMembershipFee: settings?.firstMembershipFee ?? 100,
  });
}));
const planInput = z.object({ name: z.string().trim().min(2).max(100), price: z.number().nonnegative(), durationDays: z.number().int().positive().max(3650), eligibility: planEligibility, isPromo: z.boolean() });
adminRouter.post('/plans', asyncRoute(async (req, res) => { const input = planInput.parse(req.body); const row = await MembershipPlan.create(input); await audit(req.auth!.accountId, 'PLAN_CREATED', 'MembershipPlan', String(row._id)); res.status(201).json(row); }));
adminRouter.put('/plans/:planId', asyncRoute(async (req, res) => {
  const planId = id.parse(req.params.planId); const input = planInput.parse(req.body);
  const row = await MembershipPlan.findOneAndUpdate({ _id: planId, archivedAt: null }, input, { new: true });
  if (!row) throw new HttpError(409, 'Restore the archived plan before editing it.');
  await audit(req.auth!.accountId, 'PLAN_UPDATED', 'MembershipPlan', planId); res.json(row);
}));
adminRouter.post('/plans/:planId/archive', asyncRoute(async (req, res) => {
  const planId = id.parse(req.params.planId); const { reason } = lifecycleReason.parse(req.body);
  const row = await MembershipPlan.findOneAndUpdate(
    { _id: planId, archivedAt: null },
    { $set: { isActive: false, archivedAt: new Date(), archivedBy: req.auth!.accountId, archiveReason: reason } },
    { new: true },
  );
  if (!row) throw new HttpError(409, 'This membership plan is already archived or no longer exists.');
  await audit(req.auth!.accountId, 'PLAN_ARCHIVED', 'MembershipPlan', planId, { reason }); res.json(row);
}));
adminRouter.post('/plans/:planId/restore', asyncRoute(async (req, res) => {
  const planId = id.parse(req.params.planId);
  const row = await MembershipPlan.findOneAndUpdate(
    { _id: planId, archivedAt: { $ne: null } },
    { $set: { isActive: true }, $unset: { archivedAt: 1, archivedBy: 1, archiveReason: 1 } },
    { new: true },
  );
  if (!row) throw new HttpError(409, 'This membership plan is not archived or no longer exists.');
  await audit(req.auth!.accountId, 'PLAN_RESTORED', 'MembershipPlan', planId); res.json(row);
}));
adminRouter.delete('/plans/:planId', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const planId = id.parse(req.params.planId);
  const plan = await MembershipPlan.findById(planId).lean<any>();
  if (!plan) throw new HttpError(404, 'Membership plan not found.');
  if (!plan.archivedAt) throw new HttpError(409, 'Archive the membership plan before deleting it.');
  if (await Membership.exists({ planId })) throw new HttpError(409, 'This plan has membership history and must remain archived for audit records.');
  await MembershipPlan.deleteOne({ _id: planId });
  await audit(req.auth!.accountId, 'PLAN_DELETED', 'MembershipPlan', planId, { name: plan.name, archiveReason: plan.archiveReason });
  res.status(204).end();
}));

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weeklyHoursSchema = z.array(z.object({ day: z.enum(WEEKDAYS), isClosed: z.boolean(), openTime: clockTime, closeTime: clockTime }).refine((entry) => entry.isClosed || entry.closeTime > entry.openTime, 'Closing time must be later than opening time.')).length(7).refine((entries) => new Set(entries.map((entry) => entry.day)).size === 7, 'Provide one schedule for every day.');
const exceptionSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().trim().max(100).optional(), isClosed: z.boolean(), openTime: clockTime.optional(), closeTime: clockTime.optional() }).refine((entry) => entry.isClosed || Boolean(entry.openTime && entry.closeTime && entry.closeTime > entry.openTime), 'Open exceptions require valid opening and closing times.');
const gymSettingsInput = z.object({ defaultWalkInFee: z.number().nonnegative(), firstMembershipFee: z.number().nonnegative(), announcementsEnabled: z.boolean(), gymStatusOverride: z.enum(['AUTO', 'OPEN', 'CLOSED']), hoursToday: z.string().trim().min(3).max(100).optional(), weeklyHours: weeklyHoursSchema, scheduleExceptions: z.array(exceptionSchema).max(60) });
adminRouter.post('/settings/preview', asyncRoute(async (req, res) => { const input = gymSettingsInput.parse(req.body); res.json(resolveGymAvailability(input)); }));
adminRouter.get('/settings', asyncRoute(async (_req, res) => { const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { defaultWalkInFee: 70, firstMembershipFee: 100, announcementsEnabled: true, weeklyHours: DEFAULT_WEEKLY_HOURS, scheduleExceptions: [] } }, { upsert: true, new: true }).lean<any>(); res.json({ ...row, firstMembershipFee: row.firstMembershipFee ?? 100, announcementsEnabled: row.announcementsEnabled ?? true, weeklyHours: row.weeklyHours?.length === 7 ? row.weeklyHours : DEFAULT_WEEKLY_HOURS, scheduleExceptions: row.scheduleExceptions ?? [] }); }));
adminRouter.put('/settings', asyncRoute(async (req, res) => { const input = gymSettingsInput.parse(req.body); const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, input, { upsert: true, new: true }); await audit(req.auth!.accountId, 'SETTINGS_UPDATED', 'GymSettings', String(row!._id), { scheduleExceptions: input.scheduleExceptions.length, announcementsEnabled: input.announcementsEnabled }); res.json(row); }));

function announcementResponse(row: any) { return { id: String(row._id), title: row.title, message: row.message, status: row.status, publishAt: row.publishAt ?? undefined, expiresAt: row.expiresAt ?? undefined, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
const announcementInput = z.object({ title: z.string().trim().min(3).max(120), message: z.string().trim().min(3).max(2000), status: z.enum(['DRAFT', 'PUBLISHED']), publishAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional() }).refine((entry) => !entry.expiresAt || !entry.publishAt || entry.expiresAt > entry.publishAt, { message: 'Expiry must be after publication.', path: ['expiresAt'] });
adminRouter.get('/announcements', asyncRoute(async (_req, res) => { const rows = await Announcement.find().sort({ createdAt: -1 }).limit(200).lean<any[]>(); res.json({ items: rows.map(announcementResponse) }); }));
adminRouter.post('/announcements', asyncRoute(async (req, res) => { const input = announcementInput.parse(req.body); const row = await Announcement.create({ ...input, publishAt: input.status === 'PUBLISHED' ? input.publishAt ?? new Date() : input.publishAt ?? null, createdBy: req.auth!.accountId, updatedBy: req.auth!.accountId }); await audit(req.auth!.accountId, 'ANNOUNCEMENT_CREATED', 'Announcement', String(row._id), { status: row.status }); res.status(201).json(announcementResponse(row)); }));
adminRouter.put('/announcements/:announcementId', asyncRoute(async (req, res) => { const announcementId = id.parse(req.params.announcementId); const input = announcementInput.parse(req.body); const row = await Announcement.findOneAndUpdate({ _id: announcementId, status: { $ne: 'ARCHIVED' } }, { ...input, publishAt: input.status === 'PUBLISHED' ? input.publishAt ?? new Date() : input.publishAt ?? null, updatedBy: req.auth!.accountId }, { new: true }); if (!row) throw new HttpError(404, 'Active announcement not found.'); await audit(req.auth!.accountId, 'ANNOUNCEMENT_UPDATED', 'Announcement', announcementId, { status: row.status }); res.json(announcementResponse(row)); }));
adminRouter.post('/announcements/:announcementId/archive', asyncRoute(async (req, res) => { const announcementId = id.parse(req.params.announcementId); const row = await Announcement.findOneAndUpdate({ _id: announcementId, status: { $ne: 'ARCHIVED' } }, { status: 'ARCHIVED', archivedAt: new Date(), updatedBy: req.auth!.accountId }, { new: true }); if (!row) throw new HttpError(404, 'Active announcement not found.'); await audit(req.auth!.accountId, 'ANNOUNCEMENT_ARCHIVED', 'Announcement', announcementId); res.json(announcementResponse(row)); }));
adminRouter.delete('/announcements/:announcementId', requireRoles('OWNER'), asyncRoute(async (req, res) => { const announcementId = id.parse(req.params.announcementId); const row = await Announcement.findOne({ _id: announcementId, status: 'DRAFT' }); if (!row) throw new HttpError(409, 'Only draft announcements can be permanently deleted.'); await Announcement.deleteOne({ _id: row._id }); await audit(req.auth!.accountId, 'ANNOUNCEMENT_DELETED', 'Announcement', announcementId, { title: row.title }); res.status(204).end(); }));

function stationResponse(row: any) {
  return { id: String(row._id), stationId: row.stationId, name: row.name, isActive: Boolean(row.isActive), createdAt: row.createdAt };
}

adminRouter.get('/stations', asyncRoute(async (_req, res) => {
  const rows = await AttendanceStation.find().sort({ name: 1 }).lean<any[]>();
  res.json({ items: rows.map(stationResponse) });
}));
adminRouter.post('/stations', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const input = z.object({ stationId: z.string().trim().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Use only letters, numbers, hyphens, and underscores.'), name: z.string().trim().min(2).max(100) }).parse(req.body);
  try {
    const row = await AttendanceStation.create({ ...input, createdBy: req.auth!.accountId });
    await audit(req.auth!.accountId, 'STATION_CREATED', 'AttendanceStation', String(row._id));
    res.status(201).json(stationResponse(row));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'That station ID is already registered.');
    throw error;
  }
}));
adminRouter.patch('/stations/:stationId/status', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const stationId = id.parse(req.params.stationId);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const row = await AttendanceStation.findByIdAndUpdate(stationId, { isActive }, { new: true });
  if (!row) throw new HttpError(404, 'Attendance station not found.');
  await audit(req.auth!.accountId, isActive ? 'STATION_ENABLED' : 'STATION_DISABLED', 'AttendanceStation', stationId);
  res.json(stationResponse(row));
}));

function adminAccountResponse(row: any) {
  return {
    id: String(row._id), username: row.username, firstName: row.firstName, lastName: row.lastName,
    role: row.role, isActive: Boolean(row.isActive), lastLoginAt: row.lastLoginAt ?? undefined, createdAt: row.createdAt,
  };
}

adminRouter.get('/accounts', requireRoles('OWNER'), asyncRoute(async (_req, res) => {
  const rows = await Account.find({ role: { $in: ['OWNER', 'ADMIN'] } }).sort({ role: -1, firstName: 1, lastName: 1 }).lean<any[]>();
  res.json({ items: rows.map(adminAccountResponse) });
}));
adminRouter.post('/accounts', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const input = person.pick({ firstName: true, lastName: true }).extend({ username: z.string().trim().min(3).max(100) }).parse(req.body);
  const password = temporaryPassword();
  try {
    const row = await Account.create({ ...input, username: normalizeUsername(input.username), passwordHash: await hashPassword(password), role: 'ADMIN', mustChangePassword: true });
    await audit(req.auth!.accountId, 'ADMIN_ACCOUNT_CREATED', 'Account', String(row._id), { role: row.role });
    res.status(201).json({ ...adminAccountResponse(row), temporaryPassword: password });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'That username is already in use.');
    throw error;
  }
}));
adminRouter.patch('/accounts/:accountId/status', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const accountId = id.parse(req.params.accountId);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  if (accountId === req.auth!.accountId) throw new HttpError(400, 'You cannot disable your own account.');
  const row = await Account.findOneAndUpdate({ _id: accountId, role: 'ADMIN' }, { isActive }, { new: true });
  if (!row) throw new HttpError(404, 'Administrator account not found.');
  if (!isActive) await AuthSession.deleteMany({ accountId: row._id });
  await audit(req.auth!.accountId, isActive ? 'ADMIN_ACCOUNT_ENABLED' : 'ADMIN_ACCOUNT_DISABLED', 'Account', accountId);
  await notifyOwners({ type: 'SECURITY', tone: 'WARNING', dedupeKey: `admin-status:${accountId}:${isActive}:${Date.now()}`, sourceId: accountId, title: `Administrator account ${isActive ? 'enabled' : 'disabled'}`, message: `${row.firstName} ${row.lastName}'s administrator access was ${isActive ? 'restored' : 'disabled'}.`, actionUrl: '/admin/settings?tab=accounts' });
  res.json(adminAccountResponse(row));
}));
adminRouter.post('/accounts/:accountId/reset-password', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const accountId = id.parse(req.params.accountId);
  const row = await Account.findOne({ _id: accountId, role: 'ADMIN' });
  if (!row) throw new HttpError(404, 'Administrator account not found.');
  const password = temporaryPassword();
  row.passwordHash = await hashPassword(password);
  row.mustChangePassword = true;
  await row.save();
  await AuthSession.deleteMany({ accountId: row._id });
  await audit(req.auth!.accountId, 'ADMIN_PASSWORD_RESET', 'Account', accountId);
  await createNotification(accountId, { type: 'SECURITY', tone: 'WARNING', dedupeKey: `password-reset:${accountId}:${Date.now()}`, sourceId: accountId, title: 'Your password was reset', message: 'The system owner issued a temporary password and signed out your other sessions. Change it before continuing.', actionUrl: '/admin/settings?tab=security' });
  await notifyOwners({ type: 'SECURITY', tone: 'WARNING', dedupeKey: `admin-password-reset:${accountId}:${Date.now()}`, sourceId: accountId, title: 'Administrator password reset', message: `${row.firstName} ${row.lastName}'s password was reset and their active sessions were revoked.`, actionUrl: '/admin/settings?tab=accounts' });
  res.json({ temporaryPassword: password });
}));

function coachResponse(row: any, account?: any, attendance?: any, card?: any) {
  const names = String(row.fullName ?? '').trim().split(/\s+/);
  return {
    id: String(row._id), coachNumber: row.coachNumber ?? 'Legacy coach',
    firstName: row.firstName ?? names[0] ?? '', lastName: row.lastName ?? names.slice(1).join(' '), fullName: row.fullName,
    phone: row.phone ?? '', email: row.email ?? '', specialty: row.specialty, availability: row.availability,
    specialties: Array.isArray(row.specialties) && row.specialties.length ? row.specialties : String(row.specialty ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    availabilitySchedule: Array.isArray(row.availabilitySchedule) ? row.availabilitySchedule.map((entry: any) => ({ day: entry.day, startTime: entry.startTime, endTime: entry.endTime })) : [],
    status: row.status ?? 'ACTIVE', isPublished: Boolean(row.isPublished),
    account: account ? { id: String(account._id), username: account.username, isActive: Boolean(account.isActive), mustChangePassword: Boolean(account.mustChangePassword), lastLoginAt: account.lastLoginAt ?? undefined } : undefined,
    attendanceToday: attendance ? { id: String(attendance._id), checkedInAt: attendance.checkedInAt, checkedOutAt: attendance.checkedOutAt ?? undefined } : undefined,
    nfcCard: card ? { id: String(card._id), uid: card.uid, status: card.status, assignedAt: card.assignedAt } : undefined,
  };
}

adminRouter.get('/coaches', asyncRoute(async (_req, res) => {
  const coaches = await Coach.find().sort({ fullName: 1 }).lean<any[]>();
  const coachIds = coaches.map((row) => row._id);
  const todayKey = manilaDateKey();
  const [accounts, attendance, cards] = await Promise.all([
    Account.find({ role: 'COACH', coachId: { $in: coachIds } }).lean<any[]>(),
    CoachAttendance.find({ coachId: { $in: coachIds }, attendanceDate: todayKey }).lean<any[]>(),
    CoachNfcCard.find({ coachId: { $in: coachIds }, status: 'ACTIVE' }).lean<any[]>(),
  ]);
  const accountByCoach = new Map(accounts.map((row) => [String(row.coachId), row]));
  const attendanceByCoach = new Map(attendance.map((row) => [String(row.coachId), row]));
  const cardByCoach = new Map(cards.map((row) => [String(row.coachId), row]));
  res.json({ items: coaches.map((row) => coachResponse(row, accountByCoach.get(String(row._id)), attendanceByCoach.get(String(row._id)), cardByCoach.get(String(row._id)))) });
}));

adminRouter.post('/coaches', asyncRoute(async (req, res) => {
  const input = coachProfile.extend({ username: z.string().trim().min(3).max(100) }).parse(req.body);
  const username = normalizeUsername(input.username);
  if (await Account.exists({ username })) throw new HttpError(409, 'That login username is already in use.');
  const password = temporaryPassword();
  const session = await mongoose.startSession();
  let output: ReturnType<typeof coachResponse> & { temporaryPassword: string } | undefined;
  try {
    await session.withTransaction(async () => {
      const [coach] = await Coach.create([{ coachNumber: reference('COACH'), firstName: input.firstName, lastName: input.lastName, fullName: `${input.firstName} ${input.lastName}`, phone: input.phone || null, email: input.email?.toLowerCase() || null, specialties: input.specialties, specialty: input.specialties.join(', '), availabilitySchedule: input.availabilitySchedule, availability: coachAvailabilityLabel(input.availabilitySchedule), status: 'ACTIVE', isPublished: input.isPublished }], { session });
      const [account] = await Account.create([{ username, passwordHash: await hashPassword(password), role: 'COACH', firstName: input.firstName, lastName: input.lastName, coachId: coach!._id, mustChangePassword: true }], { session });
      await audit(req.auth!.accountId, 'COACH_CREATED', 'Coach', String(coach!._id), { username }, session);
      output = { ...coachResponse(coach, account), temporaryPassword: password };
    });
  } finally { await session.endSession(); }
  res.status(201).json(output);
}));

adminRouter.put('/coaches/:coachId', asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const input = coachProfile.parse(req.body);
  const session = await mongoose.startSession();
  let output: ReturnType<typeof coachResponse> | undefined;
  try {
    await session.withTransaction(async () => {
      const coach = await Coach.findByIdAndUpdate(coachId, { firstName: input.firstName, lastName: input.lastName, fullName: `${input.firstName} ${input.lastName}`, phone: input.phone || null, email: input.email?.toLowerCase() || null, specialties: input.specialties, specialty: input.specialties.join(', '), availabilitySchedule: input.availabilitySchedule, availability: coachAvailabilityLabel(input.availabilitySchedule), isPublished: input.isPublished }, { new: true, runValidators: true, session });
      if (!coach) throw new HttpError(404, 'Coach not found.');
      const account = await Account.findOneAndUpdate({ coachId, role: 'COACH' }, { firstName: input.firstName, lastName: input.lastName }, { new: true, session });
      await audit(req.auth!.accountId, 'COACH_UPDATED', 'Coach', coachId, {}, session);
      output = coachResponse(coach, account);
    });
  } finally { await session.endSession(); }
  res.json(output);
}));

adminRouter.patch('/coaches/:coachId/status', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const { status, reason } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']), reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const coach = await Coach.findByIdAndUpdate(coachId, { status, isPublished: status === 'ACTIVE' }, { new: true });
  if (!coach) throw new HttpError(404, 'Coach not found.');
  const account = await Account.findOneAndUpdate({ coachId, role: 'COACH' }, { isActive: status === 'ACTIVE' }, { new: true });
  if (status === 'INACTIVE' && account) await AuthSession.deleteMany({ accountId: account._id });
  await audit(req.auth!.accountId, status === 'ACTIVE' ? 'COACH_ENABLED' : 'COACH_DISABLED', 'Coach', coachId, { reason });
  res.json(coachResponse(coach, account));
}));

adminRouter.post('/coaches/:coachId/reset-password', requireRoles('OWNER'), asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const account = await Account.findOne({ coachId, role: 'COACH' });
  if (!account) throw new HttpError(404, 'Coach login account not found.');
  const password = temporaryPassword();
  account.passwordHash = await hashPassword(password); account.mustChangePassword = true; await account.save();
  await AuthSession.deleteMany({ accountId: account._id });
  await audit(req.auth!.accountId, 'COACH_PASSWORD_RESET', 'Account', String(account._id), { coachId });
  res.json({ username: account.username, temporaryPassword: password });
}));

adminRouter.get('/coaches/:coachId/attendance', asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(5).max(50).default(10) }).parse(req.query);
  if (!await Coach.exists({ _id: coachId })) throw new HttpError(404, 'Coach not found.');
  const [rows, total] = await Promise.all([CoachAttendance.find({ coachId }).sort({ attendanceDate: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(), CoachAttendance.countDocuments({ coachId })]);
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map((row) => ({ id: String(row._id), attendanceDate: row.attendanceDate, checkedInAt: row.checkedInAt, checkedOutAt: row.checkedOutAt ?? undefined, method: row.method, reason: row.reason ?? undefined })) });
}));

adminRouter.post('/coaches/:coachId/attendance/check-in', asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  if (!await Coach.exists({ _id: coachId, status: 'ACTIVE' })) throw new HttpError(404, 'Active coach not found.');
  try {
    const row = await CoachAttendance.create({ coachId, attendanceDate: manilaDateKey(), checkedInAt: new Date(), method: 'MANUAL', reason, recordedBy: req.auth!.accountId });
    await audit(req.auth!.accountId, 'COACH_CHECKED_IN', 'CoachAttendance', String(row._id), { coachId, reason });
    res.status(201).json({ id: String(row._id), checkedInAt: row.checkedInAt });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'This coach is already checked in today.');
    throw error;
  }
}));

adminRouter.post('/coaches/:coachId/attendance/check-out', asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const row = await CoachAttendance.findOneAndUpdate({ coachId, attendanceDate: manilaDateKey(), checkedOutAt: null }, { checkedOutAt: new Date(), reason }, { new: true });
  if (!row) throw new HttpError(409, 'No open check-in was found for this coach today.');
  await audit(req.auth!.accountId, 'COACH_CHECKED_OUT', 'CoachAttendance', String(row._id), { coachId, reason });
  res.json({ id: String(row._id), checkedInAt: row.checkedInAt, checkedOutAt: row.checkedOutAt });
}));

adminRouter.post('/coaches/:coachId/nfc-card', asyncRoute(async (req, res) => {
  const coachId = id.parse(req.params.coachId);
  const { uid } = z.object({ uid: z.string().min(4).max(100) }).parse(req.body);
  const normalizedUid = normalizeCardUid(uid);
  const coach = await Coach.findOne({ _id: coachId, status: 'ACTIVE' });
  if (!coach) throw new HttpError(404, 'Active coach not found.');
  if (await NfcCard.exists({ uid: normalizedUid })) throw new HttpError(409, 'This NFC card is already registered to a member.');
  try {
    const card = await CoachNfcCard.create({ uid: normalizedUid, coachId, assignedBy: req.auth!.accountId });
    await audit(req.auth!.accountId, 'COACH_NFC_CARD_ASSIGNED', 'CoachNfcCard', String(card._id), { coachId });
    res.status(201).json({ id: String(card._id), uid: card.uid, status: card.status, assignedAt: card.assignedAt });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'This coach already has an active card, or this UID is already registered.');
    throw error;
  }
}));
