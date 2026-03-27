/**
 * Phase 106 — Replay readiness + strict validation segmentation for graded **`perf_tracker`** rows (read-only).
 */

import fs from "fs";
import path from "path";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { PERF_TRACKER_PATH } from "../perf_tracker_types";
import {
  existingLegCsvPaths,
  loadLegsMap,
  type LegCsvRecord,
} from "../tracking/legs_csv_index";
import { legsSnapshotDirectory } from "../tracking/legs_snapshot";
import {
  loadLegsMapForSnapshotId,
  mergeLegsFromJsonFiles,
  readTrackerRowsFromFile,
  resolveLegCsvRecordOrReconstruction,
} from "./feature_validation_export";

export const FEATURE_VALIDATION_REPLAY_READINESS_JSON = path.join(
  "data",
  "reports",
  "latest_feature_validation_replay_readiness.json"
);
export const FEATURE_VALIDATION_REPLAY_READINESS_MD = path.join(
  "data",
  "reports",
  "latest_feature_validation_replay_readiness.md"
);

const MAX_SAMPLES = 3;

function pushSample(bucket: Record<string, string[]>, key: string, legId: string): void {
  const a = bucket[key] ?? (bucket[key] = []);
  if (a.length < MAX_SAMPLES && !a.includes(legId)) a.push(legId);
}

export type FeatureValidationReplayReadinessReport = {
  generatedAtUtc: string;
  trackerPath: string;
  totalTrackerRows: number;
  gradedRows: number;
  counts: {
    replayReadySnapshotBound: number;
    snapshotBoundMissingSnapshotDir: number;
    legacyWithoutSnapshotId: number;
    legacyResolvedBestEffort: number;
    strictValidationEligible: number;
    strictValidationIneligible: number;
  };
  /** **`strictValidationIneligible`** sub-buckets (sum to ineligible when graded = eligible + ineligible). */
  strictIneligibleBreakdown: {
    snapshotBoundMissingDir: number;
    snapshotBoundReplayReadyNoLegMatch: number;
    legacyGraded: number;
  };
  samples: Record<string, string[]>;
  summaryLine: string;
};

export function formatFeatureValidationReplayReadinessSummaryLine(r: FeatureValidationReplayReadinessReport): string {
  const g = r.gradedRows;
  const c = r.counts;
  return (
    `feature_validation_replay_readiness graded=${g} ` +
    `replay_ready=${c.replayReadySnapshotBound}/${g} ` +
    `strict_eligible=${c.strictValidationEligible}/${g} ` +
    `legacy=${c.legacyWithoutSnapshotId} ` +
    `missing_snapshot_dir=${c.snapshotBoundMissingSnapshotDir} ` +
    `legacy_best_effort=${c.legacyResolvedBestEffort}`
  );
}

export type BuildFeatureValidationReplayReadinessOptions = {
  cwd: string;
  trackerPath?: string;
  legCsvPaths?: string[];
};

