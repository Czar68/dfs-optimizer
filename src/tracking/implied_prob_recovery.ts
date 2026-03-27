/**
 * Phase 67 — Grounded implied probability and related field recovery for perf_tracker rows.
 * No EV math changes; only fills from row fields, legs CSV, or deterministic snapshot matching.
 * Phase 68 — Snapshot path still requires parseable gameStartTime; use legs_csv_index + temporal backfill for coverage.
 */

import path from "path";
import { americanToImpliedProb } from "../odds_math";
import { getOddsBucket } from "../odds_buckets";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { inferSide } from "../perf_tracker_types";
import { existingLegCsvPaths, loadLegsMap, type LegCsvRecord } from "./legs_csv_index";
import { deriveClvMetrics } from "./clv_math";
import { stableMarketId } from "./id_normalization";
import { loadSnapshots, type SnapshotIndexItem } from "./reconcile_closing_lines";
import { inferPlatformGrounded } from "./tracker_integrity_contract";

type SnapshotRowLike = {
  league?: string;
  player?: string;
  stat?: string;
  line?: number;
  overOdds?: number;
  underOdds?: number;
};

function chosenSideAmerican(row: SnapshotRowLike, side: "over" | "under"): number | undefined {
  const x = side === "over" ? row.overOdds : row.underOdds;
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function marketIdForSnapshotRow(row: SnapshotRowLike): string | null {
  if (!row.league || !row.player || !row.stat || typeof row.line !== "number") return null;
  return stableMarketId(row.league, row.player, row.stat, row.line);
}

/**
 * Earliest snapshot at or before game start that matches the market; chosen-side odds must be unique among candidates.
 * Differs from CLV close-line path (newest-first); used only when row/CSV lack odds.
 */
export function resolveEarliestPreStartChosenOdds(
  snapshots: SnapshotIndexItem[],
  params: {
    marketId?: string;
    league?: string;
    playerName: string;
    stat: string;
    line: number;
    side: "over" | "under";
    gameStartTime?: string | null;
  }
): { status: "matched" | "no_start" | "no_match" | "ambiguous"; oddsAmerican?: number } {
  if (!params.gameStartTime) return { status: "no_start" };
  const startMs = new Date(params.gameStartTime).getTime();
  if (!Number.isFinite(startMs)) return { status: "no_start" };

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.fetchedAtUtc).getTime() - new Date(b.fetchedAtUtc).getTime()
  );

  for (const snap of sorted) {
    const snapMs = new Date(snap.fetchedAtUtc).getTime();
    if (!Number.isFinite(snapMs) || snapMs > startMs) continue;

    const candidates = snap.rows.filter((r) => {
      if (typeof r.line !== "number") return false;
      if (Math.abs(r.line - params.line) > 1e-9) return false;
      if (String(r.stat || "").toLowerCase() !== String(params.stat).toLowerCase()) return false;

      const rowMid = marketIdForSnapshotRow(r);
      if (params.marketId && rowMid) return rowMid === params.marketId;

      return (
        String(r.player || "").toLowerCase() === params.playerName.toLowerCase() &&
        String(r.league || "").toLowerCase() === String(params.league || "NBA").toLowerCase()
      );
    });

    if (candidates.length === 0) continue;
    const oddsSet = new Set<number>();
    for (const c of candidates) {
      const o = chosenSideAmerican(c, params.side);
      if (o != null) oddsSet.add(o);
    }
    if (oddsSet.size === 0) continue;
    if (oddsSet.size > 1) return { status: "ambiguous" };
    return { status: "matched", oddsAmerican: Array.from(oddsSet)[0] };
  }
  return { status: "no_match" };
}

export type ImpliedDerivationSource =
  | "openImpliedProb"
  | "openOddsAmerican"
  | "overUnderSide"
  | "legs_csv_odds"
  | "snapshot_earliest_prestart";

