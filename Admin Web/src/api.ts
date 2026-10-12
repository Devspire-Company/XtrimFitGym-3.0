const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/v1');
const ATTENDANCE_STATION_ID = (import.meta.env.VITE_ATTENDANCE_STATION_ID as string | undefined)?.trim() ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-XTRIM-Request', '1');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (response.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
    throw new ApiError(401, 'Your session expired. Please sign in again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type AdminUser = { id: string; username: string; firstName: string; lastName: string; role: 'ADMIN' | 'OWNER'; mustChangePassword?: boolean };
export type SessionInfo = { id: string; current: boolean; userAgent: string; lastSeenAt: string; createdAt: string; expiresAt: string };
export type AttendanceStation = { id: string; stationId: string; name: string; isActive: boolean; createdAt: string };
export type AdminAccount = { id: string; username: string; firstName: string; lastName: string; role: 'ADMIN' | 'OWNER'; isActive: boolean; lastLoginAt?: string; createdAt: string };
export type AdminNotification = {
  id: string;
  type: 'MEMBERSHIP_EXPIRING' | 'CARD_REQUIRED' | 'PAYMENT_VOIDED' | 'SECURITY';
  tone: 'INFO' | 'ACTION' | 'WARNING';
  title: string;
  message: string;
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
};
export type DashboardData = {
  activeMembers: number;
  attendanceToday: number;
  walkInsToday: number;
  cashToday: number;
  cardsPending: number;
  expiringSoon: number;
  recentActivity: Array<{ id: string; label: string; detail: string; occurredAt: string }>;
};
export type ReportData = {
  period: { days: number; preset?: 7 | 30 | 90; from: string; to: string };
  summary: { revenue: number; transactions: number; attendance: number; walkIns: number; newMembers: number; activeMemberships: number };
  daily: Array<{ date: string; revenue: number; transactions: number; attendance: number; walkIns: number; newMembers: number }>;
  monthlyActivity: Array<{ month: string; memberships: number; walkIns: number }>;
  revenueBreakdown: Array<{ type: 'MEMBERSHIP' | 'WALK_IN' | 'CARD_REPLACEMENT'; amount: number; count: number }>;
  membershipStatus: { active: number; paused: number; expired: number; cancelled: number };
  topPlans: Array<{ name: string; count: number; value: number }>;
};
export type Member = {
  id: string;
  memberNumber: string;
  fullName: string;
  phone?: string;
  status: 'ACTIVE' | 'DISABLED';
  membership?: { plan: string; status: string; expiresAt: string };
  cardStatus?: string;
};
export type AttendanceRecord = { id: string; personName: string; personNumber: string; personType: 'MEMBER' | 'COACH'; status: string; method: string; reason?: string; checkedInAt: string; checkedOutAt?: string; recordedAt: string };
export type CoachAttendanceRecord = { id: string; attendanceDate: string; checkedInAt: string; checkedOutAt?: string; method: 'NFC' | 'MANUAL'; reason?: string };
export type MemberType = 'STUDENT' | 'REGULAR';
export type PlanEligibility = 'ALL' | MemberType;
export type Plan = { _id: string; name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean; isActive: boolean; isArchived: boolean; archivedAt?: string; archiveReason?: string; usageCount: number; canDelete: boolean };
export type Weekday = 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';
export type WeeklyHours = { day: Weekday; isClosed: boolean; openTime: string; closeTime: string };
export type ScheduleException = { date: string; label?: string; isClosed: boolean; openTime?: string; closeTime?: string };
export type GymSettings = { defaultWalkInFee: number; firstMembershipFee: number; announcementsEnabled: boolean; gymStatusOverride: 'AUTO' | 'OPEN' | 'CLOSED'; hoursToday?: string; weeklyHours: WeeklyHours[]; scheduleExceptions: ScheduleException[] };
export type GymPreview = { isOpen: boolean; statusLabel: string; hoursToday: string; scheduleSource: 'WEEKLY' | 'EXCEPTION' };
export type Announcement = { id: string; title: string; message: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishAt?: string; expiresAt?: string; createdAt: string; updatedAt: string };
export type PaymentItem = { id: string; reference: string; payerName: string; amount: number; type: string; status: 'COMPLETED' | 'VOID'; receivedAt: string };
export type PaymentDetail = { id: string; reference: string; payerName: string; payerReference?: string; type: string; status: 'COMPLETED' | 'VOID'; amountDue: number; planAmount: number; membershipFee: number; amountReceived: number; change: number; method: string; notes: string; receivedAt: string; receivedBy: string; voidedAt?: string; voidedBy?: string; voidReason?: string; relatedRecordAction?: string };
export type CashClosing = { id: string; businessDate: string; status: 'CLOSED' | 'VOID'; openingCash: number; cashCollected: number; expectedCash: number; countedCash: number; variance: number; paymentCount: number; notes: string; closedAt: string; closedBy: string; voidedAt?: string; voidedBy?: string; voidReason?: string };
export type AuditEntry = { id: string; actor: string; actorUsername?: string; action: string; targetType: string; targetId?: string; metadata: Record<string, unknown>; occurredAt: string };
export type WalkInProfile = { id: string; fullName: string; phone?: string; email?: string; visits: number; lastVisitAt: string; visitedToday: boolean };
export type CoachDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type CoachAvailability = { day: CoachDay; startTime: string; endTime: string };
export type Coach = { id: string; coachNumber: string; firstName: string; lastName: string; fullName: string; phone: string; email: string; specialty: string; specialties: string[]; availability: string; availabilitySchedule: CoachAvailability[]; status: 'ACTIVE' | 'INACTIVE'; isPublished: boolean; account?: { id: string; username: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string }; attendanceToday?: { id: string; checkedInAt: string; checkedOutAt?: string }; nfcCard?: { id: string; uid: string; status: string; assignedAt: string } };
export type EmergencyContact = { name: string; relationship: string; phone: string };
export type MembershipRecord = { id: string; planId: string; planName: string; pricePaid: number; startsAt: string; expiresAt: string; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED'; pausedAt?: string; remainingMillisecondsAtPause?: number; statusReason?: string; createdAt: string };
export type MemberDetail = {
  member: { id: string; memberNumber: string; firstName: string; lastName: string; phone: string; email: string; birthDate?: string; emergencyContact?: EmergencyContact; memberType: MemberType; studentIdVerified: boolean; status: 'ACTIVE' | 'DISABLED'; sourceWalkInProfileId?: string; createdAt: string };
  account?: { id: string; username: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string };
  memberships: MembershipRecord[];
  payments: Array<{ id: string; reference: string; type: string; amountDue: number; planAmount: number; membershipFee: number; amountReceived: number; change: number; status: string; notes: string; receivedAt: string }>;
  attendance: Array<{ id: string; status: string; stationId: string; recordedAt: string; checkedOutAt?: string }>;
  cards: Array<{ id: string; uid: string; status: string; assignedAt: string; revokedAt?: string; revokeReason?: string }>;
};

export const authApi = {
  me: () => api<AdminUser>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  updateProfile: (input: { firstName: string; lastName: string; username: string; currentPassword?: string }) => api<AdminUser>('/auth/profile', { method: 'PUT', body: JSON.stringify(input) }),
  changePassword: (currentPassword: string, newPassword: string) => api<void>('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  initializePassword: (currentPassword: string, newPassword: string) => api<void>('/auth/first-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sessions: () => api<{ items: SessionInfo[] }>('/auth/sessions'),
  revokeOtherSessions: () => api<{ revoked: number }>('/auth/sessions/others', { method: 'DELETE' }),
};

export const adminApi = {
  dashboard: () => api<DashboardData>('/admin/dashboard'),
  notifications: () => api<{ unread: number; items: AdminNotification[] }>('/admin/notifications'),
  readNotification: (notificationId: string) => api<AdminNotification>(`/admin/notifications/${notificationId}/read`, { method: 'PATCH' }),
  readAllNotifications: () => api<void>('/admin/notifications/read-all', { method: 'PATCH' }),
  deleteNotification: (notificationId: string) => api<void>(`/admin/notifications/${notificationId}`, { method: 'DELETE' }),
  clearReadNotifications: () => api<void>('/admin/notifications/read', { method: 'DELETE' }),
  reports: (range: 7 | 30 | 90 | { from: string; to: string }) => api<ReportData>(`/admin/reports?${typeof range === 'number' ? `days=${range}` : new URLSearchParams(range)}`),
  announcements: () => api<{ items: Announcement[] }>('/admin/announcements'),
  createAnnouncement: (input: { title: string; message: string; status: 'DRAFT' | 'PUBLISHED'; publishAt?: string | null; expiresAt?: string | null }) => api<Announcement>('/admin/announcements', { method: 'POST', body: JSON.stringify(input) }),
  updateAnnouncement: (announcementId: string, input: { title: string; message: string; status: 'DRAFT' | 'PUBLISHED'; publishAt?: string | null; expiresAt?: string | null }) => api<Announcement>(`/admin/announcements/${announcementId}`, { method: 'PUT', body: JSON.stringify(input) }),
  archiveAnnouncement: (announcementId: string) => api<Announcement>(`/admin/announcements/${announcementId}/archive`, { method: 'POST' }),
  deleteAnnouncement: (announcementId: string) => api<void>(`/admin/announcements/${announcementId}`, { method: 'DELETE' }),
  members: (query = '', page = 1, limit = 100, status = '') => api<{ page: number; limit: number; total: number; pages: number; items: Member[] }>(`/admin/members?search=${encodeURIComponent(query)}&page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`),
  member: (memberId: string) => api<MemberDetail>(`/admin/members/${memberId}`),
  updateMember: (memberId: string, input: { firstName: string; lastName: string; phone?: string; email?: string; birthDate?: string | null; emergencyContact?: EmergencyContact; memberType?: MemberType; studentIdVerified?: boolean }) => api(`/admin/members/${memberId}`, { method: 'PUT', body: JSON.stringify(input) }),
  setMemberStatus: (memberId: string, status: 'ACTIVE' | 'DISABLED', reason: string) => api(`/admin/members/${memberId}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  resetMemberPassword: (memberId: string) => api<{ username: string; temporaryPassword: string }>(`/admin/members/${memberId}/reset-password`, { method: 'POST' }),
  renewMembership: (memberId: string, input: { planId: string; amountReceived: number; notes?: string }) => api<{ membership: MembershipRecord; paymentReference: string; change: number }>(`/admin/members/${memberId}/memberships/renew`, { method: 'POST', body: JSON.stringify(input) }),
  membershipAction: (memberId: string, membershipId: string, action: 'pause' | 'resume' | 'cancel', reason: string) => api<MembershipRecord>(`/admin/members/${memberId}/memberships/${membershipId}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  correctMembershipDates: (memberId: string, membershipId: string, input: { startsAt: string; expiresAt: string; reason: string }) => api<MembershipRecord>(`/admin/members/${memberId}/memberships/${membershipId}/dates`, { method: 'PUT', body: JSON.stringify(input) }),
  attendance: (input: { page?: number; limit?: number; search?: string; personType?: string; status?: string; from?: string; to?: string } = {}) => { const query = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return api<{ page: number; limit: number; total: number; pages: number; items: AttendanceRecord[] }>(`/admin/attendance?${query}`); },
  recordAttendance: (cardUid: string) => {
    if (!ATTENDANCE_STATION_ID) throw new ApiError(400, 'This browser is not configured as an attendance station.');
    return api<{ accepted: boolean; message: string; subjectType?: 'MEMBER' | 'COACH'; action?: 'CHECK_IN' | 'CHECK_OUT'; personName?: string; memberName?: string }>('/admin/attendance/scan', { method: 'POST', headers: { 'X-Attendance-Station': ATTENDANCE_STATION_ID }, body: JSON.stringify({ cardUid }) });
  },
  recordManualAttendance: (memberId: string, reason: string) => api<{ accepted: boolean; action: 'CHECK_IN' | 'CHECK_OUT'; message: string; memberName: string }>('/admin/attendance/manual', { method: 'POST', body: JSON.stringify({ memberId, reason }) }),
  walkIns: (input: { page?: number; limit?: number; search?: string } = {}) => { const query = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return api<{ page: number; limit: number; total: number; pages: number; items: WalkInProfile[] }>(`/admin/walk-ins?${query}`); },
  cards: () => api<{ items: Array<{ id: string; uid: string; assigneeName?: string; assigneeType: 'MEMBER' | 'COACH'; status: string }> }>('/admin/nfc-cards'),
  payments: (input: { page?: number; search?: string; type?: string; status?: string; from?: string; to?: string } = {}) => { const query = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return api<{ summary: { today: number; thisWeek: number }; page: number; limit: number; total: number; pages: number; items: PaymentItem[] }>(`/admin/payments?${query}`); },
  payment: (paymentId: string) => api<PaymentDetail>(`/admin/payments/${paymentId}`),
  voidPayment: (paymentId: string, reason: string, relatedAction: 'KEEP' | 'CANCEL_MEMBERSHIP' | 'VOID_VISIT') => api<void>(`/admin/payments/${paymentId}/void`, { method: 'POST', body: JSON.stringify({ reason, relatedAction }) }),
  cashClosingSummary: (date?: string) => api<{ businessDate: string; cashCollected: number; paymentCount: number; closing: CashClosing | null }>(`/admin/cash-closings/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  cashClosings: (page = 1) => api<{ page: number; limit: number; total: number; pages: number; items: CashClosing[] }>(`/admin/cash-closings?page=${page}&limit=10`),
  closeCashDay: (input: { businessDate: string; openingCash: number; countedCash: number; notes: string }) => api<CashClosing>('/admin/cash-closings', { method: 'POST', body: JSON.stringify(input) }),
  voidCashClosing: (closingId: string, reason: string) => api<void>(`/admin/cash-closings/${closingId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  auditLog: (input: { page?: number; limit?: number; search?: string; actor?: string; action?: string; targetType?: string; from?: string; to?: string }) => { const query = new URLSearchParams(); Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); return api<{ page: number; limit: number; total: number; pages: number; items: AuditEntry[] }>(`/admin/audit?${query}`); },
  plans: () => api<{ items: Plan[]; firstMembershipFee: number }>('/admin/plans'),
  createPlan: (input: { name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean }) => api<Plan>('/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (planId: string, input: { name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean }) => api<Plan>(`/admin/plans/${planId}`, { method: 'PUT', body: JSON.stringify(input) }),
  archivePlan: (planId: string, reason: string) => api<Plan>(`/admin/plans/${planId}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }),
  restorePlan: (planId: string) => api<Plan>(`/admin/plans/${planId}/restore`, { method: 'POST' }),
  deletePlan: (planId: string) => api<void>(`/admin/plans/${planId}`, { method: 'DELETE' }),
  enroll: (input: { firstName: string; lastName: string; phone?: string; email?: string; birthDate: string; emergencyContact: EmergencyContact; memberType: MemberType; studentIdVerified: boolean; username: string; planId: string; amountReceived: number; sourceWalkInProfileId?: string }) => api<{ memberId: string; memberNumber: string; username: string; temporaryPassword: string; paymentReference: string }>('/admin/enrollments', { method: 'POST', body: JSON.stringify(input) }),
  assignCard: (memberId: string, uid: string) => api<{ id: string; uid: string; portalUrl: string; note: string }>('/admin/nfc-cards', { method: 'POST', body: JSON.stringify({ memberId, uid }) }),
  recordWalkIn: (input: { firstName: string; lastName: string; phone?: string; email?: string; profileId?: string; amountReceived: number; notes?: string }) => api<{ id: string; paymentReference: string; amountDue: number; change: number }>('/admin/walk-ins', { method: 'POST', body: JSON.stringify(input) }),
  coaches: () => api<{ items: Coach[] }>('/admin/coaches'),
  createCoach: (input: { firstName: string; lastName: string; phone?: string; email?: string; specialties: string[]; availabilitySchedule: CoachAvailability[]; username: string; isPublished: boolean }) => api<Coach & { temporaryPassword: string }>('/admin/coaches', { method: 'POST', body: JSON.stringify(input) }),
  updateCoach: (coachId: string, input: { firstName: string; lastName: string; phone?: string; email?: string; specialties: string[]; availabilitySchedule: CoachAvailability[]; isPublished: boolean }) => api<Coach>(`/admin/coaches/${coachId}`, { method: 'PUT', body: JSON.stringify(input) }),
  setCoachStatus: (coachId: string, status: 'ACTIVE' | 'INACTIVE', reason: string) => api<Coach>(`/admin/coaches/${coachId}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  resetCoachPassword: (coachId: string) => api<{ username: string; temporaryPassword: string }>(`/admin/coaches/${coachId}/reset-password`, { method: 'POST' }),
  coachAttendance: (coachId: string, page = 1) => api<{ page: number; limit: number; total: number; pages: number; items: CoachAttendanceRecord[] }>(`/admin/coaches/${coachId}/attendance?page=${page}&limit=10`),
  checkInCoach: (coachId: string, reason: string) => api<{ id: string; checkedInAt: string }>(`/admin/coaches/${coachId}/attendance/check-in`, { method: 'POST', body: JSON.stringify({ reason }) }),
  checkOutCoach: (coachId: string, reason: string) => api<{ id: string; checkedInAt: string; checkedOutAt: string }>(`/admin/coaches/${coachId}/attendance/check-out`, { method: 'POST', body: JSON.stringify({ reason }) }),
  assignCoachCard: (coachId: string, uid: string) => api<{ id: string; uid: string; status: string; assignedAt: string }>(`/admin/coaches/${coachId}/nfc-card`, { method: 'POST', body: JSON.stringify({ uid }) }),
  revokeCard: (cardId: string, reason: string, status: 'REVOKED' | 'LOST' | 'REPLACED' = 'REVOKED') => api<void>(`/admin/nfc-cards/${cardId}/revoke`, { method: 'POST', body: JSON.stringify({ reason, status }) }),
  settings: () => api<GymSettings>('/admin/settings'),
  previewSettings: (input: GymSettings) => api<GymPreview>('/admin/settings/preview', { method: 'POST', body: JSON.stringify(input) }),
  updateSettings: (input: GymSettings) => api<GymSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(input) }),
  stations: () => api<{ items: AttendanceStation[] }>('/admin/stations'),
  createStation: (input: { stationId: string; name: string }) => api<AttendanceStation>('/admin/stations', { method: 'POST', body: JSON.stringify(input) }),
  setStationStatus: (stationId: string, isActive: boolean) => api<AttendanceStation>(`/admin/stations/${stationId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  accounts: () => api<{ items: AdminAccount[] }>('/admin/accounts'),
  createAccount: (input: { username: string; firstName: string; lastName: string }) => api<AdminAccount & { temporaryPassword: string }>('/admin/accounts', { method: 'POST', body: JSON.stringify(input) }),
  setAccountStatus: (accountId: string, isActive: boolean) => api<AdminAccount>(`/admin/accounts/${accountId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  resetAccountPassword: (accountId: string) => api<{ temporaryPassword: string }>(`/admin/accounts/${accountId}/reset-password`, { method: 'POST' }),
};
