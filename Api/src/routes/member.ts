import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Account, Announcement, AttendanceRecord, Coach, GymSettings, Member, MemberRequest, Membership, NfcCard, Notification, Payment } from '../models.js';
import { asyncRoute, HttpError } from '../http.js';
import { requireAuth, requireReadyAccount, requireRoles } from '../middleware.js';
import { portalTokenHash } from '../security.js';
import { audit } from '../audit.js';
import { DAY_MILLISECONDS, manilaDateKey, manilaDayBounds, manilaMonthBounds, resolveGymAvailability } from '../manila-time.js';
import { createNotification, notifyMember, notifyOwners, syncMemberNotifications } from '../notifications.js';

export const memberRouter = Router();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const requestReason = z.string().trim().min(10).max(500);
const correctionMobile = z.string().trim().transform((value) => value.replace(/\D/g, '')).refine((value) => !value || /^09\d{9}$/.test(value), 'Enter a valid Philippine mobile number.');

function currentMemberId(req: Express.Request) {
  if (!req.auth?.memberId) throw new HttpError(404, 'This account is not linked to a member profile.');
  return req.auth.memberId;
}

function notificationResponse(row: any) {
  return { id: String(row._id), type: row.type, tone: row.tone, title: row.title, message: row.message, actionUrl: row.actionUrl ?? undefined, readAt: row.readAt ?? undefined, createdAt: row.createdAt };
}

function membershipResponse(row: any) {
  return { id: String(row._id), plan: row.planName, status: row.status, pricePaid: row.pricePaid, startedAt: row.startsAt, expiresAt: row.expiresAt, pausedAt: row.pausedAt ?? undefined, statusChangedAt: row.statusChangedAt ?? undefined, statusReason: row.statusReason ?? undefined };
}

function requestResponse(row: any) {
  return { id: String(row._id), type: row.type, status: row.status, message: row.message, requestedChanges: row.requestedChanges ?? undefined, resolutionNote: row.resolutionNote ?? undefined, createdAt: row.createdAt, resolvedAt: row.resolvedAt ?? undefined };
}

memberRouter.get('/card/:token', asyncRoute(async (req, res) => {
  const token = z.string().min(20).max(200).parse(req.params.token);
  const card = await NfcCard.findOne({ portalTokenHash: portalTokenHash(token), status: 'ACTIVE' }).select('+portalTokenHash').lean<any>();
  if (!card) throw new HttpError(404, 'This card link is invalid or no longer active.');
  res.set('Cache-Control', 'no-store').json({ recognized: true });
}));

memberRouter.use(requireAuth, requireRoles('MEMBER'), requireReadyAccount);

memberRouter.get('/home', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const now = new Date(); const month = manilaMonthBounds(now); const today = manilaDayBounds(manilaDateKey(now));
  const [membership, card, settings, totalVisits, visitsThisMonth, last, todayAttendance, announcements, openRequests] = await Promise.all([
    Membership.findOne({ memberId }).sort({ startsAt: -1 }).lean<any>(),
    NfcCard.findOne({ memberId }).sort({ assignedAt: -1 }).lean<any>(),
    GymSettings.findOne({ key: 'primary' }).lean<any>(),
    AttendanceRecord.countDocuments({ memberId }),
    AttendanceRecord.countDocuments({ memberId, recordedAt: { $gte: month.start, $lt: month.end } }),
    AttendanceRecord.findOne({ memberId }).sort({ recordedAt: -1 }).lean<any>(),
    AttendanceRecord.findOne({ memberId, recordedAt: { $gte: today.start, $lt: today.end } }).sort({ recordedAt: -1 }).lean<any>(),
    Announcement.find({ status: 'PUBLISHED', publishAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).sort({ publishAt: -1 }).limit(6).lean<any[]>(),
    MemberRequest.find({ memberId, status: 'OPEN' }).sort({ createdAt: -1 }).lean<any[]>(),
  ]);
  const gym = resolveGymAvailability(settings ?? {}, now);
  res.json({
    membership: membership ? membershipResponse(membership) : null,
    card: card ? { status: card.status, assignedAt: card.assignedAt, maskedUid: `•••• ${String(card.uid).slice(-4)}` } : null,
    gym,
    attendanceSummary: { totalVisits, visitsThisMonth, lastVisitAt: last?.recordedAt, today: todayAttendance ? { id: String(todayAttendance._id), status: todayAttendance.checkedOutAt ? 'CHECKED_OUT' : 'CHECKED_IN', checkedInAt: todayAttendance.recordedAt, checkedOutAt: todayAttendance.checkedOutAt ?? undefined } : null },
    announcements: settings?.announcementsEnabled === false ? [] : announcements.map((row) => ({ id: String(row._id), title: row.title, message: row.message, publishedAt: row.publishAt })),
    openRequests: openRequests.map(requestResponse),
  });
}));

