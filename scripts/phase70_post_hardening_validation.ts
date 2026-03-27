/**
 * Phase 70 — Run grounded backfill, regenerate integrity/calibration reports, write comparison artifact.
 * No optimizer execution; uses existing tier/legs inputs only.
 */

import fs from "fs";
import path from "path";
import { backfillPerfTracker } from "../src/backfill_perf_tracker";
import { exportCalibrationSurface } from "../src/reporting/export_calibration_surface";
import { exportTrackerCreationIntegrity } from "../src/reporting/export_tracker_creation_integrity";
import { exportTrackerIntegrity } from "../src/reporting/export_tracker_integrity";
import { exportTrackerTemporalIntegrity } from "../src/reporting/export_tracker_temporal_integrity";

const SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;

function readJson(p: string): Json {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Json;
}

function edgeUnavailableResolvedCount(cal: Json): number {
  const slices = cal.slices as { byEdgeBucket?: Array<{ sliceKey: string; sampleCount: number }> } | undefined;
  const row = slices?.byEdgeBucket?.find((s) => s.sliceKey === "edge_unavailable");
  return row?.sampleCount ?? 0;
}

function buildPhase70Report(
  root: string,
  backfill: { appended: number; skipped: number } & Record<string, unknown>
): Json {
  const reportsDir = path.join(root, "data", "reports");
  const creation = readJson(path.join(reportsDir, "latest_tracker_creation_integrity.json"));
  const temporal = readJson(path.join(reportsDir, "latest_tracker_temporal_integrity.json"));
  const integrity = readJson(path.join(reportsDir, "latest_tracker_integrity.json"));
  const calibration = readJson(path.join(reportsDir, "latest_calibration_surface.json"));

  const creationTagged = creation.creationTagged as Json;
  const afterTemp = temporal.after as Json;
  const afterInt = integrity.after as Json;
  const rowCounts = calibration.rowCounts as Json;

  const noNewRows = backfill.appended === 0;

  const blocker = noNewRows
    ? {
        code: "no_new_tier_leg_pairs",
        message:
          "Backfill found no new (date, leg_id) pairs: all tier1.csv / tier2.csv legs for their run dates already exist in data/perf_tracker.jsonl.",
        requiredInputs: [
          "Fresh optimizer output: data/output_logs/tier1.csv (or tier2) with runTimestamp + leg*n*Id columns, and matching prizepicks-legs.csv / underdog-legs.csv (or data/legs_archive) so loadLegsMap(leg_id) succeeds.",
        ],
        commandToRetry: "npx ts-node src/backfill_perf_tracker.ts",
        note: "Root tier1.csv / tier2.csv in this repo are already fully reflected in perf_tracker; tagged rows require new appends after Phase 69.",
      }
    : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    backfill,
    blocker,
    comparison: {
      creationTaggedRows: creationTagged.rowsCreated,
      creationCalibratableRateTagged: creationTagged.creationCalibratableRate,
      legacyWithoutCreationTag: creation.legacyRowsWithoutCreationTag,
      inventoryMeetingCreationContract: (creation.inventoryAllRows as Json).meetingCreationContract,
      inventoryCreationContractRate: (creation.inventoryAllRows as Json).meetingCreationContractRate,
      resolvedRows: afterInt.resolvedRows,
      resolvedRowsFullyCalibratable: afterInt.resolvedRowsFullyCalibratable,
      resolvedImpliedProbCoverageRate: afterInt.impliedProbCoverageRate,
      resolvedGameStartCoverageRate: afterTemp.resolvedGameStartCoverageRate,
      resolvedRowsWithGameStartTime: afterTemp.resolvedRowsWithGameStartTime,
      resolvedRowsMissingGameStartTime: afterTemp.resolvedRowsMissingGameStartTime,
      calibrationResolvedLegs: rowCounts.resolvedLegs,
      calibrationPredictedEdgeBasisSite: (calibration.slices as { bySite?: Array<{ predictedEdgeBasisCount?: number }> })
        .bySite?.[0]?.predictedEdgeBasisCount,
      calibrationEdgeUnavailableResolvedCount: edgeUnavailableResolvedCount(calibration),
    },
    prePostNote: noNewRows
      ? "No new rows appended; metrics match post-hardening inventory only (creation-tagged count remains 0 until a fresh tier+legs batch produces new keys)."
      : "Fresh tagged rows appended; compare this file to a prior phase70 artifact if archived.",
  };
}

function renderMarkdown(report: Json): string {
  const lines: string[] = [];
  lines.push("# Phase 70 — Post-hardening validation snapshot");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push("");
  const c = report.comparison as Json;
  lines.push("## Key metrics (after regeneration)");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---:|`);
  const bf = report.backfill as Json;
  lines.push(`| Backfill appended | ${bf.appended} |`);
  lines.push(`| Backfill skipped (duplicate date+leg) | ${bf.skipped} |`);
  if (typeof bf.blockedMissingLegsSnapshotId === "number") {
    lines.push(`| Backfill blocked (missing legsSnapshotId) | ${bf.blockedMissingLegsSnapshotId} |`);
  }
  if (typeof bf.appendedWithLegsSnapshotId === "number") {
    lines.push(`| Backfill appended with legsSnapshotId | ${bf.appendedWithLegsSnapshotId} |`);
  }
  lines.push(`| Creation-tagged rows | ${c.creationTaggedRows} |`);
  lines.push(`| Creation calibratable rate (tagged) | ${((c.creationCalibratableRateTagged as number) * 100).toFixed(2)}% |`);
  lines.push(`| Resolved fully calibratable | ${c.resolvedRowsFullyCalibratable} / ${c.resolvedRows} |`);
  lines.push(`| Resolved impliedProb coverage rate | ${((c.resolvedImpliedProbCoverageRate as number) * 100).toFixed(2)}% |`);
  lines.push(`| Resolved gameStart coverage rate | ${((c.resolvedGameStartCoverageRate as number) * 100).toFixed(2)}% |`);
  lines.push(`| Calibration edge_unavailable resolved legs | ${c.calibrationEdgeUnavailableResolvedCount} |`);
  lines.push("");
  lines.push("## Blocker (if any)");
  const b = report.blocker as Json | null;
  if (b) {
    lines.push(`- **${b.code}**: ${b.message}`);
    for (const x of (b.requiredInputs as string[]) ?? []) {
      lines.push(`  - Required: ${x}`);
    }
    lines.push(`- Retry: \`${b.commandToRetry}\``);
    lines.push(`- ${b.note}`);
  } else {
    lines.push("- None (new rows were appended).");
  }
  lines.push("");
  lines.push("## Note");
  lines.push(String(report.prePostNote));
  lines.push("");
  return lines.join("\n");
}

export function runPhase70Validation(root = process.cwd()): { jsonPath: string; mdPath: string; report: Json } {
  const backfill = backfillPerfTracker();
  exportTrackerCreationIntegrity({ cwd: root });
  exportTrackerTemporalIntegrity({ cwd: root });
  exportTrackerIntegrity({ cwd: root });
  exportCalibrationSurface({ cwd: root });

  const report = buildPhase70Report(root, backfill);
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_phase70_post_hardening_comparison.json");
  const mdPath = path.join(outDir, "latest_phase70_post_hardening_comparison.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath, report } = runPhase70Validation();
  console.log(`[phase70] wrote ${jsonPath}`);
  console.log(`[phase70] wrote ${mdPath}`);
  console.log(
    `[phase70] backfill appended=${(report.backfill as Json).appended} taggedRows=${(report.comparison as Json).creationTaggedRows}`
  );
}
