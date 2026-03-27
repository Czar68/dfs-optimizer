/**
 * Phase 17S — Deterministic removal/adjustment reason attribution for the shared final-selection pipeline (report-only).
 */

import fs from "fs";
import path from "path";
import type { CardEvResult } from "../types";
import {
  FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT,
  FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL,
  FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION,
  FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION,
  FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL,
  attributeFilterAndOptimizeBatch,
  attributeFinalSelectionUdFormatEntries,
} from "../policy/shared_final_selection_policy";
import { ppCardStructureKey, stableStringifyForObservability, udEntryStructureKey } from "./final_selection_observability";

export const FINAL_SELECTION_REASONS_SCHEMA_VERSION = 1 as const;

const JSON_NAME = "latest_final_selection_reasons.json";
const MD_NAME = "latest_final_selection_reasons.md";

export function getFinalSelectionReasonsPaths(cwd: string): {
  dir: string;
  jsonPath: string;
  mdPath: string;
} {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

function incrementMap(m: Record<string, number>, key: string, delta = 1): void {
  m[key] = (m[key] ?? 0) + delta;
}

function sortRecordKeys(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(m).sort((a, b) => a.localeCompare(b))) {
    out[k] = m[k] ?? 0;
  }
  return out;
}

/** Only countable attribution categories (excludes engine N/A note). */
export type CountableFinalSelectionReason =
  | typeof FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL
  | typeof FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL
  | typeof FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT
  | typeof FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION;

export interface ReasonStageCounts {
  stageId: string;
  /** Human-readable transition label. */
  label: string;
  countsByReason: Record<CountableFinalSelectionReason, number>;
  structureBreakdownByReason: Partial<Record<CountableFinalSelectionReason, Record<string, number>>>;
}

export interface PpFinalSelectionReasons {
  platform: "pp";
  /** SelectionEngine does not dedupe across cards; documented for audits. */
  selectionEngineNote: typeof FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION;
  countsByReason: Record<CountableFinalSelectionReason, number>;
  stages: ReasonStageCounts[];
  dominantRemovalReason: CountableFinalSelectionReason | null;
  summaryLine: string;
}

export interface UdFinalSelectionReasons {
  platform: "ud";
  selectionEngineNote: typeof FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION;
  countsByReason: Record<CountableFinalSelectionReason, number>;
  stages: ReasonStageCounts[];
  dominantRemovalReason: CountableFinalSelectionReason | null;
  summaryLine: string;
}

export interface FinalSelectionReasonsReport {
  schemaVersion: typeof FINAL_SELECTION_REASONS_SCHEMA_VERSION;
  generatedAtUtc: string;
  runTimestampEt: string;
  pp: PpFinalSelectionReasons | null;
  ud: UdFinalSelectionReasons | null;
}

function zeroCountableReasons(): Record<CountableFinalSelectionReason, number> {
  return {
    [FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL]: 0,
    [FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]: 0,
    [FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]: 0,
    [FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]: 0,
  };
}

function dominantAmongRemovals(counts: Record<CountableFinalSelectionReason, number>): CountableFinalSelectionReason | null {
  const candidates: CountableFinalSelectionReason[] = [
    FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL,
    FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL,
    FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION,
  ];
  let best: CountableFinalSelectionReason | null = null;
  let bestN = -1;
  for (const r of candidates) {
    const n = counts[r] ?? 0;
    if (n > bestN) {
      bestN = n;
      best = r;
    }
  }
  if (bestN <= 0) return null;
  return best;
}

/** PP: `sortedCards` post-rank; `exportCards` = capped export pool. */
export function listPpExportCapRemovals(sortedCards: CardEvResult[], exportCards: CardEvResult[]): CardEvResult[] {
  if (sortedCards.length <= exportCards.length) return [];
  return sortedCards.slice(exportCards.length);
}

/** UD: ranked entries after selection; `exported` = post-cap slice. */
export function listUdExportCapRemovals(
  rankedEntries: { format: string; card: CardEvResult }[],
  exported: { format: string; card: CardEvResult }[]
): { format: string; card: CardEvResult }[] {
  if (rankedEntries.length <= exported.length) return [];
  return rankedEntries.slice(exported.length);
}

