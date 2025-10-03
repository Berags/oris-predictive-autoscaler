// Pure utilities for metrics and timing calculations used by the k6 script

/**
 * Exponential Moving Average update for publish overhead (in seconds)
 * If prevOverhead is undefined or null, initializes with the sample.
 */
export const emaOverhead = (prevOverhead, sampleSeconds, alpha = 0.1) => {
  if (
    typeof sampleSeconds !== "number" ||
    !isFinite(sampleSeconds) ||
    sampleSeconds < 0
  ) {
    throw new Error("sampleSeconds must be a non-negative number");
  }
  if (
    typeof alpha !== "number" ||
    !isFinite(alpha) ||
    alpha <= 0 ||
    alpha > 1
  ) {
    throw new Error("alpha must be in (0,1]");
  }
  if (prevOverhead === undefined || prevOverhead === null) return sampleSeconds;
  return alpha * sampleSeconds + (1 - alpha) * prevOverhead;
}

/**
 * Compute effective output rate from an array of publish timestamps in ms.
 * Returns messages per second. Requires at least 2 timestamps.
 */
export const computeEffectiveRate = (publishTimestampsMs) => {
  if (!Array.isArray(publishTimestampsMs))
    throw new Error("publishTimestampsMs must be an array");
  if (publishTimestampsMs.length < 2) return 0;
  const first = publishTimestampsMs[0];
  const last = publishTimestampsMs[publishTimestampsMs.length - 1];
  const timeSpanSeconds = (last - first) / 1000;
  if (timeSpanSeconds <= 0) return 0;
  return (publishTimestampsMs.length - 1) / timeSpanSeconds;
}

/**
 * Compute recent effective rate using only the last N timestamps (default 100).
 */
export const computeRecentEffectiveRate = (
  publishTimestampsMs,
  recentCount = 100
) => {
  if (!Array.isArray(publishTimestampsMs))
    throw new Error("publishTimestampsMs must be an array");
  if (recentCount <= 1) throw new Error("recentCount must be > 1");
  if (publishTimestampsMs.length < 2) return 0;
  const count = Math.min(recentCount, publishTimestampsMs.length);
  const recent = publishTimestampsMs.slice(-count);
  const span = (recent[recent.length - 1] - recent[0]) / 1000;
  if (span <= 0) return 0;
  return (recent.length - 1) / span;
}

/**
 * Compute theoretical rate from inter-arrival intervals (seconds),
 * using the last N intervals (default 50) if available.
 */
export const computeTheoreticalRateFromIntervals = (
  intervalsSeconds,
  sampleCount = 50
) => {
  if (!Array.isArray(intervalsSeconds))
    throw new Error("intervalsSeconds must be an array");
  if (intervalsSeconds.length === 0) return 0;
  const sample = intervalsSeconds.slice(
    -Math.min(sampleCount, intervalsSeconds.length)
  );
  const avg = sample.reduce((s, v) => s + v, 0) / sample.length;
  return avg > 0 ? 1 / avg : 0;
}

/**
 * Compute compensated wait time in milliseconds given current time, next scheduled
 * time (both in ms), and estimated publish overhead in seconds.
 */
export const computeCompensatedWaitMs = (
  nowMs,
  nextScheduledMs,
  publishOverheadSeconds
) => {
  if (
    ![nowMs, nextScheduledMs, publishOverheadSeconds].every(
      (v) => typeof v === "number" && isFinite(v)
    )
  ) {
    throw new Error(
      "nowMs, nextScheduledMs, and publishOverheadSeconds must be finite numbers"
    );
  }
  const rawWait = nextScheduledMs - nowMs;
  const compensated = rawWait - publishOverheadSeconds * 1000;
  return Math.max(0, compensated);
}
