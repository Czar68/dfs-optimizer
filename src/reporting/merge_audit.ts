/**
 * Phase 39 — Merge observability artifacts (additive reporting only).
 */

import fs from "fs";
import path from "path";
import type { MergePlatformStats, MergeStageAccounting } from "../merge_odds";
import type { CliArgs } from "../cli_args";
import type { MergedPick } from "../types";
import {
  MERGE_CONTRACT_SCHEMA_VERSION,
  MERGE_PRIMARY_MATCH_STRATEGY,
  MERGE_NEAREST_FALLBACK_STRATEGY,
  MERGE_ALT_LINE_SECOND_PASS_STRATEGY,
  MERGE_TIE_BREAK_ORDER,
  type MergeDropRecord,
  sortMergeDropRecordsDeterministically,
} from "../merge_contract";
import { stableStringifyForObservability } from "./final_selection_observability";
import {
  readMergeAuditFromDiskIfExists,
  writeMergeQualityArtifacts,
  type MergeQualityFreshnessInput,
  type MergeQualityStatusFile,
} from "./merge_quality";
import { buildMergeDiagnosticsReport, writeMergeDiagnosticsArtifacts } from "./merge_diagnostics";
import { buildMergePlayerDiagnosticsReport, writeMergePlayerDiagnosticsArtifacts } from "./merge_player_diagnostics";
import {
  buildPpNoCandidateObservabilityReport,
  writePpNoCandidateObservabilityArtifacts,
} from "./merge_pp_no_candidate_observability";

export const MERGE_AUDIT_SCHEMA_VERSION = 1 as const;

/** Returned from merge entrypoints alongside `stageAccounting` (Phase 39). */
export interface MergeAuditSnapshot {
  dropRecords: MergeDropRecord[];
  altLineFallbackCount: number;
  exactLineMatchCount: number;
  nearestWithinToleranceCount: number;
  mergedLineDeltaHistogram: Record<string, number>;
  /** Phase 42: mirrors `data/reports/merge_quality_status.json` for this finalize. */
  mergeQualityStatus: MergeQualityStatusFile;
}

const JSON_NAME = "latest_merge_audit.json";
const MD_NAME = "latest_merge_audit.md";

export function getMergeAuditPaths(cwd: string): { dir: string; jsonPath: string; mdPath: string } {
  const dir = path.join(cwd, "data", "reports");
  return {
    dir,
    jsonPath: path.join(dir, JSON_NAME),
    mdPath: path.join(dir, MD_NAME),
  };
}

export interface MergeAuditReport {
  schemaVersion: typeof MERGE_AUDIT_SCHEMA_VERSION;
  mergeContractSchemaVersion: typeof MERGE_CONTRACT_SCHEMA_VERSION;
  generatedAtUtc: string;
  contract: {
    primaryMatchStrategy: typeof MERGE_PRIMARY_MATCH_STRATEGY;
    nearestFallback: typeof MERGE_NEAREST_FALLBACK_STRATEGY;
    altLineSecondPass: typeof MERGE_ALT_LINE_SECOND_PASS_STRATEGY;
    tieBreakOrder: readonly string[];
  };
  cli: {
    exactLine: boolean;
    maxLineDiffUsed: number;
    ppMaxJuice: number;
    udMaxJuice: number;
  };
  totals: {
    rawProps: number;
    filteredBeforeMerge: number;
    propsConsideredForMatching: number;
    matched: number;
    dropped: number;
  };
  matchedBySite: Record<
    string,
    {
      mergedExact: number;
      mergedNearest: number;
      matchedTotal: number;
    }
  >;
  droppedByCanonicalReason: Record<string, number>;
  droppedByInternalReason: Record<string, number>;
  altLineFallbackCount: number;
  exactLineMatchCount: number;
  nearestWithinToleranceCount: number;
  /** Merged picks only: `altMatchDelta` → count (keys sorted in JSON). */
  mergedLineDeltaHistogram: Record<string, number>;
  drops: MergeDropRecord[];
  stageAccounting: MergeStageAccounting;
  /** Phase 115 — Echo of per-platform row counts from merge (same pass as this audit). */
  mergePlatformStats?: MergePlatformStats;
}

function countReasons(records: MergeDropRecord[]): {
  byCanonical: Record<string, number>;
  byInternal: Record<string, number>;
} {
  const byCanonical: Record<string, number> = {};
  const byInternal: Record<string, number> = {};
  for (const r of records) {
    byCanonical[r.canonicalReason] = (byCanonical[r.canonicalReason] ?? 0) + 1;
    byInternal[r.internalReason] = (byInternal[r.internalReason] ?? 0) + 1;
  }
  return { byCanonical, byInternal };
}

