import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  Account, AttendanceLock, AttendanceRecord, AttendanceStation, AuditLog, AuthSession, Coach, GymSettings,
  Member, Membership, MembershipLock, MembershipPlan, NfcCard, Payment, WalkInProfile, WalkInVisit,
} from '../models.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { asyncRoute, HttpError } from '../http.js';
import { calculatePausedTime, calculateResumedExpiry, DAY_MILLISECONDS, extendActiveMembership } from '../membership-lifecycle.js';
import { membershipPricing, planIsEligible, type MemberType, type PlanEligibility } from '../membership-pricing.js';
import { requireReadyAccount, requireRoles } from '../middleware.js';
import { addDays, hashPassword, memberNumber, normalizeCardUid, normalizeUsername, portalTokenHash, randomToken, reference, temporaryPassword } from '../security.js';

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

adminRouter.get('/dashboard', asyncRoute(async (_req, res) => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const soon = addDays(now, 7);
  const [activeMembers, attendanceToday, walkInsToday, payments, expiringSoon, cardsPending, activity] = await Promise.all([
    Membership.countDocuments({ status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }),
    AttendanceRecord.countDocuments({ recordedAt: { $gte: today } }),
    WalkInVisit.countDocuments({ visitedAt: { $gte: today } }),
    Payment.aggregate([{ $match: { status: 'COMPLETED', receivedAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$amountDue' } } }]),
    Membership.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: now, $lte: soon } }),
    Member.aggregate([{ $match: { status: 'ACTIVE' } }, { $lookup: { from: 'nfccards', let: { mid: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$memberId', '$$mid'] }, { $eq: ['$status', 'ACTIVE'] }] } } }], as: 'cards' } }, { $match: { cards: { $size: 0 } } }, { $count: 'count' }]),
    AuditLog.find().sort({ occurredAt: -1 }).limit(8).lean<any[]>(),
  ]);
  res.json({ activeMembers, attendanceToday, walkInsToday, cashToday: payments[0]?.total ?? 0, cardsPending: cardsPending[0]?.count ?? 0, expiringSoon,
    recentActivity: activity.map((row) => ({ id: String(row._id), label: String(row.action).replaceAll('_', ' '), detail: `${row.targetType}${row.targetId ? ` · ${row.targetId}` : ''}`, occurredAt: row.occurredAt })) });
}));

adminRouter.get('/members', asyncRoute(async (req, res) => {
  await expireDueMemberships();
  const search = String(req.query.search ?? '').trim();
  const escapedSearch = regexLiteral(search);
  const filter = search ? { $or: [
    { firstName: { $regex: escapedSearch, $options: 'i' } }, { lastName: { $regex: escapedSearch, $options: 'i' } },
    { memberNumber: { $regex: escapedSearch, $options: 'i' } }, { phone: { $regex: escapedSearch, $options: 'i' } },
  ] } : {};
  const members = await Member.find(filter).sort({ createdAt: -1 }).limit(100).lean<any[]>();
  const memberIds = members.map((row) => row._id);
  const [memberships, cards] = await Promise.all([
    Membership.find({ memberId: { $in: memberIds } }).sort({ startsAt: -1 }).lean<any[]>(),
    NfcCard.find({ memberId: { $in: memberIds }, status: 'ACTIVE' }).lean<any[]>(),
  ]);
  const latest = new Map<string, any>(); memberships.forEach((row) => { if (!latest.has(String(row.memberId))) latest.set(String(row.memberId), row); });
  const cardMap = new Map(cards.map((row) => [String(row.memberId), row.status]));
  res.json({ items: members.map((row) => { const membership = latest.get(String(row._id)); return { id: String(row._id), memberNumber: row.memberNumber, fullName: `${row.firstName} ${row.lastName}`, phone: row.phone ?? undefined, status: row.status, membership: membership ? { plan: membership.planName, status: membership.status, expiresAt: membership.expiresAt } : undefined, cardStatus: cardMap.get(String(row._id)) ?? 'UNASSIGNED' }; }) });
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
    attendance: attendance.map((row) => ({ id: String(row._id), status: row.status, stationId: row.stationId, recordedAt: row.recordedAt })),
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
  const input = person.extend({ birthDate: z.coerce.date(), emergencyContact, memberType, studentIdVerified: z.boolean(), username: z.string().trim().min(3).max(100), planId: id, amountReceived: z.number().nonnegative(), consent: z.object({ termsAccepted: z.literal(true), privacyAccepted: z.literal(true), liabilityAccepted: z.literal(true), version: z.string().trim().min(1).max(40) }), startsAt: z.coerce.date().optional(), sourceWalkInProfileId: id.optional() }).parse(req.body);
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
      const number = memberNumber(); const username = normalizeUsername(input.username); const start = input.startsAt ?? new Date(); const acceptedAt = new Date();
      const [member] = await Member.create([{ memberNumber: number, firstName: input.firstName, lastName: input.lastName, phone: input.phone || null, email: input.email || null, birthDate: input.birthDate, emergencyContact: input.emergencyContact, memberType: input.memberType, studentVerifiedAt: input.memberType === 'STUDENT' ? acceptedAt : null, studentVerifiedBy: input.memberType === 'STUDENT' ? req.auth!.accountId : null, enrollmentConsent: { termsAcceptedAt: acceptedAt, privacyAcceptedAt: acceptedAt, liabilityAcceptedAt: acceptedAt, version: input.consent.version, recordedBy: req.auth!.accountId }, sourceWalkInProfileId: input.sourceWalkInProfileId ?? null }], { session: transaction });
      await Account.create([{ username, passwordHash: await hashPassword(password), role: 'MEMBER', firstName: input.firstName, lastName: input.lastName, memberId: member!._id, mustChangePassword: true }], { session: transaction });
      const [membership] = await Membership.create([{ memberId: member!._id, planId: plan._id, planName: plan.name, pricePaid: plan.price, startsAt: start, expiresAt: addDays(start, plan.durationDays), status: 'ACTIVE', activatedBy: req.auth!.accountId }], { session: transaction });
      const paymentReference = reference('PAY');
      await Payment.create([{ reference: paymentReference, memberId: member!._id, membershipId: membership!._id, type: 'MEMBERSHIP', amountDue: pricing.totalDue, planAmount: pricing.planAmount, membershipFee: pricing.membershipFee, amountReceived: input.amountReceived, change: input.amountReceived - pricing.totalDue, receivedBy: req.auth!.accountId }], { session: transaction });
      if (input.sourceWalkInProfileId) await WalkInProfile.updateOne({ _id: input.sourceWalkInProfileId, convertedMemberId: null }, { convertedMemberId: member!._id }, { session: transaction });
      await audit(req.auth!.accountId, 'MEMBER_ENROLLED', 'Member', String(member!._id), { plan: plan.name, memberType: input.memberType, studentIdVerified: input.studentIdVerified, paymentReference, consentVersion: input.consent.version, ...pricing }, transaction);
      result = { memberId: String(member!._id), memberNumber: number, username, temporaryPassword: password, paymentReference };
    });
  } finally { await transaction.endSession(); }
  res.status(201).json(result);
}));

adminRouter.get('/attendance', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await AttendanceRecord.find().sort({ recordedAt: -1 }).limit(limit).populate('memberId', 'firstName lastName memberNumber').lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), memberName: `${row.memberId?.firstName ?? ''} ${row.memberId?.lastName ?? ''}`.trim(), memberNumber: row.memberId?.memberNumber ?? 'Unknown', status: row.status, recordedAt: row.recordedAt })) });
}));

