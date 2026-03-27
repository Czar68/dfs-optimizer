/**
 * Phase 81 / 109 / 114 — SSOT for **`scripts/sync_dashboard_reports.ts`** file lists (avoid drift).
 */

export const DASHBOARD_SYNC_REQUIRED_FILES = [
  "latest_run_status.json",
  "latest_pre_diversification_card_diagnosis.json",
  "latest_card_ev_viability.json",
  "latest_historical_feature_registry.json",
] as const;

export const DASHBOARD_SYNC_OPTIONAL_FILES = [
  "latest_feature_validation_overview.json",
  "latest_validation_reporting_freshness.json",
  /** Phase 115 — live merge / degraded-input operator strip (read-only copies). */
  "merge_quality_status.json",
  "merge_platform_quality_by_pass.json",
  /** Phase 116 — full merge quality + freshness block (optional; enriches dashboard panel). */
  "latest_merge_quality.json",
  /** Phase 117 — optimizer edge quality audit (optional; sync for dashboard strip + explainability). */
  "latest_optimizer_edge_quality.json",
  /** Phase 118 — historical/contextual feature coverage inventory (optional). */
  "latest_historical_feature_coverage_audit.json",
] as const;
