/**
 * Odds snapshot health — deterministic coverage checks (merge diagnostics only; no merge matcher changes).
 */

import fs from "fs";
import path from "path";
import type { InternalPlayerPropOdds } from "../types";

export const DEFAULT_MIN_ROWS = 200;
export const DEFAULT_MAX_PLACEHOLDER_SHARE = 0.15;
export const DEFAULT_MIN_DISTINCT_STATS = 2;

/** Machine-readable failure codes (stable for operators / CI). */
export type OddsSnapshotHealthReason =
  | "row_count_below_min"
  | "placeholder_players_high"
  | "narrow_stat_breadth"
  | "snapshot_age_stale";

export interface OddsSnapshotHealthThresholds {
  minRows: number;
  maxPlaceholderPlayerShare: number;
  minDistinctStats: number;
  maxAgeMinutes: number;
}

export interface OddsSnapshotHealthChecks {
  rowCount: { ok: boolean; value: number; min: number };
  placeholderShare: { ok: boolean; value: number; max: number };
  distinctStats: { ok: boolean; value: number; min: number };
  staleAge: { ok: boolean; ageMinutes: number; maxMinutes: number };
}

export interface OddsSnapshotHealthReport {
  healthy: boolean;
  reasons: OddsSnapshotHealthReason[];
  checks: OddsSnapshotHealthChecks;
  summaryLines: string[];
}

const PLACEHOLDER_PLAYER_RE = /^\s*Player\s+\d+\s*$/i;

export function isPlaceholderPlayerName(player: string): boolean {
  return PLACEHOLDER_PLAYER_RE.test(player.trim());
}

