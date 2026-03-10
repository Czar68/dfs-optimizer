/**
 * math_models/single_bet_ev.ts
 * Single-bet EV, implied probability, odds conversion, Kelly fraction.
 * EXTRACTED FROM: src/sportsbook_single_ev.ts — do not change formulas without peer-review.
 */

/** American to decimal: +110 → 2.10, -110 → 1.91 */
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) return americanOdds / 100 + 1;
  return 100 / Math.abs(americanOdds) + 1;
}

/** Decimal to American: 2.10 → +110, 1.91 → -110 */
export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

/** Implied win probability from decimal odds: 1 / decimalOdds */
export function calculateImpliedProbability(decimalOdds: number): number {
  return 1 / decimalOdds;
}

/** Fair decimal odds from true win probability: 1 / trueProb */
export function calculateFairOdds(trueWinProb: number): number {
  return 1 / trueWinProb;
}

/**
 * Single-bet EV for unit stake.
 * EV = p * (decimalOdds - 1) - (1 - p) * 1 = p * netProfit - (1-p)
 */
export function calculateSingleBetEV(trueWinProb: number, decimalOdds: number): number {
  const netProfit = decimalOdds - 1;
  return trueWinProb * netProfit - (1 - trueWinProb) * 1;
}

/**
 * Kelly fraction for a single bet: f* = (bp - q) / b, b = decimalOdds - 1, p = trueWinProb, q = 1-p.
 * Clamp to [0, 1]; return 0 if EV <= 0.
 */
export function calculateKellyFraction(trueWinProb: number, decimalOdds: number): number {
  const b = decimalOdds - 1;
  const p = trueWinProb;
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  const ev = calculateSingleBetEV(p, decimalOdds);
  if (ev <= 0) return 0;
  return Math.max(0, Math.min(1, kelly));
}
