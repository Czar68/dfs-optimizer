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
export function ev(odds: number, prob: number): number {
  return odds * prob - 1;
}

/** Parlay decimal odds = product of leg decimals. */
export function parlayOdds(legs: Leg[]): number {
  return legs.reduce((acc, leg) => acc * leg.odds, 1);
}

/** Kelly stake (fraction of bankroll): ev / (odds - 1) for decimal, capped to fraction. */
export function kellyStake(evVal: number, odds: number, fraction = 0.25): number {
  if (odds <= 1) return 0;
  const b = odds - 1;
  const f = evVal / b;
  return Math.max(0, Math.min(fraction, f * 0.25));
}

export const MIN_EV_DECIMAL = 1.05;
export const MAX_PARLAY_LEGS = 5;

/** Filter legs with EV >= minEv (e.g. 1.05 = 5% edge). minEdge = minEvDecimal - 1. */
export function evFilter(legs: Leg[], minEvDecimal = MIN_EV_DECIMAL): Leg[] {
  const minEdge = minEvDecimal - 1;
  return legs.filter((leg) => leg.ev >= minEdge);
}
