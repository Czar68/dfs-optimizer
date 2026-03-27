/**
 * Phase 17I — Cross-platform pick survival & structure distribution audit (additive diagnostics).
 * Does not change EV math, thresholds, or ranking — writes deterministic operator-facing artifacts only.
 */

import fs from "fs";
import path from "path";
import type { CardEvResult } from "../types";

/** Static references for documentation (audit trail). */
export const CODE_LOCATIONS = {
  pp: {
    rawFetchMergeEv: "src/run_optimizer.ts (fetchPrizePicksRawProps → mergeWithSnapshot → calculateEvForMergedPicks)",
    legFilters: "src/run_optimizer.ts (MIN_EDGE_PER_LEG, MIN_LEG_EV, EV_ADJ_THRESH, MAX_LEGS_PER_PLAYER)",
    cardBuild:
      "src/run_optimizer.ts (buildCardsForSize: pool filter, firstCardConstructionGateFailure, dedupeCardCandidatesByLegIdSetBestCardEv — src/policy/shared_card_construction_gates.ts)",
    cardEvFilter: "src/run_optimizer.ts (getMinEvForFlexType per slip)",
    selectionEngine:
      "src/policy/shared_final_selection_policy.ts → applyFinalCardSelectionPipeline → SelectionEngine (filterAndOptimize; platform PP)",
    export:
      "src/run_optimizer.ts → applyExportCapSliceRankedCards (resolvePrizePicksRunnerExportCardLimit + slice)",
  },
  ud: {
    rawMergeEv: "src/run_underdog_optimizer.ts (fetchUnderdogRawProps* → merge* → calculateEvForMergedPicks)",
    filterEvPicks: "src/run_underdog_optimizer.ts (filterEvPicks — factor<1 decline, leg EV floors, max 1 per player/stat)",
    cardBuild:
      "src/run_underdog_optimizer.ts (buildUdCardsFromFiltered — standard IDs then flex IDs, k-combos, player uniqueness)",
    finalSelection:
      "src/policy/shared_final_selection_policy.ts → applyFinalSelectionToFormatEntries (SelectionEngine platform UD)",
    globalSort:
      "shared_post_eligibility_optimization.sortFormatCardEntriesForExportPrimaryRanking (inside final selection + export)",
    exportCap:
      "src/run_underdog_optimizer.ts → applyExportCapSliceFormatEntries (resolveUnderdogRunnerExportCardCap + slice)",
    csvWrite: "src/run_underdog_optimizer.ts (writeUnderdogCardsToFile — underdog-cards.csv/json)",
  },
  math: {
    juiceReexport: "src/ev/juice_adjust.ts re-exports from math_models/juice_adjust",
    binomialBe: "src/config/binomial_breakeven.ts (solver / registry — used by card EV paths)",
  },
} as const;

export interface PpSurvivalSnapshot {
  rawScrapedProps: number | null;
  mergeMatchedProps: number | null;
  afterEvCompute: number;
  afterMinEdge: number;
  afterMinLegEvBeforeAdjEv: number;
  afterAdjEvThreshold: number;
  afterPlayerCap: number;
  /** Post–structure-build, pre per-type EV floor */
  cardsBuiltPreTypeEvFilter: number | null;
  cardsAfterPerTypeMinEv: number | null;
  cardsAfterSelectionEngine: number | null;
  cardsExported: number | null;
  exportedByFlexType: Record<string, number>;
  thresholds: {
    minEdgePerLeg: number;
    minLegEv: number;
    evAdjThresh: number;
    maxLegsPerPlayer: number;
    volumeMode: boolean;
  };
  notes: string[];
}

