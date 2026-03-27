// src/backfill_perf_tracker.ts
// Backfill data/perf_tracker.jsonl from tier1.csv, tier2.csv + prizepicks-legs.csv, underdog-legs.csv (last 30 days logic: use current tier/legs and runTimestamp date).

import fs from "fs";
import path from "path";
import { appendTrackerRow, readTrackerRows, ensureDataDir } from "./perf_tracker_db";
import { parseCsv, toRecord, loadLegsMap, existingLegCsvPaths, type LegCsvRecord } from "./tracking/legs_csv_index";
import { enrichTrackerGameStartTimes, toLegacyEnrichStats } from "./tracking/tracker_temporal_integrity";
import { buildPerfTrackerRowFromTierLeg } from "./tracking/tracker_creation_backfill";
import { loadRunTimestampToLegsSnapshotId } from "./tracking/legs_snapshot";
import {
  formatTrackerSnapshotNewRowEnforcementSummaryLine,
  writeTrackerSnapshotNewRowEnforcementArtifacts,
} from "./reporting/export_tracker_snapshot_new_row_enforcement";

export type { LegCsvRecord } from "./tracking/legs_csv_index";
export { loadLegsMap, existingLegCsvPaths } from "./tracking/legs_csv_index";

export type BackfillPerfTrackerOptions = {
  /**
   * Phase 105 — allow appending rows when **`legsSnapshotId`** cannot be resolved (rare / manual).
   * Also enabled by env **`PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT=1`** or **`true`**.
   */
  allowAppendWithoutLegsSnapshotId?: boolean;
};

export type BackfillPerfTrackerResult = {
  appended: number;
  skipped: number;
  blockedMissingLegsSnapshotId: number;
  appendedWithLegsSnapshotId: number;
  appendedWithoutLegsSnapshotIdOverride: number;
  /** True when escape hatch was enabled for this run (opt-in or env). */
  escapeHatchEnabled: boolean;
};

function resolveEscapeHatch(opts?: BackfillPerfTrackerOptions): boolean {
  return (
    opts?.allowAppendWithoutLegsSnapshotId === true ||
    process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT === "1" ||
    process.env.PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT === "true"
  );
}

function currentRoot(): string {
  return process.cwd();
}

function dateFromRunTimestamp(ts: string): string {
  // "2026-02-23T14:49:55 ET" -> "2026-02-23"
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function existingTierCsvPaths(root: string): string[] {
  const out: string[] = [];
  for (const rel of ["tier1.csv", "tier2.csv", path.join("data", "output_logs", "tier1.csv"), path.join("data", "output_logs", "tier2.csv")]) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) out.push(p);
  }
  const archiveDir = path.join(root, "data", "tier_archive");
  if (fs.existsSync(archiveDir)) {
    for (const f of fs.readdirSync(archiveDir)) {
      if (/^tier[12]-\d{8}\.csv$/i.test(f)) out.push(path.join(archiveDir, f));
    }
  }
  return out;
}

export function enrichExistingTrackerStartTimes(root = process.cwd()): {
  scanned: number;
  enriched: number;
  skippedExisting: number;
  skippedNoCandidate: number;
  skippedConflicting: number;
  sourceCounts: Record<string, number>;
} {
  const rows = readTrackerRows();
  const r = enrichTrackerGameStartTimes(rows, { rootDir: root, persist: true });
  return toLegacyEnrichStats(r);
}

