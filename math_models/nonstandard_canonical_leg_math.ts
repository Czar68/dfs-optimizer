/**
 * Canonical leg market edge for merged picks (standard + documented UD non-standard rows).
 * Single formula path: delegate to juiceAwareLegEv — no duplicated EV math here.
 */

import { juiceAwareLegEv } from "./juice_adjust";

/** Input passed from nonstandard_canonical_mapping → computeCanonicalLegMarketEdge. */
export interface CanonicalLegMathInput {
  trueProb: number;
  overOdds: number | null;
  underOdds: number | null;
  /** Chosen side for two-way fair probability (defaults to over if omitted). */
  outcome?: 'over' | 'under';
}

export function computeCanonicalLegMarketEdge(leg: CanonicalLegMathInput): number {
  const side = leg.outcome ?? 'over';
  return juiceAwareLegEv(leg.trueProb, leg.overOdds ?? undefined, leg.underOdds ?? undefined, side);
}
