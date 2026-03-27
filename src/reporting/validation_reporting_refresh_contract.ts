/**
 * Phase 110 — SSOT ordering for **`npm run refresh:validation-reporting`** (read-only exports + dashboard sync).
 */

export type ValidationReportingRefreshStep = {
  /** Stable id for operator logs / tests. */
  id: string;
  /** **`package.json`** **`scripts`** key — must exist. */
  npmScript: string;
};

/**
 * Order matters: replay + adoption artifacts for drill-down, then overview (embeds live builders), then dashboard sync.
 */
export const VALIDATION_REPORTING_REFRESH_STEPS: readonly ValidationReportingRefreshStep[] = [
  { id: "replay_readiness", npmScript: "export:feature-validation-replay-readiness" },
  { id: "legs_snapshot_adoption", npmScript: "export:legs-snapshot-adoption" },
  { id: "feature_validation_overview", npmScript: "export:feature-validation-overview" },
  { id: "sync_dashboard_reports", npmScript: "sync:dashboard-reports" },
] as const;
