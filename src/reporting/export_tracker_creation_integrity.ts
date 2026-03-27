/**
 * Writes data/reports/latest_tracker_creation_integrity.json and .md (Phase 69).
 */

import fs from "fs";
import path from "path";
import { readTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import {
  TRACKER_CREATION_SCHEMA_VERSION,
  computeCreationIntegritySnapshot,
  countPrimaryReasonsNonCreationCalibratableTagged,
  hasCreationTag,
  isCreationCalibratableRow,
} from "../tracking/tracker_creation_integrity_contract";

function aggregateCreationProvenance(rows: PerfTrackerRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!hasCreationTag(r) || !r.creationProvenance) continue;
    for (const [k, v] of Object.entries(r.creationProvenance)) {
      const key = `${k}=${v}`;
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

function computeInventoryCreationShape(rows: PerfTrackerRow[]): {
  totalRows: number;
  meetingCreationContract: number;
  meetingCreationContractRate: number;
} {
  const totalRows = rows.length;
  let meetingCreationContract = 0;
  for (const r of rows) {
    if (isCreationCalibratableRow(r)) meetingCreationContract++;
  }
  return {
    totalRows,
    meetingCreationContract,
    meetingCreationContractRate: totalRows === 0 ? 0 : meetingCreationContract / totalRows,
  };
}

export type TrackerCreationIntegrityReport = {
  schemaVersion: number;
  generatedAtUtc: string;
  creationTagged: ReturnType<typeof computeCreationIntegritySnapshot>;
  legacyRowsWithoutCreationTag: number;
  inventoryAllRows: ReturnType<typeof computeInventoryCreationShape>;
  primaryReasonBreakdownTaggedNonCalibratable: ReturnType<
    typeof countPrimaryReasonsNonCreationCalibratableTagged
  >;
  creationProvenanceAggregate: Record<string, number>;
  notes: string[];
};

function renderMarkdown(report: TrackerCreationIntegrityReport): string {
  const lines: string[] = [];
  lines.push("# Tracker creation-time integrity (Phase 69)");
  lines.push("");
  lines.push(`Generated: ${report.generatedAtUtc}`);
  lines.push(`Schema: ${report.schemaVersion}`);
  lines.push("");
  lines.push("## Creation-tagged rows (`creationTimestampUtc` present)");
  lines.push(`- rowsCreated: **${report.creationTagged.rowsCreated}**`);
  lines.push(`- rowsCreatedFullyCalibratable (creation contract): **${report.creationTagged.rowsCreatedFullyCalibratable}**`);
  lines.push(`- creationCalibratableRate: **${(report.creationTagged.creationCalibratableRate * 100).toFixed(2)}%**`);
  lines.push("");
  lines.push("| Field / rate | Coverage (tagged) |");
  lines.push("|---|---:|");
  lines.push(`| platform | ${(report.creationTagged.platformCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| gameStartTime (valid) | ${(report.creationTagged.gameStartCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| trueProb | ${(report.creationTagged.trueProbCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| implied or open-odds context | ${(report.creationTagged.impliedOrOpenContextCoverageRate * 100).toFixed(2)}% |`);
  lines.push(`| projectedEV | ${(report.creationTagged.projectedEvCoverageRate * 100).toFixed(2)}% |`);
  lines.push("");
  lines.push("## Legacy rows (no creation tag)");
  lines.push(`- Count: **${report.legacyRowsWithoutCreationTag}**`);
  lines.push("");
  lines.push("## Full inventory (all rows) — creation contract");
  lines.push(`- totalRows: **${report.inventoryAllRows.totalRows}**`);
  lines.push(`- meetingCreationContract: **${report.inventoryAllRows.meetingCreationContract}** (${(report.inventoryAllRows.meetingCreationContractRate * 100).toFixed(2)}%)`);
  lines.push("");
  lines.push("## Primary reason — tagged but not creation-calibratable");
  lines.push("| Reason | Count |");
  lines.push("|---|---:|");
  for (const [k, v] of Object.entries(report.primaryReasonBreakdownTaggedNonCalibratable)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Creation provenance aggregate (tagged rows)");
  lines.push("| key=value | Count |");
  lines.push("|---|---:|");
  for (const [k, v] of Object.entries(report.creationProvenanceAggregate).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Operator guidance");
  for (const n of report.notes) {
    lines.push(`- ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function buildTrackerCreationIntegrityReport(rows: PerfTrackerRow[], generatedAtUtc: string): TrackerCreationIntegrityReport {
  const tagged = rows.filter(hasCreationTag);
  const legacyRowsWithoutCreationTag = rows.length - tagged.length;
  const notes: string[] = [
    "Creation contract: platform (grounded), valid gameStartTime, trueProb, impliedProb or open-odds context, projectedEV.",
    "Backfill path (`buildPerfTrackerRowFromTierLeg`) sets creationTimestampUtc, creationSource, creationProvenance, selectionSnapshotTs from tier run.",
    "Preserve tier/legs CSV archives under data/tier_archive and data/legs_archive per existing repo practice so historical leg_id joins remain available.",
    "Rows without creationTimestampUtc are legacy; new appends from backfill should be tagged.",
  ];

  return {
    schemaVersion: TRACKER_CREATION_SCHEMA_VERSION,
    generatedAtUtc,
    creationTagged: computeCreationIntegritySnapshot(rows),
    legacyRowsWithoutCreationTag,
    inventoryAllRows: computeInventoryCreationShape(rows),
    primaryReasonBreakdownTaggedNonCalibratable: countPrimaryReasonsNonCreationCalibratableTagged(rows),
    creationProvenanceAggregate: aggregateCreationProvenance(rows),
    notes,
  };
}

export function exportTrackerCreationIntegrity(options?: { cwd?: string }): {
  jsonPath: string;
  mdPath: string;
  report: TrackerCreationIntegrityReport;
} {
  const root = options?.cwd ?? process.cwd();
  const rows = readTrackerRows();
  const report = buildTrackerCreationIntegrityReport(rows, new Date().toISOString());
  const outDir = path.join(root, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_tracker_creation_integrity.json");
  const mdPath = path.join(outDir, "latest_tracker_creation_integrity.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { jsonPath, mdPath, report };
}

if (require.main === module) {
  const { jsonPath, mdPath, report } = exportTrackerCreationIntegrity();
  console.log(`[export:tracker-creation-integrity] wrote ${jsonPath}`);
  console.log(`[export:tracker-creation-integrity] wrote ${mdPath}`);
  console.log(
    `[export:tracker-creation-integrity] tagged=${report.creationTagged.rowsCreated} creationCalibratableRate=${(report.creationTagged.creationCalibratableRate * 100).toFixed(2)}%`
  );
}
