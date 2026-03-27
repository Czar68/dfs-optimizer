/**
 * Generic rolling descriptive statistics for backtest feature rows.
 * Used by historical feature registry — not live EV/gating.
 */

export function arithmeticMean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Unbiased sample variance (requires ≥2 points). */
export function sampleVarianceUnbiased(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = arithmeticMean(values)!;
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return s / (values.length - 1);
}

/**
 * OLS slope of y on x where x = 0,1,...,n-1 (game order within window).
 * Returns null if length < 2 or zero variance in x.
 */
export function slopeLinearOnIndex(y: number[]): number | null {
  const n = y.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2;
  const my = arithmeticMean(y);
  if (my == null) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - mx;
    num += dx * (y[i] - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}
