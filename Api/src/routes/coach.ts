import { Router } from 'express';
import { Coach, CoachAttendance, GymSettings } from '../models.js';
import { asyncRoute, HttpError } from '../http.js';
import { requireAuth, requireReadyAccount, requireRoles } from '../middleware.js';

export const coachRouter = Router();
coachRouter.use(requireAuth, requireRoles('COACH'), requireReadyAccount);

coachRouter.get('/overview', asyncRoute(async (req, res) => {
  if (!req.auth!.coachId) throw new HttpError(404, 'Coach profile is not linked to this account.');
  const [coach, settings, recentAttendance] = await Promise.all([
    Coach.findById(req.auth!.coachId).lean<any>(),
    GymSettings.findOne({ key: 'primary' }).lean<any>(),
    CoachAttendance.find({ coachId: req.auth!.coachId }).sort({ checkedInAt: -1 }).limit(30).lean<any[]>(),
  ]);
  if (!coach || (coach.status ?? 'ACTIVE') !== 'ACTIVE') throw new HttpError(403, 'This coach profile is not active.');
  res.json({
    coach: { coachNumber: coach.coachNumber ?? 'Coach', fullName: coach.fullName, specialty: coach.specialty, availability: coach.availability },
    gym: { hoursToday: settings?.hoursToday ?? 'Contact reception for today\'s hours.' },
    attendance: recentAttendance.map((row) => ({ id: String(row._id), attendanceDate: row.attendanceDate, checkedInAt: row.checkedInAt, checkedOutAt: row.checkedOutAt ?? undefined })),
  });
}));