export interface UdSurvivalSnapshot {
  rawScrapedProps: number | null;
  mergedProps: number | null;
  evComputed: number;
  afterFilterEvPicks: number;
  afterSiteFilter: number;
  finalLegPoolForCards: number;
  generatedTotal: number;
  generatedByStructureId: Record<string, number>;
  generatedByFlexTypePreCap: Record<string, number>;
  exportedTotal: number;
  exportedByStructureId: Record<string, number>;
  exportedByFlexType: Record<string, number>;
  maxCardsCap: number;
  autoBoostSecondPass: boolean;
  usedSharedLegs: boolean;
  udMinLegEv: number;
  udMinEdge: number;
  udVolume: boolean;
  allowedStandardStructureIds: string[];
  allowedFlexStructureIds: string[];
  notes: string[];
}

export interface PlatformSurvivalSummary {
  schemaVersion: 1;
  generatedAtUtc: string;
  runTimestampEt: string;
  runMode: "pp" | "ud" | "both" | "partial";
  pp: PpSurvivalSnapshot | null;
  ud: UdSurvivalSnapshot | null;
  mathModelsWiring: {
    juice_adjust_reexports_math_models: true;
    breakevenFromRegistry: "src/config/binomial_breakeven.ts + math_models registry";
  };
  operatorNotes: string[];
}

