/**
 * Writes data/reports/latest_tracker_temporal_integrity.json and .md.
 * Dry-run: enrichment in memory only; --apply persists via enrichTrackerGameStartTimes (when rows backfilled).
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import {
  TRACKER_TEMPORAL_SCHEMA_VERSION,
  computeTemporalIntegritySnapshot,
  enrichTrackerGameStartTimes,
  type GameStartEnrichmentResult,
  type TemporalIntegritySnapshot,
} from "../tracking/tracker_temporal_integrity";

function deepCloneRows(rows: PerfTrackerRow[]): PerfTrackerRow[] {
  return rows.map((r) => JSON.parse(JSON.stringify(r)) as PerfTrackerRow);
}

export type TrackerTemporalIntegrityReport = {
  schemaVersion: number;
  generatedAtUtc: string;
  applyPass: {
    applied: boolean;
    perfTrackerWritten: boolean;
  };
  before: TemporalIntegritySnapshot;
  after: TemporalIntegritySnapshot;
  enrichment: GameStartEnrichmentResult;
  deltas: {
    resolvedRowsMissingGameStartTime: number;
    overallGameStartCoverageRate: number;
    resolvedGameStartCoverageRate: number;
  };
  notes: string[];
  /** Operator-facing: whether Phase 67 implied/snapshot recovery can plausibly improve after persisting times. */
  impliedProbRecoveryOutlook: string;
};

export function buildTrackerTemporalIntegrityReport(input: {
  rowsBeforeMutation: PerfTrackerRow[];
  rowsAfterMutation: PerfTrackerRow[];
  enrichment: GameStartEnrichmentResult;
  applied: boolean;
  perfTrackerWritten: boolean;
  generatedAtUtc: string;
}): TrackerTemporalIntegrityReport {
  const before = computeTemporalIntegritySnapshot(input.rowsBeforeMutation);
  const after = computeTemporalIntegritySnapshot(input.rowsAfterMutation);
  const notes: string[] = [
    "gameStartTime must be ISO-parseable; invalid non-empty strings are not overwritten and count toward invalid_existing_game_start.",
    "Backfill order: legs CSV (leg_id), then legs JSON / oddsapi_today (deterministic; ambiguous → skip). OddsAPI snapshot rows do not expose per-market commence times here (fromSnapshotEvent = 0).",
    "Phase 67 snapshot implied recovery requires gameStartTime; more resolved rows with valid times can participate after this pass.",
  ];
  if (!input.applied) {
    notes.push("Dry-run: no write to data/perf_tracker.jsonl; use npm run backfill:tracker-start-times to persist.");
  } else if (!input.perfTrackerWritten) {
    notes.push("Apply pass: no rows backfilled this run — perf_tracker unchanged on disk.");
  }

  const deltaMissing = after.resolvedRowsMissingGameStartTime - before.resolvedRowsMissingGameStartTime;
  let impliedProbRecoveryOutlook =
    "Re-run npm run export:tracker-integrity or backfill:tracker-implied after persisting grounded gameStartTime values to measure impliedProb lift.";
  if (deltaMissing < 0) {
    impliedProbRecoveryOutlook =
      "Resolved rows missing gameStartTime decreased in this pass; Phase 67 snapshot-based impliedProb recovery can engage on more markets once odds/snapshot data align.";
  } else if (deltaMissing === 0 && input.enrichment.rowsBackfilledThisPass === 0) {
    impliedProbRecoveryOutlook =
      "No new grounded gameStartTime values this pass; impliedProb recovery unchanged unless other fields change.";
  }

  return {
    schemaVersion: TRACKER_TEMPORAL_SCHEMA_VERSION,
    generatedAtUtc: input.generatedAtUtc,
    applyPass: {
      applied: input.applied,
      perfTrackerWritten: input.perfTrackerWritten,
    },
    before,
    after,
    enrichment: input.enrichment,
    deltas: {
      resolvedRowsMissingGameStartTime: deltaMissing,
      overallGameStartCoverageRate: after.overallGameStartCoverageRate - before.overallGameStartCoverageRate,
      resolvedGameStartCoverageRate: after.resolvedGameStartCoverageRate - before.resolvedGameStartCoverageRate,
    },
    notes,
    impliedProbRecoveryOutlook,
  };
}

