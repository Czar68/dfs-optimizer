/**
 * Phase 17R — Site-invariant final selection observability + distribution guardrails (report-only).
 * Does not change selection outcomes; writes deterministic artifacts under data/reports/.
 */

import fs from "fs";
import path from "path";
import type { CardEvResult } from "../types";

export const FINAL_SELECTION_OBSERVABILITY_SCHEMA_VERSION = 1 as const;

/** If any single structure's share of exported cards exceeds this, emit a guardrail note. */
export const GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD = 0.55;

/** If export cap shifts any structure's share by more than this many percentage points, note. */
export const GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT = 15;

/** If final selection removes this fraction or more of pre-selection cards, note (per platform). */
export const GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN = 0.35;

/** When both PP and UD are present, warn if |PP removal ratio − UD removal ratio| exceeds this. */
export const GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN = 0.25;

export interface StructureDistributionSnapshot {
  total: number;
  /** Prefer registry / canonical ids; keys sorted lexicographically in serialized output. */
  byStructureKey: Record<string, number>;
  pctByStructureKey: Record<string, number>;
}

export interface StageDelta {
  fromStage: string;
  toStage: string;
  totalDelta: number;
  /** Negative = cards removed going forward. */
  interpretation: "cards_removed" | "cards_added" | "unchanged";
}

export interface PpFinalSelectionObservability {
  platform: "pp";
  postStructureEvaluationBuild: StructureDistributionSnapshot;
  postPerTypeMinEvFilter: StructureDistributionSnapshot;
  postFinalSelection: StructureDistributionSnapshot;
  postExportCap: StructureDistributionSnapshot;
  deltas: StageDelta[];
  selectionEngineRemovalFromFiltered: number;
  selectionEngineRemovalRatioFromFiltered: number | null;
  exportCapRemovalFromSorted: number;
  guardrailNotes: string[];
}

export interface UdFinalSelectionObservability {
  platform: "ud";
  postStructureEvaluationBuild: StructureDistributionSnapshot;
  postFinalSelection: StructureDistributionSnapshot;
  postExportCap: StructureDistributionSnapshot;
  deltas: StageDelta[];
  selectionEngineRemovalFromBuilt: number;
  selectionEngineRemovalRatioFromBuilt: number | null;
  exportCapRemovalFromRanked: number;
  guardrailNotes: string[];
}

export interface FinalSelectionObservabilityReport {
  schemaVersion: typeof FINAL_SELECTION_OBSERVABILITY_SCHEMA_VERSION;
  generatedAtUtc: string;
  runTimestampEt: string;
  pp: PpFinalSelectionObservability | null;
  ud: UdFinalSelectionObservability | null;
  combinedGuardrailNotes: string[];
}

const JSON_NAME = "latest_final_selection_observability.json";
const MD_NAME = "latest_final_selection_observability.md";

