import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipPricing, planIsEligible } from '../src/membership-pricing.js';

test('first membership includes the configured one-time fee', () => {
  assert.deepEqual(membershipPricing(500, 100, true), { planAmount: 500, membershipFee: 100, totalDue: 600 });
});

test('renewals do not charge the first-membership fee', () => {
  assert.deepEqual(membershipPricing(500, 100, false), { planAmount: 500, membershipFee: 0, totalDue: 500 });
});

test('plan eligibility permits universal and matching plans only', () => {
  assert.equal(planIsEligible('ALL', 'STUDENT'), true);
  assert.equal(planIsEligible('STUDENT', 'STUDENT'), true);
  assert.equal(planIsEligible('REGULAR', 'STUDENT'), false);
});
