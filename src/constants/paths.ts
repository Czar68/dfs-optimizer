/**
 * Centralized path management for pipeline outputs and artifacts.
 * All file-writing and reading of pipeline CSVs/JSONs should use these helpers.
 * Single source of truth: change folder names here only.
 */

import path from "path";

/** Directory under project root for optimizer outputs (legs, cards, tiers, merge reports). */
export const OUTPUT_DIR = "data/output_logs";

/** Directory for run metadata and logs. */
export const ARTIFACTS_DIR = "artifacts";

/** Directory for data files (top_legs, tracking, perf_tracker, etc.). */
export const DATA_DIR = "data";

/** Subdir for artifact logs. */
export const ARTIFACTS_LOGS_DIR = "artifacts/logs";

// ─── Output filenames (under OUTPUT_DIR) ───────────────────────────────────
export const PP_LEGS_CSV = "prizepicks-legs.csv";
export const PP_CARDS_CSV = "prizepicks-cards.csv";
export const PP_LEGS_JSON = "prizepicks-legs.json";
export const PP_CARDS_JSON = "prizepicks-cards.json";
export const UD_LEGS_CSV = "underdog-legs.csv";
export const UD_CARDS_CSV = "underdog-cards.csv";
export const UD_LEGS_JSON = "underdog-legs.json";
export const UD_CARDS_JSON = "underdog-cards.json";
export const PP_INNOVATIVE_CSV = "prizepicks-innovative-cards.csv";
export const EDGE_CLUSTERS_JSON = "edge-clusters.json";
export const STAT_BALANCE_RADAR_SVG = "stat-balance-radar.svg";
export const TIER1_CSV = "tier1.csv";
export const TIER2_CSV = "tier2.csv";
export const PARLAYS_CSV = "parlays.csv";
export const MERGE_REPORT_CSV = "merge_report.csv";
export const PP_IMPORTED_CSV = "prizepicks_imported.csv";
export const UD_IMPORTED_CSV = "underdog_imported.csv";
export const ODDSAPI_IMPORTED_CSV = "oddsapi_imported.csv";
/** Line movement sidecar for dashboard (leg_id, player, stat, delta, category, priorLine, currentLine, priorRunTs). */
export const LINE_MOVEMENT_CSV = "line_movement.csv";

/** Artifact filenames (under ARTIFACTS_DIR). */
export const LAST_RUN_JSON = "last_run.json";

/** Data filenames (under DATA_DIR). */
export const TOP_LEGS_JSON = "top_legs.json";

/** Canonical NBA/MLB prop warehouse paths (under DATA_DIR). Single source of truth for append/validate/audit. */
export const NBA_PROPS_MASTER_CSV = "prop_history/nba_props_master.csv";
export const MLB_PROPS_MASTER_CSV = "prop_history/mlb_props_master.csv";

/** Prop warehouse audit artifact (under ARTIFACTS_DIR). */
export const PROP_WAREHOUSE_AUDIT_JSON = "prop-warehouse-audit.json";

/**
 * Resolve project root. When running from dist, __dirname is dist/src; when running from ts-node, cwd is typically root.
 * Prefer explicit root when available (e.g. server uses path.join(__dirname, "..")).
 */
function defaultRoot(): string {
  return process.cwd();
}

/**
 * Full path to a file under OUTPUT_DIR.
 * @param filename - Basename (e.g. PP_LEGS_CSV)
 * @param root - Project root; defaults to process.cwd()
 */
export function getOutputPath(filename: string, root: string = defaultRoot()): string {
  return path.join(root, OUTPUT_DIR, filename);
}

/**
 * Full path to the output directory.
 */
export function getOutputDir(root: string = defaultRoot()): string {
  return path.join(root, OUTPUT_DIR);
}

/**
 * Full path to a file under ARTIFACTS_DIR.
 */
export function getArtifactsPath(filename: string, root: string = defaultRoot()): string {
  return path.join(root, ARTIFACTS_DIR, filename);
}

/**
 * Full path to a file under DATA_DIR.
 */
export function getDataPath(filename: string, root: string = defaultRoot()): string {
  return path.join(root, DATA_DIR, filename);
}
