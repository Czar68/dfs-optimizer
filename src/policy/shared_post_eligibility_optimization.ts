/**
 * Phase 17P — Site-invariant post-eligibility optimization policy (after leg + card gates, before export).
 * Card/leg EV from evaluators is platform math; this module holds **shared** ranking hooks and
 * non-evaluator adjustments that apply the same rule to PP and UD.
 */

import type { CardEvResult, EvPick } from "../types";

/** Documented pipeline (PP runs SelectionEngine; UD skips — see Phase 17P docs). */
export const SHARED_POST_ELIGIBILITY_OPTIMIZATION_STAGE_ORDER = [
  "post_evaluator_duplicate_player_leg_penalty",
  "selection_engine_breakeven_anti_dilution_pp_only",
  "export_primary_ranking_sort_cards",
] as const;

/** Stable annotation: duplicate-player leg stacking penalty applied to raw evaluator output. */
export const POST_OPT_ANNOTATION_DUPLICATE_PLAYER_PENALTY = "POST_OPT_DUPLICATE_PLAYER_LEG_PENALTY" as const;

/**
 * Base per duplicate leg beyond the first on the same player (legacy PP `CORRELATION_PENALTY_PER_DUPLICATE`).
 * With unique-players-per-card gates, factor is usually 1; kept for parity and defensive use.
 */
export const DUPLICATE_PLAYER_LEG_CORRELATION_PENALTY_BASE = 0.95 as const;

/**
 * Down-weights card EV when the same player appears on multiple legs (legacy name: correlation penalty).
 * Does not change evaluator math — applies **after** `evaluateFlexCard` / UD card evaluators.
 */
export function applyPostEvaluatorDuplicatePlayerLegPenalty(result: CardEvResult): CardEvResult {
  const playerCounts = new Map<string, number>();
  for (const { pick } of result.legs) {
    playerCounts.set(pick.player, (playerCounts.get(pick.player) ?? 0) + 1);
  }
  let extraLegsFromSamePlayer = 0;
  for (const count of playerCounts.values()) {
    if (count > 1) extraLegsFromSamePlayer += count - 1;
  }
  const factor =
    extraLegsFromSamePlayer === 0
      ? 1
      : Math.pow(DUPLICATE_PLAYER_LEG_CORRELATION_PENALTY_BASE, extraLegsFromSamePlayer);

  const cardEvAdjusted = result.cardEv * factor;
  const totalReturnAdjusted = (cardEvAdjusted + 1) * result.stake;

  return {
    ...result,
    cardEv: cardEvAdjusted,
    expectedValue: cardEvAdjusted,
    totalReturn: totalReturnAdjusted,
  };
}

/** Unified leg value for post-filter ranking (PP `effectiveEv` / UD bench top_legs): adjEv ?? legEv. */
export function postEligibilityLegValueMetric(leg: EvPick): number {
  return leg.adjEv ?? leg.legEv;
}

export function compareLegsForPostEligibilityRanking(a: EvPick, b: EvPick): number {
  const va = postEligibilityLegValueMetric(a);
  const vb = postEligibilityLegValueMetric(b);
  if (vb !== va) return vb - va;
  return a.id.localeCompare(b.id);
}

export function sortLegsByPostEligibilityValue(legs: EvPick[]): EvPick[] {
  return [...legs].sort(compareLegsForPostEligibilityRanking);
}

/**
 * Primary export ranking for cards: cardEv desc, then winProbCash, then sorted leg ids.
 * Used for PP `sortedCards` and UD wrapped cards (same **meaning** for final ordering).
 */
export function compareCardsForExportPrimaryRanking(a: CardEvResult, b: CardEvResult): number {
  if (b.cardEv !== a.cardEv) {
    return b.cardEv - a.cardEv;
  }
  if (b.winProbCash !== a.winProbCash) {
    return b.winProbCash - a.winProbCash;
  }
  const aKey = a.legs
    .map((l) => l.pick.id)
    .slice()
    .sort()
    .join("|");
  const bKey = b.legs
    .map((l) => l.pick.id)
    .slice()
    .sort()
    .join("|");
  return aKey.localeCompare(bKey);
}

export function sortCardsForExportPrimaryRanking(cards: CardEvResult[]): CardEvResult[] {
  return [...cards].sort(compareCardsForExportPrimaryRanking);
}

/** UD `{ format, card }[]` — order by shared card comparator on inner `card`. */
export function sortFormatCardEntriesForExportPrimaryRanking(
  entries: { format: string; card: CardEvResult }[]
): { format: string; card: CardEvResult }[] {
  return [...entries].sort((a, b) => compareCardsForExportPrimaryRanking(a.card, b.card));
}