export function buildPpFinalSelectionReasons(params: {
  cardsBeforeEvFilter: CardEvResult[];
  filteredCards: CardEvResult[];
  sortedCards: CardEvResult[];
  exportCards: CardEvResult[];
}): PpFinalSelectionReasons {
  const selectionEngineNote = FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION;
  const counts = zeroCountableReasons();

  const perTypeRemoved = params.cardsBeforeEvFilter.filter((c) => !params.filteredCards.includes(c));
  const stagePerType: ReasonStageCounts = {
    stageId: "postStructureEvaluationBuild_to_postPerTypeMinEvFilter",
    label: "Structure evaluation build → per-type min EV filter",
    countsByReason: zeroCountableReasons(),
    structureBreakdownByReason: {},
  };
  const brPer: Record<string, number> = {};
  for (const c of perTypeRemoved) {
    counts[FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL]++;
    stagePerType.countsByReason[FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL]++;
    incrementMap(brPer, ppCardStructureKey(c));
  }
  if (Object.keys(brPer).length > 0) {
    stagePerType.structureBreakdownByReason[FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL] = sortRecordKeys(brPer);
  }

  const attr = attributeFilterAndOptimizeBatch(params.filteredCards, "PP");
  const stageEngine: ReasonStageCounts = {
    stageId: "postPerTypeMinEvFilter_to_postFinalSelection",
    label: "Per-type min EV pool → SelectionEngine (breakeven + anti-dilution)",
    countsByReason: zeroCountableReasons(),
    structureBreakdownByReason: {},
  };
  const brBe: Record<string, number> = {};
  for (const c of attr.breakevenDropped) {
    counts[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]++;
    stageEngine.countsByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]++;
    incrementMap(brBe, ppCardStructureKey(c));
  }
  if (Object.keys(brBe).length > 0) {
    stageEngine.structureBreakdownByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL] = sortRecordKeys(brBe);
  }
  for (const { input } of attr.antiDilutionAdjustments) {
    counts[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]++;
    stageEngine.countsByReason[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]++;
  }
  const brAd: Record<string, number> = {};
  for (const { input } of attr.antiDilutionAdjustments) {
    incrementMap(brAd, ppCardStructureKey(input));
  }
  if (Object.keys(brAd).length > 0) {
    stageEngine.structureBreakdownByReason[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT] =
      sortRecordKeys(brAd);
  }

  const capRemoved = listPpExportCapRemovals(params.sortedCards, params.exportCards);
  const stageCap: ReasonStageCounts = {
    stageId: "postFinalSelection_to_postExportCap",
    label: "Ranked pool → export cap slice",
    countsByReason: zeroCountableReasons(),
    structureBreakdownByReason: {},
  };
  const brCap: Record<string, number> = {};
  for (const c of capRemoved) {
    counts[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]++;
    stageCap.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]++;
    incrementMap(brCap, ppCardStructureKey(c));
  }
  if (Object.keys(brCap).length > 0) {
    stageCap.structureBreakdownByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION] = sortRecordKeys(brCap);
  }

  const dom = dominantAmongRemovals(counts);
  const summaryLine = [
    `PP: per_type_min_ev=${counts[FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL]},`,
    `breakeven=${counts[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]},`,
    `anti_dilution_adjustments=${counts[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]},`,
    `export_cap=${counts[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]}.`,
    dom ? `Dominant removal: ${dom}.` : "No removals recorded in tracked categories.",
  ].join(" ");

  return {
    platform: "pp",
    selectionEngineNote,
    countsByReason: counts,
    stages: [stagePerType, stageEngine, stageCap],
    dominantRemovalReason: dom,
    summaryLine,
  };
}

export function buildUdFinalSelectionReasons(params: {
  builtPreFinalSelection: { format: string; card: CardEvResult }[];
  postFinalSelectionRanked: { format: string; card: CardEvResult }[];
  postExportCap: { format: string; card: CardEvResult }[];
}): UdFinalSelectionReasons {
  const selectionEngineNote = FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION;
  const counts = zeroCountableReasons();

  const attr = attributeFinalSelectionUdFormatEntries(params.builtPreFinalSelection, "UD");

  const stageEngine: ReasonStageCounts = {
    stageId: "postStructureEvaluationBuild_to_postFinalSelection",
    label: "Built candidate pool → SelectionEngine (breakeven + anti-dilution) + UD export sort",
    countsByReason: zeroCountableReasons(),
    structureBreakdownByReason: {},
  };
  const brBe: Record<string, number> = {};
  for (const e of attr.breakevenDropped) {
    counts[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]++;
    stageEngine.countsByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]++;
    incrementMap(brBe, udEntryStructureKey(e));
  }
  if (Object.keys(brBe).length > 0) {
    stageEngine.structureBreakdownByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL] = sortRecordKeys(brBe);
  }
  for (const adj of attr.antiDilutionAdjustments) {
    counts[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]++;
    stageEngine.countsByReason[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]++;
  }
  const brAd: Record<string, number> = {};
  for (const adj of attr.antiDilutionAdjustments) {
    incrementMap(brAd, udEntryStructureKey({ format: adj.format, card: adj.before }));
  }
  if (Object.keys(brAd).length > 0) {
    stageEngine.structureBreakdownByReason[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT] =
      sortRecordKeys(brAd);
  }

  const capRemoved = listUdExportCapRemovals(params.postFinalSelectionRanked, params.postExportCap);
  const stageCap: ReasonStageCounts = {
    stageId: "postFinalSelection_to_postExportCap",
    label: "Ranked pool → export cap slice",
    countsByReason: zeroCountableReasons(),
    structureBreakdownByReason: {},
  };
  const brCap: Record<string, number> = {};
  for (const e of capRemoved) {
    counts[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]++;
    stageCap.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]++;
    incrementMap(brCap, udEntryStructureKey(e));
  }
  if (Object.keys(brCap).length > 0) {
    stageCap.structureBreakdownByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION] = sortRecordKeys(brCap);
  }

  const dom = dominantAmongRemovals(counts);
  const summaryLine = [
    `UD: breakeven=${counts[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]},`,
    `anti_dilution_adjustments=${counts[FINAL_SELECTION_REASON_ANTI_DILUTION_STRUCTURE_ADJUSTMENT]},`,
    `export_cap=${counts[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]}.`,
    dom ? `Dominant removal: ${dom}.` : "No removals recorded in tracked categories.",
  ].join(" ");

  return {
    platform: "ud",
    selectionEngineNote,
    countsByReason: counts,
    stages: [stageEngine, stageCap],
    dominantRemovalReason: dom,
    summaryLine,
  };
}

