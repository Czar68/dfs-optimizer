/**
 * Phase 69 — Creation-time completeness for new perf_tracker rows (no EV math).
 * Rows are "creation-tagged" when `creationTimestampUtc` is present (Phase 69+ appends).
 */

import type { PerfTrackerRow } from "../perf_tracker_types";
import { inferSide } from "../perf_tracker_types";
import {
  hasFiniteImpliedProb,
  hasFiniteProjectedEv,
  hasFiniteTrueProb,
  hasPlatformGrounded,
  inferPlatformGrounded,
} from "./tracker_integrity_contract";
import { isValidGameStartTime } from "./tracker_temporal_integrity";

export const TRACKER_CREATION_SCHEMA_VERSION = 1;

export const CREATION_SOURCE_BACKFILL = "backfill_perf_tracker";

export type CreationCompletenessPrimaryReason =
  | "creation_calibratable"
  | "missing_platform"
  | "missing_game_start"
  | "missing_true_prob"
  | "missing_implied_or_open_odds_context"
  | "missing_projected_ev";

/** impliedProb or deterministic open-odds context (chosen side), for calibration inputs. */
export function hasImpliedOrOpenOddsContext(r: PerfTrackerRow): boolean {
  if (hasFiniteImpliedProb(r)) return true;
  if (typeof r.openOddsAmerican === "number" && Number.isFinite(r.openOddsAmerican)) return true;
  const side = r.side ?? inferSide(r.leg_id);
  const o = side === "over" ? r.overOdds : r.underOdds;
  return typeof o === "number" && Number.isFinite(o);
}

/**
 * Unresolved row that has all calibration inputs Phase 67 uses, except resolution.
 * Requires valid parseable gameStartTime (same bar as Phase 68 temporal contract).
 */
export function isCreationCalibratableRow(r: PerfTrackerRow): boolean {
  return (
    hasPlatformGrounded(r) &&
    isValidGameStartTime(r.gameStartTime) &&
    hasFiniteTrueProb(r) &&
    hasImpliedOrOpenOddsContext(r) &&
    hasFiniteProjectedEv(r)
  );
}

export function hasCreationTag(r: PerfTrackerRow): boolean {
  return typeof r.creationTimestampUtc === "string" && r.creationTimestampUtc.trim().length > 0;
}

export function primaryCreationCompletenessReason(r: PerfTrackerRow): CreationCompletenessPrimaryReason {
  if (!hasPlatformGrounded(r)) return "missing_platform";
  if (!isValidGameStartTime(r.gameStartTime)) return "missing_game_start";
  if (!hasFiniteTrueProb(r)) return "missing_true_prob";
  if (!hasImpliedOrOpenOddsContext(r)) return "missing_implied_or_open_odds_context";
  if (!hasFiniteProjectedEv(r)) return "missing_projected_ev";
  return "creation_calibratable";
}

export interface CreationIntegritySnapshot {
  /** Rows with `creationTimestampUtc` (Phase 69+). */
  rowsCreated: number;
  rowsCreatedFullyCalibratable: number;
  rowsCreatedWithGameStartTime: number;
  rowsCreatedWithPlatform: number;
  rowsCreatedWithTrueProb: number;
  rowsCreatedWithImpliedProbOrOpenOddsContext: number;
  rowsCreatedWithProjectedEv: number;
  creationCalibratableRate: number;
  gameStartCoverageRate: number;
  platformCoverageRate: number;
  trueProbCoverageRate: number;
  impliedOrOpenContextCoverageRate: number;
  projectedEvCoverageRate: number;
}

function rate(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

export function computeCreationIntegritySnapshot(rows: PerfTrackerRow[]): CreationIntegritySnapshot {
  const created = rows.filter(hasCreationTag);
  const rowsCreated = created.length;
  let rowsCreatedFullyCalibratable = 0;
  let rowsCreatedWithGameStartTime = 0;
  let rowsCreatedWithPlatform = 0;
  let rowsCreatedWithTrueProb = 0;
  let rowsCreatedWithImpliedProbOrOpenOddsContext = 0;
  let rowsCreatedWithProjectedEv = 0;

  for (const r of created) {
    if (isCreationCalibratableRow(r)) rowsCreatedFullyCalibratable++;
    if (isValidGameStartTime(r.gameStartTime)) rowsCreatedWithGameStartTime++;
    if (hasPlatformGrounded(r)) rowsCreatedWithPlatform++;
    if (hasFiniteTrueProb(r)) rowsCreatedWithTrueProb++;
    if (hasImpliedOrOpenOddsContext(r)) rowsCreatedWithImpliedProbOrOpenOddsContext++;
    if (hasFiniteProjectedEv(r)) rowsCreatedWithProjectedEv++;
  }

  return {
    rowsCreated,
    rowsCreatedFullyCalibratable,
    rowsCreatedWithGameStartTime,
    rowsCreatedWithPlatform,
    rowsCreatedWithTrueProb,
    rowsCreatedWithImpliedProbOrOpenOddsContext,
    rowsCreatedWithProjectedEv,
    creationCalibratableRate: rate(rowsCreatedFullyCalibratable, rowsCreated),
    gameStartCoverageRate: rate(rowsCreatedWithGameStartTime, rowsCreated),
    platformCoverageRate: rate(rowsCreatedWithPlatform, rowsCreated),
    trueProbCoverageRate: rate(rowsCreatedWithTrueProb, rowsCreated),
    impliedOrOpenContextCoverageRate: rate(rowsCreatedWithImpliedProbOrOpenOddsContext, rowsCreated),
    projectedEvCoverageRate: rate(rowsCreatedWithProjectedEv, rowsCreated),
  };
}

export function countPrimaryReasonsNonCreationCalibratableTagged(
  rows: PerfTrackerRow[]
): Record<Exclude<CreationCompletenessPrimaryReason, "creation_calibratable">, number> {
  const out: Record<string, number> = {
    missing_platform: 0,
    missing_game_start: 0,
    missing_true_prob: 0,
    missing_implied_or_open_odds_context: 0,
    missing_projected_ev: 0,
  };
  for (const r of rows) {
    if (!hasCreationTag(r)) continue;
    if (isCreationCalibratableRow(r)) continue;
    const pr = primaryCreationCompletenessReason(r);
    if (pr === "creation_calibratable") continue;
    out[pr] = (out[pr] ?? 0) + 1;
  }
  return out as Record<Exclude<CreationCompletenessPrimaryReason, "creation_calibratable">, number>;
}

/**
 * Deterministic platform for backfill: explicit tier site when non-empty; else leg_id (no default PP for empty).
 */
export function resolvePlatformForBackfill(
  siteColumnPresent: boolean,
  siteRawUpper: string,
  legId: string
): "PP" | "UD" | undefined {
  const s = siteRawUpper.trim();
  if (siteColumnPresent) {
    if (s === "UD" || s === "UNDERDOG") return "UD";
    if (s === "PP" || s === "PRIZEPICKS" || s === "PRIZE_PICKS") return "PP";
    if (s.length > 0) return "PP";
  }
  return inferPlatformGrounded({ leg_id: legId, platform: undefined } as PerfTrackerRow);
}