export function tryDeriveImpliedProbFromRowFields(row: PerfTrackerRow): {
  implied: number;
  source: ImpliedDerivationSource;
} | null {
  if (typeof row.openImpliedProb === "number" && Number.isFinite(row.openImpliedProb)) {
    return { implied: row.openImpliedProb, source: "openImpliedProb" };
  }
  if (typeof row.openOddsAmerican === "number" && Number.isFinite(row.openOddsAmerican)) {
    return { implied: americanToImpliedProb(row.openOddsAmerican), source: "openOddsAmerican" };
  }
  const side = row.side ?? inferSide(row.leg_id);
  const o = side === "over" ? row.overOdds : row.underOdds;
  if (typeof o === "number" && Number.isFinite(o)) {
    return { implied: americanToImpliedProb(o), source: "overUnderSide" };
  }
  return null;
}

function mergeLegCsvOddsOnly(row: PerfTrackerRow, leg: LegCsvRecord): boolean {
  let touched = false;
  if (leg.overOdds != null && Number.isFinite(leg.overOdds) && row.overOdds == null) {
    row.overOdds = leg.overOdds;
    touched = true;
  }
  if (leg.underOdds != null && Number.isFinite(leg.underOdds) && row.underOdds == null) {
    row.underOdds = leg.underOdds;
    touched = true;
  }
  return touched;
}

function mergeLegCsvModelFields(row: PerfTrackerRow, leg: LegCsvRecord): { trueProb: boolean; ev: boolean } {
  let trueProb = false;
  let ev = false;
  if (!hasFinite(row.trueProb) && Number.isFinite(leg.trueProb)) {
    row.trueProb = leg.trueProb;
    trueProb = true;
  }
  if (!hasFinite(row.projectedEV) && Number.isFinite(leg.legEv)) {
    row.projectedEV = leg.legEv;
    row.playedEV = leg.legEv;
    ev = true;
  }
  return { trueProb, ev };
}

