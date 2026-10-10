const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000/v1';
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
export type DashboardData = {
  activeMembers: number;
  attendanceToday: number;
  walkInsToday: number;
  cashToday: number;
  cardsPending: number;
  expiringSoon: number;
  recentActivity: Array<{ id: string; label: string; detail: string; occurredAt: string }>;
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
export type AttendanceRecord = { id: string; memberName: string; memberNumber: string; status: string; recordedAt: string };
export type MemberType = 'STUDENT' | 'REGULAR';
export type PlanEligibility = 'ALL' | MemberType;
export type Plan = { _id: string; name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean; isActive: boolean };
export type GymSettings = { defaultWalkInFee: number; firstMembershipFee: number; gymStatusOverride: 'AUTO' | 'OPEN' | 'CLOSED'; hoursToday: string };
export type EmergencyContact = { name: string; relationship: string; phone: string };
export type MembershipRecord = { id: string; planId: string; planName: string; pricePaid: number; startsAt: string; expiresAt: string; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED'; pausedAt?: string; remainingMillisecondsAtPause?: number; statusReason?: string; createdAt: string };
export type MemberDetail = {
  member: { id: string; memberNumber: string; firstName: string; lastName: string; phone: string; email: string; birthDate?: string; emergencyContact?: EmergencyContact; memberType: MemberType; studentIdVerified: boolean; status: 'ACTIVE' | 'DISABLED'; sourceWalkInProfileId?: string; createdAt: string };
  account?: { id: string; username: string; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string };
  memberships: MembershipRecord[];
  payments: Array<{ id: string; reference: string; type: string; amountDue: number; planAmount: number; membershipFee: number; amountReceived: number; change: number; status: string; notes: string; receivedAt: string }>;
  attendance: Array<{ id: string; status: string; stationId: string; recordedAt: string }>;
  cards: Array<{ id: string; uid: string; status: string; assignedAt: string; revokedAt?: string; revokeReason?: string }>;
};

export const authApi = {
  me: () => api<AdminUser>('/auth/me'),
  login: (username: string, password: string) => api<AdminUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, portal: 'admin' }) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  updateProfile: (input: { firstName: string; lastName: string; username: string; currentPassword?: string }) => api<AdminUser>('/auth/profile', { method: 'PUT', body: JSON.stringify(input) }),
  changePassword: (currentPassword: string, newPassword: string) => api<void>('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  initializePassword: (currentPassword: string, newPassword: string) => api<void>('/auth/first-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sessions: () => api<{ items: SessionInfo[] }>('/auth/sessions'),
  revokeOtherSessions: () => api<{ revoked: number }>('/auth/sessions/others', { method: 'DELETE' }),
};

export const adminApi = {
  dashboard: () => api<DashboardData>('/admin/dashboard'),
  members: (query = '') => api<{ items: Member[] }>(`/admin/members?search=${encodeURIComponent(query)}`),
  member: (memberId: string) => api<MemberDetail>(`/admin/members/${memberId}`),
  updateMember: (memberId: string, input: { firstName: string; lastName: string; phone?: string; email?: string; birthDate?: string | null; emergencyContact?: EmergencyContact; memberType?: MemberType; studentIdVerified?: boolean }) => api(`/admin/members/${memberId}`, { method: 'PUT', body: JSON.stringify(input) }),
  setMemberStatus: (memberId: string, status: 'ACTIVE' | 'DISABLED', reason: string) => api(`/admin/members/${memberId}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  resetMemberPassword: (memberId: string) => api<{ username: string; temporaryPassword: string }>(`/admin/members/${memberId}/reset-password`, { method: 'POST' }),
  renewMembership: (memberId: string, input: { planId: string; amountReceived: number; notes?: string }) => api<{ membership: MembershipRecord; paymentReference: string; change: number }>(`/admin/members/${memberId}/memberships/renew`, { method: 'POST', body: JSON.stringify(input) }),
  membershipAction: (memberId: string, membershipId: string, action: 'pause' | 'resume' | 'cancel', reason: string) => api<MembershipRecord>(`/admin/members/${memberId}/memberships/${membershipId}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  correctMembershipDates: (memberId: string, membershipId: string, input: { startsAt: string; expiresAt: string; reason: string }) => api<MembershipRecord>(`/admin/members/${memberId}/memberships/${membershipId}/dates`, { method: 'PUT', body: JSON.stringify(input) }),
  attendance: () => api<{ items: AttendanceRecord[] }>('/admin/attendance?limit=50'),
  recordAttendance: (cardUid: string) => {
    if (!ATTENDANCE_STATION_ID) throw new ApiError(400, 'This browser is not configured as an attendance station.');
    return api<{ accepted: boolean; message: string; memberName?: string }>('/admin/attendance/scan', { method: 'POST', headers: { 'X-Attendance-Station': ATTENDANCE_STATION_ID }, body: JSON.stringify({ cardUid }) });
  },
  recordManualAttendance: (memberId: string, reason: string) => api<{ accepted: boolean; message: string; memberName: string }>('/admin/attendance/manual', { method: 'POST', body: JSON.stringify({ memberId, reason }) }),
  walkIns: () => api<{ items: Array<{ id: string; fullName: string; visits: number; lastVisitAt: string }> }>('/admin/walk-ins'),
  cards: () => api<{ items: Array<{ id: string; uid: string; memberName?: string; status: string }> }>('/admin/nfc-cards'),
  payments: () => api<{ items: Array<{ id: string; reference: string; payerName: string; amount: number; type: string; receivedAt: string }> }>('/admin/payments'),
  plans: () => api<{ items: Plan[]; firstMembershipFee: number }>('/admin/plans'),
  createPlan: (input: { name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean }) => api<Plan>('/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (planId: string, input: { name: string; price: number; durationDays: number; eligibility: PlanEligibility; isPromo: boolean }) => api<Plan>(`/admin/plans/${planId}`, { method: 'PUT', body: JSON.stringify(input) }),
  setPlanStatus: (planId: string, isActive: boolean) => api<Plan>(`/admin/plans/${planId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  enroll: (input: { firstName: string; lastName: string; phone?: string; email?: string; birthDate: string; emergencyContact: EmergencyContact; memberType: MemberType; studentIdVerified: boolean; username: string; planId: string; amountReceived: number; consent: { termsAccepted: boolean; privacyAccepted: boolean; liabilityAccepted: boolean; version: string }; sourceWalkInProfileId?: string }) => api<{ memberId: string; memberNumber: string; username: string; temporaryPassword: string; paymentReference: string }>('/admin/enrollments', { method: 'POST', body: JSON.stringify(input) }),
  assignCard: (memberId: string, uid: string) => api<{ id: string; uid: string; portalUrl: string; note: string }>('/admin/nfc-cards', { method: 'POST', body: JSON.stringify({ memberId, uid }) }),
  recordWalkIn: (input: { firstName: string; lastName: string; phone?: string; email?: string; profileId?: string; amountReceived: number; notes?: string }) => api<{ id: string; paymentReference: string; amountDue: number; change: number }>('/admin/walk-ins', { method: 'POST', body: JSON.stringify(input) }),
  settings: () => api<GymSettings>('/admin/settings'),
  updateSettings: (input: GymSettings) => api<GymSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(input) }),
  stations: () => api<{ items: AttendanceStation[] }>('/admin/stations'),
  createStation: (input: { stationId: string; name: string }) => api<AttendanceStation>('/admin/stations', { method: 'POST', body: JSON.stringify(input) }),
  setStationStatus: (stationId: string, isActive: boolean) => api<AttendanceStation>(`/admin/stations/${stationId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  accounts: () => api<{ items: AdminAccount[] }>('/admin/accounts'),
  createAccount: (input: { username: string; firstName: string; lastName: string }) => api<AdminAccount & { temporaryPassword: string }>('/admin/accounts', { method: 'POST', body: JSON.stringify(input) }),
  setAccountStatus: (accountId: string, isActive: boolean) => api<AdminAccount>(`/admin/accounts/${accountId}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  resetAccountPassword: (accountId: string) => api<{ temporaryPassword: string }>(`/admin/accounts/${accountId}/reset-password`, { method: 'POST' }),
};
