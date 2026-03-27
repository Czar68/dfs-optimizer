/**
 * Phase 78 — PP card builder leg pool (post-eligibility only).
 * Eligible legs already passed market-relative gates (`edge` / `legEv` / effective EV).
 * No secondary trueProb vs structure-breakeven filter — that legacy screen could empty the pool
 * while `eligibleLegsAfterRunnerFilters` stayed positive (Phase 76 diagnosis).
 */

import type { EvPick } from "../types";

export const PP_CARD_BUILDER_MAX_POOL_LEGS = 30 as const;

/** Rank by market edge (`edge` desc), cap pool size — same legs eligibility produced. */
export function buildPpCardBuilderPool(legs: EvPick[]): EvPick[] {
  return [...legs]
    .sort((a, b) => b.edge - a.edge)
    .slice(0, PP_CARD_BUILDER_MAX_POOL_LEGS);
}
