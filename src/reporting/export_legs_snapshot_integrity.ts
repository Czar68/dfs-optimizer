/**
 * Phase 102 — Read-only legs snapshot binding coverage vs **`data/perf_tracker.jsonl`**.
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { legsSnapshotDirectory } from "../tracking/legs_snapshot";

export type LegsSnapshotIntegrityReport = {
  generatedAtUtc: string;
  trackerPath: string;
  totalRows: number;
  rowsWithLegsSnapshotId: number;
  rowsMissingLegsSnapshotId: number;
  distinctSnapshotIdsReferenced: string[];
  snapshotDirExistsCount: Record<string, boolean>;
  referencedSnapshotMissingOnDisk: string[];
};

export function buildLegsSnapshotIntegrityReport(cwd: string = process.cwd()): LegsSnapshotIntegrityReport {
  const rows = readTrackerRows(cwd);
  const withId: PerfTrackerRow[] = [];
  const without: PerfTrackerRow[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    const s = r.legsSnapshotId?.trim();
    if (s) {
      withId.push(r);
      ids.add(s);
    } else {
      without.push(r);
    }
  }
  const distinct = [...ids].sort((a, b) => a.localeCompare(b));
  const exists: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const id of distinct) {
    const ok = fs.existsSync(legsSnapshotDirectory(cwd, id));
    exists[id] = ok;
    if (!ok) missing.push(id);
  }
  return {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: path.join(cwd, "data", "perf_tracker.jsonl"),
    totalRows: rows.length,
    rowsWithLegsSnapshotId: withId.length,
    rowsMissingLegsSnapshotId: without.length,
    distinctSnapshotIdsReferenced: distinct,
    snapshotDirExistsCount: exists,
    referencedSnapshotMissingOnDisk: missing,
  };
}

export function writeLegsSnapshotIntegrityArtifacts(cwd: string = process.cwd()): void {
  const report = buildLegsSnapshotIntegrityReport(cwd);
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_legs_snapshot_integrity.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const mdPath = path.join(outDir, "latest_legs_snapshot_integrity.md");
  const lines: string[] = [
    "# Legs snapshot integrity (Phase 102)",
    "",
    `- **generatedAtUtc:** ${report.generatedAtUtc}`,
    `- **tracker:** \`${report.trackerPath}\``,
    `- **total_rows:** ${report.totalRows}`,
    `- **rows_with_legsSnapshotId:** ${report.rowsWithLegsSnapshotId}`,
    `- **rows_missing_legsSnapshotId:** ${report.rowsMissingLegsSnapshotId}`,
    `- **distinct_snapshot_ids:** ${report.distinctSnapshotIdsReferenced.length}`,
    "",
  ];
  for (const id of report.distinctSnapshotIdsReferenced) {
    lines.push(`- **\`${id}\`** — dir_exists=${report.snapshotDirExistsCount[id]}`);
  }
  if (report.referencedSnapshotMissingOnDisk.length > 0) {
    lines.push("", "## Missing on disk", ...report.referencedSnapshotMissingOnDisk.map((id) => `- ${id}`));
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
}
