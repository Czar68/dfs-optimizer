/**
 * Phase 112 — Validation reporting dashboard sync freshness (read-only; no math).
 */

import fs from "fs";
import path from "path";
import { stableStringifyForObservability } from "./final_selection_observability";

export const VALIDATION_REPORTING_FRESHNESS_JSON = path.join(
  "data",
  "reports",
  "latest_validation_reporting_freshness.json"
);
export const VALIDATION_REPORTING_FRESHNESS_MD = path.join(
  "data",
  "reports",
  "latest_validation_reporting_freshness.md"
);

export type ValidationReportingFreshnessClassification = "fresh" | "stale" | "unknown";

export type ValidationReportingFreshnessPayload = {
  generatedAtUtc: string;
  /** When **`npm run refresh:validation-reporting`** last completed successfully (this file written right after). */
  lastValidationReportingRefreshUtc: string;
  repoOverviewRel: string;
  dashboardOverviewRel: string;
  repoOverviewMtimeUtc: string | null;
  dashboardOverviewMtimeUtc: string | null;
  classification: ValidationReportingFreshnessClassification;
  reason: string;
  summaryLine: string;
};

function mtimeUtcMs(abs: string): number | null {
  try {
    if (!fs.existsSync(abs)) return null;
    return fs.statSync(abs).mtimeMs;
  } catch {
    return null;
  }
}

function iso(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Compare repo vs dashboard copy of **`latest_feature_validation_overview.json`** mtimes.
 * **Stale** = dashboard missing or strictly older than repo (sync needed).
 */
export function classifyValidationReportingDashboardSync(opts: {
  repoMtimeMs: number | null;
  dashboardMtimeMs: number | null;
  repoExists: boolean;
  dashboardExists: boolean;
}): { classification: ValidationReportingFreshnessClassification; reason: string } {
  if (!opts.repoExists) {
    return { classification: "unknown", reason: "repo overview JSON missing" };
  }
  if (!opts.dashboardExists) {
    return { classification: "stale", reason: "dashboard copy missing — run sync:dashboard-reports" };
  }
  const r = opts.repoMtimeMs;
  const d = opts.dashboardMtimeMs;
  if (r == null || d == null) {
    return { classification: "unknown", reason: "could not read file mtimes" };
  }
  if (d < r) {
    return { classification: "stale", reason: "dashboard copy older than repo overview — run sync:dashboard-reports" };
  }
  return { classification: "fresh", reason: "dashboard copy matches or is newer than repo overview mtime" };
}

export function formatValidationReportingFreshnessSummaryLine(p: ValidationReportingFreshnessPayload): string {
  const rs = p.repoOverviewMtimeUtc ?? "na";
  const ds = p.dashboardOverviewMtimeUtc ?? "na";
  return `validation_reporting_freshness status=${p.classification} repo_m=${rs} dash_m=${ds}`;
}

export function buildValidationReportingFreshnessPayload(cwd: string): ValidationReportingFreshnessPayload {
  const repoRel = path.join("data", "reports", "latest_feature_validation_overview.json");
  const dashRel = path.join("web-dashboard", "public", "data", "reports", "latest_feature_validation_overview.json");
  const repoAbs = path.join(cwd, repoRel);
  const dashAbs = path.join(cwd, dashRel);
  const repoExists = fs.existsSync(repoAbs);
  const dashboardExists = fs.existsSync(dashAbs);
  const repoMtimeMs = mtimeUtcMs(repoAbs);
  const dashboardMtimeMs = mtimeUtcMs(dashAbs);
  const { classification, reason } = classifyValidationReportingDashboardSync({
    repoExists,
    dashboardExists,
    repoMtimeMs,
    dashboardMtimeMs,
  });
  const now = new Date().toISOString();
  const payload: ValidationReportingFreshnessPayload = {
    generatedAtUtc: now,
    lastValidationReportingRefreshUtc: now,
    repoOverviewRel: repoRel.replace(/\\/g, "/"),
    dashboardOverviewRel: dashRel.replace(/\\/g, "/"),
    repoOverviewMtimeUtc: iso(repoMtimeMs),
    dashboardOverviewMtimeUtc: iso(dashboardMtimeMs),
    classification,
    reason,
    summaryLine: "",
  };
  payload.summaryLine = formatValidationReportingFreshnessSummaryLine(payload);
  return payload;
}

export function writeValidationReportingFreshnessArtifacts(cwd: string): ValidationReportingFreshnessPayload {
  const outDir = path.join(cwd, "data", "reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const payload = buildValidationReportingFreshnessPayload(cwd);
  const jsonPath = path.join(cwd, VALIDATION_REPORTING_FRESHNESS_JSON);
  fs.writeFileSync(jsonPath, stableStringifyForObservability(payload), "utf8");
  const mdPath = path.join(cwd, VALIDATION_REPORTING_FRESHNESS_MD);
  const lines = [
    "# Validation reporting — dashboard freshness (Phase 112)",
    "",
    `- **summary:** \`${payload.summaryLine}\``,
    `- **classification:** ${payload.classification}`,
    `- **reason:** ${payload.reason}`,
    `- **last_validation_reporting_refresh_utc:** ${payload.lastValidationReportingRefreshUtc}`,
    `- **repo_overview_mtime_utc:** ${payload.repoOverviewMtimeUtc ?? "—"}`,
    `- **dashboard_overview_mtime_utc:** ${payload.dashboardOverviewMtimeUtc ?? "—"}`,
    "",
  ];
  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return payload;
}
