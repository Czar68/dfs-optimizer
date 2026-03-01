/**
 * EV / Parlay pipeline: ev(odds, prob), parlay_odds, kelly_stake.
 * aggregator.merge_sgo_rundown() -> ev_filter(1.05+) -> greedy_parlay(5-leg max).
 */

export interface Leg {
  id: string;
  odds: number;   // decimal (e.g. 1.91)
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

/** Kelly stake (fraction of bankroll): ev / (odds - 1) for decimal, or kelly fraction from edge. */
export function kellyStake(ev: number, odds: number, fraction = 0.25): number {
  if (odds <= 1) return 0;
  const b = odds - 1;
  const q = 1 - 1 / odds;
  const k = (odds * (1 / odds) - 1) / b; // simplified: (edge) / b
  const f = (ev / b);
  return Math.max(0, Math.min(fraction, f * 0.25));
}

export const MIN_EV_DECIMAL = 1.05; // 5%+ EV threshold
export const MAX_PARLAY_LEGS = 5;

/** Filter legs with EV >= minEv (e.g. 1.05 = 5% edge). */
export function evFilter(legs: Leg[], minEvDecimal = MIN_EV_DECIMAL): Leg[] {
  const minEdge = minEvDecimal - 1;
  return legs.filter((leg) => leg.ev >= minEdge);
}

/** Greedy parlay: pick up to maxLegs legs by highest EV, then compute combined odds. */
export function greedyParlay(legs: Leg[], maxLegs = MAX_PARLAY_LEGS): { legs: Leg[]; odds: number } {
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
