import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCashClosing } from '../src/cash-closing.js';

test('cash closing calculates the expected drawer and exact variance', () => {
  assert.deepEqual(calculateCashClosing(1_000, 2_450.5, 3_460.5), { expectedCash: 3_450.5, variance: 10 });
});

test('cash closing rounds currency safely to two decimal places', () => {
  assert.deepEqual(calculateCashClosing(0.1, 0.2, 0.3), { expectedCash: 0.3, variance: 0 });
  assert.deepEqual(calculateCashClosing(500, 70, 565.555), { expectedCash: 570, variance: -4.45 });
});