export function buildFeatureValidationReplayReadinessReport(
  opts: BuildFeatureValidationReplayReadinessOptions
): FeatureValidationReplayReadinessReport {
  const cwd = opts.cwd;
  const trackerAbs = path.isAbsolute(opts.trackerPath ?? "")
    ? opts.trackerPath!
    : path.join(cwd, opts.trackerPath ?? PERF_TRACKER_PATH);

  const allRows = readTrackerRowsFromFile(trackerAbs);
  const graded = allRows.filter((r): r is PerfTrackerRow & { result: 0 | 1 } => r.result === 0 || r.result === 1);

  const seen = new Map<string, PerfTrackerRow>();
  for (const r of graded) {
    seen.set(`${r.date}\t${r.leg_id}`, r);
  }
  const rowsToProcess = [...seen.values()].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.leg_id.localeCompare(b.leg_id);
  });

  const legPaths = opts.legCsvPaths ?? existingLegCsvPaths(cwd);
  const legacyLegsMap = loadLegsMap(legPaths.map((p) => (path.isAbsolute(p) ? p : path.join(cwd, p))));
  mergeLegsFromJsonFiles(cwd, legacyLegsMap);

  const snapshotCache = new Map<string, Map<string, LegCsvRecord>>();

  let replayReadySnapshotBound = 0;
  let snapshotBoundMissingSnapshotDir = 0;
  let legacyWithoutSnapshotId = 0;
  let legacyResolvedBestEffort = 0;
  let strictValidationEligible = 0;
  let ineligibleMissingDir = 0;
  let ineligibleSnapNoLeg = 0;
  let ineligibleLegacy = 0;

  const samples: Record<string, string[]> = {};

  for (const row of rowsToProcess) {
    const sid = row.legsSnapshotId?.trim();
    if (sid) {
      const dir = legsSnapshotDirectory(cwd, sid);
      const dirOk = fs.existsSync(dir);
      if (!snapshotCache.has(sid)) {
        snapshotCache.set(sid, loadLegsMapForSnapshotId(cwd, sid));
      }
      const snapMap = snapshotCache.get(sid)!;
      const replayReady = dirOk && snapMap.size > 0;
      if (replayReady) {
        replayReadySnapshotBound++;
        pushSample(samples, "replay_ready_snapshot_bound", row.leg_id);
        const res = resolveLegCsvRecordOrReconstruction(row, snapMap);
        if (res) {
          strictValidationEligible++;
          pushSample(samples, "strict_validation_eligible", row.leg_id);
        } else {
          ineligibleSnapNoLeg++;
          pushSample(samples, "strict_validation_ineligible", row.leg_id);
          pushSample(samples, "snapshot_bound_replay_ready_no_leg_match", row.leg_id);
        }
      } else {
        snapshotBoundMissingSnapshotDir++;
        ineligibleMissingDir++;
        pushSample(samples, "snapshot_bound_missing_snapshot_dir", row.leg_id);
        pushSample(samples, "strict_validation_ineligible", row.leg_id);
      }
    } else {
      legacyWithoutSnapshotId++;
      ineligibleLegacy++;
      pushSample(samples, "legacy_without_snapshot_id", row.leg_id);
      pushSample(samples, "strict_validation_ineligible", row.leg_id);
      if (resolveLegCsvRecordOrReconstruction(row, legacyLegsMap)) {
        legacyResolvedBestEffort++;
        pushSample(samples, "legacy_resolved_best_effort", row.leg_id);
      }
    }
  }

  const gradedRows = rowsToProcess.length;
  const strictValidationIneligible = gradedRows - strictValidationEligible;

  const report: FeatureValidationReplayReadinessReport = {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: trackerAbs,
    totalTrackerRows: allRows.length,
    gradedRows,
    counts: {
      replayReadySnapshotBound,
      snapshotBoundMissingSnapshotDir,
      legacyWithoutSnapshotId,
      legacyResolvedBestEffort,
      strictValidationEligible,
      strictValidationIneligible,
    },
    strictIneligibleBreakdown: {
      snapshotBoundMissingDir: ineligibleMissingDir,
      snapshotBoundReplayReadyNoLegMatch: ineligibleSnapNoLeg,
      legacyGraded: ineligibleLegacy,
    },
    samples,
    summaryLine: "",
  };
  report.summaryLine = formatFeatureValidationReplayReadinessSummaryLine(report);
  return report;
}

export function writeFeatureValidationReplayReadinessArtifacts(
  opts: BuildFeatureValidationReplayReadinessOptions
): FeatureValidationReplayReadinessReport {
  const report = buildFeatureValidationReplayReadinessReport(opts);
  const outDir = path.join(opts.cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(opts.cwd, FEATURE_VALIDATION_REPLAY_READINESS_JSON);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const mdPath = path.join(opts.cwd, FEATURE_VALIDATION_REPLAY_READINESS_MD);
  const lines: string[] = [
    "# Feature validation — replay readiness (Phase 106)",
    "",
    `- **summary:** \`${report.summaryLine}\``,
    "",
    "## Counts (graded, deduped)",
    "",
    `- **graded_rows:** ${report.gradedRows}`,
    `- **replay_ready_snapshot_bound:** ${report.counts.replayReadySnapshotBound}`,
    `- **snapshot_bound_missing_snapshot_dir:** ${report.counts.snapshotBoundMissingSnapshotDir}`,
    `- **legacy_without_snapshot_id:** ${report.counts.legacyWithoutSnapshotId}`,
    `- **legacy_resolved_best_effort:** ${report.counts.legacyResolvedBestEffort}`,
    `- **strict_validation_eligible:** ${report.counts.strictValidationEligible}`,
    `- **strict_validation_ineligible:** ${report.counts.strictValidationIneligible}`,
    "",
    "### Strict ineligible breakdown",
    "",
    `- **snapshot_bound_missing_dir:** ${report.strictIneligibleBreakdown.snapshotBoundMissingDir}`,
    `- **snapshot_bound_replay_ready_no_leg_match:** ${report.strictIneligibleBreakdown.snapshotBoundReplayReadyNoLegMatch}`,
    `- **legacy_graded:** ${report.strictIneligibleBreakdown.legacyGraded}`,
    "",
    "## Samples (leg_id)",
    "",
  ];
  for (const k of Object.keys(report.samples).sort((a, b) => a.localeCompare(b))) {
    const ids = report.samples[k];
    if (ids?.length) lines.push(`- **${k}:** ${ids.join(", ")}`);
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return report;
}