memberRouter.get('/overview', asyncRoute(async (req, res) => {
  res.redirect(307, '/v1/member/home');
}));

memberRouter.get('/memberships', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(5).max(50).default(10) }).parse(req.query);
  const [current, rows, total] = await Promise.all([
    Membership.findOne({ memberId }).sort({ startsAt: -1 }).lean<any>(),
    Membership.find({ memberId }).sort({ startsAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(),
    Membership.countDocuments({ memberId }),
  ]);
  res.json({ current: current ? membershipResponse(current) : null, page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map(membershipResponse) });
}));

memberRouter.get('/payments', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(5).max(50).default(10) }).parse(req.query);
  const [rows, total] = await Promise.all([
    Payment.find({ memberId }).sort({ receivedAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(),
    Payment.countDocuments({ memberId }),
  ]);
  res.json({ page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map((row) => ({ id: String(row._id), reference: row.reference, type: row.type, status: row.status, amount: row.amountDue, method: row.method, receivedAt: row.receivedAt })) });
}));

memberRouter.get('/payments/:paymentId', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const paymentId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.paymentId);
  const row = await Payment.findOne({ _id: paymentId, memberId }).populate('receivedBy', 'firstName lastName').lean<any>();
  if (!row) throw new HttpError(404, 'Receipt not found.');
  res.json({ id: String(row._id), reference: row.reference, type: row.type, status: row.status, amountDue: row.amountDue, planAmount: row.planAmount ?? 0, membershipFee: row.membershipFee ?? 0, amountReceived: row.amountReceived, change: row.change, method: row.method, receivedAt: row.receivedAt, receivedBy: row.receivedBy ? `${row.receivedBy.firstName} ${row.receivedBy.lastName}` : 'X-TRIM FIT GYM', voidedAt: row.voidedAt ?? undefined, voidReason: row.voidReason ?? undefined });
}));

memberRouter.get('/attendance', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(5).max(50).default(12), from: dateKey.optional(), to: dateKey.optional() }).parse(req.query);
  if (input.from && input.to && input.from > input.to) throw new HttpError(400, 'The start date must be before the end date.');
  const filter: Record<string, any> = { memberId };
  if (input.from || input.to) filter.recordedAt = { ...(input.from ? { $gte: manilaDayBounds(input.from).start } : {}), ...(input.to ? { $lt: manilaDayBounds(input.to).end } : {}) };
  const month = manilaMonthBounds();
  const [rows, total, totalVisits, visitsThisMonth] = await Promise.all([
    AttendanceRecord.find(filter).sort({ recordedAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean<any[]>(),
    AttendanceRecord.countDocuments(filter), AttendanceRecord.countDocuments({ memberId }),
    AttendanceRecord.countDocuments({ memberId, recordedAt: { $gte: month.start, $lt: month.end } }),
  ]);
  res.json({ summary: { totalVisits, visitsThisMonth }, page: input.page, limit: input.limit, total, pages: Math.max(1, Math.ceil(total / input.limit)), items: rows.map((row) => ({ id: String(row._id), attendanceDate: row.attendanceDate ?? manilaDateKey(row.recordedAt), checkedInAt: row.recordedAt, checkedOutAt: row.checkedOutAt ?? undefined, status: row.checkedOutAt ? 'CHECKED_OUT' : 'CHECKED_IN', checkInMethod: row.checkInMethod ?? (row.status === 'MANUAL' ? 'MANUAL' : 'NFC'), checkOutMethod: row.checkOutMethod ?? undefined, station: row.stationId })) });
}));

