/**
 * Phase 69 — Deterministic perf_tracker row construction from tier CSV + legs CSV (backfill path).
 * No EV math changes; only field threading + provenance.
 */

import type { LegCsvRecord } from "./legs_csv_index";
import type { PerfTrackerRow } from "../perf_tracker_types";
import { inferSide } from "../perf_tracker_types";
import { americanToImpliedProb } from "../odds_math";
import { getOddsBucket } from "../odds_buckets";
import { deriveClvMetrics } from "./clv_math";
import { normalizeStatToken, stableMarketId, stablePlayerId } from "./id_normalization";
import { isValidGameStartTime } from "./tracker_temporal_integrity";
import { CREATION_SOURCE_BACKFILL, resolvePlatformForBackfill } from "./tracker_creation_integrity_contract";

export type TierLegBuildInput = {
  date: string;
  legId: string;
  leg: LegCsvRecord;
  siteColumnPresent: boolean;
  siteRawUpper: string;
  structure: string;
  kellyFrac: number;
  cardTier: number;
  runTimestamp: string;
  /** Phase 102 — from **`loadRunTimestampToLegsSnapshotId`** when archive meta matches tier **`runTimestamp`**. */
  legsSnapshotId?: string;
  /**
   * Phase 105 — escape hatch only: append without resolved **`legsSnapshotId`**.
   * Sets **`creationProvenance.legsSnapshotAppend`** = **`override_without_snapshot_id`** (never silent).
   */
  appendWithoutSnapshotOverride?: boolean;
};

function platformProvenanceKey(siteColumnPresent: boolean, siteRawUpper: string): string {
  const s = siteRawUpper.trim();
  if (siteColumnPresent && (s === "UD" || s === "UNDERDOG" || s === "PP" || s === "PRIZEPICKS" || s === "PRIZE_PICKS")) {
    return "tier_csv_site";
  }
  if (siteColumnPresent && s.length > 0) return "tier_csv_site";
  return "leg_id_inference";
}

/**
 * Single source of truth for backfill appends; used by `backfillPerfTracker` and tests.
 */
export function buildPerfTrackerRowFromTierLeg(input: TierLegBuildInput): PerfTrackerRow {
  const { leg, legId, date, siteColumnPresent, siteRawUpper } = input;
  const platformResolved = resolvePlatformForBackfill(siteColumnPresent, siteRawUpper, legId);
  const side = inferSide(legId);
  const overOdds = leg.overOdds;
  const underOdds = leg.underOdds;
  const openOddsAmerican =
    side === "over"
      ? overOdds != null && Number.isFinite(overOdds)
        ? overOdds
        : undefined
      : underOdds != null && Number.isFinite(underOdds)
        ? underOdds
        : undefined;
  const openImpliedProb =
    openOddsAmerican != null ? americanToImpliedProb(openOddsAmerican) : undefined;
  const impliedProb = openImpliedProb;
  const oddsBucket =
    overOdds != null && underOdds != null ? getOddsBucket(overOdds, underOdds, side) : undefined;
  const league = leg.league || "NBA";
  const playerId = stablePlayerId(league, leg.player);
  const marketId = stableMarketId(league, leg.player, leg.stat, leg.line);
  const statNormalized = normalizeStatToken(leg.stat);
  const clv = deriveClvMetrics(openImpliedProb, undefined);

  const gameStartTime =
    leg.gameStartTime && isValidGameStartTime(leg.gameStartTime) ? leg.gameStartTime.trim() : undefined;

  const creationTimestampUtc = new Date().toISOString();
  const creationProvenance: Record<string, string> = {
    platform: platformProvenanceKey(siteColumnPresent, siteRawUpper),
    gameStartTime: gameStartTime ? "legs_csv" : "missing",
    trueProb: "legs_csv",
    projectedEV: "legs_csv",
    impliedProb:
      impliedProb != null && Number.isFinite(impliedProb)
        ? "legs_csv_open_odds_derived"
        : hasImpliedOrOpenOddsFromLeg(leg, side)
          ? "legs_csv_over_under"
          : "missing",
  };
  if (input.appendWithoutSnapshotOverride) {
    creationProvenance.legsSnapshotAppend = "override_without_snapshot_id";
  }

  const row: PerfTrackerRow = {
    date,
    leg_id: legId,
    player: leg.player,
    stat: leg.stat,
    line: leg.line,
    book: leg.book,
    trueProb: leg.trueProb,
    projectedEV: leg.legEv,
    playedEV: leg.legEv,
    kelly: input.kellyFrac,
    card_tier: input.cardTier,
    result: undefined,
    scrape_stat: undefined,
    hist_mult: undefined,
    overOdds: overOdds ?? undefined,
    underOdds: underOdds ?? undefined,
    side,
    impliedProb: impliedProb ?? undefined,
    oddsBucket: oddsBucket ?? undefined,
    platform: platformResolved,
    structure: input.structure || undefined,
    playerId,
    marketId,
    statNormalized,
    openOddsAmerican,
    openImpliedProb,
    clvDelta: clv.clvDelta,
    clvPct: clv.clvPct,
    gameStartTime,
    team: leg.team ?? undefined,
    opponent: leg.opponent ?? undefined,
    selectionSnapshotTs: input.runTimestamp.trim() || undefined,
    creationTimestampUtc,
    creationSource: CREATION_SOURCE_BACKFILL,
    creationProvenance,
    legsSnapshotId: input.legsSnapshotId,
  };

  return row;
}

function hasImpliedOrOpenOddsFromLeg(leg: LegCsvRecord, side: "over" | "under"): boolean {
  const o = side === "over" ? leg.overOdds : leg.underOdds;
  return typeof o === "number" && Number.isFinite(o);
}
