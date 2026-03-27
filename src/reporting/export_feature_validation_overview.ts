/**
 * Phase 108 — Consolidated feature validation / provenance overview (read-only; no optimizer).
 *
 * Composes existing report builders + optional on-disk Phase **105** / **107** artifacts — no duplicated classification logic.
 */

import fs from "fs";
import path from "path";
import {
  DEFAULT_FEATURE_VALIDATION_POLICY,
  normalizeFeatureValidationPolicy,
  type FeatureValidationPolicy,
} from "./feature_validation_export";
import { stableStringifyForObservability } from "./final_selection_observability";
import {
  buildFeatureValidationReplayReadinessReport,
  type FeatureValidationReplayReadinessReport,
} from "./export_feature_validation_replay_readiness";
import {
  buildLegsSnapshotAdoptionReport,
  formatLegsSnapshotAdoptionSummaryLine,
} from "./export_legs_snapshot_adoption";
import { formatTrackerSnapshotNewRowEnforcementSummaryLine } from "./export_tracker_snapshot_new_row_enforcement";
import type { BackfillPerfTrackerResult } from "../backfill_perf_tracker";
import { FEATURE_VALIDATION_POLICY_STATUS_JSON } from "./export_feature_validation_policy_status";

export const FEATURE_VALIDATION_OVERVIEW_JSON = path.join(
  "data",
  "reports",
  "latest_feature_validation_overview.json"
);
export const FEATURE_VALIDATION_OVERVIEW_MD = path.join(
  "data",
  "reports",
  "latest_feature_validation_overview.md"
);

export function resolveEffectiveFeatureValidationPolicy(): FeatureValidationPolicy {
  return (
    normalizeFeatureValidationPolicy(process.env.FEATURE_VALIDATION_POLICY) ?? DEFAULT_FEATURE_VALIDATION_POLICY
  );
}

function readLastExportPolicyFromArtifact(cwd: string): string | null {
  const p = path.join(cwd, FEATURE_VALIDATION_POLICY_STATUS_JSON);
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { policy?: string };
    return typeof j.policy === "string" && j.policy.trim() ? j.policy.trim() : null;
  } catch {
    return null;
  }
}

export type NewRowEnforcementSlice = {
  artifactPresent: true;
  appendedWithLegsSnapshotId: number;
  blockedMissingLegsSnapshotId: number;
  appendedWithoutLegsSnapshotIdOverride: number;
  escapeHatchEnabled: boolean;
  enforcementSummaryLine: string;
};

function readNewRowEnforcementFromArtifact(cwd: string): NewRowEnforcementSlice | null {
  const rel = path.join("data", "reports", "latest_tracker_snapshot_new_row_enforcement.json");
  const p = path.join(cwd, rel);
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as BackfillPerfTrackerResult & { summaryLine?: string };
    const slice: NewRowEnforcementSlice = {
      artifactPresent: true,
      appendedWithLegsSnapshotId: j.appendedWithLegsSnapshotId ?? 0,
      blockedMissingLegsSnapshotId: j.blockedMissingLegsSnapshotId ?? 0,
      appendedWithoutLegsSnapshotIdOverride: j.appendedWithoutLegsSnapshotIdOverride ?? 0,
      escapeHatchEnabled: Boolean(j.escapeHatchEnabled),
      enforcementSummaryLine:
        typeof j.summaryLine === "string" && j.summaryLine.trim()
          ? j.summaryLine.trim()
          : formatTrackerSnapshotNewRowEnforcementSummaryLine({
              appended: j.appended ?? 0,
              skipped: j.skipped ?? 0,
              blockedMissingLegsSnapshotId: j.blockedMissingLegsSnapshotId ?? 0,
              appendedWithLegsSnapshotId: j.appendedWithLegsSnapshotId ?? 0,
              appendedWithoutLegsSnapshotIdOverride: j.appendedWithoutLegsSnapshotIdOverride ?? 0,
              escapeHatchEnabled: Boolean(j.escapeHatchEnabled),
            }),
    };
    return slice;
  } catch {
    return null;
  }
}

export type FeatureValidationOverviewReport = {
  generatedAtUtc: string;
  trackerPath: string;
  effectivePolicy: FeatureValidationPolicy;
  /** From **`latest_feature_validation_policy_status.json`** when present. */
  lastExportPolicy: string | null;
  replayReadiness: {
    gradedRows: number;
    counts: FeatureValidationReplayReadinessReport["counts"];
    strictIneligibleBreakdown: FeatureValidationReplayReadinessReport["strictIneligibleBreakdown"];
    replayReadinessSummaryLine: string;
  };
  snapshotAdoption: {
    totalRows: number;
    rowsWithLegsSnapshotId: number;
    rowsWithoutLegsSnapshotId: number;
    gradedTotal: number;
    gradedWithLegsSnapshotId: number;
    gradedWithoutLegsSnapshotId: number;
    legacyUnsnapshottedRows: number;
    adoptionSummaryLine: string;
  };
  newRowEnforcement: NewRowEnforcementSlice | null;
  /** Deterministic (no timestamps); stable for operators and tests. */
  summaryLine: string;
};

