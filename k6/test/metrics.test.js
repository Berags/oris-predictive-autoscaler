import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emaOverhead,
  computeEffectiveRate,
  computeRecentEffectiveRate,
  computeTheoreticalRateFromIntervals,
  computeCompensatedWaitMs,
} from '../util/metrics.js';

test('emaOverhead initializes and updates correctly', () => {
  const first = emaOverhead(undefined, 0.02, 0.1);
  assert.equal(first, 0.02);
  const second = emaOverhead(first, 0.04, 0.1);
  // 0.1*0.04 + 0.9*0.02 = 0.022
  assert.ok(Math.abs(second - 0.022) < 1e-9);
});

test('computeEffectiveRate returns 0 with insufficient data', () => {
  assert.equal(computeEffectiveRate([]), 0);
  assert.equal(computeEffectiveRate([1000]), 0);
});

test('computeEffectiveRate computes correct rate', () => {
  // 6 timestamps across 5 intervals totalling 5 seconds -> 1 msg/s
  const ts = [0, 1000, 2000, 3000, 4000, 5000];
  assert.equal(computeEffectiveRate(ts), 1);
});

test('computeRecentEffectiveRate with last N points', () => {
  const ts = [0, 1000, 2000, 3000, 4000, 5000];
  // last 3 timestamps: 3000..5000 => 2 intervals over 2 seconds => 1 msg/s
  assert.equal(computeRecentEffectiveRate(ts, 3), 1);
});

test('computeTheoreticalRateFromIntervals uses harmonic logic (1/avg)', () => {
  const intervals = [1, 1, 1, 1];
  assert.equal(computeTheoreticalRateFromIntervals(intervals), 1);
  const intervals2 = [0.5, 0.5, 0.5, 0.5];
  assert.equal(computeTheoreticalRateFromIntervals(intervals2), 2);
});

test('computeCompensatedWaitMs clamps to zero and compensates overhead', () => {
  const now = 1000;
  const next = 1100; // 100ms later
  const overhead = 0.05; // 50ms
  // raw wait 100ms - 50ms = 50ms
  assert.equal(computeCompensatedWaitMs(now, next, overhead), 50);
  // If overhead larger than raw wait, it should clamp to 0
  assert.equal(computeCompensatedWaitMs(now, next, 0.2), 0);
});
