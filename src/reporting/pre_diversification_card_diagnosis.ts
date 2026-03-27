/**
 * Phase 76 — Pre-diversification card pipeline diagnosis (counts + root-cause classification).
 * Read-only observability; does not change EV, gating, or diversification math.
 */

import fs from "fs";
import path from "path";
import type { CardEvResult, FlexType } from "../types";

export const PRE_DIVERSIFICATION_CARD_DIAGNOSIS_SCHEMA_VERSION = 1 as const;

export type PpStructureBuildStats = {
  flexType: FlexType;
  size: number;
  /** Eligible legs in builder pool (top N by `edge`; Phase 78 no longer applies trueProb vs structure BE). */
  poolLegsAfterTrueProbFilter: number;
  maxAttempts: number;
  successfulCardBuilds: number;
  failedCardBuilds: number;
  feasibilityPruned: number;
  evRejected: number;
  evCallsMade: number;
  candidatesPreDedupe: number;
  candidatesPostDedupe: number;
  cardEvMin: number | null;
  cardEvMax: number | null;
  cardEvMedian: number | null;
};

export type PpPreDiversificationBlock = {
  eligibleLegsAfterRunnerFilters: number;
  minLegsRequiredForCardBuild: number;
  earlyExitTooFewLegs: boolean;
  noViableStructuresAllSkippedByLegEv: boolean;
  viableStructureFlexTypes: string[];
  skippedStructureFlexTypes: string[];
  maxEffectiveLegEvObserved: number | null;
  /** Sum of attempt-loop iterations scheduled (per structure maxAttempts). */
  builderAttemptLoopsScheduled: number;
  /** Sum of `successfulCardBuilds` from each structure build. */
  builderSuccessfulFullLegSets: number;
  /** Sum of EV evaluations (`evaluateFlexCard` calls that returned). */
  builderEvEvaluationsReturned: number;
  structureBuildStats: PpStructureBuildStats[];
  /** Concat of post-dedupe per-structure cards (same as cards before per-type min EV). */
  cardsAfterBuilderPostStructureDedupe: number;
  cardsAfterPerTypeMinEvFilter: number;
  selectionEngineBreakevenDropped: number;
  selectionEngineAntiDilutionAdjustments: number;
  cardsAfterSelectionEngine: number;
  cardsAfterPrimaryRankSort: number;
  cardsInputToDiversificationLayer: number;
  cardsExportedAfterCapOrDiversification: number;
  portfolioDiversificationEnabled: boolean;
  exampleBreakevenDropped: {
    flexType: string;
    avgProb: number;
    requiredBreakeven: number;
    legIdsSample: string[];
  } | null;
};

export type UdPreDiversificationBlock = {
  eligibleLegsAfterRunnerFilters: number;
  combosEnumeratedFromKCombinations: number;
  combosPassedConstructionGate: number;
  combosPassedStructureThreshold: number;
  cardsPreDedupe: number;
  cardsPostDedupe: number;
  cardsAfterSelectionEngine: number;
  selectionEngineBreakevenDropped: number;
  selectionEngineAntiDilutionAdjustments: number;
  cardsInputToDiversificationLayer: number;
  cardsExportedAfterCapOrDiversification: number;
  portfolioDiversificationEnabled: boolean;
  exampleBreakevenDropped: {
    format: string;
    avgProb: number;
    requiredBreakeven: number;
    legIdsSample: string[];
  } | null;
};

export type PreDiversificationRootCause =
  | "insufficient_legs_for_minimum_card_size"
  | "no_viable_pp_structures_max_leg_ev_below_structure_floor"
  | "pp_builder_zero_accepted_candidates"
  | "pp_per_type_min_ev_filter_removed_all"
  | "pp_selection_engine_breakeven_removed_all"
  | "ud_builder_zero_accepted_candidates"
  | "ud_selection_engine_breakeven_removed_all"
  | "non_zero_cards_reach_export"
  | "unknown";

export type PreDiversificationCardDiagnosisPayload = {
  schemaVersion: typeof PRE_DIVERSIFICATION_CARD_DIAGNOSIS_SCHEMA_VERSION;
  generatedAtUtc: string;
  pp: PpPreDiversificationBlock | null;
  ud: UdPreDiversificationBlock | null;
  dominantDropStage: string;
  rootCause: PreDiversificationRootCause;
  notes: string[];
};

