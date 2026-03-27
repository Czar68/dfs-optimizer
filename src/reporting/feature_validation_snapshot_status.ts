/**
 * Phase 103 — Compact snapshot export status (read-only; no optimizer).
 */

import fs from "fs";
import path from "path";
import type { FeatureValidationExportStats } from "./feature_validation_export";

export const FEATURE_VALIDATION_SNAPSHOT_STATUS_JSON = path.join(
  "data",
  "reports",
  "latest_feature_validation_snapshot_status.json"
);
export const FEATURE_VALIDATION_SNAPSHOT_STATUS_MD = path.join(
  "data",
  "reports",
  "latest_feature_validation_snapshot_status.md"
);

export function buildFeatureValidationSnapshotStatusPayload(
  stats: FeatureValidationExportStats,
  trackerAbs: string
): Record<string, unknown> {
  return {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: trackerAbs,
    ...stats,
  };
}

export function writeFeatureValidationSnapshotStatusArtifacts(
  cwd: string,
  stats: FeatureValidationExportStats,
  trackerAbs: string
): void {
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const payload = buildFeatureValidationSnapshotStatusPayload(stats, trackerAbs);
  const jsonPath = path.join(cwd, FEATURE_VALIDATION_SNAPSHOT_STATUS_JSON);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const mdPath = path.join(cwd, FEATURE_VALIDATION_SNAPSHOT_STATUS_MD);
  const lines: string[] = [
    "# Feature validation — snapshot status (Phase 103)",
    "",
    `- **generatedAtUtc:** ${payload.generatedAtUtc}`,
    `- **tracker:** \`${trackerAbs}\``,
    "",
    "## Counts",
    "",
    `- **rows_with_legsSnapshotId:** ${stats.rowsWithLegsSnapshotId}`,
    `- **rows_without_legsSnapshotId:** ${stats.rowsWithoutLegsSnapshotId}`,
    `- **snapshot_referenced_dir_exists_rows:** ${stats.snapshotReferencedDirExistsRows}`,
    `- **snapshot_referenced_dir_missing_rows:** ${stats.snapshotReferencedDirMissingRows}`,
    `- **exported:** ${stats.exported}`,
    `- **skipped_no_leg (total):** ${stats.skippedNoLeg}`,
    "",
    "### Snapshot-bound joins",
    "",
    `- **snapshot_joined_by_leg_id:** ${stats.snapshotJoinedByLegId}`,
    `- **snapshot_joined_by_reconstruction:** ${stats.snapshotJoinedByReconstruction}`,
    "",
    "### Legacy joins",
    "",
    `- **legacy_joined_by_leg_id:** ${stats.legacyJoinedByLegId}`,
    `- **legacy_joined_by_reconstruction:** ${stats.legacyJoinedByReconstruction}`,
    "",
    "### Fail-closed (snapshot-bound)",
    "",
    `- **missing_snapshot_directory:** ${stats.skippedMissingSnapshotDirectory}`,
    `- **snapshot_present_no_leg_match:** ${stats.skippedSnapshotPresentNoLegMatch}`,
    `- **snapshot_present_ambiguous_reconstruction:** ${stats.skippedSnapshotAmbiguousReconstruction}`,
    "",
    "### Fail-closed (legacy)",
    "",
    `- **legacy_no_leg_match:** ${stats.skippedLegacyNoLegMatch}`,
    "",
    "### Enforcement",
    "",
    `- **enforceSnapshotResolved:** ${stats.enforceSnapshotResolved}`,
    `- **enforcementFailed:** ${stats.enforcementFailed}`,
    "",
    "## Samples (leg_id)",
    "",
  ];
  for (const [k, ids] of Object.entries(stats.skipReasonSamples)) {
    lines.push(`- **${k}:** ${ids.length ? ids.join(", ") : "(none)"}`);
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
}
