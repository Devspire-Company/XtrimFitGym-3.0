import mongoose, { Schema, model } from 'mongoose';

const options = { timestamps: true, versionKey: false } as const;

const accountSchema = new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'MEMBER', 'COACH'], required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null, index: true },
  coachId: { type: Schema.Types.ObjectId, ref: 'Coach', default: null, index: true },
  mustChangePassword: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date, default: null },
}, options);

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'MEMBER', 'COACH'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  userAgent: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
}, options);

const memberSchema = new Schema({
  memberNumber: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, default: null, index: true },
  email: { type: String, default: null, lowercase: true, trim: true, index: true },
  birthDate: { type: Date, default: null },
  emergencyContact: {
    name: { type: String, trim: true, default: null },
    relationship: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
  },
  enrollmentConsent: {
    termsAcceptedAt: { type: Date, default: null },
    privacyAcceptedAt: { type: Date, default: null },
    liabilityAcceptedAt: { type: Date, default: null },
    version: { type: String, default: null },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  },
  photoUrl: { type: String, default: null },
  status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
  sourceWalkInProfileId: { type: Schema.Types.ObjectId, ref: 'WalkInProfile', default: null },
  memberType: { type: String, enum: ['STUDENT', 'REGULAR'], default: 'REGULAR', index: true },
  studentVerifiedAt: { type: Date, default: null },
  studentVerifiedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
}, options);

const membershipPlanSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  durationDays: { type: Number, required: true, min: 1 },
  eligibility: { type: String, enum: ['ALL', 'STUDENT', 'REGULAR'], default: 'ALL', index: true },
  isPromo: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  archivedAt: { type: Date, default: null, index: true },
  archivedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  archiveReason: { type: String, default: null },
}, options);

const membershipSchema = new Schema({
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
  planName: { type: String, required: true },
  pricePaid: { type: Number, required: true, min: 0 },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'], required: true, default: 'ACTIVE', index: true },
  activatedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  pausedAt: { type: Date, default: null },
  remainingMillisecondsAtPause: { type: Number, default: null, min: 0 },
  statusChangedAt: { type: Date, default: null },
  statusChangedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  statusReason: { type: String, default: null },
}, options);
membershipSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });

const membershipLockSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, required: true },
  touchedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false });

const paymentSchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null, index: true },
  membershipId: { type: Schema.Types.ObjectId, ref: 'Membership', default: null, index: true },
  walkInProfileId: { type: Schema.Types.ObjectId, ref: 'WalkInProfile', default: null, index: true },
  type: { type: String, enum: ['MEMBERSHIP', 'WALK_IN', 'CARD_REPLACEMENT'], required: true, index: true },
  amountDue: { type: Number, required: true, min: 0 },
  planAmount: { type: Number, default: 0, min: 0 },
  membershipFee: { type: Number, default: 0, min: 0 },
  amountReceived: { type: Number, required: true, min: 0 },
  change: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['CASH'], default: 'CASH' },
  status: { type: String, enum: ['COMPLETED', 'VOID'], default: 'COMPLETED', index: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  voidReason: { type: String, default: null },
  relatedRecordAction: { type: String, enum: ['KEPT', 'MEMBERSHIP_CANCELLED', 'VISIT_VOIDED'], default: null },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  receivedAt: { type: Date, required: true, default: Date.now, index: true },
  notes: { type: String, default: '' },
}, options);

const cashClosingSchema = new Schema({
  businessDate: { type: String, required: true },
  status: { type: String, enum: ['CLOSED', 'VOID'], default: 'CLOSED', index: true },
  openingCash: { type: Number, required: true, min: 0 },
  cashCollected: { type: Number, required: true, min: 0 },
  expectedCash: { type: Number, required: true, min: 0 },
  countedCash: { type: Number, required: true, min: 0 },
  variance: { type: Number, required: true },
  paymentCount: { type: Number, required: true, min: 0 },
  notes: { type: String, default: '' },
  closedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  closedAt: { type: Date, required: true, default: Date.now },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  voidedAt: { type: Date, default: null },
  voidReason: { type: String, default: null },
}, options);
cashClosingSchema.index({ businessDate: 1 }, { name: 'cash_closing_active_business_date', unique: true, partialFilterExpression: { status: 'CLOSED' } });