function parseIntEnv(name: string, fallback: number, override?: number): number {
  if (override !== undefined && Number.isFinite(override)) return Math.floor(override);
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatEnv(name: string, fallback: number, override?: number): number {
  if (override !== undefined && Number.isFinite(override)) return override;
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve thresholds: env vars, optional overrides from OddsSnapshotManager.configure,
 * and stale age from oddsMaxAgeMin (CLI) or default stale window.
 */
export function resolveOddsSnapshotHealthThresholds(
  overrides: Partial<OddsSnapshotHealthThresholds> | undefined,
  oddsMaxAgeMin: number | undefined,
  staleDefaultMinutes: number,
): OddsSnapshotHealthThresholds {
  const minRows = parseIntEnv("ODDS_SNAPSHOT_HEALTH_MIN_ROWS", DEFAULT_MIN_ROWS, overrides?.minRows);
  const maxPlaceholderPlayerShare = parseFloatEnv(
    "ODDS_SNAPSHOT_HEALTH_MAX_PLACEHOLDER_SHARE",
    DEFAULT_MAX_PLACEHOLDER_SHARE,
    overrides?.maxPlaceholderPlayerShare,
  );
  const minDistinctStats = parseIntEnv(
    "ODDS_SNAPSHOT_HEALTH_MIN_DISTINCT_STATS",
    DEFAULT_MIN_DISTINCT_STATS,
    overrides?.minDistinctStats,
  );
  const maxAgeMinutes =
    overrides?.maxAgeMinutes !== undefined && Number.isFinite(overrides.maxAgeMinutes)
      ? overrides.maxAgeMinutes
      : oddsMaxAgeMin !== undefined && Number.isFinite(oddsMaxAgeMin)
        ? oddsMaxAgeMin
        : staleDefaultMinutes;

  return {
    minRows,
    maxPlaceholderPlayerShare,
    minDistinctStats,
    maxAgeMinutes,
  };
}

export function evaluateOddsSnapshotHealth(
  rows: InternalPlayerPropOdds[],
  ctx: { ageMinutes: number; thresholds: OddsSnapshotHealthThresholds },
): OddsSnapshotHealthReport {
  const { thresholds, ageMinutes } = ctx;
  const n = rows.length;
  const placeholderCount = rows.filter((r) => isPlaceholderPlayerName(r.player)).length;
  const placeholderShare = n === 0 ? 1 : placeholderCount / n;
  const distinctStats = new Set(rows.map((r) => r.stat)).size;

  const rowOk = n >= thresholds.minRows;
  const phOk = placeholderShare <= thresholds.maxPlaceholderPlayerShare;
  const statOk = distinctStats >= thresholds.minDistinctStats;
  const staleOk = ageMinutes <= thresholds.maxAgeMinutes;

  const reasons: OddsSnapshotHealthReason[] = [];
  if (!rowOk) reasons.push("row_count_below_min");
  if (!phOk) reasons.push("placeholder_players_high");
  if (!statOk) reasons.push("narrow_stat_breadth");
  if (!staleOk) reasons.push("snapshot_age_stale");

  const checks: OddsSnapshotHealthChecks = {
    rowCount: { ok: rowOk, value: n, min: thresholds.minRows },
    placeholderShare: { ok: phOk, value: placeholderShare, max: thresholds.maxPlaceholderPlayerShare },
    distinctStats: { ok: statOk, value: distinctStats, min: thresholds.minDistinctStats },
    staleAge: { ok: staleOk, ageMinutes, maxMinutes: thresholds.maxAgeMinutes },
  };

  const summaryLines: string[] = [
    `rows=${n} (min ${thresholds.minRows}) ${rowOk ? "ok" : "FAIL"}`,
    `placeholderShare=${placeholderShare.toFixed(3)} (max ${thresholds.maxPlaceholderPlayerShare}) ${phOk ? "ok" : "FAIL"}`,
    `distinctStats=${distinctStats} (min ${thresholds.minDistinctStats}) ${statOk ? "ok" : "FAIL"}`,
    `ageMinutes=${ageMinutes.toFixed(1)} (max ${thresholds.maxAgeMinutes}) ${staleOk ? "ok" : "FAIL"}`,
  ];

  return {
    healthy: reasons.length === 0,
    reasons,
    checks,
    summaryLines,
  };
}

export function getOddsSnapshotHealthPaths(root: string = process.cwd()): { json: string; md: string } {
  const dir = path.join(root, "data", "reports");
  return {
    json: path.join(dir, "latest_odds_snapshot_health.json"),
    md: path.join(dir, "latest_odds_snapshot_health.md"),
  };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function formatOddsSnapshotHealthMarkdown(
  snapshot: {
    snapshotId: string;
    fetchedAtUtc: string;
    refreshMode: string;
    source: string;
    rows: InternalPlayerPropOdds[];
  },
  health: OddsSnapshotHealthReport,
  meta: { configuredRefreshMode: string; evaluatedAtUtc: string },
): string {
  const status = health.healthy ? "HEALTHY" : "UNHEALTHY";
  const lines: string[] = [
    `# Odds snapshot health`,
    ``,
    `**Status:** **${status}**`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| EvaluatedAt (UTC) | ${meta.evaluatedAtUtc} |`,
    `| SnapshotId | ${snapshot.snapshotId} |`,
    `| FetchedAt (UTC) | ${snapshot.fetchedAtUtc} |`,
    `| Configured refreshMode | ${meta.configuredRefreshMode} |`,
    `| Effective refreshMode | ${snapshot.refreshMode} |`,
    `| Source | ${snapshot.source} |`,
    `| Rows analyzed | ${snapshot.rows.length} |`,
    ``,
  ];

  if (health.reasons.length > 0) {
    lines.push(`## Reasons`, ``);
    for (const r of health.reasons) {
      lines.push(`- \`${r}\``);
    }
    lines.push(``);
  }

  lines.push(`## Checks`, ``);
  const c = health.checks;
  lines.push(
    `| Check | Value | Threshold | OK |`,
    `| --- | --- | --- | --- |`,
    `| Row count | ${c.rowCount.value} | ≥ ${c.rowCount.min} | ${c.rowCount.ok ? "yes" : "no"} |`,
    `| Placeholder player share | ${(c.placeholderShare.value * 100).toFixed(1)}% | ≤ ${(c.placeholderShare.max * 100).toFixed(1)}% | ${c.placeholderShare.ok ? "yes" : "no"} |`,
    `| Distinct stats | ${c.distinctStats.value} | ≥ ${c.distinctStats.min} | ${c.distinctStats.ok ? "yes" : "no"} |`,
    `| Age (minutes) | ${c.staleAge.ageMinutes.toFixed(1)} | ≤ ${c.staleAge.maxMinutes} | ${c.staleAge.ok ? "yes" : "no"} |`,
    ``,
  );

  lines.push(`## Summary`, ``);
  for (const s of health.summaryLines) {
    lines.push(`- ${s}`);
  }
  lines.push(``);

  return lines.join("\n");
}

export function writeOddsSnapshotHealthArtifacts(
  snapshot: {
    snapshotId: string;
    fetchedAtUtc: string;
    refreshMode: string;
    source: string;
    rows: InternalPlayerPropOdds[];
  },
  health: OddsSnapshotHealthReport,
  meta: { configuredRefreshMode: string },
  root: string = process.cwd(),
): void {
  const paths = getOddsSnapshotHealthPaths(root);
  ensureDir(path.dirname(paths.json));
  const evaluatedAtUtc = new Date().toISOString();
  const payload = {
    evaluatedAtUtc,
    snapshotId: snapshot.snapshotId,
    fetchedAtUtc: snapshot.fetchedAtUtc,
    configuredRefreshMode: meta.configuredRefreshMode,
    effectiveRefreshMode: snapshot.refreshMode,
    source: snapshot.source,
    rowsAnalyzed: snapshot.rows.length,
    healthy: health.healthy,
    reasons: health.reasons,
    checks: health.checks,
    summaryLines: health.summaryLines,
  };
  fs.writeFileSync(paths.json, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(paths.md, formatOddsSnapshotHealthMarkdown(snapshot, health, { ...meta, evaluatedAtUtc }), "utf8");
}
