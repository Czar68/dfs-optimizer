/**
 * Phase 17Q — Site-invariant final selection policy (after shared leg eligibility, card gates, post-opt hooks).
 * Orchestrates breakeven + anti-dilution (SelectionEngine) and export-cap slicing with deterministic ordering.
 * Evaluator math remains in `evaluateFlexCard` / `evaluateUd*`; registry lookups use `structureId` when set (see SelectionEngine).
 *
 * Phase 17S — Typed removal/adjustment attribution (report-only): `attributeFilterAndOptimizeBatch`,
 * `attributeFinalSelectionUdFormatEntries` mirror `filterAndOptimize` / `applyFinalSelectionToFormatEntries` without changing outputs.
 */

import type { CardEvResult } from "../types";
import type { Platform } from "../../math_models/optimal_card_size";
import { getBreakevenThreshold } from "../../math_models/breakeven_from_registry";
import { applyAntiDilution, filterAndOptimize, passesBreakevenFilter } from "../SelectionEngine";
import { sortFormatCardEntriesForExportPrimaryRanking } from "./shared_post_eligibility_optimization";

// ---- Phase 17S — canonical reason codes (shared pipeline; no hidden literals in reports) ----

/** PP: removed because `card.cardEv` fell below per-type minimum EV floor (pre-SelectionEngine). */
export const FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL = "per_type_min_ev_removal" as const;

/** PP & UD: removed because `passesBreakevenFilter(card)` failed (registry breakeven vs avgProb). */
export const FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL = "breakeven_filter_removal" as const;

/** PP & UD: card kept but structure/leg count changed by `applyAntiDilution` (not a pool removal). */
export const FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT = "anti_dilution_structure_adjustment" as const;

/** PP & UD: removed by `applyExportCapSlice*` (ranked list truncated). */
export const FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION = "export_cap_truncation" as const;

/** Documented: SelectionEngine does not apply cross-card dedupe / “already covered” suppression. */
export const FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION =
  "not_applicable_no_cross_card_suppression_in_selection_engine" as const;

export type FinalSelectionReasonCode =
  | typeof FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL
  | typeof FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL
  | typeof FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT
  | typeof FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION
  | typeof FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION;

/** Canonical ordering of final-selection stages (both sites). */
export const FINAL_SELECTION_POLICY_STAGE_ORDER = [
  "pre_ranked_card_candidates",
  "breakeven_and_anti_dilution_selection_engine",
  "export_primary_ranking_sort",
  "export_cap_slice",
] as const;

/** Annotation: SelectionEngine uses registry breakeven + optimal leg count (PP/UD structure sets from math_models). */
export const FINAL_SELECTION_ANNOTATION_SELECTION_ENGINE = "FINAL_SELECTION_SELECTION_ENGINE_UD_OR_PP" as const;

/**
 * Breakeven filter + anti-dilution for a flat card list (PP path and UD batch).
 * `platform` selects which structure-id universe `getOptimalCardSize` searches (PP vs UD registries).
 */
export function applyFinalCardSelectionPipeline(cards: CardEvResult[], platform: Platform): CardEvResult[] {
  return filterAndOptimize(cards, platform);
}

/**
 * Same logic as `filterAndOptimize`, plus lists of cards dropped by breakeven and pairs adjusted by anti-dilution.
 * `kept` is identical to `filterAndOptimize(cards, platform)` (same order).
 */
export function attributeFilterAndOptimizeBatch(
  cards: CardEvResult[],
  platform: Platform
): {
  kept: CardEvResult[];
  breakevenDropped: CardEvResult[];
  antiDilutionAdjustments: { input: CardEvResult; output: CardEvResult }[];
} {
  const kept: CardEvResult[] = [];
  const breakevenDropped: CardEvResult[] = [];
  const antiDilutionAdjustments: { input: CardEvResult; output: CardEvResult }[] = [];

  for (const card of cards) {
    if (!passesBreakevenFilter(card)) {
      breakevenDropped.push(card);
      continue;
    }
    const optimized = applyAntiDilution(card, platform);
    const required = getBreakevenThreshold(optimized.flexType);
    const breakevenGap = optimized.avgProb - required;
    const out: CardEvResult = { ...optimized, breakevenGap };
    kept.push(out);
    const changed =
      card.legs.length !== out.legs.length ||
      card.structureId !== out.structureId ||
      card.flexType !== out.flexType;
    if (changed) {
      antiDilutionAdjustments.push({ input: card, output: out });
    }
  }
  return { kept, breakevenDropped, antiDilutionAdjustments };
}

/**
 * Same semantics as `applyFinalSelectionToFormatEntries`, plus explicit breakeven drops and anti-dilution pairs.
 * `keptEntries` matches that function’s return value for the same inputs.
 */
export function attributeFinalSelectionUdFormatEntries(
  entries: { format: string; card: CardEvResult }[],
  platform: Platform
): {
  keptEntries: { format: string; card: CardEvResult }[];
  breakevenDropped: { format: string; card: CardEvResult }[];
  antiDilutionAdjustments: { format: string; before: CardEvResult; after: CardEvResult }[];
} {
  const keptPreSort: { format: string; card: CardEvResult }[] = [];
  const breakevenDropped: { format: string; card: CardEvResult }[] = [];
  const antiDilutionAdjustments: { format: string; before: CardEvResult; after: CardEvResult }[] = [];

  for (const e of entries) {
    if (!passesBreakevenFilter(e.card)) {
      breakevenDropped.push(e);
      continue;
    }
    const optimized = applyAntiDilution(e.card, platform);
    const required = getBreakevenThreshold(optimized.flexType);
    const breakevenGap = optimized.avgProb - required;
    const out: CardEvResult = { ...optimized, breakevenGap };
    const changed =
      e.card.legs.length !== out.legs.length ||
      e.card.structureId !== out.structureId ||
      e.card.flexType !== out.flexType;
    if (changed) {
      antiDilutionAdjustments.push({ format: e.format, before: e.card, after: out });
    }
    keptPreSort.push({ format: out.structureId ?? e.format, card: out });
  }
  const keptEntries = sortFormatCardEntriesForExportPrimaryRanking(keptPreSort);
  return { keptEntries, breakevenDropped, antiDilutionAdjustments };
}

/**
 * UD wrapped cards: run the same SelectionEngine pass per candidate, then re-rank with shared primary comparator.
 * Updates `format` to `card.structureId` when the optimizer trims to a different structure.
 */
export function applyFinalSelectionToFormatEntries(
  entries: { format: string; card: CardEvResult }[],
  platform: Platform
): { format: string; card: CardEvResult }[] {
  const out: { format: string; card: CardEvResult }[] = [];
  for (const e of entries) {
    const sel = filterAndOptimize([e.card], platform);
    if (sel.length === 0) continue;
    const c = sel[0];
    out.push({ format: c.structureId ?? e.format, card: c });
  }
  return sortFormatCardEntriesForExportPrimaryRanking(out);
}

/** Deterministic export slice on already-ranked PP cards (`--export-uncap` uses MAX_SAFE_INTEGER). */
export function applyExportCapSliceRankedCards(cards: CardEvResult[], cap: number): CardEvResult[] {
  if (cap >= Number.MAX_SAFE_INTEGER) return [...cards];
  return cards.slice(0, cap);
}

/** Same semantics for UD `{ format, card }[]` after primary ranking sort. */
export function applyExportCapSliceFormatEntries(
  entries: { format: string; card: CardEvResult }[],
  cap: number
): { format: string; card: CardEvResult }[] {
  if (cap >= Number.MAX_SAFE_INTEGER) return [...entries];
  return entries.slice(0, cap);
}