adminRouter.post('/attendance/scan', asyncRoute(async (req, res) => {
  const { cardUid } = z.object({ cardUid: z.string().min(4).max(100) }).parse(req.body);
  const stationId = req.get('x-attendance-station');
  if (!stationId) throw new HttpError(400, 'This device is not configured as an attendance station.');
  const station = await AttendanceStation.findOne({ stationId, isActive: true }).lean<any>();
  if (!station) throw new HttpError(403, 'This attendance station is not registered or has been disabled.');
  const card = await NfcCard.findOne({ uid: normalizeCardUid(cardUid), status: 'ACTIVE' }).populate('memberId', 'firstName lastName status').lean<any>();
  if (!card || card.memberId?.status !== 'ACTIVE') throw new HttpError(404, 'This NFC card is not assigned to an active member.');
  const now = new Date();
  const membership = await Membership.findOne({ memberId: card.memberId._id, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }).lean<any>();
  if (!membership) throw new HttpError(403, 'This member does not have an active membership.');
  const cutoff = new Date(now.getTime() - config().ATTENDANCE_DUPLICATE_SECONDS * 1000);
  const transaction = await mongoose.startSession();
  let record: any;
  try {
    await transaction.withTransaction(async () => {
      await AttendanceLock.findOneAndUpdate({ _id: card.memberId._id, $or: [{ lastAcceptedAt: { $lte: cutoff } }, { lastAcceptedAt: { $exists: false } }] }, { $set: { lastAcceptedAt: now } }, { upsert: true, session: transaction });
      [record] = await AttendanceRecord.create([{ memberId: card.memberId._id, cardId: card._id, stationId, recordedAt: now, recordedBy: req.auth!.accountId }], { session: transaction });
      await audit(req.auth!.accountId, 'ATTENDANCE_RECORDED', 'AttendanceRecord', String(record!._id), { stationId }, transaction);
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'Attendance was already recorded moments ago.', 'DUPLICATE_SCAN');
    throw error;
  } finally { await transaction.endSession(); }
  res.status(201).json({ accepted: true, message: 'Attendance recorded.', memberName: `${card.memberId.firstName} ${card.memberId.lastName}` });
}));

adminRouter.post('/attendance/manual', asyncRoute(async (req, res) => {
  const { memberId, reason } = z.object({ memberId: id, reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const now = new Date();
  const [member, membership] = await Promise.all([
    Member.findOne({ _id: memberId, status: 'ACTIVE' }).lean<any>(),
    Membership.findOne({ memberId, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }).lean<any>(),
  ]);
  if (!member) throw new HttpError(404, 'Active member not found.');
  if (!membership) throw new HttpError(403, 'This member does not have a current active membership.');
  const cutoff = new Date(now.getTime() - config().ATTENDANCE_DUPLICATE_SECONDS * 1000);
  const session = await mongoose.startSession();
  let record: any;
  try {
    await session.withTransaction(async () => {
      await AttendanceLock.findOneAndUpdate({ _id: member._id, $or: [{ lastAcceptedAt: { $lte: cutoff } }, { lastAcceptedAt: { $exists: false } }] }, { $set: { lastAcceptedAt: now } }, { upsert: true, session });
      [record] = await AttendanceRecord.create([{ memberId: member._id, cardId: null, stationId: 'ADMIN_MANUAL', status: 'MANUAL', reason, recordedAt: now, recordedBy: req.auth!.accountId }], { session });
      await audit(req.auth!.accountId, 'ATTENDANCE_RECORDED_MANUALLY', 'AttendanceRecord', String(record!._id), { memberId, reason }, session);
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, 'Attendance was already recorded moments ago.', 'DUPLICATE_ATTENDANCE');
    throw error;
  } finally { await session.endSession(); }
  res.status(201).json({ accepted: true, message: `Manual attendance recorded for ${member.firstName} ${member.lastName}.`, memberName: `${member.firstName} ${member.lastName}` });
}));

adminRouter.get('/walk-ins', asyncRoute(async (_req, res) => {
  const rows = await WalkInProfile.find().sort({ lastVisitAt: -1 }).limit(100).lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), fullName: `${row.firstName} ${row.lastName}`, visits: row.totalVisits, lastVisitAt: row.lastVisitAt })) });
}));