const cashDayLockSchema = new Schema({
  _id: { type: String, required: true },
  touchedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false });

const nfcCardSchema = new Schema({
  uid: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  portalTokenHash: { type: String, required: true, unique: true, select: false },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  status: { type: String, enum: ['ACTIVE', 'REVOKED', 'LOST', 'REPLACED'], default: 'ACTIVE', index: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  assignedAt: { type: Date, required: true, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokeReason: { type: String, default: null },
}, options);
nfcCardSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });

const coachNfcCardSchema = new Schema({
  uid: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  coachId: { type: Schema.Types.ObjectId, ref: 'Coach', required: true },
  status: { type: String, enum: ['ACTIVE', 'REVOKED', 'LOST', 'REPLACED'], default: 'ACTIVE', index: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  assignedAt: { type: Date, required: true, default: Date.now },
  revokedAt: { type: Date, default: null },
  revokeReason: { type: String, default: null },
}, options);
coachNfcCardSchema.index({ coachId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });

const stationSchema = new Schema({
  stationId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
}, options);

const attendanceSchema = new Schema({
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  cardId: { type: Schema.Types.ObjectId, ref: 'NfcCard', default: null },
  stationId: { type: String, required: true, index: true },
  status: { type: String, enum: ['ACCEPTED', 'MANUAL'], default: 'ACCEPTED' },
  reason: { type: String, default: null },
  checkOutReason: { type: String, default: null },
  attendanceDate: { type: String, default: null },
  recordedAt: { type: Date, required: true, default: Date.now, index: true },
  checkedOutAt: { type: Date, default: null },
  checkInMethod: { type: String, enum: ['NFC', 'MANUAL'], default: null },
  checkOutMethod: { type: String, enum: ['NFC', 'MANUAL'], default: null },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
}, options);
attendanceSchema.index({ memberId: 1, recordedAt: -1 });
attendanceSchema.index({ memberId: 1, attendanceDate: 1 }, { unique: true, partialFilterExpression: { attendanceDate: { $type: 'string' } } });

const attendanceLockSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, required: true },
  lastAcceptedAt: { type: Date, required: true },
}, { versionKey: false });

const walkInProfileSchema = new Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, default: null },
  email: { type: String, default: null, lowercase: true, trim: true },
  convertedMemberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
  totalVisits: { type: Number, default: 0, min: 0 },
  lastVisitAt: { type: Date, default: null, index: true },
}, options);
walkInProfileSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

const walkInVisitSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: 'WalkInProfile', required: true, index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  visitedAt: { type: Date, required: true, default: Date.now, index: true },
  visitDate: { type: String, required: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  status: { type: String, enum: ['ACTIVE', 'VOID'], default: 'ACTIVE', index: true },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  voidReason: { type: String, default: null },
}, options);
walkInVisitSchema.index({ profileId: 1, visitDate: 1 }, { unique: true, partialFilterExpression: { visitDate: { $type: 'string' } } });

