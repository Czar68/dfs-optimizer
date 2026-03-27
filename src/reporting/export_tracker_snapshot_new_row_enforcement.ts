/**
 * Phase 105 — New-row **`legsSnapshotId`** enforcement outcomes (**`backfillPerfTracker`** only).
 */

import fs from "fs";
import path from "path";
import type { BackfillPerfTrackerResult } from "../backfill_perf_tracker";

export const TRACKER_SNAPSHOT_NEW_ROW_ENFORCEMENT_JSON = path.join(
  "data",
  "reports",
  "latest_tracker_snapshot_new_row_enforcement.json"
);
export const TRACKER_SNAPSHOT_NEW_ROW_ENFORCEMENT_MD = path.join(
  "data",
  "reports",
  "latest_tracker_snapshot_new_row_enforcement.md"
);

export function formatTrackerSnapshotNewRowEnforcementSummaryLine(r: BackfillPerfTrackerResult): string {
  const overrideUsed = r.appendedWithoutLegsSnapshotIdOverride > 0;
  return (
    `tracker_snapshot_new_row_enforcement appended_with_id=${r.appendedWithLegsSnapshotId} ` +
    `blocked_missing_id=${r.blockedMissingLegsSnapshotId} ` +
    `appended_override_without_id=${r.appendedWithoutLegsSnapshotIdOverride} ` +
    `escape_hatch_enabled=${r.escapeHatchEnabled} override_used=${overrideUsed}`
  );
}

export function writeTrackerSnapshotNewRowEnforcementArtifacts(
  cwd: string,
  result: BackfillPerfTrackerResult
): void {
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAtUtc: new Date().toISOString(),
    summaryLine: formatTrackerSnapshotNewRowEnforcementSummaryLine(result),
    ...result,
  };
  const jsonPath = path.join(cwd, TRACKER_SNAPSHOT_NEW_ROW_ENFORCEMENT_JSON);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  const mdPath = path.join(cwd, TRACKER_SNAPSHOT_NEW_ROW_ENFORCEMENT_MD);
  const lines: string[] = [
    "# Tracker snapshot — new row enforcement (Phase 105)",
    "",
    `- **summary:** \`${payload.summaryLine}\``,
    "",
    "## Counts",
    "",
    `- **appended_total:** ${result.appended}`,
    `- **appended_with_legsSnapshotId:** ${result.appendedWithLegsSnapshotId}`,
    `- **blocked_missing_legsSnapshotId:** ${result.blockedMissingLegsSnapshotId}`,
    `- **appended_override_without_legsSnapshotId:** ${result.appendedWithoutLegsSnapshotIdOverride}`,
    `- **duplicate_skipped:** ${result.skipped}`,
    `- **escape_hatch_enabled:** ${result.escapeHatchEnabled}`,
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
}
