/**
 * Phase 115 — Per-merge-pass PP/UD metrics (survives `latest_merge_audit` overwrite in `both` mode).
 * Read-only consumers; merge_odds callers upsert after each pass.
 */

import fs from "fs";
import path from "path";
import type { MergePlatformStats, MergeStageAccounting } from "../merge_odds";
import { stableStringifyForObservability } from "./final_selection_observability";

export const MERGE_PLATFORM_QUALITY_BY_PASS_SCHEMA_VERSION = 1 as const;

const JSON_NAME = "merge_platform_quality_by_pass.json";

export type MergePlatformQualityPass = "prizepicks" | "underdog";

export interface MergePlatformQualityPassSnapshot {
  capturedAtUtc: string;
  /** merged / matchEligible when matchEligible > 0 */
  match_rate: number | null;
  rawProps: number;
  matchEligible: number;
  merged: number;
  unmatched_legs_count: number;
  explicitAliasResolutionHits: number;
  multiBookConsensusPickCount: number;
  /** explicitAliasResolutionHits / propsConsideredForMatchingRows */
  alias_resolution_rate: number | null;
  dropped_due_to_missing_market: number;
  dropped_due_to_line_diff: number;
  oddsFetchedAtUtc: string | null;
  /** From OddsSnapshotManager when present — coarse staleness signal */
  oddsSnapshotAgeMinutes: number | null;
}

export interface MergePlatformQualityByPassFile {
  schemaVersion: typeof MERGE_PLATFORM_QUALITY_BY_PASS_SCHEMA_VERSION;
  updatedAtUtc: string;
  prizepicks: MergePlatformQualityPassSnapshot | null;
  underdog: MergePlatformQualityPassSnapshot | null;
  note: string;
}

function snapshotPath(cwd: string): string {
  return path.join(cwd, "data", "reports", JSON_NAME);
}

function emptyFile(updatedAtUtc: string): MergePlatformQualityByPassFile {
  return {
    schemaVersion: MERGE_PLATFORM_QUALITY_BY_PASS_SCHEMA_VERSION,
    updatedAtUtc,
    prizepicks: null,
    underdog: null,
    note:
      "latest_merge_audit reflects the last merge pass only; this file retains PP and UD snapshots separately for operator review (both mode).",
  };
}

export function readMergePlatformQualityByPassIfExists(cwd: string): MergePlatformQualityByPassFile | null {
  const p = snapshotPath(cwd);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as MergePlatformQualityByPassFile;
    if (raw.schemaVersion !== MERGE_PLATFORM_QUALITY_BY_PASS_SCHEMA_VERSION) return null;
    return raw;
  } catch {
    return null;
  }
}

function buildSnapshot(input: {
  pass: MergePlatformQualityPass;
  platformStats: MergePlatformStats;
  stageAccounting: MergeStageAccounting;
  oddsFetchedAtUtc: string | null;
  oddsSnapshotAgeMinutes: number | null;
}): MergePlatformQualityPassSnapshot {
  const row = input.platformStats[input.pass];
  const merged = row ? row.mergedExact + row.mergedNearest : 0;
  const matchEligible = row?.matchEligible ?? 0;
  const match_rate = matchEligible > 0 ? merged / matchEligible : null;
  const sa = input.stageAccounting;
  const aliasHits = sa.explicitAliasResolutionHits ?? 0;
  const propsConsidered = sa.propsConsideredForMatchingRows;
  return {
    capturedAtUtc: new Date().toISOString(),
    match_rate,
    rawProps: row?.rawProps ?? 0,
    matchEligible,
    merged,
    unmatched_legs_count: sa.unmatchedPropRows,
    explicitAliasResolutionHits: aliasHits,
    multiBookConsensusPickCount: sa.multiBookConsensusPickCount ?? 0,
    alias_resolution_rate: propsConsidered > 0 ? aliasHits / propsConsidered : null,
    dropped_due_to_missing_market: sa.skippedByReason.noCandidate,
    dropped_due_to_line_diff: sa.skippedByReason.lineDiff,
    oddsFetchedAtUtc: input.oddsFetchedAtUtc,
    oddsSnapshotAgeMinutes: input.oddsSnapshotAgeMinutes,
  };
}

/**
 * Upserts one platform's snapshot; preserves the other pass if present.
 */
export function upsertMergePlatformQualityByPass(
  cwd: string,
  input: {
    pass: MergePlatformQualityPass;
    platformStats: MergePlatformStats;
    stageAccounting: MergeStageAccounting;
    oddsFetchedAtUtc: string | null;
    oddsSnapshotAgeMinutes: number | null;
  }
): void {
  const dir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const updatedAtUtc = new Date().toISOString();
  const prev = readMergePlatformQualityByPassIfExists(cwd);
  const base = prev ?? emptyFile(updatedAtUtc);
  const snap = buildSnapshot({ ...input, pass: input.pass });
  const next: MergePlatformQualityByPassFile = {
    ...base,
    updatedAtUtc,
    prizepicks: input.pass === "prizepicks" ? snap : base.prizepicks,
    underdog: input.pass === "underdog" ? snap : base.underdog,
  };
  fs.writeFileSync(snapshotPath(cwd), stableStringifyForObservability(next), "utf8");
}
