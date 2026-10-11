import { Router } from 'express';
import { z } from 'zod';
import { Announcement, AttendanceRecord, AuthSession, Coach, GymSettings, Membership, NfcCard, Account } from '../models.js';
import { asyncRoute, HttpError } from '../http.js';
import { requireAuth, requireReadyAccount, requireRoles } from '../middleware.js';
import { hashPassword, portalTokenHash, verifyPassword } from '../security.js';
import { audit } from '../audit.js';
import { manilaMonthBounds, resolveGymAvailability } from '../manila-time.js';

export const memberRouter = Router();

memberRouter.get('/card/:token', asyncRoute(async (req, res) => {
  const token = z.string().min(20).max(200).parse(req.params.token);
  const card = await NfcCard.findOne({ portalTokenHash: portalTokenHash(token), status: 'ACTIVE' }).select('+portalTokenHash').lean<any>();
  if (!card) throw new HttpError(404, 'This card link is invalid or no longer active.');
  res.set('Cache-Control', 'no-store').json({ recognized: true });
}));

memberRouter.use(requireAuth, requireRoles('MEMBER'), requireReadyAccount);

memberRouter.get('/overview', asyncRoute(async (req, res) => {
  const now = new Date();
  const month = manilaMonthBounds(now);
  const [membership, card, settings, totalVisits, visitsThisMonth, last, announcements] = await Promise.all([
    Membership.findOne({ memberId: req.auth!.memberId }).sort({ startsAt: -1 }).lean<any>(),
    NfcCard.findOne({ memberId: req.auth!.memberId, status: 'ACTIVE' }).lean<any>(),
    GymSettings.findOne({ key: 'primary' }).lean<any>(),
    AttendanceRecord.countDocuments({ memberId: req.auth!.memberId }),
    AttendanceRecord.countDocuments({ memberId: req.auth!.memberId, recordedAt: { $gte: month.start, $lt: month.end } }),
    AttendanceRecord.findOne({ memberId: req.auth!.memberId }).sort({ recordedAt: -1 }).lean<any>(),
    Announcement.find({ status: 'PUBLISHED', publishAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).sort({ publishAt: -1 }).limit(10).lean<any[]>(),
  ]);
  const gym = resolveGymAvailability(settings ?? {}, now);
  res.json({
    membership: membership ? { plan: membership.planName, status: membership.status, startedAt: membership.startsAt, expiresAt: membership.expiresAt } : null,
    card: card ? { status: card.status } : null,
    gym,
    attendanceSummary: { totalVisits, visitsThisMonth, lastVisitAt: last?.recordedAt },
    announcements: announcements.map((row) => ({ id: String(row._id), title: row.title, message: row.message, publishedAt: row.publishAt })),
  });
}));

memberRouter.get('/attendance', asyncRoute(async (req, res) => {
  const rows = await AttendanceRecord.find({ memberId: req.auth!.memberId }).sort({ recordedAt: -1 }).limit(100).lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), recordedAt: row.recordedAt, checkedOutAt: row.checkedOutAt ?? undefined, status: !row.attendanceDate ? 'VISIT RECORDED' : row.checkedOutAt ? 'CHECKED OUT' : 'CHECKED IN', station: row.stationId })) });
}));

memberRouter.get('/coaches', asyncRoute(async (_req, res) => {
  const rows = await Coach.find({ isPublished: true }).sort({ fullName: 1 }).lean<any[]>();
  res.json({ items: rows.map((row) => ({ id: String(row._id), fullName: row.fullName, specialty: row.specialty, availability: row.availability })) });
}));

memberRouter.put('/password', asyncRoute(async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(8).max(200), newPassword: z.string().min(10).max(200).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/) }).parse(req.body);
  const account = await Account.findById(req.auth!.accountId).select('+passwordHash').exec() as any;
  if (!account || !await verifyPassword(input.currentPassword, account.passwordHash)) throw new HttpError(401, 'The current password is incorrect.');
  account.passwordHash = await hashPassword(input.newPassword);
  await account.save();
  await AuthSession.deleteMany({ accountId: account._id, _id: { $ne: req.auth!.sessionId } });
  await audit(req.auth!.accountId, 'PASSWORD_CHANGED', 'Account', req.auth!.accountId);
  res.status(204).end();
}));