export function buildMergeAuditReport(input: {
  generatedAtUtc: string;
  stageAccounting: MergeStageAccounting;
  platformStats: MergePlatformStats;
  dropRecords: MergeDropRecord[];
  altLineFallbackCount: number;
  exactLineMatchCount: number;
  nearestWithinToleranceCount: number;
  mergedLineDeltaHistogram: Record<string, number>;
  cli: {
    exactLine: boolean;
    maxLineDiffUsed: number;
    ppMaxJuice: number;
    udMaxJuice: number;
  };
}): MergeAuditReport {
  const sortedDrops = sortMergeDropRecordsDeterministically(input.dropRecords);
  const { byCanonical, byInternal } = countReasons(sortedDrops);

  const matchedBySite: MergeAuditReport["matchedBySite"] = {};
  for (const k of Object.keys(input.platformStats).sort((a, b) => a.localeCompare(b))) {
    const ps = input.platformStats[k];
    matchedBySite[k] = {
      mergedExact: ps.mergedExact,
      mergedNearest: ps.mergedNearest,
      matchedTotal: ps.mergedExact + ps.mergedNearest,
    };
  }

  const sa = input.stageAccounting;
  return {
    schemaVersion: MERGE_AUDIT_SCHEMA_VERSION,
    mergeContractSchemaVersion: MERGE_CONTRACT_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    contract: {
      primaryMatchStrategy: MERGE_PRIMARY_MATCH_STRATEGY,
      nearestFallback: MERGE_NEAREST_FALLBACK_STRATEGY,
      altLineSecondPass: MERGE_ALT_LINE_SECOND_PASS_STRATEGY,
      tieBreakOrder: [...MERGE_TIE_BREAK_ORDER],
    },
    cli: { ...input.cli },
    totals: {
      rawProps: sa.rawRows,
      filteredBeforeMerge: sa.filteredBeforeMergeRows,
      propsConsideredForMatching: sa.propsConsideredForMatchingRows,
      matched: sa.matchedRows,
      dropped: sa.noMatchRows + sa.filteredBeforeMergeRows,
    },
    matchedBySite,
    droppedByCanonicalReason: byCanonical,
    droppedByInternalReason: byInternal,
    altLineFallbackCount: input.altLineFallbackCount,
    exactLineMatchCount: input.exactLineMatchCount,
    nearestWithinToleranceCount: input.nearestWithinToleranceCount,
    mergedLineDeltaHistogram: input.mergedLineDeltaHistogram,
    drops: sortedDrops,
    stageAccounting: sa,
    mergePlatformStats: input.platformStats,
  };
}

