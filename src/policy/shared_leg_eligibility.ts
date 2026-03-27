/**
 * Phase 17N — Site-invariant eligibility primitives (shared after platform-math normalization).
 *
 * Single implementation paths for:
 * - FCFS leg caps (grouping mode is the only allowed site difference)
 * - Runner export card slice limits (CLI semantics shared; PP uses maxExport vs maxCards when not unified)
 *
 * Approved irreducible differences (see tests/phase17n_site_invariant_eligibility_enforcement.spec.ts):
 * - Platform math: UD pick factor + udAdjustedLegEv tiers vs PP effective EV (adjEv ?? legEv) + calibration.
 * - Platform input semantics: FCFS grouping key = player (PP) vs `${site}:${player}:${stat}` (UD).
 */

import type { CliArgs } from "../cli_args";
import type { EvPick } from "../types";

/** Declarative ordering for audits: shared gates after each site’s platform_math leg fields are final. */
export const PHASE17N_SHARED_ELIGIBILITY_STAGE_ORDER = [
  "shared_min_edge_comparator",
  "shared_min_leg_ev_or_platform_tiered_ev",
  "shared_fcfs_cap",
] as const;

export const PHASE17N_IRREDUCIBLE_PLATFORM_MATH = [
  "ud_pick_factor_decline_and_ud_adjusted_leg_ev_tiers",
  "pp_historical_calibration_and_effective_ev_floor",
] as const;

export const PHASE17N_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS = [
  "fcfs_cap_key_per_player_pp",
  "fcfs_cap_key_site_player_stat_ud",
] as const;

export type SharedCapGroupingMode = "per_player" | "per_player_per_stat_site";

export function sharedEligibilityCapKeyPerPlayer(leg: EvPick): string {
  return leg.player;
}

export function sharedEligibilityCapKeyPlayerStatSite(leg: EvPick): string {
  return `${leg.site}:${leg.player}:${leg.stat}`;
}

/**
 * First-come-first-served cap: one canonical loop; mode selects grouping (PP vs UD semantics).
 */
export function applySharedFirstComeFirstServedCap(
  legs: EvPick[],
  maxPerKey: number,
  mode: SharedCapGroupingMode
): EvPick[] {
  const keyFn =
    mode === "per_player"
      ? sharedEligibilityCapKeyPerPlayer
      : sharedEligibilityCapKeyPlayerStatSite;
  const counts = new Map<string, number>();
  const out: EvPick[] = [];
  for (const leg of legs) {
    const k = keyFn(leg);
    const n = counts.get(k) ?? 0;
    if (n + 1 > maxPerKey) continue;
    counts.set(k, n + 1);
    out.push(leg);
  }
  return out;
}

/** Same edge comparator PP and UD use post-normalization (`leg.edge >= minEdge`). */
export function sharedLegPassesMinEdge(leg: Pick<EvPick, "edge">, minEdge: number): boolean {
  return leg.edge >= minEdge;
}

/**
 * PP runner export slice: unified `both` platform uses --max-cards like legacy; PP-only paths use --max-export.
 * Pass `true` only when `cliArgs.platform === "both"` (do not pass raw platform — avoids misclassification for non-PP modes).
 */
export function resolvePrizePicksRunnerExportCardLimit(
  args: CliArgs,
  useMaxCardsWhenUnifiedBoth: boolean
): number {
  if (args.exportUncap) return Number.MAX_SAFE_INTEGER;
  return useMaxCardsWhenUnifiedBoth ? args.maxCards : args.maxExport;
}

/** UD runner export slice: default cap 800 when --max-cards omitted; honors --export-uncap like PP. */
export function resolveUnderdogRunnerExportCardCap(args: CliArgs): number {
  if (args.exportUncap) return Number.MAX_SAFE_INTEGER;
  return args.maxCards ?? 800;
}
