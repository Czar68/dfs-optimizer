/**
 * Phase 107 — Validation policy surfacing for feature export (read-only; no optimizer).
 */

import fs from "fs";
import path from "path";
import type { FeatureValidationExportStats, FeatureValidationPolicy } from "./feature_validation_export";
import { stableStringifyForObservability } from "./final_selection_observability";
import {
  buildFeatureValidationReplayReadinessReport,
  type FeatureValidationReplayReadinessReport,
} from "./export_feature_validation_replay_readiness";

export const FEATURE_VALIDATION_POLICY_STATUS_JSON = path.join(
  "data",
  "reports",
  "latest_feature_validation_policy_status.json"
);
export const FEATURE_VALIDATION_POLICY_STATUS_MD = path.join(
  "data",
  "reports",
  "latest_feature_validation_policy_status.md"
);

export type FeatureValidationPolicyStatusArtifact = {
  generatedAtUtc: string;
  trackerPath: string;
  policy: FeatureValidationPolicy;
  gradedRowsConsidered: number;
  policyExcludedGradedRows: number;
  policyExcludedNoSnapshotId: number;
  exported: number;
  /** Successful exports whose join used the global legacy legs map (best-effort / legacy-inclusive). */
  exportedViaLegacyMapJoin: number;
  /** Successful exports whose join used a snapshot archive map (replay-safe path). */
  exportedViaSnapshotMapJoin: number;
  skippedNoLeg: number;
  reasonBuckets: {
    missing_snapshot_directory: number;
    snapshot_present_no_leg_match: number;
    snapshot_present_ambiguous_reconstruction: number;
    legacy_no_leg_match: number;
  };
  replayReadiness: {
    gradedRows: number;
    counts: FeatureValidationReplayReadinessReport["counts"];
    strictIneligibleBreakdown: FeatureValidationReplayReadinessReport["strictIneligibleBreakdown"];
    replayReadinessSummaryLine: string;
  };
  /** Deterministic (no timestamps); stable for tests and diffs. */
  summaryLine: string;
};

export function formatFeatureValidationPolicySummaryLine(a: FeatureValidationPolicyStatusArtifact): string {
  const p = a.policy;
  const g = a.gradedRowsConsidered;
  const e = a.exported;
  const ex = a.policyExcludedGradedRows;
  const exNs = a.policyExcludedNoSnapshotId;
  const leg = a.exportedViaLegacyMapJoin;
  const snap = a.exportedViaSnapshotMapJoin;
  const skip = a.skippedNoLeg;
  const strict = a.replayReadiness.counts.strictValidationEligible;
  return (
    `feature_validation_policy_status policy=${p} graded=${g} exported=${e} ` +
    `excluded_policy=${ex} excluded_no_snapshot_id=${exNs} legacy_map_join=${leg} snap_map_join=${snap} ` +
    `skipped_no_leg=${skip} strict_eligible_graded=${strict}`
  );
}

export function buildFeatureValidationPolicyStatusArtifact(
  cwd: string,
  trackerAbs: string,
  policy: FeatureValidationPolicy,
  stats: FeatureValidationExportStats
): FeatureValidationPolicyStatusArtifact {
  const replay = buildFeatureValidationReplayReadinessReport({ cwd, trackerPath: trackerAbs });
  const artifact: FeatureValidationPolicyStatusArtifact = {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: trackerAbs,
    policy,
    /** Deduped graded rows (same basis as **`exportFeatureValidationPicks`** loop and Phase **106**). */
    gradedRowsConsidered: replay.gradedRows,
    policyExcludedGradedRows: stats.policyExcludedGradedRows,
    policyExcludedNoSnapshotId: stats.policyExcludedNoSnapshotId,
    exported: stats.exported,
    exportedViaLegacyMapJoin: stats.exportedViaLegacyMapJoin,
    exportedViaSnapshotMapJoin: stats.exportedViaSnapshotMapJoin,
    skippedNoLeg: stats.skippedNoLeg,
    reasonBuckets: {
      missing_snapshot_directory: stats.skippedMissingSnapshotDirectory,
      snapshot_present_no_leg_match: stats.skippedSnapshotPresentNoLegMatch,
      snapshot_present_ambiguous_reconstruction: stats.skippedSnapshotAmbiguousReconstruction,
      legacy_no_leg_match: stats.skippedLegacyNoLegMatch,
    },
    replayReadiness: {
      gradedRows: replay.gradedRows,
      counts: replay.counts,
      strictIneligibleBreakdown: replay.strictIneligibleBreakdown,
      replayReadinessSummaryLine: replay.summaryLine,
    },
    summaryLine: "",
  };
  artifact.summaryLine = formatFeatureValidationPolicySummaryLine(artifact);
  return artifact;
}