export function backfillPerfTracker(opts?: BackfillPerfTrackerOptions): BackfillPerfTrackerResult {
  const escapeHatchEnabled = resolveEscapeHatch(opts);
  ensureDataDir();
  const root = currentRoot();
  enrichExistingTrackerStartTimes(root);
  const legPaths = existingLegCsvPaths(root);
  const legsMap = loadLegsMap(legPaths);
  const snapshotByRunTs = loadRunTimestampToLegsSnapshotId(root);
  const existing = readTrackerRows();
  const seen = new Set<string>();
  for (const r of existing) {
    seen.add(`${r.date}\t${r.leg_id}`);
  }

  let appended = 0;
  let skipped = 0;
  let blockedMissingLegsSnapshotId = 0;
  let appendedWithLegsSnapshotId = 0;
  let appendedWithoutLegsSnapshotIdOverride = 0;
  const legCols = ["leg1Id", "leg2Id", "leg3Id", "leg4Id", "leg5Id", "leg6Id"];

  const tierFiles = existingTierCsvPaths(root);
  for (const p of tierFiles) {
    const tierFile = path.basename(p).toLowerCase();
    const { headers, rows } = parseCsv(p);
    if (headers.length === 0) continue;
    const runIdx = headers.indexOf("runTimestamp");
    const siteIdx = headers.indexOf("site");
    const flexTypeIdx = headers.indexOf("flexType");
    const siteColumnPresent = siteIdx >= 0;
    if (runIdx === -1) continue;
    const tierNum = tierFile === "tier1.csv" ? 1 : 2;

    for (const row of rows) {
      const rec = toRecord(headers, row);
      const runTimestamp = rec.runTimestamp ?? "";
      const date = dateFromRunTimestamp(runTimestamp);
      if (!date) continue;
      const kellyFracVal = rec.kellyFrac ?? "";
      const kellyStakeVal = rec.kellyStake ?? "";
      const kellyFrac = kellyFracVal ? parseFloat(kellyFracVal) : (kellyStakeVal ? 0.2 : 0);

      const siteRawUpper = siteColumnPresent ? (rec.site ?? rec["site"] ?? "").trim().toUpperCase() : "";
      const structure = flexTypeIdx >= 0 ? (rec.flexType ?? "").trim().toUpperCase() : "";

      for (const col of legCols) {
        const legId = (rec[col] ?? "").trim();
        if (!legId) continue;
        const key = `${date}\t${legId}`;
        if (seen.has(key)) {
          skipped++;
          continue;
        }
        const leg = legsMap.get(legId);
        if (!leg) continue;
        const sid = snapshotByRunTs.get(runTimestamp.trim())?.trim();
        const sidOk = Boolean(sid);
        if (!sidOk) {
          if (!escapeHatchEnabled) {
            blockedMissingLegsSnapshotId++;
            console.warn(
              `[PerfTracker] BLOCKED append: missing legsSnapshotId for runTimestamp=${JSON.stringify(runTimestamp.trim())} leg_id=${JSON.stringify(legId)} (add data/legs_archive/<id>/snapshot_meta.json or artifacts/legs_snapshot_ref.json, or set PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT=1)`
            );
            continue;
          }
        }
        seen.add(key);
        const trackerRow = buildPerfTrackerRowFromTierLeg({
          date,
          legId,
          leg,
          siteColumnPresent,
          siteRawUpper,
          structure,
          kellyFrac,
          cardTier: tierNum,
          runTimestamp,
          legsSnapshotId: sidOk ? sid : undefined,
          appendWithoutSnapshotOverride: !sidOk && escapeHatchEnabled,
        });
        appendTrackerRow(trackerRow);
        appended++;
        if (sidOk) {
          appendedWithLegsSnapshotId++;
        } else {
          appendedWithoutLegsSnapshotIdOverride++;
          console.warn(
            `[PerfTracker] OVERRIDE append without legsSnapshotId (escape hatch) runTimestamp=${JSON.stringify(runTimestamp.trim())} leg_id=${JSON.stringify(legId)}`
          );
        }
      }
    }
  }

  const result: BackfillPerfTrackerResult = {
    appended,
    skipped,
    blockedMissingLegsSnapshotId,
    appendedWithLegsSnapshotId,
    appendedWithoutLegsSnapshotIdOverride,
    escapeHatchEnabled,
  };
  writeTrackerSnapshotNewRowEnforcementArtifacts(root, result);
  return result;
}

if (require.main === module) {
  const allowOverride =
    process.argv.includes("--allow-append-without-snapshot") ||
    process.argv.includes("--allow-append-without-snapshot=true");
  const r = backfillPerfTracker({ allowAppendWithoutLegsSnapshotId: allowOverride });
  console.log(
    `[PerfTracker] Backfill: appended=${r.appended} skipped=${r.skipped} blocked_missing_snapshot=${r.blockedMissingLegsSnapshotId} appended_with_id=${r.appendedWithLegsSnapshotId} appended_override_without_id=${r.appendedWithoutLegsSnapshotIdOverride} escape_hatch=${r.escapeHatchEnabled}`
  );
  console.log(`[PerfTracker] ${formatTrackerSnapshotNewRowEnforcementSummaryLine(r)}`);
}