memberRouter.get('/card', asyncRoute(async (req, res) => {
  const row = await NfcCard.findOne({ memberId: currentMemberId(req) }).sort({ assignedAt: -1 }).lean<any>();
  res.json({ card: row ? { id: String(row._id), maskedUid: `•••• ${String(row.uid).slice(-4)}`, status: row.status, assignedAt: row.assignedAt, revokedAt: row.revokedAt ?? undefined } : null });
}));

memberRouter.post('/card/report-lost', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const { reason } = z.object({ reason: requestReason }).parse(req.body); const session = await mongoose.startSession(); let requestId = '';
  try { await session.withTransaction(async () => {
    const card = await NfcCard.findOneAndUpdate({ memberId, status: 'ACTIVE' }, { $set: { status: 'LOST', revokedAt: new Date(), revokeReason: reason } }, { new: true, session });
    if (!card) throw new HttpError(409, 'There is no active NFC card to report lost.');
    const [request] = await MemberRequest.create([{ memberId, type: 'NFC_LOST', message: reason }], { session });
    if (!request) throw new HttpError(500, 'The lost-card report could not be created.'); requestId = String(request._id);
    const member = await Member.findById(memberId).session(session).lean<any>();
    await audit(req.auth!.accountId, 'MEMBER_REPORTED_CARD_LOST', 'NfcCard', String(card._id), { requestId, reason }, session);
    await notifyOwners({ type: 'MEMBER_REQUEST', tone: 'WARNING', dedupeKey: `member-card-lost:${requestId}`, sourceId: memberId, title: `${member?.firstName ?? 'A member'} reported a lost NFC card`, message: `${member?.memberNumber ?? ''} disabled their card immediately. Review and issue a replacement at reception.`, actionUrl: '/admin/nfc-cards' }, undefined, session);
    await notifyMember(memberId, { type: 'CARD_UPDATE', tone: 'WARNING', dedupeKey: `member-card-lost-confirmation:${requestId}`, sourceId: String(card._id), title: 'Your NFC card is now blocked', message: 'The lost card can no longer record attendance. Visit reception for a replacement.', actionUrl: '/portal/membership' }, session);
  }); } finally { await session.endSession(); }
  res.status(201).json({ requestId, status: 'LOST' });
}));

memberRouter.get('/profile', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req);
  const [member, account] = await Promise.all([Member.findById(memberId).lean<any>(), Account.findById(req.auth!.accountId).select('username lastLoginAt').lean<any>()]);
  if (!member) throw new HttpError(404, 'Member profile not found.');
  res.json({ id: String(member._id), memberNumber: member.memberNumber, firstName: member.firstName, lastName: member.lastName, phone: member.phone ?? '', email: member.email ?? '', birthDate: member.birthDate ?? undefined, emergencyContact: member.emergencyContact ?? null, memberType: member.memberType ?? 'REGULAR', studentVerified: Boolean(member.studentVerifiedAt), username: account?.username ?? '', lastLoginAt: account?.lastLoginAt ?? undefined });
}));

memberRouter.get('/requests', asyncRoute(async (req, res) => {
  const rows = await MemberRequest.find({ memberId: currentMemberId(req) }).sort({ createdAt: -1 }).limit(50).lean<any[]>(); res.json({ items: rows.map(requestResponse) });
}));

memberRouter.post('/requests/renewal', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const { message } = z.object({ message: requestReason }).parse(req.body);
  if (await MemberRequest.exists({ memberId, type: 'RENEWAL', status: 'OPEN' })) throw new HttpError(409, 'You already have an open renewal request.');
  const row = await MemberRequest.create({ memberId, type: 'RENEWAL', message }); const member = await Member.findById(memberId).lean<any>();
  await audit(req.auth!.accountId, 'MEMBERSHIP_RENEWAL_REQUESTED', 'MemberRequest', String(row._id), { memberId });
  await notifyOwners({ type: 'MEMBER_REQUEST', tone: 'ACTION', dedupeKey: `renewal-request:${row._id}`, sourceId: memberId, title: `${member?.firstName ?? 'A member'} requested membership renewal`, message: `${member?.memberNumber ?? ''} asked reception to review their next membership.`, actionUrl: `/admin/members/${memberId}` });
  res.status(201).json(requestResponse(row));
}));

