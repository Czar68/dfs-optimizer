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

/** Aggregator: merge SGO + Rundown data (from shared-cache). */
export interface AggregatorInput {
  sgo?: unknown;
  rundown?: unknown;
}

export function mergeSgoRundown(sgo: unknown, rundown: unknown): Leg[] {
  const legs: Leg[] = [];
  const push = (id: string, odds: number, prob: number) => {
    const e = ev(odds, prob);
    legs.push({ id, odds, prob, ev: e });
  };
  if (sgo && typeof sgo === "object" && Array.isArray((sgo as { data?: unknown[] }).data)) {
    for (const row of (sgo as { data: { player_name?: string; stat?: string; line?: number; over_odds?: number }[] }).data) {
      const odds = row.over_odds ?? 0;
      if (odds > 0) push(`${row.player_name}-${row.stat}-${row.line}`, odds, 1 / odds);
    }
  }
  if (rundown && typeof rundown === "object" && Array.isArray((rundown as { props?: unknown[] }).props)) {
    for (const p of (rundown as { props: { player?: string; stat?: string; line?: number; over_odds?: number }[] }).props) {
      const odds = p.over_odds ?? 0;
      if (odds > 0) push(`${p.player}-${p.stat}-${p.line}`, odds, 1 / odds);
    }
  }
  return legs;
}

export const aggregator = {
  merge_sgo_rundown: mergeSgoRundown,
  ev_filter: evFilter,
  greedy_parlay: greedyParlay,
};