adminRouter.post('/walk-ins', asyncRoute(async (req, res) => {
  const input = person.extend({ profileId: id.optional(), amountReceived: z.number().nonnegative(), notes: z.string().max(500).optional() }).parse(req.body);
  const settings = await GymSettings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { defaultWalkInFee: 70 } }, { upsert: true, new: true }).lean<any>();
  const fee = settings.defaultWalkInFee;
  if (input.amountReceived < fee) throw new HttpError(400, 'Cash received is below the walk-in fee.');
  const transaction = await mongoose.startSession();
  let output: any;
  try {
    await transaction.withTransaction(async () => {
      let profile: any;
      if (input.profileId) profile = await WalkInProfile.findById(input.profileId).session(transaction);
      else [profile] = await WalkInProfile.create([{ firstName: input.firstName, lastName: input.lastName, phone: input.phone || null, email: input.email || null }], { session: transaction });
      if (!profile) throw new HttpError(404, 'Walk-in profile not found.');
      const paymentReference = reference('WALK');
      const [payment] = await Payment.create([{ reference: paymentReference, walkInProfileId: profile._id, type: 'WALK_IN', amountDue: fee, amountReceived: input.amountReceived, change: input.amountReceived - fee, receivedBy: req.auth!.accountId, notes: input.notes ?? '' }], { session: transaction });
      const [visit] = await WalkInVisit.create([{ profileId: profile._id, paymentId: payment!._id, recordedBy: req.auth!.accountId }], { session: transaction });
      profile.totalVisits += 1; profile.lastVisitAt = visit!.visitedAt; await profile.save({ session: transaction });
      await audit(req.auth!.accountId, 'WALK_IN_RECORDED', 'WalkInVisit', String(visit!._id), { paymentReference }, transaction);
      output = { id: String(visit!._id), paymentReference, amountDue: fee, change: input.amountReceived - fee };
    });
  } finally { await transaction.endSession(); }
  res.status(201).json(output);
}));

