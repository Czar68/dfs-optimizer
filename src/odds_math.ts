// src/odds_math.ts

// American odds -> implied probability (vigged)
export function americanToProb(american: number): number {
  if (american === 0 || !Number.isFinite(american)) return 0.5;
  if (american > 0) {
    return 100 / (american + 100);
  }
  return -american / (-american + 100);
}

/** American odds → implied probability. Step 3: explicit helper for calibration/reporting. */
export function americanToImpliedProb(odds: number): number {
  if (odds === 0 || !Number.isFinite(odds)) return 0.5;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// Two‑way devig using simple proportional scaling.
// Returns [trueProbOver, trueProbUnder].
export function devigTwoWay(
  probOver: number,
  probUnder: number
): [number, number] {
  const total = probOver + probUnder;
  if (total <= 0) {
    return [0.5, 0.5];
  }
  return [probOver / total, probUnder / total];
}

// Implied fair American odds from probability
export function probToAmerican(prob: number): number {
  if (prob <= 0) return 0;
  if (prob >= 1) return 0;
  if (prob >= 0.5) {
    return -(prob / (1 - prob)) * 100;
  }
  return ((1 - prob) / prob) * 100;
}