function renderMarkdown(report: TrackerTemporalIntegrityReport): string {
  const lines: string[] = [];
  lines.push("# Tracker temporal integrity (gameStartTime)");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push(`Schema: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(
    `- Apply: **${report.applyPass.applied ? "yes" : "no"}** (perf_tracker written: **${report.applyPass.perfTrackerWritten ? "yes" : "no"}**)`
  );
  lines.push(`- Total rows: ${report.before.totalRows}`);
  lines.push(`- Resolved rows: ${report.before.resolvedRows}`);
  lines.push("");
  lines.push("## Coverage (before → after)");
  lines.push("| Metric | Before | After | Δ |");
  lines.push("|---|---:|---:|---:|");
  lines.push(
    `| Rows with valid gameStartTime | ${report.before.rowsWithGameStartTime} | ${report.after.rowsWithGameStartTime} | ${report.after.rowsWithGameStartTime - report.before.rowsWithGameStartTime} |`
  );
  lines.push(
    `| Resolved with gameStartTime | ${report.before.resolvedRowsWithGameStartTime} | ${report.after.resolvedRowsWithGameStartTime} | ${report.after.resolvedRowsWithGameStartTime - report.before.resolvedRowsWithGameStartTime} |`
  );
  lines.push(
    `| Resolved missing gameStartTime | ${report.before.resolvedRowsMissingGameStartTime} | ${report.after.resolvedRowsMissingGameStartTime} | ${report.deltas.resolvedRowsMissingGameStartTime} |`
  );
  lines.push(
    `| Overall coverage rate | ${(report.before.overallGameStartCoverageRate * 100).toFixed(2)}% | ${(report.after.overallGameStartCoverageRate * 100).toFixed(2)}% | ${(report.deltas.overallGameStartCoverageRate * 100).toFixed(2)} pp |`
  );
  lines.push(
    `| Resolved coverage rate | ${(report.before.resolvedGameStartCoverageRate * 100).toFixed(2)}% | ${(report.after.resolvedGameStartCoverageRate * 100).toFixed(2)}% | ${(report.deltas.resolvedGameStartCoverageRate * 100).toFixed(2)} pp |`
  );
  lines.push("");
  lines.push("## Enrichment pass");
  lines.push("```json");
  lines.push(JSON.stringify(report.enrichment, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Source attribution (this pass)");
  lines.push("| Key | Count |");
  lines.push("|---|---:|");
  for (const [k, v] of Object.entries(report.enrichment.sourceAttribution)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push(`| fromSnapshotEvent | ${report.enrichment.fromSnapshotEvent} |`);
  lines.push("");
  lines.push("## Untimed rows — reason breakdown (after scan)");
  lines.push("| Reason | Count |");
  lines.push("|---|---:|");
  for (const [k, v] of Object.entries(report.enrichment.reasonBreakdownUntimed)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Phase 67 / impliedProb");
  lines.push(report.impliedProbRecoveryOutlook);
  lines.push("");
  lines.push("## Notes");
  for (const n of report.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function exportTrackerTemporalIntegrity(options?: { cwd?: string; apply?: boolean }): {
  jsonPath: string;
  mdPath: string;
  report: TrackerTemporalIntegrityReport;
} {
  const root = options?.cwd ?? process.cwd();
  const apply = options?.apply ?? process.argv.includes("--apply");

  const rowsLive = readTrackerRows();
  const rowsBeforeMutation = deepCloneRows(rowsLive);
  const rowsWorking = deepCloneRows(rowsLive);

  const enrichment = enrichTrackerGameStartTimes(rowsWorking, { rootDir: root, persist: apply });

  const perfTrackerWritten = apply && enrichment.rowsBackfilledThisPass > 0;
  const rowsAfterMutation =
    apply && enrichment.rowsBackfilledThisPass > 0 ? readTrackerRows() : rowsWorking;

  const report = buildTrackerTemporalIntegrityReport({
    rowsBeforeMutation,
    rowsAfterMutation,
    enrichment,
    applied: apply,
    perfTrackerWritten,
    generatedAtUtc: new Date().toISOString(),
  });

  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_tracker_temporal_integrity.json");
  const mdPath = path.join(outDir, "latest_tracker_temporal_integrity.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const apply = process.argv.includes("--apply");
  const { jsonPath, mdPath, report } = exportTrackerTemporalIntegrity({ apply });
  console.log(`[export:tracker-temporal-integrity] wrote ${jsonPath}`);
  console.log(`[export:tracker-temporal-integrity] wrote ${mdPath}`);
  console.log(
    `[export:tracker-temporal-integrity] resolved missing start ${report.before.resolvedRowsMissingGameStartTime} → ${report.after.resolvedRowsMissingGameStartTime} applied=${report.applyPass.applied}`
  );
}