export function buildFinalSelectionReasonsReport(params: {
  generatedAtUtc: string;
  runTimestampEt: string;
  pp: PpFinalSelectionReasons | null;
  ud: UdFinalSelectionReasons | null;
}): FinalSelectionReasonsReport {
  return {
    schemaVersion: FINAL_SELECTION_REASONS_SCHEMA_VERSION,
    generatedAtUtc: params.generatedAtUtc,
    runTimestampEt: params.runTimestampEt,
    pp: params.pp,
    ud: params.ud,
  };
}

export function formatFinalSelectionReasonsMarkdown(report: FinalSelectionReasonsReport): string {
  const lines: string[] = [];
  lines.push("# Final selection — reason attribution");
  lines.push("");
  lines.push(`- **generatedAtUtc:** ${report.generatedAtUtc}`);
  lines.push(`- **runTimestampEt:** ${report.runTimestampEt}`);
  lines.push(`- **schemaVersion:** ${report.schemaVersion}`);
  lines.push("");

  if (report.pp) {
    lines.push("## PrizePicks");
    lines.push(`- ${report.pp.summaryLine}`);
    lines.push(`- **Dominant removal (excl. anti-dilution as removal):** ${report.pp.dominantRemovalReason ?? "—"}`);
    lines.push(`- **SelectionEngine:** ${report.pp.selectionEngineNote}`);
    lines.push("");
    lines.push("### Counts by reason");
    for (const k of Object.keys(report.pp.countsByReason).sort((a, b) => a.localeCompare(b))) {
      lines.push(`- \`${k}\`: ${report.pp.countsByReason[k as CountableFinalSelectionReason]}`);
    }
    lines.push("");
    for (const st of report.pp.stages) {
      lines.push(`### ${st.stageId}`);
      lines.push(`- ${st.label}`);
      for (const rk of Object.keys(st.countsByReason).sort((a, b) => a.localeCompare(b))) {
        const n = st.countsByReason[rk as CountableFinalSelectionReason];
        if (n > 0) lines.push(`  - \`${rk}\`: ${n}`);
      }
      lines.push("");
    }
  }

  if (report.ud) {
    lines.push("## Underdog");
    lines.push(`- ${report.ud.summaryLine}`);
    lines.push(`- **Dominant removal (excl. anti-dilution as removal):** ${report.ud.dominantRemovalReason ?? "—"}`);
    lines.push(`- **SelectionEngine:** ${report.ud.selectionEngineNote}`);
    lines.push("");
    lines.push("### Counts by reason");
    for (const k of Object.keys(report.ud.countsByReason).sort((a, b) => a.localeCompare(b))) {
      lines.push(`- \`${k}\`: ${report.ud.countsByReason[k as CountableFinalSelectionReason]}`);
    }
    lines.push("");
    for (const st of report.ud.stages) {
      lines.push(`### ${st.stageId}`);
      lines.push(`- ${st.label}`);
      for (const rk of Object.keys(st.countsByReason).sort((a, b) => a.localeCompare(b))) {
        const n = st.countsByReason[rk as CountableFinalSelectionReason];
        if (n > 0) lines.push(`  - \`${rk}\`: ${n}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function writeFinalSelectionReasonsArtifacts(cwd: string, report: FinalSelectionReasonsReport): void {
  const { dir, jsonPath, mdPath } = getFinalSelectionReasonsPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatFinalSelectionReasonsMarkdown(report), "utf8");
}

/** Merge PP and/or UD sections (same pattern as Phase 17R observability merge). */
export function mergeFinalSelectionReasonsArtifact(
  cwd: string,
  patch: {
    runTimestampEt: string;
    generatedAtUtc: string;
    pp?: PpFinalSelectionReasons | null;
    ud?: UdFinalSelectionReasons | null;
  }
): void {
  const { jsonPath } = getFinalSelectionReasonsPaths(cwd);
  let existing: FinalSelectionReasonsReport | null = null;
  if (fs.existsSync(jsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as FinalSelectionReasonsReport;
    } catch {
      existing = null;
    }
  }
  const pp = patch.pp !== undefined ? patch.pp : existing?.pp ?? null;
  const ud = patch.ud !== undefined ? patch.ud : existing?.ud ?? null;
  writeFinalSelectionReasonsArtifacts(
    cwd,
    buildFinalSelectionReasonsReport({
      generatedAtUtc: patch.generatedAtUtc,
      runTimestampEt: patch.runTimestampEt,
      pp,
      ud,
    })
  );
}