export function formatFeatureValidationOverviewSummaryLine(r: FeatureValidationOverviewReport): string {
  const g = r.replayReadiness.gradedRows;
  const c = r.replayReadiness.counts;
  const a = r.snapshotAdoption;
  const en = r.newRowEnforcement;
  const blocked = en ? String(en.blockedMissingLegsSnapshotId) : "na";
  const overrideAppends = en ? String(en.appendedWithoutLegsSnapshotIdOverride) : "na";
  return (
    `feature_validation_overview policy=${r.effectivePolicy} graded=${g} ` +
    `replay_ready=${c.replayReadySnapshotBound}/${g} ` +
    `strict_eligible=${c.strictValidationEligible}/${g} ` +
    `missing_snapshot_dir=${c.snapshotBoundMissingSnapshotDir} ` +
    `legacy_wo_sid=${c.legacyWithoutSnapshotId} ` +
    `snap_rows_all=${a.rowsWithLegsSnapshotId}/${a.totalRows} ` +
    `snap_graded=${a.gradedWithLegsSnapshotId}/${a.gradedTotal} ` +
    `blocked_new_wo=${blocked} override_appends=${overrideAppends}`
  );
}

export type BuildFeatureValidationOverviewOptions = {
  cwd: string;
  trackerPath?: string;
};

export function buildFeatureValidationOverviewReport(
  opts: BuildFeatureValidationOverviewOptions
): FeatureValidationOverviewReport {
  const cwd = opts.cwd;
  const replay = buildFeatureValidationReplayReadinessReport({ cwd, trackerPath: opts.trackerPath });
  const adoption = buildLegsSnapshotAdoptionReport(cwd);
  const effectivePolicy = resolveEffectiveFeatureValidationPolicy();
  const lastExportPolicy = readLastExportPolicyFromArtifact(cwd);
  const newRowEnforcement = readNewRowEnforcementFromArtifact(cwd);

  const report: FeatureValidationOverviewReport = {
    generatedAtUtc: new Date().toISOString(),
    trackerPath: replay.trackerPath,
    effectivePolicy,
    lastExportPolicy,
    replayReadiness: {
      gradedRows: replay.gradedRows,
      counts: replay.counts,
      strictIneligibleBreakdown: replay.strictIneligibleBreakdown,
      replayReadinessSummaryLine: replay.summaryLine,
    },
    snapshotAdoption: {
      totalRows: adoption.totalRows,
      rowsWithLegsSnapshotId: adoption.rowsWithLegsSnapshotId,
      rowsWithoutLegsSnapshotId: adoption.rowsWithoutLegsSnapshotId,
      gradedTotal: adoption.gradedTotal,
      gradedWithLegsSnapshotId: adoption.gradedWithLegsSnapshotId,
      gradedWithoutLegsSnapshotId: adoption.gradedWithoutLegsSnapshotId,
      legacyUnsnapshottedRows: adoption.legacyUnsnapshottedRows,
      adoptionSummaryLine: formatLegsSnapshotAdoptionSummaryLine(adoption),
    },
    newRowEnforcement,
    summaryLine: "",
  };
  report.summaryLine = formatFeatureValidationOverviewSummaryLine(report);
  return report;
}

export function writeFeatureValidationOverviewArtifacts(opts: BuildFeatureValidationOverviewOptions): FeatureValidationOverviewReport {
  const report = buildFeatureValidationOverviewReport(opts);
  const cwd = opts.cwd;
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(cwd, FEATURE_VALIDATION_OVERVIEW_JSON);
  fs.writeFileSync(jsonPath, stableStringifyForObservability(report), "utf8");

  const mdPath = path.join(cwd, FEATURE_VALIDATION_OVERVIEW_MD);
  const lines: string[] = [
    "# Feature validation — overview (Phase 108)",
    "",
    `- **summary:** \`${report.summaryLine}\``,
    `- **effective_policy:** \`${report.effectivePolicy}\` (from \`FEATURE_VALIDATION_POLICY\` or default)`,
    `- **last_export_policy (artifact):** ${report.lastExportPolicy ? `\`${report.lastExportPolicy}\`` : "*none*"}`,
    `- **tracker:** \`${report.trackerPath}\``,
    "",
    "## Graded validation slice (Phase 106)",
    "",
    `- **graded_rows (deduped):** ${report.replayReadiness.gradedRows}`,
    `- **replay_ready_snapshot_bound:** ${report.replayReadiness.counts.replayReadySnapshotBound}`,
    `- **snapshot_bound_missing_snapshot_dir:** ${report.replayReadiness.counts.snapshotBoundMissingSnapshotDir}`,
    `- **strict_validation_eligible:** ${report.replayReadiness.counts.strictValidationEligible}`,
    `- **legacy_without_snapshot_id:** ${report.replayReadiness.counts.legacyWithoutSnapshotId}`,
    "",
    `\`${report.replayReadiness.replayReadinessSummaryLine}\``,
    "",
    "## Tracker snapshot adoption (Phase 104)",
    "",
    `- **rows_with_legsSnapshotId / total:** ${report.snapshotAdoption.rowsWithLegsSnapshotId}/${report.snapshotAdoption.totalRows}`,
    `- **graded_with_legsSnapshotId / graded_total:** ${report.snapshotAdoption.gradedWithLegsSnapshotId}/${report.snapshotAdoption.gradedTotal}`,
    "",
    `\`${report.snapshotAdoption.adoptionSummaryLine}\``,
    "",
    "## New-row enforcement (Phase 105 artifact)",
    "",
  ];
  if (report.newRowEnforcement) {
    lines.push(`\`${report.newRowEnforcement.enforcementSummaryLine}\``);
  } else {
    lines.push("*No `latest_tracker_snapshot_new_row_enforcement.json` — run backfill to refresh.*");
  }
  lines.push("");
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return report;
}
