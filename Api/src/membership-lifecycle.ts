export const DAY_MILLISECONDS = 86_400_000;

export function extendActiveMembership(expiresAt: Date, durationDays: number) {
  if (!Number.isInteger(durationDays) || durationDays < 1) throw new Error('Membership duration must be a positive whole number of days.');
  return new Date(expiresAt.getTime() + durationDays * DAY_MILLISECONDS);
}

export function calculatePausedTime(expiresAt: Date, pausedAt: Date) {
  return Math.max(0, expiresAt.getTime() - pausedAt.getTime());
}

export function calculateResumedExpiry(resumedAt: Date, remainingMilliseconds: number) {
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) throw new Error('Paused membership has no remaining time.');
  return new Date(resumedAt.getTime() + remainingMilliseconds);
}
