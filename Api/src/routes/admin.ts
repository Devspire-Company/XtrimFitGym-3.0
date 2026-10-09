import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  Account, AttendanceLock, AttendanceRecord, AttendanceStation, AuditLog, Coach, GymSettings,
  Member, Membership, MembershipPlan, NfcCard, Payment, WalkInProfile, WalkInVisit,
} from '../models.js';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { asyncRoute, HttpError } from '../http.js';
import { requireReadyAccount, requireRoles } from '../middleware.js';
import { addDays, hashPassword, memberNumber, normalizeCardUid, normalizeUsername, portalTokenHash, randomToken, reference, temporaryPassword } from '../security.js';

export const adminRouter = Router();
adminRouter.use(requireRoles('OWNER', 'ADMIN'), requireReadyAccount);

const id = z.string().regex(/^[a-f\d]{24}$/i);
const person = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().max(30).optional(), email: z.string().trim().email().optional() });

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
  const search = String(req.query.search ?? '').trim();
  const filter = search ? { $or: [
    { firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } },
    { memberNumber: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } },
  ] } : {};
  const members = await Member.find(filter).sort({ createdAt: -1 }).limit(100).lean<any[]>();
  const memberIds = members.map((row) => row._id);
  const [memberships, cards] = await Promise.all([
    Membership.find({ memberId: { $in: memberIds } }).sort({ startsAt: -1 }).lean<any[]>(),
    NfcCard.find({ memberId: { $in: memberIds }, status: 'ACTIVE' }).lean<any[]>(),
  ]);
  const latest = new Map<string, any>(); memberships.forEach((row) => { if (!latest.has(String(row.memberId))) latest.set(String(row.memberId), row); });
  const cardMap = new Map(cards.map((row) => [String(row.memberId), row.status]));
  res.json({ items: members.map((row) => { const membership = latest.get(String(row._id)); return { id: String(row._id), memberNumber: row.memberNumber, fullName: `${row.firstName} ${row.lastName}`, phone: row.phone ?? undefined, membership: membership ? { plan: membership.planName, status: membership.status, expiresAt: membership.expiresAt } : undefined, cardStatus: cardMap.get(String(row._id)) ?? 'UNASSIGNED' }; }) });
}));

adminRouter.post('/enrollments', asyncRoute(async (req, res) => {
  const input = person.extend({ username: z.string().trim().min(3).max(100), planId: id, amountReceived: z.number().nonnegative(), startsAt: z.coerce.date().optional() }).parse(req.body);
  const plan = await MembershipPlan.findOne({ _id: input.planId, isActive: true }).lean<any>();
  if (!plan) throw new HttpError(404, 'The selected membership plan is not available.');
  if (input.amountReceived < plan.price) throw new HttpError(400, 'Cash received is below the membership price.');
  const password = temporaryPassword();
  const transaction = await mongoose.startSession();
  let result: { memberId: string; memberNumber: string; username: string; temporaryPassword: string; paymentReference: string } | undefined;
  try {
    await transaction.withTransaction(async () => {
      const number = memberNumber(); const username = normalizeUsername(input.username); const start = input.startsAt ?? new Date();
      const [member] = await Member.create([{ memberNumber: number, firstName: input.firstName, lastName: input.lastName, phone: input.phone || null, email: input.email || null }], { session: transaction });
      await Account.create([{ username, passwordHash: await hashPassword(password), role: 'MEMBER', firstName: input.firstName, lastName: input.lastName, memberId: member!._id, mustChangePassword: true }], { session: transaction });
      await Membership.create([{ memberId: member!._id, planId: plan._id, planName: plan.name, pricePaid: plan.price, startsAt: start, expiresAt: addDays(start, plan.durationDays), status: 'ACTIVE', activatedBy: req.auth!.accountId }], { session: transaction });
      const paymentReference = reference('PAY');
      await Payment.create([{ reference: paymentReference, memberId: member!._id, type: 'MEMBERSHIP', amountDue: plan.price, amountReceived: input.amountReceived, change: input.amountReceived - plan.price, receivedBy: req.auth!.accountId }], { session: transaction });
      await audit(req.auth!.accountId, 'MEMBER_ENROLLED', 'Member', String(member!._id), { plan: plan.name, paymentReference }, transaction);
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

adminRouter.get('/plans', asyncRoute(async (_req, res) => { res.json({ items: await MembershipPlan.find().sort({ price: 1 }).lean() }); }));
adminRouter.post('/plans', asyncRoute(async (req, res) => { const input = z.object({ name: z.string().trim().min(2).max(100), price: z.number().nonnegative(), durationDays: z.number().int().positive().max(3650) }).parse(req.body); const row = await MembershipPlan.create(input); await audit(req.auth!.accountId, 'PLAN_CREATED', 'MembershipPlan', String(row._id)); res.status(201).json(row); }));

adminRouter.get('/settings', asyncRoute(async (_req, res) => { const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { defaultWalkInFee: 70 } }, { upsert: true, new: true }).lean(); res.json(row); }));
adminRouter.put('/settings', asyncRoute(async (req, res) => { const input = z.object({ defaultWalkInFee: z.number().nonnegative(), gymStatusOverride: z.enum(['AUTO', 'OPEN', 'CLOSED']), hoursToday: z.string().trim().min(3).max(100) }).parse(req.body); const row = await GymSettings.findOneAndUpdate({ key: 'primary' }, input, { upsert: true, new: true }); await audit(req.auth!.accountId, 'SETTINGS_UPDATED', 'GymSettings', String(row!._id)); res.json(row); }));

adminRouter.get('/stations', asyncRoute(async (_req, res) => { res.json({ items: await AttendanceStation.find().sort({ name: 1 }).lean() }); }));
adminRouter.post('/stations', requireRoles('OWNER'), asyncRoute(async (req, res) => { const input = z.object({ stationId: z.string().trim().min(8).max(100), name: z.string().trim().min(2).max(100) }).parse(req.body); const row = await AttendanceStation.create({ ...input, createdBy: req.auth!.accountId }); await audit(req.auth!.accountId, 'STATION_CREATED', 'AttendanceStation', String(row._id)); res.status(201).json(row); }));

adminRouter.post('/accounts', requireRoles('OWNER'), asyncRoute(async (req, res) => { const input = person.pick({ firstName: true, lastName: true }).extend({ username: z.string().trim().min(3).max(100), password: z.string().min(10).max(200), role: z.enum(['OWNER', 'ADMIN']).default('ADMIN') }).parse(req.body); const row = await Account.create({ ...input, username: normalizeUsername(input.username), passwordHash: await hashPassword(input.password), mustChangePassword: true }); await audit(req.auth!.accountId, 'ADMIN_ACCOUNT_CREATED', 'Account', String(row._id), { role: row.role }); res.status(201).json({ id: String(row._id), username: row.username, role: row.role }); }));

adminRouter.get('/coaches', asyncRoute(async (_req, res) => { res.json({ items: await Coach.find().sort({ fullName: 1 }).lean() }); }));