function hasFinite(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export type GroundedEnrichmentPassStats = {
  rowsScanned: number;
  impliedFilledFromOpenImpliedProb: number;
  impliedFilledFromOpenOddsAmerican: number;
  impliedFilledFromOverUnderSide: number;
  impliedFilledFromSnapshot: number;
  skippedSnapshotAmbiguous: number;
  skippedSnapshotNoGameStart: number;
  skippedSnapshotNoMatch: number;
  legsCsvMergedOdds: number;
  trueProbFilledFromLegsCsv: number;
  projectedEvFilledFromLegsCsv: number;
  platformFilledFromInference: number;
  openOddsAmericanFilledFromLegs: number;
  oddsBucketRecomputed: number;
};

export function applyGroundedTrackerEnrichment(
  rows: PerfTrackerRow[],
  options?: {
    rootDir?: string;
    snapshots?: SnapshotIndexItem[];
    snapshotsDir?: string;
  }
): { rows: PerfTrackerRow[]; stats: GroundedEnrichmentPassStats } {
  const root = options?.rootDir ?? process.cwd();
  const legPaths = existingLegCsvPaths(root);
  const legsMap = loadLegsMap(legPaths);
  const snapshots =
    options?.snapshots ??
    loadSnapshots(options?.snapshotsDir ?? path.join(root, "data", "odds_snapshots"));

  const stats: GroundedEnrichmentPassStats = {
    rowsScanned: rows.length,
    impliedFilledFromOpenImpliedProb: 0,
    impliedFilledFromOpenOddsAmerican: 0,
    impliedFilledFromOverUnderSide: 0,
    impliedFilledFromSnapshot: 0,
    skippedSnapshotAmbiguous: 0,
    skippedSnapshotNoGameStart: 0,
    skippedSnapshotNoMatch: 0,
    legsCsvMergedOdds: 0,
    trueProbFilledFromLegsCsv: 0,
    projectedEvFilledFromLegsCsv: 0,
    platformFilledFromInference: 0,
    openOddsAmericanFilledFromLegs: 0,
    oddsBucketRecomputed: 0,
  };

  for (const row of rows) {
    if (!row.platform) {
      const p = inferPlatformGrounded(row);
      if (p) {
        row.platform = p;
        stats.platformFilledFromInference += 1;
      }
    }

    const leg = legsMap.get(row.leg_id);
    if (leg) {
      const m = mergeLegCsvModelFields(row, leg);
      if (m.trueProb) stats.trueProbFilledFromLegsCsv += 1;
      if (m.ev) stats.projectedEvFilledFromLegsCsv += 1;
      if (mergeLegCsvOddsOnly(row, leg)) {
        stats.legsCsvMergedOdds += 1;
      }
      const side = row.side ?? inferSide(row.leg_id);
      const openAm =
        side === "over"
          ? row.overOdds != null && Number.isFinite(row.overOdds)
            ? row.overOdds
            : undefined
          : row.underOdds != null && Number.isFinite(row.underOdds)
            ? row.underOdds
            : undefined;
      if (openAm != null && row.openOddsAmerican == null) {
        row.openOddsAmerican = openAm;
        stats.openOddsAmericanFilledFromLegs += 1;
      }
      if (row.openImpliedProb == null && openAm != null) {
        row.openImpliedProb = americanToImpliedProb(openAm);
      }
    }

    if (!hasFinite(row.impliedProb)) {
      const d0 = tryDeriveImpliedProbFromRowFields(row);
      if (d0) {
        row.impliedProb = d0.implied;
        if (d0.source === "openImpliedProb") stats.impliedFilledFromOpenImpliedProb += 1;
        else if (d0.source === "openOddsAmerican") stats.impliedFilledFromOpenOddsAmerican += 1;
        else if (d0.source === "overUnderSide") stats.impliedFilledFromOverUnderSide += 1;
      }
    }

    if (!hasFinite(row.impliedProb)) {
      const side = row.side ?? inferSide(row.leg_id);
      const marketId = row.marketId ?? stableMarketId("NBA", row.player, row.stat, row.line);
      const snap = resolveEarliestPreStartChosenOdds(snapshots, {
        marketId,
        league: "NBA",
        playerName: row.player,
        stat: row.stat,
        line: row.line,
        side,
        gameStartTime: row.gameStartTime ?? null,
      });
      if (snap.status === "matched" && snap.oddsAmerican != null) {
        row.openOddsAmerican = row.openOddsAmerican ?? snap.oddsAmerican;
        const imp = americanToImpliedProb(snap.oddsAmerican);
        row.openImpliedProb = row.openImpliedProb ?? imp;
        row.impliedProb = imp;
        stats.impliedFilledFromSnapshot += 1;
      } else if (snap.status === "ambiguous") stats.skippedSnapshotAmbiguous += 1;
      else if (snap.status === "no_start") stats.skippedSnapshotNoGameStart += 1;
      else stats.skippedSnapshotNoMatch += 1;
    }

    if (
      hasFinite(row.impliedProb) &&
      row.overOdds != null &&
      row.underOdds != null &&
      !row.oddsBucket
    ) {
      const side = row.side ?? inferSide(row.leg_id);
      const bucket = getOddsBucket(row.overOdds, row.underOdds, side);
      if (bucket) {
        row.oddsBucket = bucket;
        stats.oddsBucketRecomputed += 1;
      }
    }

    if (hasFinite(row.impliedProb) && !hasFinite(row.openImpliedProb)) {
      row.openImpliedProb = row.impliedProb;
    }

    if (hasFinite(row.openImpliedProb) && hasFinite(row.closeImpliedProb)) {
      const clv = deriveClvMetrics(row.openImpliedProb, row.closeImpliedProb);
      if (clv.clvDelta != null) row.clvDelta = clv.clvDelta;
      if (clv.clvPct != null) row.clvPct = clv.clvPct;
    }
  }

  return { rows, stats };
}