export function getFinalSelectionObservabilityPaths(cwd: string): {
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

export function ppCardStructureKey(card: CardEvResult): string {
  const sid = card.structureId?.trim();
  if (sid) return sid;
  return String(card.flexType ?? "unknown");
}

export function udEntryStructureKey(entry: { format: string; card: CardEvResult }): string {
  const sid = entry.card.structureId?.trim();
  if (sid) return sid;
  if (entry.format?.trim()) return entry.format.trim();
  return ppCardStructureKey(entry.card);
}

function sortedKeys(record: Record<string, number>): string[] {
  return Object.keys(record).sort((a, b) => a.localeCompare(b));
}

/** Aggregate card list by structure key. */
export function distributionFromPpCards(cards: CardEvResult[]): StructureDistributionSnapshot {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const k = ppCardStructureKey(c);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const byStructureKey: Record<string, number> = {};
  for (const k of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    byStructureKey[k] = counts.get(k) ?? 0;
  }
  const total = cards.length;
  const pctByStructureKey: Record<string, number> = {};
  for (const k of sortedKeys(byStructureKey)) {
    const raw = total > 0 ? (100 * byStructureKey[k]) / total : 0;
    pctByStructureKey[k] = Math.round(raw * 100) / 100;
  }
  return { total, byStructureKey, pctByStructureKey };
}

export function distributionFromUdFormatEntries(
  entries: { format: string; card: CardEvResult }[]
): StructureDistributionSnapshot {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = udEntryStructureKey(e);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const byStructureKey: Record<string, number> = {};
  for (const k of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    byStructureKey[k] = counts.get(k) ?? 0;
  }
  const total = entries.length;
  const pctByStructureKey: Record<string, number> = {};
  for (const k of sortedKeys(byStructureKey)) {
    const raw = total > 0 ? (100 * byStructureKey[k]) / total : 0;
    pctByStructureKey[k] = Math.round(raw * 100) / 100;
  }
  return { total, byStructureKey, pctByStructureKey };
}

function deltaStage(fromLabel: string, toLabel: string, fromTotal: number, toTotal: number): StageDelta {
  const totalDelta = toTotal - fromTotal;
  let interpretation: StageDelta["interpretation"] = "unchanged";
  if (totalDelta < 0) interpretation = "cards_removed";
  if (totalDelta > 0) interpretation = "cards_added";
  return { fromStage: fromLabel, toStage: toLabel, totalDelta, interpretation };
}

function maxPctShare(snapshot: StructureDistributionSnapshot): number {
  let m = 0;
  for (const v of Object.values(snapshot.pctByStructureKey)) {
    if (v > m) m = v;
  }
  return m / 100;
}

function maxPctPointShift(
  pre: StructureDistributionSnapshot,
  post: StructureDistributionSnapshot
): number {
  const keys = new Set([...Object.keys(pre.pctByStructureKey), ...Object.keys(post.pctByStructureKey)]);
  let maxShift = 0;
  for (const k of keys) {
    const a = pre.pctByStructureKey[k] ?? 0;
    const b = post.pctByStructureKey[k] ?? 0;
    const shift = Math.abs(a - b);
    if (shift > maxShift) maxShift = shift;
  }
  return maxShift;
}

function guardrailDominanceExported(exported: StructureDistributionSnapshot, platform: string): string | null {
  if (exported.total === 0) return null;
  const mx = maxPctShare(exported);
  if (mx >= GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD) {
    return `[${platform}] Exported pool: one structure represents ≥${(
      GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD * 100
    ).toFixed(0)}% of cards (max share ${(mx * 100).toFixed(1)}%).`;
  }
  return null;
}

function guardrailExportMix(
  pre: StructureDistributionSnapshot,
  post: StructureDistributionSnapshot,
  platform: string
): string | null {
  if (pre.total === 0 || post.total === 0) return null;
  const shift = maxPctPointShift(pre, post);
  if (shift >= GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT) {
    return `[${platform}] Export cap shifted structure mix: max |Δpct| across structures = ${shift.toFixed(
      1
    )}pp (threshold ${GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT}pp).`;
  }
  return null;
}

function guardrailSelectionRemoval(ratio: number | null, platform: string): string | null {
  if (ratio == null || ratio < GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN) return null;
  return `[${platform}] Final selection removed ≥${(GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN * 100).toFixed(
    0
  )}% of pre-selection cards (observed ${(ratio * 100).toFixed(1)}%).`;
}

function guardrailCrossSite(ppRatio: number | null, udRatio: number | null): string | null {
  if (ppRatio == null || udRatio == null) return null;
  if (Math.abs(ppRatio - udRatio) >= GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN) {
    return `[cross-site] PP vs UD selection removal ratio differs by ≥${(
      GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN * 100
    ).toFixed(0)}pp (PP ${(ppRatio * 100).toFixed(1)}% vs UD ${(udRatio * 100).toFixed(1)}%).`;
  }
  return null;
}

export function buildPpFinalSelectionObservability(params: {
  cardsBeforeEvFilter: CardEvResult[];
  filteredCards: CardEvResult[];
  selectionCards: CardEvResult[];
  sortedCards: CardEvResult[];
  exportCards: CardEvResult[];
}): PpFinalSelectionObservability {
  const postStructureEvaluationBuild = distributionFromPpCards(params.cardsBeforeEvFilter);
  const postPerTypeMinEvFilter = distributionFromPpCards(params.filteredCards);
  const postFinalSelection = distributionFromPpCards(params.selectionCards);
  const postExportCap = distributionFromPpCards(params.exportCards);

  const deltas: StageDelta[] = [
    deltaStage("postStructureEvaluationBuild", "postPerTypeMinEvFilter", postStructureEvaluationBuild.total, postPerTypeMinEvFilter.total),
    deltaStage("postPerTypeMinEvFilter", "postFinalSelection", postPerTypeMinEvFilter.total, postFinalSelection.total),
    deltaStage("postFinalSelection", "postExportCap", postFinalSelection.total, postExportCap.total),
  ];

  const removedBySelection = postPerTypeMinEvFilter.total - postFinalSelection.total;
  const selectionEngineRemovalRatioFromFiltered =
    postPerTypeMinEvFilter.total > 0 ? removedBySelection / postPerTypeMinEvFilter.total : null;

  const exportCapRemovalFromSorted = postFinalSelection.total - postExportCap.total;

  const guardrailNotes: string[] = [];
  const g1 = guardrailSelectionRemoval(selectionEngineRemovalRatioFromFiltered, "PP");
  if (g1) guardrailNotes.push(g1);
  const g2 = guardrailDominanceExported(postExportCap, "PP");
  if (g2) guardrailNotes.push(g2);
  const g3 = guardrailExportMix(postFinalSelection, postExportCap, "PP");
  if (g3) guardrailNotes.push(g3);

  return {
    platform: "pp",
    postStructureEvaluationBuild,
    postPerTypeMinEvFilter,
    postFinalSelection,
    postExportCap,
    deltas,
    selectionEngineRemovalFromFiltered: removedBySelection,
    selectionEngineRemovalRatioFromFiltered,
    exportCapRemovalFromSorted: exportCapRemovalFromSorted,
    guardrailNotes,
  };
}

export function buildUdFinalSelectionObservability(params: {
  builtPreFinalSelection: { format: string; card: CardEvResult }[];
  postFinalSelection: { format: string; card: CardEvResult }[];
  postExportCap: { format: string; card: CardEvResult }[];
}): UdFinalSelectionObservability {
  const postStructureEvaluationBuild = distributionFromUdFormatEntries(params.builtPreFinalSelection);
  const postFinalSelection = distributionFromUdFormatEntries(params.postFinalSelection);
  const postExportCap = distributionFromUdFormatEntries(params.postExportCap);

  const deltas: StageDelta[] = [
    deltaStage("postStructureEvaluationBuild", "postFinalSelection", postStructureEvaluationBuild.total, postFinalSelection.total),
    deltaStage("postFinalSelection", "postExportCap", postFinalSelection.total, postExportCap.total),
  ];

  const removedBySelection = postStructureEvaluationBuild.total - postFinalSelection.total;
  const selectionEngineRemovalRatioFromBuilt =
    postStructureEvaluationBuild.total > 0 ? removedBySelection / postStructureEvaluationBuild.total : null;

  const exportCapRemovalFromRanked = postFinalSelection.total - postExportCap.total;

  const guardrailNotes: string[] = [];
  const g1 = guardrailSelectionRemoval(selectionEngineRemovalRatioFromBuilt, "UD");
  if (g1) guardrailNotes.push(g1);
  const g2 = guardrailDominanceExported(postExportCap, "UD");
  if (g2) guardrailNotes.push(g2);
  const g3 = guardrailExportMix(postFinalSelection, postExportCap, "UD");
  if (g3) guardrailNotes.push(g3);

  return {
    platform: "ud",
    postStructureEvaluationBuild,
    postFinalSelection,
    postExportCap,
    deltas,
    selectionEngineRemovalFromBuilt: removedBySelection,
    selectionEngineRemovalRatioFromBuilt,
    exportCapRemovalFromRanked,
    guardrailNotes,
  };
}

export function buildFinalSelectionObservabilityReport(params: {
  generatedAtUtc: string;
  runTimestampEt: string;
  pp: PpFinalSelectionObservability | null;
  ud: UdFinalSelectionObservability | null;
}): FinalSelectionObservabilityReport {
  const combinedGuardrailNotes: string[] = [];
  for (const n of params.pp?.guardrailNotes ?? []) combinedGuardrailNotes.push(n);
  for (const n of params.ud?.guardrailNotes ?? []) combinedGuardrailNotes.push(n);
  const cross = guardrailCrossSite(
    params.pp?.selectionEngineRemovalRatioFromFiltered ?? null,
    params.ud?.selectionEngineRemovalRatioFromBuilt ?? null
  );
  if (cross) combinedGuardrailNotes.push(cross);

  return {
    schemaVersion: FINAL_SELECTION_OBSERVABILITY_SCHEMA_VERSION,
    generatedAtUtc: params.generatedAtUtc,
    runTimestampEt: params.runTimestampEt,
    pp: params.pp,
    ud: params.ud,
    combinedGuardrailNotes: combinedGuardrailNotes.sort((a, b) => a.localeCompare(b)),
  };
}

function formatSnapshotMarkdown(title: string, s: StructureDistributionSnapshot): string[] {
  const lines: string[] = [`### ${title}`, `- total: ${s.total}`];
  for (const k of sortedKeys(s.byStructureKey)) {
    lines.push(`- ${k}: ${s.byStructureKey[k]} (${s.pctByStructureKey[k]?.toFixed(2) ?? "0"}%)`);
  }
  lines.push("");
  return lines;
}

export function formatFinalSelectionObservabilityMarkdown(report: FinalSelectionObservabilityReport): string {
  const lines: string[] = [];
  lines.push(`# Final selection observability`);
  lines.push("");
  lines.push(`- **generatedAtUtc:** ${report.generatedAtUtc}`);
  lines.push(`- **runTimestampEt:** ${report.runTimestampEt}`);
  lines.push(`- **schemaVersion:** ${report.schemaVersion}`);
  lines.push("");

  if (report.pp) {
    lines.push(`## PrizePicks`);
    lines.push(...formatSnapshotMarkdown("postStructureEvaluationBuild", report.pp.postStructureEvaluationBuild));
    lines.push(...formatSnapshotMarkdown("postPerTypeMinEvFilter", report.pp.postPerTypeMinEvFilter));
    lines.push(...formatSnapshotMarkdown("postFinalSelection", report.pp.postFinalSelection));
    lines.push(...formatSnapshotMarkdown("postExportCap", report.pp.postExportCap));
    lines.push(`#### Deltas`);
    for (const d of report.pp.deltas) {
      lines.push(`- ${d.fromStage} → ${d.toStage}: ${d.totalDelta} (${d.interpretation})`);
    }
    lines.push("");
    lines.push(
      `- selection removal from filtered (breakeven + anti-dilution path): ${report.pp.selectionEngineRemovalFromFiltered} (ratio ${report.pp.selectionEngineRemovalRatioFromFiltered?.toFixed(4) ?? "n/a"})`
    );
    lines.push(`- export cap removal from ranked: ${report.pp.exportCapRemovalFromSorted}`);
    lines.push("");
  }

  if (report.ud) {
    lines.push(`## Underdog`);
    lines.push(...formatSnapshotMarkdown("postStructureEvaluationBuild", report.ud.postStructureEvaluationBuild));
    lines.push(...formatSnapshotMarkdown("postFinalSelection", report.ud.postFinalSelection));
    lines.push(...formatSnapshotMarkdown("postExportCap", report.ud.postExportCap));
    lines.push(`#### Deltas`);
    for (const d of report.ud.deltas) {
      lines.push(`- ${d.fromStage} → ${d.toStage}: ${d.totalDelta} (${d.interpretation})`);
    }
    lines.push("");
    lines.push(
      `- selection removal from built pool: ${report.ud.selectionEngineRemovalFromBuilt} (ratio ${report.ud.selectionEngineRemovalRatioFromBuilt?.toFixed(4) ?? "n/a"})`
    );
    lines.push(`- export cap removal from ranked: ${report.ud.exportCapRemovalFromRanked}`);
    lines.push("");
  }

  lines.push(`## Guardrails`);
  if (report.combinedGuardrailNotes.length === 0) {
    lines.push(`- (none)`);
  } else {
    for (const n of report.combinedGuardrailNotes) lines.push(`- ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeysDeep(obj[k]);
  }
  return out;
}

/** Deterministic JSON stringify: sort object keys recursively for nested plain objects. */
export function stableStringifyForObservability(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), null, 2) + "\n";
}

export function writeFinalSelectionObservabilityArtifacts(
  cwd: string,
  report: FinalSelectionObservabilityReport
): void {
  const { dir, jsonPath, mdPath } = getFinalSelectionObservabilityPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatFinalSelectionObservabilityMarkdown(report), "utf8");
}

/**
 * Merge PP and/or UD sections into one on-disk report (unified runs: PP write then UD merge).
 */
export function mergeFinalSelectionObservabilityArtifact(
  cwd: string,
  patch: {
    runTimestampEt: string;
    generatedAtUtc: string;
    pp?: PpFinalSelectionObservability | null;
    ud?: UdFinalSelectionObservability | null;
  }
): void {
  const { jsonPath } = getFinalSelectionObservabilityPaths(cwd);
  let existing: FinalSelectionObservabilityReport | null = null;
  if (fs.existsSync(jsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as FinalSelectionObservabilityReport;
    } catch {
      existing = null;
    }
  }
  const pp = patch.pp !== undefined ? patch.pp : existing?.pp ?? null;
  const ud = patch.ud !== undefined ? patch.ud : existing?.ud ?? null;
  const report = buildFinalSelectionObservabilityReport({
    generatedAtUtc: patch.generatedAtUtc,
    runTimestampEt: patch.runTimestampEt,
    pp,
    ud,
  });
  writeFinalSelectionObservabilityArtifacts(cwd, report);
}
