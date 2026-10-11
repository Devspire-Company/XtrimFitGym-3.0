import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_WEEKLY_HOURS,
  manilaDateKey,
  manilaDayBounds,
  manilaMonthBounds,
  manilaWeekBounds,
  resolveGymAvailability,
} from '../src/manila-time.js';

test('Manila date changes at 16:00 UTC', () => {
  assert.equal(manilaDateKey(new Date('2026-10-10T15:59:59.999Z')), '2026-10-10');
  assert.equal(manilaDateKey(new Date('2026-10-10T16:00:00.000Z')), '2026-10-11');
});

test('Manila day bounds are expressed as UTC instants', () => {
  const bounds = manilaDayBounds('2026-10-11');
  assert.equal(bounds.start.toISOString(), '2026-10-10T16:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-11T16:00:00.000Z');
});

test('month bounds handle month-end, year-end, and leap day', () => {
  const february = manilaMonthBounds(new Date('2028-02-29T08:00:00.000Z'));
  assert.equal(february.start.toISOString(), '2028-01-31T16:00:00.000Z');
  assert.equal(february.end.toISOString(), '2028-02-29T16:00:00.000Z');

  const december = manilaMonthBounds(new Date('2026-12-31T08:00:00.000Z'));
  assert.equal(december.end.toISOString(), '2026-12-31T16:00:00.000Z');
});

test('week bounds begin Monday in Manila', () => {
  const bounds = manilaWeekBounds(new Date('2026-10-11T04:00:00.000Z'));
  assert.equal(bounds.start.toISOString(), '2026-10-04T16:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-11T16:00:00.000Z');
});

test('weekly hours determine open state and the member-facing label', () => {
  const result = resolveGymAvailability(
    { weeklyHours: DEFAULT_WEEKLY_HOURS },
    new Date('2026-10-11T01:00:00.000Z'),
  );
  assert.deepEqual(result, {
    isOpen: true,
    statusLabel: 'Open now',
    hoursToday: '6:00 AM – 10:00 PM',
    scheduleSource: 'WEEKLY',
  });
});

test('special closures override weekly hours', () => {
  const result = resolveGymAvailability(
    {
      weeklyHours: DEFAULT_WEEKLY_HOURS,
      scheduleExceptions: [{ date: '2026-10-11', label: 'Maintenance day', isClosed: true }],
    },
    new Date('2026-10-11T01:00:00.000Z'),
  );
  assert.equal(result.isOpen, false);
  assert.equal(result.hoursToday, 'Maintenance day');
  assert.equal(result.scheduleSource, 'EXCEPTION');
});

test('manual status overrides take precedence over the schedule', () => {
  const beforeOpening = new Date('2026-10-10T20:00:00.000Z');
  assert.equal(resolveGymAvailability({ gymStatusOverride: 'OPEN' }, beforeOpening).isOpen, true);
  assert.equal(resolveGymAvailability({ gymStatusOverride: 'CLOSED' }, new Date('2026-10-11T01:00:00.000Z')).isOpen, false);
});
