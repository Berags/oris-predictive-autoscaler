// Pure utility to verify inter-arrival intervals against an expected lambda
// Designed to be runnable in both k6 (ES module) and Node.js (CommonJS via transpilation not required here)

const verifyLambda = (intervals, expectedLambda, opts = {}) => {
  if (!Array.isArray(intervals)) throw new Error('intervals must be an array');
  if (typeof expectedLambda !== 'number' || !isFinite(expectedLambda) || expectedLambda <= 0) {
    throw new Error('expectedLambda must be a positive number');
  }

  const minSamples = opts.minSamples ?? 100;
  if (intervals.length < minSamples) return null; // Need minimum samples

  const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  const expectedMean = 1 / expectedLambda;
  const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
  const expectedVariance = 1 / (expectedLambda * expectedLambda);

  const meanError = Math.abs(mean - expectedMean) / expectedMean;
  const varianceError = Math.abs(variance - expectedVariance) / expectedVariance;

  const meanTolerance = opts.meanTolerance ?? 0.1; // 10%
  const varianceTolerance = opts.varianceTolerance ?? 0.2; // 20%

  return {
    sampleCount: intervals.length,
    actualMean: mean,
    expectedMean: expectedMean,
    meanError: meanError,
    actualVariance: variance,
    expectedVariance: expectedVariance,
    varianceError: varianceError,
    actualLambda: 1 / mean,
    isValid: meanError < meanTolerance && varianceError < varianceTolerance,
  };
}

export default verifyLambda;
