/**
 * Phase 68 — Temporal integrity contract + grounded gameStartTime enrichment.
 * No EV math; deterministic sources only.
 */

import { writeTrackerRows } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { existingLegCsvPaths, loadLegsMap } from "./legs_csv_index";
import { loadStartTimeCandidates, makeMarketKey, pickCandidate } from "./tracker_start_time_sources";

export const TRACKER_TEMPORAL_SCHEMA_VERSION = 1;

export function isValidGameStartTime(s: string | null | undefined): boolean {
  if (s == null || typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms);
}

export interface TemporalIntegritySnapshot {
  totalRows: number;
  resolvedRows: number;
  rowsWithGameStartTime: number;
  resolvedRowsWithGameStartTime: number;
  resolvedRowsMissingGameStartTime: number;
  overallGameStartCoverageRate: number;
  resolvedGameStartCoverageRate: number;
}

export function computeTemporalIntegritySnapshot(rows: PerfTrackerRow[]): TemporalIntegritySnapshot {
  const totalRows = rows.length;
  const resolved = rows.filter((r) => r.result === 0 || r.result === 1);
  const resolvedRows = resolved.length;
  let rowsWithGameStartTime = 0;
  let resolvedRowsWithGameStartTime = 0;
  for (const r of rows) {
    if (isValidGameStartTime(r.gameStartTime)) rowsWithGameStartTime++;
  }
  for (const r of resolved) {
    if (isValidGameStartTime(r.gameStartTime)) resolvedRowsWithGameStartTime++;
  }
  const resolvedRowsMissingGameStartTime = resolvedRows - resolvedRowsWithGameStartTime;
  return {
    totalRows,
    resolvedRows,
    rowsWithGameStartTime,
    resolvedRowsWithGameStartTime,
    resolvedRowsMissingGameStartTime,
    overallGameStartCoverageRate: totalRows === 0 ? 0 : rowsWithGameStartTime / totalRows,
    resolvedGameStartCoverageRate: resolvedRows === 0 ? 0 : resolvedRowsWithGameStartTime / resolvedRows,
  };
}

export type GameStartSourceKey = "from_legs_csv" | "from_legs_json" | "from_oddsapi_today";

export type GameStartEnrichmentResult = {
  rowsScanned: number;
  rowsAlreadyTimed: number;
  skippedInvalidExisting: number;
  rowsBackfilledThisPass: number;
  rowsStillUntimed: number;
  /** Aggregated category counts (reporting). */
  sourceAttribution: Record<string, number>;
  /** Per-file or per-source keys compatible with legacy enrichExistingTrackerStartTimes sourceCounts. */
  legacySourceCounts: Record<string, number>;
  skippedConflicting: number;
  skippedNoCandidate: number;
  /** OddsAPI snapshot rows do not carry per-market commence times in this repo — always 0. */
  fromSnapshotEvent: 0;
  reasonBreakdownUntimed: {
    invalid_existing_game_start: number;
    ambiguous_or_conflicting_candidates: number;
    no_grounded_source: number;
  };
};

function sourceKeyFromCandidateSource(fileBase: string): GameStartSourceKey | null {
  if (fileBase === "oddsapi_today.json") return "from_oddsapi_today";
  if (/\.json$/i.test(fileBase)) return "from_legs_json";
  return null;
}

/**
 * Fills missing gameStartTime from: legs CSV (leg_id), then legs JSON / oddsapi_today (same rules as legacy enrich).
 * Preserves any non-empty existing string without overwrite; invalid parse is left untouched and skipped.
 */