memberRouter.post('/requests/profile-correction', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); const input = z.object({ message: requestReason, phone: correctionMobile.optional(), email: z.string().trim().email().or(z.literal('')).optional(), emergencyContact: z.object({ name: z.string().trim().min(1).max(120), relationship: z.string().trim().min(1).max(40), phone: correctionMobile.refine(Boolean, 'Enter an emergency contact number.') }).optional() }).parse(req.body);
  if (await MemberRequest.exists({ memberId, type: 'PROFILE_CORRECTION', status: 'OPEN' })) throw new HttpError(409, 'You already have an open profile correction request.');
  const requestedChanges = { phone: input.phone, email: input.email, emergencyContact: input.emergencyContact };
  const row = await MemberRequest.create({ memberId, type: 'PROFILE_CORRECTION', message: input.message, requestedChanges }); const member = await Member.findById(memberId).lean<any>();
  await audit(req.auth!.accountId, 'PROFILE_CORRECTION_REQUESTED', 'MemberRequest', String(row._id), { memberId });
  await notifyOwners({ type: 'MEMBER_REQUEST', tone: 'ACTION', dedupeKey: `profile-correction:${row._id}`, sourceId: memberId, title: `${member?.firstName ?? 'A member'} requested a profile correction`, message: `${member?.memberNumber ?? ''} submitted updated contact information for review.`, actionUrl: `/admin/members/${memberId}` });
  res.status(201).json(requestResponse(row));
}));

memberRouter.get('/coaches', asyncRoute(async (_req, res) => {
  const rows = await Coach.find({ isPublished: true, status: 'ACTIVE' }).sort({ fullName: 1 }).lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), fullName: row.fullName, specialties: row.specialties?.length ? row.specialties : String(row.specialty ?? '').split(',').map((item) => item.trim()).filter(Boolean), availabilitySchedule: row.availabilitySchedule ?? [] })) });
}));

memberRouter.get('/notifications', asyncRoute(async (req, res) => {
  const memberId = currentMemberId(req); await syncMemberNotifications(req.auth!.accountId, memberId);
  const [rows, unread] = await Promise.all([Notification.find({ recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null }).sort({ createdAt: -1 }).limit(40).lean<any[]>(), Notification.countDocuments({ recipientAccountId: req.auth!.accountId, deletedAt: null, resolvedAt: null, readAt: null })]);
  res.json({ unread, items: rows.map(notificationResponse) });
}));

memberRouter.patch('/notifications/read-all', asyncRoute(async (req, res) => { await Notification.updateMany({ recipientAccountId: req.auth!.accountId, deletedAt: null, readAt: null }, { $set: { readAt: new Date() } }); res.status(204).end(); }));
memberRouter.delete('/notifications/read', asyncRoute(async (req, res) => { await Notification.updateMany({ recipientAccountId: req.auth!.accountId, readAt: { $ne: null }, deletedAt: null }, { $set: { deletedAt: new Date() } }); res.status(204).end(); }));
memberRouter.patch('/notifications/:notificationId/read', asyncRoute(async (req, res) => { const notificationId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.notificationId); const row = await Notification.findOneAndUpdate({ _id: notificationId, recipientAccountId: req.auth!.accountId, deletedAt: null }, { $set: { readAt: new Date() } }, { new: true }); if (!row) throw new HttpError(404, 'Notification not found.'); res.json(notificationResponse(row)); }));
memberRouter.delete('/notifications/:notificationId', asyncRoute(async (req, res) => { const notificationId = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.notificationId); const row = await Notification.findOneAndUpdate({ _id: notificationId, recipientAccountId: req.auth!.accountId, deletedAt: null }, { $set: { deletedAt: new Date() } }); if (!row) throw new HttpError(404, 'Notification not found.'); res.status(204).end(); }));