adminRouter.get('/nfc-cards', asyncRoute(async (_req, res) => {
  const rows = await NfcCard.find().sort({ assignedAt: -1 }).populate('memberId', 'firstName lastName').lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), uid: row.uid, memberName: row.memberId ? `${row.memberId.firstName} ${row.memberId.lastName}` : undefined, status: row.status })) });
}));

adminRouter.post('/nfc-cards', asyncRoute(async (req, res) => {
  const input = z.object({ memberId: id, uid: z.string().min(4).max(100) }).parse(req.body);
  const now = new Date();
  const [member, membership] = await Promise.all([Member.findOne({ _id: input.memberId, status: 'ACTIVE' }), Membership.findOne({ memberId: input.memberId, status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } })]);
  if (!member) throw new HttpError(404, 'Member not found.');
  if (!membership) throw new HttpError(400, 'Assign a card only after activating the membership.');
  const token = randomToken();
  const card = await NfcCard.create({ uid: normalizeCardUid(input.uid), portalTokenHash: portalTokenHash(token), memberId: member._id, assignedBy: req.auth!.accountId });
  await audit(req.auth!.accountId, 'NFC_CARD_ASSIGNED', 'NfcCard', String(card._id), { memberId: input.memberId });
  res.status(201).json({ id: String(card._id), uid: card.uid, portalUrl: `${config().MEMBER_APP_ORIGIN}/c/${token}`, note: 'Save or encode this URL now. The API does not store the readable token.' });
}));

