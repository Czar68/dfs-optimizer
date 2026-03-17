/**
 * math_models/ev_parlay.ts
 * EV per unit, parlay decimal odds, Kelly stake for parlays.
 * EXTRACTED FROM: src/ev_parlay.ts — do not change formulas without peer-review.
 */
export interface Leg {
    id: string;
    odds: number;
    prob: number;
    ev: number;
}
/** EV per unit: odds * prob - 1 (decimal). */
export declare function ev(odds: number, prob: number): number;
/** Parlay decimal odds = product of leg decimals. */
export declare function parlayOdds(legs: Leg[]): number;
/** Kelly stake (fraction of bankroll): ev / (odds - 1) for decimal, capped to fraction. */
export declare function kellyStake(evVal: number, odds: number, fraction?: number): number;
export declare const MIN_EV_DECIMAL = 1.05;
export declare const MAX_PARLAY_LEGS = 5;
/** Filter legs with EV >= minEv (e.g. 1.05 = 5% edge). minEdge = minEvDecimal - 1. */
export declare function evFilter(legs: Leg[], minEvDecimal?: number): Leg[];