function medianSorted(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function medianCardEv(cards: CardEvResult[]): number | null {
  const evs = cards.map((c) => c.cardEv).filter((x) => Number.isFinite(x));
  if (evs.length === 0) return null;
  evs.sort((a, b) => a - b);
  return medianSorted(evs);
}

export function classifyPreDiversificationRootCause(
  payload: Pick<PreDiversificationCardDiagnosisPayload, "pp" | "ud">
): { rootCause: PreDiversificationRootCause; dominantDropStage: string } {
  const pp = payload.pp;
  const ud = payload.ud;
  const notes: string[] = [];

  if (pp) {
    if (pp.earlyExitTooFewLegs) {
      return {
        rootCause: "insufficient_legs_for_minimum_card_size",
        dominantDropStage: "pp:early_exit_before_structure_evaluation",
      };
    }
    if (pp.noViableStructuresAllSkippedByLegEv) {
      return {
        rootCause: "no_viable_pp_structures_max_leg_ev_below_structure_floor",
        dominantDropStage: "pp:viable_structures_filter_MIN_LEG_EV_REQUIREMENTS",
      };
    }
    if (pp.cardsAfterBuilderPostStructureDedupe === 0) {
      return {
        rootCause: "pp_builder_zero_accepted_candidates",
        dominantDropStage: "pp:buildCardsForSize_sampling_and_ev_gates",
      };
    }
    if (pp.cardsAfterPerTypeMinEvFilter === 0 && pp.cardsAfterBuilderPostStructureDedupe > 0) {
      return {
        rootCause: "pp_per_type_min_ev_filter_removed_all",
        dominantDropStage: "pp:per_type_min_card_ev_filter",
      };
    }
    if (pp.cardsAfterSelectionEngine === 0 && pp.cardsAfterPerTypeMinEvFilter > 0) {
      return {
        rootCause: "pp_selection_engine_breakeven_removed_all",
        dominantDropStage: "pp:SelectionEngine.passesBreakevenFilter",
      };
    }
    if (pp.cardsExportedAfterCapOrDiversification > 0) {
      notes.push("PP exported at least one card.");
    }
  }

  if (ud) {
    if (ud.cardsPostDedupe === 0 && ud.combosEnumeratedFromKCombinations > 0) {
      return {
        rootCause: "ud_builder_zero_accepted_candidates",
        dominantDropStage: "ud:construction_gate_or_structure_threshold",
      };
    }
    if (ud.cardsPostDedupe === 0 && ud.combosEnumeratedFromKCombinations === 0) {
      return {
        rootCause: "ud_builder_zero_accepted_candidates",
        dominantDropStage: "ud:no_k_combinations_or_structure_precheck",
      };
    }
    if (ud.cardsAfterSelectionEngine === 0 && ud.cardsPostDedupe > 0) {
      return {
        rootCause: "ud_selection_engine_breakeven_removed_all",
        dominantDropStage: "ud:SelectionEngine.passesBreakevenFilter",
      };
    }
    if (ud.cardsExportedAfterCapOrDiversification > 0) {
      notes.push("UD exported at least one card.");
    }
  }

  const ppExported = pp?.cardsExportedAfterCapOrDiversification ?? 0;
  const udExported = ud?.cardsExportedAfterCapOrDiversification ?? 0;
  if (ppExported > 0 || udExported > 0) {
    return {
      rootCause: "non_zero_cards_reach_export",
      dominantDropStage: "export_cap_or_diversification_only",
    };
  }

  return {
    rootCause: "unknown",
    dominantDropStage: "requires_manual_review",
  };
}

function readExistingPayload(root: string): Partial<PreDiversificationCardDiagnosisPayload> {
  const p = path.join(root, "data", "reports", "latest_pre_diversification_card_diagnosis.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Partial<PreDiversificationCardDiagnosisPayload>;
  } catch {
    return {};
  }
}

/**
 * Merge-updates PP or UD section and rewrites JSON + Markdown (same pattern as portfolio diversification).
 */
export function updatePreDiversificationCardDiagnosisSection(
  section: "pp" | "ud",
  block: PpPreDiversificationBlock | UdPreDiversificationBlock | null,
  root: string = process.cwd()
): void {
  const prev = readExistingPayload(root);
  const payload: PreDiversificationCardDiagnosisPayload = {
    schemaVersion: PRE_DIVERSIFICATION_CARD_DIAGNOSIS_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    pp: section === "pp" ? (block as PpPreDiversificationBlock | null) : prev.pp ?? null,
    ud: section === "ud" ? (block as UdPreDiversificationBlock | null) : prev.ud ?? null,
    dominantDropStage: "",
    rootCause: "unknown",
    notes: [],
  };
  const c = classifyPreDiversificationRootCause(payload);
  payload.dominantDropStage = c.dominantDropStage;
  payload.rootCause = c.rootCause;
  payload.notes = [];

  const outDir = path.join(root, "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "latest_pre_diversification_card_diagnosis.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );
  writePreDiversificationMarkdown(root, payload);
}

export function writePreDiversificationMarkdown(
  root: string,
  payload: PreDiversificationCardDiagnosisPayload
): void {
  const lines: string[] = [
    "# Phase 76 — Pre-diversification card diagnosis",
    "",
    `Generated: **${payload.generatedAtUtc}**`,
    "",
    `- **Root cause:** \`${payload.rootCause}\``,
    `- **Dominant drop stage:** ${payload.dominantDropStage}`,
    "",
  ];

  if (payload.pp) {
    const p = payload.pp;
    lines.push(
      "## PrizePicks",
      "",
      "| Stage | Count |",
      "|---|---:|",
      `| Eligible legs (runner filters) | ${p.eligibleLegsAfterRunnerFilters} |`,
      `| Min legs required | ${p.minLegsRequiredForCardBuild} |`,
      `| Early exit (too few legs) | ${p.earlyExitTooFewLegs ? "yes" : "no"} |`,
      `| No viable structures (max leg EV) | ${p.noViableStructuresAllSkippedByLegEv ? "yes" : "no"} |`,
      `| Cards after builder (post structure dedupe) | ${p.cardsAfterBuilderPostStructureDedupe} |`,
      `| After per-type min EV | ${p.cardsAfterPerTypeMinEvFilter} |`,
      `| SelectionEngine breakeven dropped | ${p.selectionEngineBreakevenDropped} |`,
      `| Anti-dilution adjustments | ${p.selectionEngineAntiDilutionAdjustments} |`,
      `| After SelectionEngine | ${p.cardsAfterSelectionEngine} |`,
      `| After primary rank sort | ${p.cardsAfterPrimaryRankSort} |`,
      `| Input to diversification / cap (sorted candidates) | ${p.cardsInputToDiversificationLayer} |`,
      `| Exported | ${p.cardsExportedAfterCapOrDiversification} |`,
      "",
      "### Per-structure builder",
      "",
      ...p.structureBuildStats.map(
        (s) =>
          `- **${s.flexType}** (${s.size} leg): pool=${s.poolLegsAfterTrueProbFilter} attempts=${s.maxAttempts} evCalls=${s.evCallsMade} preDedupe=${s.candidatesPreDedupe} postDedupe=${s.candidatesPostDedupe} ev[min,max,med]=${[
              s.cardEvMin,
              s.cardEvMax,
              s.cardEvMedian,
            ]
              .map((x) => (x == null ? "n/a" : x.toFixed(4)))
              .join(", ")}`
      ),
      ""
    );
    if (payload.pp.exampleBreakevenDropped) {
      const e = payload.pp.exampleBreakevenDropped;
      lines.push(
        "### Example breakeven drop",
        "",
        `- flexType=${e.flexType} avgProb=${e.avgProb} required=${e.requiredBreakeven}`,
        `- legs: ${e.legIdsSample.join(", ")}`,
        ""
      );
    }
  } else {
    lines.push("## PrizePicks", "", "_Not recorded._", "");
  }

  if (payload.ud) {
    const u = payload.ud;
    lines.push(
      "## Underdog",
      "",
      "| Stage | Count |",
      "|---|---:|",
      `| Eligible legs | ${u.eligibleLegsAfterRunnerFilters} |`,
      `| k-combination combos enumerated | ${u.combosEnumeratedFromKCombinations} |`,
      `| Passed construction gate | ${u.combosPassedConstructionGate} |`,
      `| Passed structure threshold | ${u.combosPassedStructureThreshold} |`,
      `| Pre-dedupe cards | ${u.cardsPreDedupe} |`,
      `| Post-dedupe cards | ${u.cardsPostDedupe} |`,
      `| SelectionEngine breakeven dropped | ${u.selectionEngineBreakevenDropped} |`,
      `| Anti-dilution adjustments | ${u.selectionEngineAntiDilutionAdjustments} |`,
      `| After SelectionEngine | ${u.cardsAfterSelectionEngine} |`,
      `| Pre-div input | ${u.cardsInputToDiversificationLayer} |`,
      `| Exported | ${u.cardsExportedAfterCapOrDiversification} |`,
      ""
    );
    if (payload.ud.exampleBreakevenDropped) {
      const e = payload.ud.exampleBreakevenDropped;
      lines.push(
        "### Example breakeven drop",
        "",
        `- format=${e.format} avgProb=${e.avgProb} required=${e.requiredBreakeven}`,
        `- legs: ${e.legIdsSample.join(", ")}`,
        ""
      );
    }
  } else {
    lines.push("## Underdog", "", "_Not recorded._", "");
  }

  fs.writeFileSync(
    path.join(root, "data", "reports", "latest_pre_diversification_card_diagnosis.md"),
    lines.join("\n"),
    "utf8"
  );
}