adminRouter.post('/nfc-cards/:cardId/revoke', asyncRoute(async (req, res) => {
  const cardId = id.parse(req.params.cardId); const { reason, status } = z.object({ reason: z.string().trim().min(3).max(300), status: z.enum(['REVOKED', 'LOST', 'REPLACED']).default('REVOKED') }).parse(req.body);
  const card = await NfcCard.findOneAndUpdate({ _id: cardId, status: 'ACTIVE' }, { status, revokedAt: new Date(), revokeReason: reason }, { new: true });
  if (!card) throw new HttpError(404, 'Active card not found.');
  await audit(req.auth!.accountId, 'NFC_CARD_REVOKED', 'NfcCard', cardId, { reason, status }); res.status(204).end();
}));

adminRouter.get('/payments', asyncRoute(async (_req, res) => {
  const rows = await Payment.find().sort({ receivedAt: -1 }).limit(200).populate('memberId', 'firstName lastName').populate('walkInProfileId', 'firstName lastName').lean<any[]>();
  res.json({ items: rows.map((row) => { const payer = row.memberId ?? row.walkInProfileId; return { id: String(row._id), reference: row.reference, payerName: payer ? `${payer.firstName} ${payer.lastName}` : 'Unknown', amount: row.amountDue, type: row.type, receivedAt: row.receivedAt }; }) });
}));

adminRouter.get('/plans', asyncRoute(async (_req, res) => { const [items, settings] = await Promise.all([MembershipPlan.find().sort({ price: 1 }).lean<any[]>(), GymSettings.findOne({ key: 'primary' }).lean<any>()]); res.json({ items: items.map((row) => ({ ...row, eligibility: row.eligibility ?? 'ALL', isPromo: Boolean(row.isPromo) })), firstMembershipFee: settings?.firstMembershipFee ?? 100 }); }));
const planInput = z.object({ name: z.string().trim().min(2).max(100), price: z.number().nonnegative(), durationDays: z.number().int().positive().max(3650), eligibility: planEligibility, isPromo: z.boolean() });
adminRouter.post('/plans', asyncRoute(async (req, res) => { const input = planInput.parse(req.body); const row = await MembershipPlan.create(input); await audit(req.auth!.accountId, 'PLAN_CREATED', 'MembershipPlan', String(row._id)); res.status(201).json(row); }));
adminRouter.put('/plans/:planId', asyncRoute(async (req, res) => { const planId = id.parse(req.params.planId); const input = planInput.parse(req.body); const row = await MembershipPlan.findByIdAndUpdate(planId, input, { new: true }); if (!row) throw new HttpError(404, 'Membership plan not found.'); await audit(req.auth!.accountId, 'PLAN_UPDATED', 'MembershipPlan', planId); res.json(row); }));
adminRouter.patch('/plans/:planId/status', asyncRoute(async (req, res) => { const planId = id.parse(req.params.planId); const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body); const row = await MembershipPlan.findByIdAndUpdate(planId, { isActive }, { new: true }); if (!row) throw new HttpError(404, 'Membership plan not found.'); await audit(req.auth!.accountId, isActive ? 'PLAN_ENABLED' : 'PLAN_DISABLED', 'MembershipPlan', planId); res.json(row); }));

adminRouter.get('/settings', asyncRoute(async (_req, res) => { const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { defaultWalkInFee: 70, firstMembershipFee: 100 } }, { upsert: true, new: true }).lean<any>(); res.json({ ...row, firstMembershipFee: row.firstMembershipFee ?? 100 }); }));
adminRouter.put('/settings', asyncRoute(async (req, res) => { const input = z.object({ defaultWalkInFee: z.number().nonnegative(), firstMembershipFee: z.number().nonnegative(), gymStatusOverride: z.enum(['AUTO', 'OPEN', 'CLOSED']), hoursToday: z.string().trim().min(3).max(100) }).parse(req.body); const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, input, { upsert: true, new: true }); await audit(req.auth!.accountId, 'SETTINGS_UPDATED', 'GymSettings', String(row!._id)); res.json(row); }));

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
  res.json({ temporaryPassword: password });
}));

adminRouter.get('/coaches', asyncRoute(async (_req, res) => { res.json({ items: await Coach.find().sort({ fullName: 1 }).lean() }); }));