export function countPpCardsByFlexType(cards: CardEvResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) {
    const k = (c.flexType ?? "unknown") as string;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const DEFAULT_PP_NOTES = [
  "Dedupe / gates: shared_card_construction_gates (unique players, same-underlying opposite-side, team/game density); PP+UD dedupe by sorted leg ids, best cardEv kept.",
  "Exported cards may be fewer than generated+filtered when --max-export / --max-cards caps apply.",
];

export function buildPpSurvivalSnapshot(params: {
  rawScrapedProps: number | null;
  mergeMatchedProps: number | null;
  afterEvCompute: number;
  afterMinEdge: number;
  afterMinLegEvBeforeAdjEv: number;
  afterAdjEvThreshold: number;
  afterPlayerCap: number;
  cardsBuiltPreTypeEvFilter: number | null;
  cardsAfterPerTypeMinEv: number | null;
  cardsAfterSelectionEngine: number | null;
  cardsExported: number | null;
  exportedByFlexType: Record<string, number>;
  thresholds: PpSurvivalSnapshot["thresholds"];
  extraNotes?: string[];
}): PpSurvivalSnapshot {
  return {
    rawScrapedProps: params.rawScrapedProps,
    mergeMatchedProps: params.mergeMatchedProps,
    afterEvCompute: params.afterEvCompute,
    afterMinEdge: params.afterMinEdge,
    afterMinLegEvBeforeAdjEv: params.afterMinLegEvBeforeAdjEv,
    afterAdjEvThreshold: params.afterAdjEvThreshold,
    afterPlayerCap: params.afterPlayerCap,
    cardsBuiltPreTypeEvFilter: params.cardsBuiltPreTypeEvFilter,
    cardsAfterPerTypeMinEv: params.cardsAfterPerTypeMinEv,
    cardsAfterSelectionEngine: params.cardsAfterSelectionEngine,
    cardsExported: params.cardsExported,
    exportedByFlexType: params.exportedByFlexType,
    thresholds: params.thresholds,
    notes: [...DEFAULT_PP_NOTES, ...(params.extraNotes ?? [])],
  };
}

export function buildPlatformSurvivalSummary(params: {
  generatedAtUtc: string;
  runTimestampEt: string;
  runMode: PlatformSurvivalSummary["runMode"];
  pp: PpSurvivalSnapshot | null;
  ud: UdSurvivalSnapshot | null;
  operatorNotes?: string[];
}): PlatformSurvivalSummary {
  const notes = params.operatorNotes ?? [];
  return {
    schemaVersion: 1,
    generatedAtUtc: params.generatedAtUtc,
    runTimestampEt: params.runTimestampEt,
    runMode: params.runMode,
    pp: params.pp,
    ud: params.ud,
    mathModelsWiring: {
      juice_adjust_reexports_math_models: true,
      breakevenFromRegistry: "src/config/binomial_breakeven.ts + math_models registry",
    },
    operatorNotes: notes,
  };
}

export function formatPlatformSurvivalMarkdown(s: PlatformSurvivalSummary): string {
  const lines: string[] = [];
  lines.push(`# Platform survival summary (Phase 17I)`);
  lines.push(``);
  lines.push(`- **Run (ET):** ${s.runTimestampEt}`);
  lines.push(`- **Generated UTC:** ${s.generatedAtUtc}`);
  lines.push(`- **Mode:** ${s.runMode}`);
  lines.push(``);
  lines.push(`## Code map`);
  lines.push(`- **PP:** ${CODE_LOCATIONS.pp.rawFetchMergeEv}`);
  lines.push(`- **UD:** ${CODE_LOCATIONS.ud.rawMergeEv}`);
  lines.push(`- **Math:** ${CODE_LOCATIONS.math.juiceReexport}`);
  lines.push(``);
  if (s.pp) {
    lines.push(`## PrizePicks stage counts`);
    lines.push(`| Stage | Count |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| Raw scraped props | ${s.pp.rawScrapedProps ?? "n/a (mock/skip)"} |`);
    lines.push(`| Merge-matched props | ${s.pp.mergeMatchedProps ?? "n/a"} |`);
    lines.push(`| After EV compute | ${s.pp.afterEvCompute} |`);
    lines.push(`| After min edge (per leg) | ${s.pp.afterMinEdge} |`);
    lines.push(`| After min leg EV (pre adjEv gate) | ${s.pp.afterMinLegEvBeforeAdjEv} |`);
    lines.push(`| After adjEV ≥ threshold | ${s.pp.afterAdjEvThreshold} |`);
    lines.push(`| After player cap | ${s.pp.afterPlayerCap} |`);
    lines.push(`| Cards built (all structures, pre per-type EV) | ${s.pp.cardsBuiltPreTypeEvFilter ?? "n/a"} |`);
    lines.push(`| After per-slip min card EV | ${s.pp.cardsAfterPerTypeMinEv ?? "n/a"} |`);
    lines.push(`| After SelectionEngine | ${s.pp.cardsAfterSelectionEngine ?? "n/a"} |`);
    lines.push(`| Exported cards | ${s.pp.cardsExported ?? "n/a"} |`);
    lines.push(``);
    lines.push(`**PP thresholds (this run):** minEdge=${s.pp.thresholds.minEdgePerLeg}, minLegEv=${s.pp.thresholds.minLegEv}, evAdjThresh=${s.pp.thresholds.evAdjThresh}, maxLegsPerPlayer=${s.pp.thresholds.maxLegsPerPlayer}, volume=${s.pp.thresholds.volumeMode}`);
    lines.push(``);
    lines.push(`**Exported by flexType:** ${JSON.stringify(s.pp.exportedByFlexType)}`);
    lines.push(``);
    if (s.pp.notes.length) {
      lines.push(`**Notes:**`);
      for (const n of s.pp.notes) lines.push(`- ${n}`);
      lines.push(``);
    }
  } else {
    lines.push(`## PrizePicks`);
    lines.push(`(not run or no snapshot)`);
    lines.push(``);
  }
  if (s.ud) {
    lines.push(`## Underdog stage counts`);
    lines.push(`| Stage | Count |`);
    lines.push(`| --- | ---: |`);
    lines.push(`| Raw scraped props | ${s.ud.rawScrapedProps ?? "n/a (shared/mock)"} |`);
    lines.push(`| Merged props | ${s.ud.mergedProps ?? "n/a"} |`);
    lines.push(`| After EV compute | ${s.ud.evComputed} |`);
    lines.push(`| After filterEvPicks | ${s.ud.afterFilterEvPicks} |`);
    lines.push(`| After site=underdog filter | ${s.ud.afterSiteFilter} |`);
    lines.push(`| Final leg pool (card construction) | ${s.ud.finalLegPoolForCards} |`);
    lines.push(`| Cards generated (pre cap) | ${s.ud.generatedTotal} |`);
    lines.push(`| Cards exported (post cap) | ${s.ud.exportedTotal} |`);
    lines.push(`| Max cards cap | ${s.ud.maxCardsCap} |`);
    lines.push(`| Auto-boost 2nd pass | ${s.ud.autoBoostSecondPass ? "yes" : "no"} |`);
    lines.push(`| Shared PP legs | ${s.ud.usedSharedLegs ? "yes" : "no"} |`);
    lines.push(``);
    lines.push(`**UD thresholds:** udMinLegEv=${s.ud.udMinLegEv}, udMinEdge=${s.ud.udMinEdge}, udVolume=${s.ud.udVolume}`);
    lines.push(``);
    lines.push(`**Generated by structureId (pre cap):** ${JSON.stringify(s.ud.generatedByStructureId)}`);
    lines.push(`**Generated by flexType (pre cap):** ${JSON.stringify(s.ud.generatedByFlexTypePreCap)}`);
    lines.push(`**Exported by structureId:** ${JSON.stringify(s.ud.exportedByStructureId)}`);
    lines.push(`**Exported by flexType:** ${JSON.stringify(s.ud.exportedByFlexType)}`);
    lines.push(``);
    if (s.ud.notes.length) {
      lines.push(`**Notes:**`);
      for (const n of s.ud.notes) lines.push(`- ${n}`);
      lines.push(``);
    }
  } else {
    lines.push(`## Underdog`);
    lines.push(`(not run or no snapshot)`);
    lines.push(``);
  }
  lines.push(`## Operator interpretation`);
  for (const n of s.operatorNotes) lines.push(`- ${n}`);
  lines.push(``);
  return lines.join("\n");
}

const JSON_NAME = "latest_platform_survival_summary.json";
const MD_NAME = "latest_platform_survival_summary.md";

export function getPlatformSurvivalReportPaths(cwd: string): { jsonPath: string; mdPath: string; dir: string } {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

export function writePlatformSurvivalArtifacts(cwd: string, summary: PlatformSurvivalSummary): void {
  const { dir, jsonPath, mdPath } = getPlatformSurvivalReportPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(mdPath, formatPlatformSurvivalMarkdown(summary), "utf8");
}

/** Convenience: build PP snapshot when platform is not ud-only; merge operator notes. */
export function writePhase17iOperatorArtifacts(
  cwd: string,
  params: {
    runTimestampEt: string;
    runMode: PlatformSurvivalSummary["runMode"];
    platform: "pp" | "ud" | "both";
    ppLegFunnel: {
      rawScrapedProps: number | null;
      mergeMatchedProps: number | null;
      afterEvCompute: number;
      afterMinEdge: number;
      afterMinLegEvBeforeAdjEv: number;
      afterAdjEvThreshold: number;
      afterPlayerCap: number;
      cardsBuiltPreTypeEvFilter: number | null;
      cardsAfterPerTypeMinEv: number | null;
      cardsAfterSelectionEngine: number | null;
      cardsExported: number | null;
      exportedByFlexType: Record<string, number>;
    } | null;
    ppThresholds: PpSurvivalSnapshot["thresholds"];
    ud: UdSurvivalSnapshot | null;
    operatorNotes: string[];
  }
): void {
  const pp =
    params.platform === "ud" || params.ppLegFunnel === null
      ? null
      : buildPpSurvivalSnapshot({
          ...params.ppLegFunnel,
          thresholds: params.ppThresholds,
        });
  const summary = buildPlatformSurvivalSummary({
    generatedAtUtc: new Date().toISOString(),
    runTimestampEt: params.runTimestampEt,
    runMode: params.runMode,
    pp,
    ud: params.ud,
    operatorNotes: params.operatorNotes,
  });
  writePlatformSurvivalArtifacts(cwd, summary);
}
