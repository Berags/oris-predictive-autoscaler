import assert from 'node:assert/strict';
import test from 'node:test';
import verifyLambda from '../util/verifyLambda.js';

// Helper to generate exponential inter-arrival times for a given lambda
function rexp(n, lambda) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    arr[i] = -Math.log(1 - Math.random()) / lambda;
  }
  return arr;
}

// Contract checks
test('verifyLambda validates inputs', () => {
  assert.throws(() => verifyLambda('nope', 1), /intervals must be an array/);
  assert.throws(() => verifyLambda([], 0), /positive number/);
  assert.throws(() => verifyLambda([], -1), /positive number/);
  assert.throws(() => verifyLambda([], NaN), /positive number/);
});

test('verifyLambda returns null if not enough samples', () => {
  const res = verifyLambda([0.1, 0.2, 0.3], 10, { minSamples: 10 });
  assert.equal(res, null);
});

test('verifyLambda recognizes approximate Poisson intervals', () => {
  const lambda = 5; // 5 msg/s
  const intervals = rexp(2000, lambda); // lots of samples for stability
  const res = verifyLambda(intervals, lambda);
  assert.equal(typeof res, 'object');
  assert.equal(res.sampleCount, intervals.length);
  assert.ok(res.isValid, `Expected valid with meanError=${res.meanError} varianceError=${res.varianceError}`);
  // Check mean is close to 1/lambda
  assert.ok(Math.abs(res.actualMean - 1 / lambda) / (1 / lambda) < 0.1);
});

test('verifyLambda flags wrong lambda', () => {
  const trueLambda = 2;
  const intervals = rexp(1500, trueLambda);
  const res = verifyLambda(intervals, 8); // wrong expected
  assert.equal(typeof res, 'object');
  assert.equal(res.sampleCount, intervals.length);
  assert.ok(!res.isValid);
});
