/**
 * Phase 104 — **`legsSnapshotId`** adoption vs legacy debt (read-only; no optimizer).
 *
 * **Tracker write paths (SSOT):** New **`perf_tracker`** rows are appended only from
 * **`backfillPerfTracker`** → **`buildPerfTrackerRowFromTierLeg`**, which stamps **`legsSnapshotId`**
 * when **`loadRunTimestampToLegsSnapshotId`** resolves the tier **`runTimestamp`** (archive meta or
 * **`artifacts/legs_snapshot_ref.json`**). **Phase 105:** new appends without a resolved id are blocked
 * unless the escape hatch is enabled (see **`backfill_perf_tracker`**). Other **`writeTrackerRows`**
 * paths mutate existing rows in place and preserve **`legsSnapshotId`**.
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";

export const LEGS_SNAPSHOT_ADOPTION_JSON = path.join(
  "data",
  "reports",
  "latest_legs_snapshot_adoption.json"
);
export const LEGS_SNAPSHOT_ADOPTION_MD = path.join(
  "data",
  "reports",
  "latest_legs_snapshot_adoption.md"
);

export type MonthBucket = {
  total: number;
  withLegsSnapshotId: number;
  withoutLegsSnapshotId: number;
};

export type LegsSnapshotAdoptionReport = {
  generatedAtUtc: string;
  trackerPath: string;
  totalRows: number;
  rowsWithLegsSnapshotId: number;
  rowsWithoutLegsSnapshotId: number;
  /** 0–100, two decimal places. */
  pctSnapshotBound: number;
  gradedTotal: number;
  gradedWithLegsSnapshotId: number;
  gradedWithoutLegsSnapshotId: number;
  /** Same as **`rowsWithoutLegsSnapshotId`** — explicit debt label for operators. */
  legacyUnsnapshottedRows: number;
  /** **`YYYY-MM`** → counts; keys sorted lexicographically in JSON writer. */
  byMonth: Record<string, MonthBucket>;
  /** Stable one-line summary for CLI / dashboards. */
  summaryLine: string;
};

function monthKeyFromRow(row: PerfTrackerRow): string {
  const d = row.date?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 7);
  return "unknown";
}

function pct2(n: number, d: number): number {
  if (d === 0 || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
  return Math.round((n / d) * 10000) / 100;
}

export function formatLegsSnapshotAdoptionSummaryLine(r: LegsSnapshotAdoptionReport): string {
  return (
    `legs_snapshot_adoption snapshot=${r.rowsWithLegsSnapshotId}/${r.totalRows} ` +
    `graded_snap=${r.gradedWithLegsSnapshotId}/${r.gradedTotal} ` +
    `legacy_unsnapshotted=${r.legacyUnsnapshottedRows}`
  );
}

export function buildLegsSnapshotAdoptionReport(cwd: string = process.cwd()): LegsSnapshotAdoptionReport {
  const rows = readTrackerRows(cwd);
  let withId = 0;
  let gradedWith = 0;
  let gradedTotal = 0;
  const byMonth: Record<string, MonthBucket> = {};

  for (const row of rows) {
    const has = Boolean(row.legsSnapshotId?.trim());
    if (has) withId += 1;
    const g = row.result === 0 || row.result === 1;
    if (g) {
      gradedTotal += 1;
      if (has) gradedWith += 1;
    }
    const mk = monthKeyFromRow(row);
    if (!byMonth[mk]) {
      byMonth[mk] = { total: 0, withLegsSnapshotId: 0, withoutLegsSnapshotId: 0 };
    }
    const b = byMonth[mk]!;
    b.total += 1;
    if (has) b.withLegsSnapshotId += 1;
    else b.withoutLegsSnapshotId += 1;
  }

  const total = rows.length;
  const without = total - withId;
  const gradedWithout = gradedTotal - gradedWith;

  const report: LegsSnapshotAdoptionReport = {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: path.join(cwd, "data", "perf_tracker.jsonl"),
    totalRows: total,
    rowsWithLegsSnapshotId: withId,
    rowsWithoutLegsSnapshotId: without,
    pctSnapshotBound: pct2(withId, total),
    gradedTotal,
    gradedWithLegsSnapshotId: gradedWith,
    gradedWithoutLegsSnapshotId: gradedWithout,
    legacyUnsnapshottedRows: without,
    byMonth: {},
    summaryLine: "",
  };

  const sortedMonths = Object.keys(byMonth).sort((a, b) => a.localeCompare(b));
  for (const m of sortedMonths) {
    report.byMonth[m] = byMonth[m]!;
  }
  report.summaryLine = formatLegsSnapshotAdoptionSummaryLine(report);
  return report;
}

export function writeLegsSnapshotAdoptionArtifacts(cwd: string = process.cwd()): LegsSnapshotAdoptionReport {
  const report = buildLegsSnapshotAdoptionReport(cwd);
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(cwd, LEGS_SNAPSHOT_ADOPTION_JSON);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  const mdPath = path.join(cwd, LEGS_SNAPSHOT_ADOPTION_MD);
  const lines: string[] = [
    "# Legs snapshot adoption (Phase 104)",
    "",
    `- **generatedAtUtc:** ${report.generatedAtUtc}`,
    `- **tracker:** \`${report.trackerPath}\``,
    "",
    "## Summary",
    "",
    `\`${report.summaryLine}\``,
    "",
    "## Counts",
    "",
    `- **total_rows:** ${report.totalRows}`,
    `- **rows_with_legsSnapshotId:** ${report.rowsWithLegsSnapshotId}`,
    `- **rows_without_legsSnapshotId:** ${report.rowsWithoutLegsSnapshotId}`,
    `- **pct_snapshot_bound:** ${report.pctSnapshotBound}%`,
    "",
    "### Graded (result 0/1)",
    "",
    `- **graded_total:** ${report.gradedTotal}`,
    `- **graded_with_legsSnapshotId:** ${report.gradedWithLegsSnapshotId}`,
    `- **graded_without_legsSnapshotId:** ${report.gradedWithoutLegsSnapshotId}`,
    "",
    "## By month (date prefix)",
    "",
  ];
  for (const [mk, b] of Object.entries(report.byMonth)) {
    lines.push(
      `- **${mk}:** total=${b.total} with_id=${b.withLegsSnapshotId} without_id=${b.withoutLegsSnapshotId}`
    );
  }
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return report;
}
