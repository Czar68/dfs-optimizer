/**
 * Phase 112 — Browser-safe parse for **`latest_validation_reporting_freshness.json`**.
 */

export type ValidationReportingFreshnessClassification = "fresh" | "stale" | "unknown";

export type ValidationReportingFreshnessDashboard = {
  classification: ValidationReportingFreshnessClassification
  lastValidationReportingRefreshUtc: string
  reason: string
  summaryLine: string
  repoOverviewMtimeUtc: string | null
  dashboardOverviewMtimeUtc: string | null
}

export function parseValidationReportingFreshnessJson(
  raw: unknown
): ValidationReportingFreshnessDashboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const c = o.classification;
  if (c !== "fresh" && c !== "stale" && c !== "unknown") return null;
  const last = o.lastValidationReportingRefreshUtc;
  if (typeof last !== "string" || !last.trim()) return null;
  const reason = o.reason;
  if (typeof reason !== "string") return null;
  const summaryLine = o.summaryLine;
  if (typeof summaryLine !== "string") return null;
  const r = o.repoOverviewMtimeUtc;
  const d = o.dashboardOverviewMtimeUtc;
  const repoOverviewMtimeUtc =
    r === null ? null : typeof r === "string" && r.trim() ? r.trim() : null;
  const dashboardOverviewMtimeUtc =
    d === null ? null : typeof d === "string" && d.trim() ? d.trim() : null;
  return {
    classification: c,
    lastValidationReportingRefreshUtc: last.trim(),
    reason,
    summaryLine,
    repoOverviewMtimeUtc,
    dashboardOverviewMtimeUtc,
  };
}