export function enrichTrackerGameStartTimes(
  rows: PerfTrackerRow[],
  options: { rootDir: string; persist?: boolean }
): GameStartEnrichmentResult {
  const root = options.rootDir;
  const persist = options.persist ?? false;
  const legsMap = loadLegsMap(existingLegCsvPaths(root));
  const candidates = loadStartTimeCandidates(root);

  const sourceAttribution: Record<string, number> = {
    from_legs_csv: 0,
    from_legs_json: 0,
    from_oddsapi_today: 0,
  };
  const legacySourceCounts: Record<string, number> = {};
  const bumpLegacy = (key: string) => {
    legacySourceCounts[key] = (legacySourceCounts[key] ?? 0) + 1;
  };
  let rowsAlreadyTimed = 0;
  let skippedInvalidExisting = 0;
  let rowsBackfilledThisPass = 0;
  let skippedConflicting = 0;
  let skippedNoCandidate = 0;
  const conflictLegIds = new Set<string>();
  const noCandidateLegIds = new Set<string>();

  for (const row of rows) {
    const hasExisting = typeof row.gameStartTime === "string" && row.gameStartTime.trim().length > 0;
    if (hasExisting) {
      if (isValidGameStartTime(row.gameStartTime)) {
        rowsAlreadyTimed += 1;
      } else {
        skippedInvalidExisting += 1;
      }
      continue;
    }

    const leg = legsMap.get(row.leg_id);
    if (leg?.gameStartTime && isValidGameStartTime(leg.gameStartTime)) {
      row.gameStartTime = leg.gameStartTime.trim();
      if (!row.team && leg.team) row.team = leg.team;
      if (!row.opponent && leg.opponent) row.opponent = leg.opponent;
      sourceAttribution.from_legs_csv += 1;
      bumpLegacy("legs_csv");
      rowsBackfilledThisPass += 1;
      continue;
    }

    const byId = candidates.byLegId.get(row.leg_id) ?? [];
    const byMarket = candidates.byMarketKey.get(makeMarketKey(row.player, row.stat, row.line)) ?? [];
    const directPick = pickCandidate(byId);
    const marketPick = pickCandidate(byMarket);
    const chosen = directPick ?? marketPick;
    const hasConflict = (byId.length > 0 && !directPick) || (!directPick && byMarket.length > 0 && !marketPick);
    if (hasConflict) {
      skippedConflicting += 1;
      conflictLegIds.add(row.leg_id);
      continue;
    }
    if (!chosen) {
      skippedNoCandidate += 1;
      noCandidateLegIds.add(row.leg_id);
      continue;
    }

    const sk = sourceKeyFromCandidateSource(chosen.source);
    if (sk === "from_oddsapi_today") sourceAttribution.from_oddsapi_today += 1;
    else sourceAttribution.from_legs_json += 1;
    bumpLegacy(chosen.source);

    row.gameStartTime = chosen.gameStartTime;
    if (!row.team && chosen.team) row.team = chosen.team;
    if (!row.opponent && chosen.opponent) row.opponent = chosen.opponent;
    rowsBackfilledThisPass += 1;
  }

  let rowsStillUntimed = 0;
  const reasonBreakdownUntimed = {
    invalid_existing_game_start: 0,
    ambiguous_or_conflicting_candidates: 0,
    no_grounded_source: 0,
  };

  for (const row of rows) {
    if (isValidGameStartTime(row.gameStartTime)) continue;
    rowsStillUntimed += 1;
    const hasExisting = typeof row.gameStartTime === "string" && row.gameStartTime.trim().length > 0;
    if (hasExisting) {
      reasonBreakdownUntimed.invalid_existing_game_start += 1;
    } else if (conflictLegIds.has(row.leg_id)) {
      reasonBreakdownUntimed.ambiguous_or_conflicting_candidates += 1;
    } else if (noCandidateLegIds.has(row.leg_id)) {
      reasonBreakdownUntimed.no_grounded_source += 1;
    } else {
      reasonBreakdownUntimed.no_grounded_source += 1;
    }
  }

  if (persist && rowsBackfilledThisPass > 0) {
    writeTrackerRows(rows);
  }

  return {
    rowsScanned: rows.length,
    rowsAlreadyTimed,
    skippedInvalidExisting,
    rowsBackfilledThisPass,
    rowsStillUntimed,
    sourceAttribution,
    legacySourceCounts,
    skippedConflicting,
    skippedNoCandidate,
    fromSnapshotEvent: 0,
    reasonBreakdownUntimed,
  };
}

/** Maps Phase 68 result to legacy enrichExistingTrackerStartTimes return shape. */
export function toLegacyEnrichStats(r: GameStartEnrichmentResult): {
  scanned: number;
  enriched: number;
  skippedExisting: number;
  skippedNoCandidate: number;
  skippedConflicting: number;
  sourceCounts: Record<string, number>;
} {
  return {
    scanned: r.rowsScanned,
    enriched: r.rowsBackfilledThisPass,
    skippedExisting: r.rowsAlreadyTimed + r.skippedInvalidExisting,
    skippedNoCandidate: r.skippedNoCandidate,
    skippedConflicting: r.skippedConflicting,
    sourceCounts: { ...r.legacySourceCounts },
  };
}
