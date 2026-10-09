const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000/v1';
const ATTENDANCE_STATION_ID = (import.meta.env.VITE_ATTENDANCE_STATION_ID as string | undefined)?.trim() ?? '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type AdminUser = { id: string; firstName: string; lastName: string; role: 'ADMIN' | 'OWNER' };
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
  membership?: { plan: string; status: string; expiresAt: string };
  cardStatus?: string;
};
export type AttendanceRecord = { id: string; memberName: string; memberNumber: string; status: string; recordedAt: string };
export type Plan = { _id: string; name: string; price: number; durationDays: number; isActive: boolean };
export type GymSettings = { defaultWalkInFee: number; gymStatusOverride: 'AUTO' | 'OPEN' | 'CLOSED'; hoursToday: string };

export const authApi = {
  me: () => api<AdminUser>('/auth/me'),
  login: (username: string, password: string) => api<AdminUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, portal: 'admin' }) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
};

export const adminApi = {
  dashboard: () => api<DashboardData>('/admin/dashboard'),
  members: (query = '') => api<{ items: Member[] }>(`/admin/members?search=${encodeURIComponent(query)}`),
  attendance: () => api<{ items: AttendanceRecord[] }>('/admin/attendance?limit=50'),
  recordAttendance: (cardUid: string) => {
    if (!ATTENDANCE_STATION_ID) throw new ApiError(400, 'This browser is not configured as an attendance station.');
    return api<{ accepted: boolean; message: string; memberName?: string }>('/admin/attendance/scan', { method: 'POST', headers: { 'X-Attendance-Station': ATTENDANCE_STATION_ID }, body: JSON.stringify({ cardUid }) });
  },
  walkIns: () => api<{ items: Array<{ id: string; fullName: string; visits: number; lastVisitAt: string }> }>('/admin/walk-ins'),
  cards: () => api<{ items: Array<{ id: string; uid: string; memberName?: string; status: string }> }>('/admin/nfc-cards'),
  payments: () => api<{ items: Array<{ id: string; reference: string; payerName: string; amount: number; type: string; receivedAt: string }> }>('/admin/payments'),
  plans: () => api<{ items: Plan[] }>('/admin/plans'),
  createPlan: (input: { name: string; price: number; durationDays: number }) => api<Plan>('/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  enroll: (input: { firstName: string; lastName: string; phone?: string; email?: string; username: string; planId: string; amountReceived: number }) => api<{ memberId: string; memberNumber: string; username: string; temporaryPassword: string; paymentReference: string }>('/admin/enrollments', { method: 'POST', body: JSON.stringify(input) }),
  assignCard: (memberId: string, uid: string) => api<{ id: string; uid: string; portalUrl: string; note: string }>('/admin/nfc-cards', { method: 'POST', body: JSON.stringify({ memberId, uid }) }),
  recordWalkIn: (input: { firstName: string; lastName: string; phone?: string; email?: string; profileId?: string; amountReceived: number; notes?: string }) => api<{ id: string; paymentReference: string; amountDue: number; change: number }>('/admin/walk-ins', { method: 'POST', body: JSON.stringify(input) }),
  settings: () => api<GymSettings>('/admin/settings'),
  updateSettings: (input: GymSettings) => api<GymSettings>('/admin/settings', { method: 'PUT', body: JSON.stringify(input) }),
};
