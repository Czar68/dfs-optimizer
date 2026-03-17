/**
 * EV / Parlay pipeline: ev(odds, prob), parlay_odds, kelly_stake.
 * For decimal-odds parlays only. For DFS card EV use outcome-based formula:
 *   EV = Σ P(outcome) × Payout(outcome) - 1  → math_models/card_ev_from_registry.
 *
 * Math delegated to math_models/ev_parlay (locked-down canonical source).
 */

export type { Leg } from '../math_models/ev_parlay';
export {
  ev,
  parlayOdds,
  kellyStake,
  MIN_EV_DECIMAL,
  MAX_PARLAY_LEGS,
  evFilter,
} from '../math_models/ev_parlay';

import type { Leg } from '../math_models/ev_parlay';
import { ev, parlayOdds, evFilter } from '../math_models/ev_parlay';

/** Greedy parlay: pick up to maxLegs legs by highest EV, then compute combined odds. */
export function greedyParlay(legs: Leg[], maxLegs = 5): { legs: Leg[]; odds: number } {
  const sorted = [...legs].sort((a, b) => b.ev - a.ev);
  const chosen = sorted.slice(0, maxLegs);
  return { legs: chosen, odds: parlayOdds(chosen) };
}

export const aggregator = {
  ev_filter: evFilter,
  greedy_parlay: greedyParlay,
};