export function formatMergeAuditMarkdown(report: MergeAuditReport): string {
  const lines: string[] = [];
  lines.push("# Merge audit");
  lines.push("");
  lines.push(`- **Generated (UTC):** ${report.generatedAtUtc}`);
  lines.push(`- **Schema:** merge_audit v${report.schemaVersion}, merge_contract v${report.mergeContractSchemaVersion}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(
    `| Raw props | Filtered pre-merge | Match-eligible | Matched | Dropped (unmatched + pre-filters in stageAccounting) |`
  );
  lines.push(
    `| ---: | ---: | ---: | ---: | ---: |`
  );
  lines.push(
    `| ${report.totals.rawProps} | ${report.totals.filteredBeforeMerge} | ${report.stageAccounting.propsConsideredForMatchingRows} | ${report.totals.matched} | ${report.totals.dropped} |`
  );
  lines.push("");
  lines.push("## CLI merge knobs");
  lines.push("");
  lines.push(
    `- exactLine=${report.cli.exactLine}, maxLineDiffUsed=${report.cli.maxLineDiffUsed}, ppMaxJuice=${report.cli.ppMaxJuice}, udMaxJuice=${report.cli.udMaxJuice}`
  );
  lines.push("");
  lines.push("## Match quality");
  lines.push("");
  lines.push(
    `- exactLineMatches=${report.exactLineMatchCount}, nearestWithinTolerance=${report.nearestWithinToleranceCount}, altLineFallback=${report.altLineFallbackCount}`
  );
  lines.push("");
  lines.push("## Dropped by canonical reason");
  lines.push("");
  for (const k of Object.keys(report.droppedByCanonicalReason).sort((a, b) => a.localeCompare(b))) {
    lines.push(`- ${k}: ${report.droppedByCanonicalReason[k]}`);
  }
  lines.push("");
  lines.push("## Matched by site");
  lines.push("");
  for (const k of Object.keys(report.matchedBySite).sort((a, b) => a.localeCompare(b))) {
    const m = report.matchedBySite[k];
    lines.push(`- ${k}: exact=${m.mergedExact}, nearest=${m.mergedNearest}, total=${m.matchedTotal}`);
  }
  lines.push("");
  const ppd = report.stageAccounting.ppConsensusDispersion;
  lines.push("## PP consensus dispersion (Phase P)");
  lines.push("");
  if (ppd) {
    lines.push(`- nPpMerged: ${ppd.nPpMerged}`);
    lines.push(`- meanConsensusBookCount: ${ppd.meanConsensusBookCount.toFixed(4)}`);
    lines.push(`- meanDevigSpreadOver: ${ppd.meanDevigSpreadOver.toFixed(6)}`);
    lines.push(`- p95DevigSpreadOver: ${ppd.p95DevigSpreadOver?.toFixed(6) ?? "null"}`);
    lines.push(`- shareMultiBookConsensus: ${(ppd.shareMultiBookConsensus * 100).toFixed(2)}%`);
  } else {
    lines.push("- (no PP merged rows in this pass)");
  }
  lines.push("");
  return lines.join("\n");
}

export function writeMergeAuditArtifacts(cwd: string, report: MergeAuditReport): void {
  const { dir, jsonPath, mdPath } = getMergeAuditPaths(cwd);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");
  fs.writeFileSync(mdPath, formatMergeAuditMarkdown(report), "utf8");
}

export { canonicalMergeDropReason } from "../merge_contract";

/**
 * Builds histogram + platform exact/nearest counts, writes `latest_merge_audit` under `cwd`,
 * returns snapshot for callers/tests.
 */
export function finalizeMergeAuditArtifacts(input: {
  cwd: string;
  generatedAtUtc: string;
  stageAccounting: MergeStageAccounting;
  platformStats: MergePlatformStats;
  dropRecords: MergeDropRecord[];
  merged: MergedPick[];
  altLineFallbackCount: number;
  cli: CliArgs;
  /**
   * Phase 53: same pick-side key as merge matching for `no_candidate` rollups (`merge_player_diagnostics`).
   * Supplied by `merge_odds` (`normalizePickPlayerKeyForDiagnostics`).
   */
  normalizePickPlayerKeyForDiagnostics: (player: string) => string;
  /** Phase 115 — odds snapshot / wall-clock context for merge-quality freshness block. */
  freshness?: MergeQualityFreshnessInput;
}): MergeAuditSnapshot {
  const maxLineDiff = input.cli.exactLine ? 0 : 0.5;
  const ppMaxJuice = input.cli.maxJuice ?? 180;
  const udMaxJuice = input.cli.maxJuice ?? 200;
  const mergedLineDeltaHistogram: Record<string, number> = {};
  for (const m of input.merged) {
    const d = m.altMatchDelta ?? 0;
    const key = d === 0 ? "0" : d.toFixed(2);
    mergedLineDeltaHistogram[key] = (mergedLineDeltaHistogram[key] ?? 0) + 1;
  }
  let exactLineMatchCount = 0;
  let nearestWithinToleranceCount = 0;
  for (const ps of Object.values(input.platformStats)) {
    exactLineMatchCount += ps.mergedExact;
    nearestWithinToleranceCount += ps.mergedNearest;
  }
  const previousAudit = readMergeAuditFromDiskIfExists(input.cwd);
  const report = buildMergeAuditReport({
    generatedAtUtc: input.generatedAtUtc,
    stageAccounting: input.stageAccounting,
    platformStats: input.platformStats,
    dropRecords: input.dropRecords,
    altLineFallbackCount: input.altLineFallbackCount,
    exactLineMatchCount,
    nearestWithinToleranceCount,
    mergedLineDeltaHistogram,
    cli: {
      exactLine: input.cli.exactLine,
      maxLineDiffUsed: maxLineDiff,
      ppMaxJuice,
      udMaxJuice,
    },
  });
  writeMergeAuditArtifacts(input.cwd, report);
  const mergeDiagnostics = buildMergeDiagnosticsReport({
    generatedAtUtc: input.generatedAtUtc,
    report,
    merged: input.merged,
  });
  writeMergeDiagnosticsArtifacts(input.cwd, mergeDiagnostics);
  const mergePlayerDiagnostics = buildMergePlayerDiagnosticsReport({
    generatedAtUtc: input.generatedAtUtc,
    sourceAuditGeneratedAtUtc: report.generatedAtUtc,
    drops: report.drops,
    normalizePickPlayerKey: input.normalizePickPlayerKeyForDiagnostics,
  });
  writeMergePlayerDiagnosticsArtifacts(input.cwd, mergePlayerDiagnostics);
  /** PP pass in `both` / `pp` runs — use platform keys so we still write when PP has zero `drops` (all merged). */
  const hasPrizePicksMergePass = Object.prototype.hasOwnProperty.call(input.platformStats, "prizepicks");
  if (hasPrizePicksMergePass) {
    const ppObs = buildPpNoCandidateObservabilityReport({
      generatedAtUtc: input.generatedAtUtc,
      sourceAuditGeneratedAtUtc: report.generatedAtUtc,
      drops: report.drops,
      normalizePickPlayerKey: input.normalizePickPlayerKeyForDiagnostics,
    });
    writePpNoCandidateObservabilityArtifacts(input.cwd, ppObs);
  }
  const mergeQualityStatus = writeMergeQualityArtifacts(
    input.cwd,
    report,
    previousAudit,
    input.generatedAtUtc,
    input.freshness
  );
  return {
    dropRecords: report.drops,
    altLineFallbackCount: report.altLineFallbackCount,
    exactLineMatchCount: report.exactLineMatchCount,
    nearestWithinToleranceCount: report.nearestWithinToleranceCount,
    mergedLineDeltaHistogram: report.mergedLineDeltaHistogram,
    mergeQualityStatus,
  };
}
