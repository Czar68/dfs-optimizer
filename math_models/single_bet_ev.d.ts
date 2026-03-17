/**
 * math_models/single_bet_ev.ts
 * Single-bet EV, implied probability, odds conversion, Kelly fraction.
 * EXTRACTED FROM: src/sportsbook_single_ev.ts — do not change formulas without peer-review.
 */
/** American to decimal: +110 → 2.10, -110 → 1.91 */
export declare function americanToDecimal(americanOdds: number): number;
/** Decimal to American: 2.10 → +110, 1.91 → -110 */
export declare function decimalToAmerican(decimalOdds: number): number;
/** Implied win probability from decimal odds: 1 / decimalOdds */
export declare function calculateImpliedProbability(decimalOdds: number): number;
/** Fair decimal odds from true win probability: 1 / trueProb */
export declare function calculateFairOdds(trueWinProb: number): number;
/**
 * Single-bet EV for unit stake.
 * EV = p * (decimalOdds - 1) - (1 - p) * 1 = p * netProfit - (1-p)
 */
export declare function calculateSingleBetEV(trueWinProb: number, decimalOdds: number): number;
/**
 * Kelly fraction for a single bet: f* = (bp - q) / b, b = decimalOdds - 1, p = trueWinProb, q = 1-p.
 * Clamp to [0, 1]; return 0 if EV <= 0.
 */
export declare function calculateKellyFraction(trueWinProb: number, decimalOdds: number): number;
