export const MANILA_TIME_ZONE = 'Asia/Manila';
export const DAY_MILLISECONDS = 86_400_000;
export const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
export type Weekday = typeof WEEKDAYS[number];
export type WeeklyHours = { day: Weekday; isClosed: boolean; openTime: string; closeTime: string };
export type ScheduleException = { date: string; label?: string; isClosed: boolean; openTime?: string; closeTime?: string };
export const DEFAULT_WEEKLY_HOURS: WeeklyHours[] = WEEKDAYS.map((day) => ({ day, isClosed: false, openTime: '06:00', closeTime: '22:00' }));

const manilaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function manilaDateKey(value = new Date()): string {
  const parts = Object.fromEntries(manilaDateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function manilaDayBounds(dateKey = manilaDateKey()): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MILLISECONDS) };
}

export function manilaWeekBounds(value = new Date()): { start: Date; end: Date } {
  const todayStart = manilaDayBounds(manilaDateKey(value)).start;
  const manilaDayOfWeek = new Date(todayStart.getTime() + (8 * 60 * 60 * 1000)).getUTCDay();
  const daysSinceMonday = (manilaDayOfWeek + 6) % 7;
  const start = new Date(todayStart.getTime() - (daysSinceMonday * DAY_MILLISECONDS));
  return { start, end: new Date(start.getTime() + (7 * DAY_MILLISECONDS)) };
}

export function manilaMonthBounds(value = new Date()): { start: Date; end: Date } {
  const key = manilaDateKey(value);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`);
  return { start, end };
}

function timeLabel(value: string): string {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function resolveGymAvailability(settings: { gymStatusOverride?: 'AUTO' | 'OPEN' | 'CLOSED'; weeklyHours?: WeeklyHours[]; scheduleExceptions?: ScheduleException[] }, now = new Date()) {
  const date = manilaDateKey(now);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TIME_ZONE, weekday: 'long' }).format(now).toUpperCase() as Weekday;
  const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: MANILA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const exception = settings.scheduleExceptions?.find((entry) => entry.date === date);
  const regular = settings.weeklyHours?.find((entry) => entry.day === day) ?? DEFAULT_WEEKLY_HOURS.find((entry) => entry.day === day)!;
  const schedule = exception ?? regular;
  const isScheduledOpen = !schedule.isClosed && Boolean(schedule.openTime && schedule.closeTime) && currentTime >= schedule.openTime! && currentTime < schedule.closeTime!;
  const override = settings.gymStatusOverride ?? 'AUTO';
  const isOpen = override === 'OPEN' || (override === 'AUTO' && isScheduledOpen);
  const hoursToday = schedule.isClosed ? (exception?.label || 'Closed today') : `${timeLabel(schedule.openTime!)} – ${timeLabel(schedule.closeTime!)}`;
  return { isOpen, statusLabel: isOpen ? 'Open now' : 'Closed', hoursToday, scheduleSource: exception ? 'EXCEPTION' : 'WEEKLY' };
}
