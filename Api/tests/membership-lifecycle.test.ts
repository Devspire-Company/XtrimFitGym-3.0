import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePausedTime, calculateResumedExpiry, DAY_MILLISECONDS, extendActiveMembership } from '../src/membership-lifecycle.js';

test('active renewal extends from the existing expiry instead of today', () => {
  const expiry = new Date('2026-10-20T08:00:00.000Z');
  assert.equal(extendActiveMembership(expiry, 30).toISOString(), '2026-11-19T08:00:00.000Z');
});

test('pausing preserves the exact unused membership time', () => {
  const pausedAt = new Date('2026-10-10T08:00:00.000Z');
  const expiry = new Date('2026-10-15T20:00:00.000Z');
  assert.equal(calculatePausedTime(expiry, pausedAt), 5.5 * DAY_MILLISECONDS);
});

test('resuming restores the preserved duration from the resume time', () => {
  const resumedAt = new Date('2026-11-01T00:00:00.000Z');
  assert.equal(calculateResumedExpiry(resumedAt, 5.5 * DAY_MILLISECONDS).toISOString(), '2026-11-06T12:00:00.000Z');
});

test('invalid durations are rejected', () => {
  assert.throws(() => extendActiveMembership(new Date(), 0));
  assert.throws(() => calculateResumedExpiry(new Date(), 0));
});
