import mongoose, { Schema, model } from 'mongoose';

const options = { timestamps: true, versionKey: false } as const;

const accountSchema = new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'MEMBER'], required: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null, index: true },
  mustChangePassword: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  lastLoginAt: { type: Date, default: null },
}, options);

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'MEMBER'], required: true },
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
  receivedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  receivedAt: { type: Date, required: true, default: Date.now, index: true },
  notes: { type: String, default: '' },
}, options);

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
  recordedAt: { type: Date, required: true, default: Date.now, index: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
}, options);
attendanceSchema.index({ memberId: 1, recordedAt: -1 });

const attendanceLockSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, required: true },
  lastAcceptedAt: { type: Date, required: true },
}, { versionKey: false });

const walkInProfileSchema = new Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phone: { type: String, default: null, index: true },
  email: { type: String, default: null, lowercase: true, trim: true },
  convertedMemberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
  totalVisits: { type: Number, default: 0, min: 0 },
  lastVisitAt: { type: Date, default: null, index: true },
}, options);

const walkInVisitSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: 'WalkInProfile', required: true, index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  visitedAt: { type: Date, required: true, default: Date.now, index: true },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
}, options);

const coachSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  specialty: { type: String, required: true, trim: true },
  availability: { type: String, required: true, trim: true },
  isPublished: { type: Boolean, default: true, index: true },
}, options);

const gymSettingsSchema = new Schema({
  key: { type: String, default: 'primary', unique: true },
  defaultWalkInFee: { type: Number, default: 70, min: 0 },
  firstMembershipFee: { type: Number, default: 100, min: 0 },
  gymStatusOverride: { type: String, enum: ['AUTO', 'OPEN', 'CLOSED'], default: 'AUTO' },
  hoursToday: { type: String, default: 'Contact the gym for today\'s hours.' },
}, options);

const auditLogSchema = new Schema({
  actorAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
}, { versionKey: false });

export const Account = model('Account', accountSchema);
export const AuthSession = model('AuthSession', sessionSchema);
export const Member = model('Member', memberSchema);
export const MembershipPlan = model('MembershipPlan', membershipPlanSchema);
export const Membership = model('Membership', membershipSchema);
export const MembershipLock = model('MembershipLock', membershipLockSchema);
export const Payment = model('Payment', paymentSchema);
export const NfcCard = model('NfcCard', nfcCardSchema);
export const AttendanceStation = model('AttendanceStation', stationSchema);
export const AttendanceRecord = model('AttendanceRecord', attendanceSchema);
export const AttendanceLock = model('AttendanceLock', attendanceLockSchema);
export const WalkInProfile = model('WalkInProfile', walkInProfileSchema);
export const WalkInVisit = model('WalkInVisit', walkInVisitSchema);
export const Coach = model('Coach', coachSchema);
export const GymSettings = model('GymSettings', gymSettingsSchema);
export const AuditLog = model('AuditLog', auditLogSchema);

export type AccountRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ObjectId = mongoose.Types.ObjectId;
