// src/historical/decay_weights.ts
// Exponential decay weight utilities for time-series calibration.
// Re-exported standalone so callers need not import calibrate_leg_ev.

const LN2 = Math.log(2);

/**
 * Exponential decay weight for an observation made `daysAgo` days ago.
 * Weight = exp(-daysAgo * ln2 / halfLife).
 * Returns 1.0 when daysAgo == 0 and approaches 0 as age → ∞.
 */
export function exponentialDecayWeight(
  daysAgo: number,
  halfLife: number
): number {
  if (daysAgo < 0) return 1.0; // future/same-day dates treated as present
  return Math.exp((-daysAgo * LN2) / halfLife);
}

/**
 * Decay-weighted average of values[] using parallel weights[].
 * Returns 0 when sumWeight == 0.
 */
export function weightedAverage(values: number[], weights: number[]): number {
  const n = Math.min(values.length, weights.length);
  let sumW = 0;
  let sumWV = 0;
  for (let i = 0; i < n; i++) {
    sumW += weights[i];
    sumWV += weights[i] * values[i];
  }
  return sumW > 0 ? sumWV / sumW : 0;
}

/**
 * Decay-weighted standard deviation of values[], given pre-computed weighted mean.
 * Returns 0 when sumWeight == 0 or only one effective sample.
 */
export function weightedStdDev(
  values: number[],
  weights: number[],
  mean: number
): number {
  const n = Math.min(values.length, weights.length);
  let sumW = 0;
  let sumWD2 = 0;
  for (let i = 0; i < n; i++) {
    sumW += weights[i];
    sumWD2 += weights[i] * Math.pow(values[i] - mean, 2);
  }
  return sumW > 0 ? Math.sqrt(sumWD2 / sumW) : 0;
}

/**
 * Sum of decay weights for an array of daysAgo values.
 * Useful for computing n_eff (effective sample size).
 */
export function effectiveSampleSize(
  daysAgoArr: number[],
  halfLife: number
): number {
  return daysAgoArr.reduce(
    (s, d) => s + exponentialDecayWeight(d, halfLife),
    0
  );
}