export function writeFeatureValidationPolicyStatusArtifacts(
  cwd: string,
  trackerAbs: string,
  policy: FeatureValidationPolicy,
  stats: FeatureValidationExportStats
): FeatureValidationPolicyStatusArtifact {
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const artifact = buildFeatureValidationPolicyStatusArtifact(cwd, trackerAbs, policy, stats);
  const jsonPath = path.join(cwd, FEATURE_VALIDATION_POLICY_STATUS_JSON);
  fs.writeFileSync(jsonPath, stableStringifyForObservability(artifact), "utf8");

  const mdPath = path.join(cwd, FEATURE_VALIDATION_POLICY_STATUS_MD);
  const rb = artifact.reasonBuckets;
  const lines: string[] = [
    "# Feature validation — policy status (Phase 107)",
    "",
    `- **summary:** \`${artifact.summaryLine}\``,
    `- **policy:** \`${artifact.policy}\``,
    `- **tracker:** \`${trackerAbs}\``,
    "",
    "## This export run",
    "",
    `- **graded_rows_considered:** ${artifact.gradedRowsConsidered}`,
    `- **exported:** ${artifact.exported}`,
    `- **policy_excluded_graded_rows:** ${artifact.policyExcludedGradedRows}`,
    `- **policy_excluded_no_snapshot_id (strict):** ${artifact.policyExcludedNoSnapshotId}`,
    `- **exported_via_legacy_map_join (best-effort-inclusive):** ${artifact.exportedViaLegacyMapJoin}`,
    `- **exported_via_snapshot_map_join (replay-safe join path):** ${artifact.exportedViaSnapshotMapJoin}`,
    `- **skipped_no_leg:** ${artifact.skippedNoLeg}`,
    "",
    "### Stable reason buckets (skip)",
    "",
    `- **missing_snapshot_directory:** ${rb.missing_snapshot_directory}`,
    `- **snapshot_present_no_leg_match:** ${rb.snapshot_present_no_leg_match}`,
    `- **snapshot_present_ambiguous_reconstruction:** ${rb.snapshot_present_ambiguous_reconstruction}`,
    `- **legacy_no_leg_match:** ${rb.legacy_no_leg_match}`,
    "",
    "## Replay readiness snapshot (graded set)",
    "",
    `- **replay summary:** \`${artifact.replayReadiness.replayReadinessSummaryLine}\``,
    `- **strict_validation_eligible (graded):** ${artifact.replayReadiness.counts.strictValidationEligible}`,
    `- **strict_validation_ineligible (graded):** ${artifact.replayReadiness.counts.strictValidationIneligible}`,
    `- **replay_ready_snapshot_bound:** ${artifact.replayReadiness.counts.replayReadySnapshotBound}`,
    `- **legacy_without_snapshot_id:** ${artifact.replayReadiness.counts.legacyWithoutSnapshotId}`,
    `- **legacy_resolved_best_effort:** ${artifact.replayReadiness.counts.legacyResolvedBestEffort}`,
    "",
    "### Strict ineligible breakdown",
    "",
    `- **snapshot_bound_missing_dir:** ${artifact.replayReadiness.strictIneligibleBreakdown.snapshotBoundMissingDir}`,
    `- **snapshot_bound_replay_ready_no_leg_match:** ${artifact.replayReadiness.strictIneligibleBreakdown.snapshotBoundReplayReadyNoLegMatch}`,
    `- **legacy_graded:** ${artifact.replayReadiness.strictIneligibleBreakdown.legacyGraded}`,
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return artifact;
}
