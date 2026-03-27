/**
 * Writes data/reports/latest_tracker_integrity.json and .md.
 * Optional --apply: persists grounded enrichment to data/perf_tracker.jsonl.
 */

import fs from "fs";
import path from "path";
import { readTrackerRows, writeTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { applyGroundedTrackerEnrichment, type GroundedEnrichmentPassStats } from "../tracking/implied_prob_recovery";
import {
  TRACKER_INTEGRITY_SCHEMA_VERSION,
  computeTrackerCompleteness,
  countPrimaryReasonsForNonCalibratableResolved,
  hasFiniteImpliedProb,
  isResolvedRow,
} from "../tracking/tracker_integrity_contract";

export type TrackerIntegrityReport = {
  schemaVersion: number;
  generatedAtUtc: string;
  applyPass: {
    applied: boolean;
    perfTrackerWritten: boolean;
  };
  enrichmentStats: GroundedEnrichmentPassStats;
  before: ReturnType<typeof computeTrackerCompleteness>;
  after: ReturnType<typeof computeTrackerCompleteness>;
  deltas: {
    resolvedRowsFullyCalibratable: number;
    impliedProbCoverageRate: number;
    fullyCalibratableRate: number;
  };
  primaryReasonBreakdownBefore: ReturnType<typeof countPrimaryReasonsForNonCalibratableResolved>;
  primaryReasonBreakdownAfter: ReturnType<typeof countPrimaryReasonsForNonCalibratableResolved>;
  resolvedMissingImpliedAfter: {
    count: number;
    snapshotPassSkips: {
      skippedSnapshotAmbiguous: number;
      skippedSnapshotNoGameStart: number;
      skippedSnapshotNoMatch: number;
    };
    /** Per-row residual classification (resolved, still no implied after enrichment). */
    residualByReason: {
      missing_game_start: number;
      missing_leg_odds_and_no_snapshot_match: number;
      ambiguous_snapshot_only: number;
    };
  };
  notes: string[];
};

function deepCloneRows(rows: PerfTrackerRow[]): PerfTrackerRow[] {
  return rows.map((r) => JSON.parse(JSON.stringify(r)) as PerfTrackerRow);
}

export function buildTrackerIntegrityReport(input: {
  rowsBeforeMutation: PerfTrackerRow[];
  rowsAfterMutation: PerfTrackerRow[];
  enrichmentStats: GroundedEnrichmentPassStats;
  applied: boolean;
  perfTrackerWritten: boolean;
  generatedAtUtc: string;
}): TrackerIntegrityReport {
  const before = computeTrackerCompleteness(input.rowsBeforeMutation);
  const after = computeTrackerCompleteness(input.rowsAfterMutation);

  let missing_game_start = 0;
  let missing_leg_odds_and_no_snapshot_match = 0;
  let ambiguous_only = 0;
  for (const row of input.rowsAfterMutation) {
    if (!isResolvedRow(row) || hasFiniteImpliedProb(row)) continue;
    if (!row.gameStartTime?.trim()) {
      missing_game_start += 1;
      continue;
    }
    const hasSomeOdds =
      (typeof row.overOdds === "number" && Number.isFinite(row.overOdds)) ||
      (typeof row.underOdds === "number" && Number.isFinite(row.underOdds)) ||
      (typeof row.openOddsAmerican === "number" && Number.isFinite(row.openOddsAmerican));
    if (!hasSomeOdds) missing_leg_odds_and_no_snapshot_match += 1;
    else ambiguous_only += 1;
  }

  const notes: string[] = [
    "fully_calibratable = resolved + platform + trueProb + impliedProb + projectedEV (platform may be inferred from leg_id).",
    "Snapshot recovery: earliest pre-start OddsAPI snapshot with unique chosen-side odds; ambiguous → skip.",
    "Leg CSV merge: existingLegCsvPaths + loadLegsMap (same as perf tracker backfill).",
  ];
  if (!input.applied) {
    notes.push("Dry-run: enrichment applied in memory only; use --apply to persist data/perf_tracker.jsonl.");
  }

  return {
    schemaVersion: TRACKER_INTEGRITY_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    applyPass: {
      applied: input.applied,
      perfTrackerWritten: input.perfTrackerWritten,
    },
    enrichmentStats: input.enrichmentStats,
    before,
    after,
    deltas: {
      resolvedRowsFullyCalibratable: after.resolvedRowsFullyCalibratable - before.resolvedRowsFullyCalibratable,
      impliedProbCoverageRate: after.impliedProbCoverageRate - before.impliedProbCoverageRate,
      fullyCalibratableRate: after.fullyCalibratableRate - before.fullyCalibratableRate,
    },
    primaryReasonBreakdownBefore: countPrimaryReasonsForNonCalibratableResolved(input.rowsBeforeMutation),
    primaryReasonBreakdownAfter: countPrimaryReasonsForNonCalibratableResolved(input.rowsAfterMutation),
    resolvedMissingImpliedAfter: {
      count: input.rowsAfterMutation.filter((r) => isResolvedRow(r) && !hasFiniteImpliedProb(r)).length,
      snapshotPassSkips: {
        skippedSnapshotAmbiguous: input.enrichmentStats.skippedSnapshotAmbiguous,
        skippedSnapshotNoGameStart: input.enrichmentStats.skippedSnapshotNoGameStart,
        skippedSnapshotNoMatch: input.enrichmentStats.skippedSnapshotNoMatch,
      },
      residualByReason: {
        missing_game_start,
        missing_leg_odds_and_no_snapshot_match,
        ambiguous_snapshot_only: ambiguous_only,
      },
    },
    notes,
  };
}

function renderMarkdown(report: TrackerIntegrityReport): string {
  const lines: string[] = [];
  lines.push("# Tracker integrity (perf_tracker calibration inputs)");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push(`Schema: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(
    `- Apply pass: **${report.applyPass.applied ? "yes" : "no"}** (perf_tracker written: **${report.applyPass.perfTrackerWritten ? "yes" : "no"}**)`
  );
  lines.push(`- Resolved rows: ${report.before.resolvedRows}`);
  lines.push(
    `- Fully calibratable (before → after): ${report.before.resolvedRowsFullyCalibratable} → ${report.after.resolvedRowsFullyCalibratable} (Δ ${report.deltas.resolvedRowsFullyCalibratable})`
  );
  lines.push(
    `- impliedProb coverage: ${(report.before.impliedProbCoverageRate * 100).toFixed(2)}% → ${(report.after.impliedProbCoverageRate * 100).toFixed(2)}%`
  );
  lines.push("");
  lines.push("## Coverage rates (after)");
  lines.push(`| Metric | Rate |`);
  lines.push(`|---|---:|`);
  lines.push(`| platform | ${(report.after.platformCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| trueProb | ${(report.after.trueProbCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| impliedProb | ${(report.after.impliedProbCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| projectedEV | ${(report.after.projectedEvCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| fully calibratable | ${(report.after.fullyCalibratableRate * 100).toFixed(2)}% |`);
  lines.push("");
  lines.push("## Primary reason — resolved, not fully calibratable (after)");
  lines.push("| Reason | Count |");
  lines.push("|---|---:|");
  for (const [k, v] of Object.entries(report.primaryReasonBreakdownAfter)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Enrichment stats");
  lines.push("```json");
  lines.push(JSON.stringify(report.enrichmentStats, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Resolved rows still missing impliedProb (after)");
  lines.push(`- Count: ${report.resolvedMissingImpliedAfter.count}`);
  lines.push("");
  lines.push("### Snapshot pass (all rows that attempted snapshot while implied missing)");
  lines.push("| Skip reason | Count |");
  lines.push("|---|---:|");
  lines.push(`| ambiguous | ${report.resolvedMissingImpliedAfter.snapshotPassSkips.skippedSnapshotAmbiguous} |`);
  lines.push(`| no game start | ${report.resolvedMissingImpliedAfter.snapshotPassSkips.skippedSnapshotNoGameStart} |`);
  lines.push(`| no match | ${report.resolvedMissingImpliedAfter.snapshotPassSkips.skippedSnapshotNoMatch} |`);
  lines.push("");
  lines.push("### Residual missing implied (diagnostic)");
  for (const [k, v] of Object.entries(report.resolvedMissingImpliedAfter.residualByReason)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  lines.push("## Notes");
  for (const n of report.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function exportTrackerIntegrity(options?: { cwd?: string; apply?: boolean }): {
  jsonPath: string;
  mdPath: string;
  report: TrackerIntegrityReport;
} {
  const root = options?.cwd ?? process.cwd();
  const apply = options?.apply ?? process.argv.includes("--apply");

  const rowsLive = readTrackerRows();
  const rowsBeforeMutation = deepCloneRows(rowsLive);

  const { stats } = applyGroundedTrackerEnrichment(rowsLive, { rootDir: root });
  const rowsAfterMutation = rowsLive;

  let perfTrackerWritten = false;
  if (apply) {
    writeTrackerRows(rowsAfterMutation);
    perfTrackerWritten = true;
  }

  const report = buildTrackerIntegrityReport({
    rowsBeforeMutation,
    rowsAfterMutation: apply ? readTrackerRows() : rowsAfterMutation,
    enrichmentStats: stats,
    applied: apply,
    perfTrackerWritten,
    generatedAtUtc: new Date().toISOString(),
  });

  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_tracker_integrity.json");
  const mdPath = path.join(outDir, "latest_tracker_integrity.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  const { jsonPath, mdPath, report } = exportTrackerIntegrity({ apply });
  console.log(`[export:tracker-integrity] wrote ${jsonPath}`);
  console.log(`[export:tracker-integrity] wrote ${mdPath}`);
  console.log(
    `[export:tracker-integrity] fullyCalibratable ${report.before.resolvedRowsFullyCalibratable} → ${report.after.resolvedRowsFullyCalibratable} applied=${report.applyPass.applied}`
  );
}
