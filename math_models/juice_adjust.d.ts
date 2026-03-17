/**
 * math_models/juice_adjust.ts
 * Juice-aware leg EV: true BE from odds, fair BE from two-way, structure breakeven.
 * EXTRACTED FROM: src/ev/juice_adjust.ts — do not change formulas without peer-review.
 */
/**
 * True breakeven probability from American odds on the chosen side.
 * decimal = american>0 ? 1+american/100 : 1+100/|american|; return 1/decimal.
 */
export declare function trueBeFromOdds(americanOdds: number): number;
/**
 * Fair breakeven from two-way odds: impliedOver / (impliedOver + impliedUnder).
 */
export declare function fairBeFromTwoWayOdds(overOdds: number, underOdds: number): number;
/**
 * Structure-specific per-leg breakeven from gospel payout tables (PP/UD).
 */
export declare function structureBreakeven(platform: 'PP' | 'UD', flexType: string): number;
/**
 * Leg-level edge: trueProb - 0.5 (naive breakeven). Card-level EV uses structure payouts separately.
 */
export declare function juiceAwareLegEv(trueProb: number, _overOdds: number | null | undefined, _underOdds: number | null | undefined): number;