const coachSchema = new Schema({
  coachNumber: { type: String },
  firstName: { type: String, default: null, trim: true },
  lastName: { type: String, default: null, trim: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, default: null, trim: true, index: true },
  email: { type: String, default: null, lowercase: true, trim: true, index: true },
  specialty: { type: String, required: true, trim: true },
  availability: { type: String, required: true, trim: true },
  specialties: [{ type: String, trim: true }],
  availabilitySchedule: [{
    _id: false,
    day: { type: String, enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'], required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  }],
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  isPublished: { type: Boolean, default: true, index: true },
}, options);
coachSchema.index({ coachNumber: 1 }, { unique: true, partialFilterExpression: { coachNumber: { $type: 'string' } } });

const coachAttendanceSchema = new Schema({
  coachId: { type: Schema.Types.ObjectId, ref: 'Coach', required: true, index: true },
  attendanceDate: { type: String, required: true },
  checkedInAt: { type: Date, required: true, default: Date.now },
  checkedOutAt: { type: Date, default: null },
  method: { type: String, enum: ['MANUAL', 'NFC'], default: 'MANUAL' },
  stationId: { type: String, default: null },
  reason: { type: String, default: null },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
}, options);
coachAttendanceSchema.index({ coachId: 1, attendanceDate: 1 }, { unique: true });

const gymSettingsSchema = new Schema({
  key: { type: String, default: 'primary', unique: true },
  defaultWalkInFee: { type: Number, default: 70, min: 0 },
  firstMembershipFee: { type: Number, default: 100, min: 0 },
  announcementsEnabled: { type: Boolean, default: true },
  gymStatusOverride: { type: String, enum: ['AUTO', 'OPEN', 'CLOSED'], default: 'AUTO' },
  hoursToday: { type: String, default: 'Contact the gym for today\'s hours.' },
  weeklyHours: [{
    _id: false,
    day: { type: String, enum: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'], required: true },
    isClosed: { type: Boolean, default: false },
    openTime: { type: String, default: '06:00' },
    closeTime: { type: String, default: '22:00' },
  }],
  scheduleExceptions: [{
    _id: false,
    date: { type: String, required: true },
    label: { type: String, default: '' },
    isClosed: { type: Boolean, default: true },
    openTime: { type: String, default: null },
    closeTime: { type: String, default: null },
  }],
}, options);

const announcementSchema = new Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT', index: true },
  publishAt: { type: Date, default: null, index: true },
  expiresAt: { type: Date, default: null, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  archivedAt: { type: Date, default: null },
}, options);

const auditLogSchema = new Schema({
  actorAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
}, { versionKey: false });

const notificationSchema = new Schema({
  recipientAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  type: { type: String, enum: ['MEMBERSHIP_EXPIRING', 'CARD_REQUIRED', 'PAYMENT_VOIDED', 'SECURITY'], required: true, index: true },
  tone: { type: String, enum: ['INFO', 'ACTION', 'WARNING'], default: 'INFO' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  actionUrl: { type: String, default: null },
  sourceId: { type: String, default: null },
  dedupeKey: { type: String, required: true },
  readAt: { type: Date, default: null, index: true },
  deletedAt: { type: Date, default: null, index: true },
  resolvedAt: { type: Date, default: null, index: true },
}, options);
notificationSchema.index({ recipientAccountId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ recipientAccountId: 1, deletedAt: 1, resolvedAt: 1, createdAt: -1 });

export const Account = model('Account', accountSchema);
export const AuthSession = model('AuthSession', sessionSchema);
export const Member = model('Member', memberSchema);
export const MembershipPlan = model('MembershipPlan', membershipPlanSchema);
export const Membership = model('Membership', membershipSchema);
export const MembershipLock = model('MembershipLock', membershipLockSchema);
export const Payment = model('Payment', paymentSchema);
export const CashClosing = model('CashClosing', cashClosingSchema);
export const CashDayLock = model('CashDayLock', cashDayLockSchema);
export const NfcCard = model('NfcCard', nfcCardSchema);
export const CoachNfcCard = model('CoachNfcCard', coachNfcCardSchema);
export const AttendanceStation = model('AttendanceStation', stationSchema);
export const AttendanceRecord = model('AttendanceRecord', attendanceSchema);
export const AttendanceLock = model('AttendanceLock', attendanceLockSchema);
export const WalkInProfile = model('WalkInProfile', walkInProfileSchema);
export const WalkInVisit = model('WalkInVisit', walkInVisitSchema);
export const Coach = model('Coach', coachSchema);
export const CoachAttendance = model('CoachAttendance', coachAttendanceSchema);
export const GymSettings = model('GymSettings', gymSettingsSchema);
export const Announcement = model('Announcement', announcementSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
export const Notification = model('Notification', notificationSchema);

export type AccountRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'COACH';
export type ObjectId = mongoose.Types.ObjectId;
