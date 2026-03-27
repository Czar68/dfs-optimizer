// src/ev/leg_ev_pipeline.ts
// Chained EV adjustment pipeline: base legEv → structure calibration → player trend.
// Called after calculate_ev.ts computes the raw per-leg legEv.
//
// Layer 1 (structure calibration):
//   If a structure calibration exists with nLegs >= minStructureSamples
//   and |actualLegWinRate − impliedBreakeven| > minCalibrationShift:
//     calibratedProb = clamp(trueProb * calibMult, trueProb ± maxStructureShift)
//
// Layer 2 (player trend):
//   If a player trend exists with nLegs >= minTrendSamples
//   and |trendBoost| >= TREND_MIN_CALIB_SHIFT:
//     trendAdjProb = clamp(calibratedProb + trendBoost, [0.01, 0.99])
//
// finalProb → finalLegEv = market-relative edge vs two-way fair (juiceAwareLegEv).

import { EvPick } from "../types";
import {
  StructureCalibration,
  getStructureCalibration,
} from "../historical/calibration_store";
import {
  PlayerTrend,
  getPlayerTrend,
  TREND_MIN_CALIB_SHIFT,
} from "../historical/trend_analyzer";
import { juiceAwareLegEv } from "./juice_adjust";

// ── Constants ──────────────────────────────────────────────────────────────────
export const PIPELINE_MIN_CALIB_SHIFT = 0.02;   // structure calibration min shift
export const PIPELINE_MAX_STRUCTURE_SHIFT = 0.05; // max prob shift from structure calib
export const PIPELINE_MIN_STRUCTURE_SAMPLES = 100;
export const PIPELINE_MIN_TREND_SAMPLES = 10;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface LegEvPipelineOptions {
  /** Pre-built structure calibration list (from calibration_store). */
  structureCalibrations?: StructureCalibration[];
  /** Pre-built player trend map (from trend_analyzer). */
  playerTrends?: Map<string, PlayerTrend>;
  /** Platform for structure calibration lookup ("PP" or "UD"). */
  platform?: "PP" | "UD";
  /** FlexType for structure calibration lookup (e.g. "4P", "3F"). */
  flexType?: string;
  /** Min resolved legs to activate structure calibration (default 100). */
  minStructureSamples?: number;
  /** Min shift to activate structure calibration (default 0.02). */
  minCalibrationShift?: number;
  /** Max trend samples threshold (default 10). */
  minTrendSamples?: number;
}

export interface LegEvAdjustment {
  /** Original trueProb from EV merge step. */
  baseProb: number;
  /** Probability after structure calibration (null if not applied). */
  structureAdjProb: number | null;
  /** Probability after player trend (null if not applied). */
  trendAdjProb: number | null;
  /** Final probability used for legEv (= trendAdjProb ?? structureAdjProb ?? baseProb). */
  finalProb: number;
  /** Final per-leg EV = juiceAwareLegEv(finalProb, odds, outcome). */
  finalLegEv: number;
  adjustments: {
    structureCalibMult?: number;
    structureEdge?: number;
    structureNLegs?: number;
    trendBoost?: number;
    trendNLegs?: number;
    trendVolatility?: number;
  };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Apply the full EV adjustment pipeline to a single leg.
 * Returns the original legEv unchanged (as baseProb − 0.5) when no calibration
 * data is available — never degrades below the base estimate.
 */
export function applyLegEvPipeline(
  leg: EvPick,
  options: LegEvPipelineOptions = {}
): LegEvAdjustment {
  const {
    structureCalibrations,
    playerTrends,
    platform,
    flexType,
    minStructureSamples = PIPELINE_MIN_STRUCTURE_SAMPLES,
    minCalibrationShift = PIPELINE_MIN_CALIB_SHIFT,
    minTrendSamples = PIPELINE_MIN_TREND_SAMPLES,
  } = options;

  const baseProb = leg.trueProb;
  const adjustments: LegEvAdjustment["adjustments"] = {};
  let currentProb = baseProb;
  let structureAdjProb: number | null = null;
  let trendAdjProb: number | null = null;

  // ── Layer 1: Structure calibration ──────────────────────────────────────────
  if (
    structureCalibrations &&
    structureCalibrations.length > 0 &&
    platform &&
    flexType
  ) {
    const calib = getStructureCalibration(
      structureCalibrations,
      platform,
      flexType
    );
    if (
      calib &&
      calib.nLegs >= minStructureSamples &&
      Math.abs(calib.legEdge) >= minCalibrationShift
    ) {
      // Scale trueProb by calibMult, capped to ±maxStructureShift
      const rawAdj = baseProb * calib.calibMult;
      const capped = Math.max(
        baseProb - PIPELINE_MAX_STRUCTURE_SHIFT,
        Math.min(baseProb + PIPELINE_MAX_STRUCTURE_SHIFT, rawAdj)
      );
      structureAdjProb = Math.max(0.01, Math.min(0.99, capped));
      currentProb = structureAdjProb;
      adjustments.structureCalibMult = calib.calibMult;
      adjustments.structureEdge = calib.legEdge;
      adjustments.structureNLegs = calib.nLegs;
    }
  }

  // ── Layer 2: Player trend ────────────────────────────────────────────────────
  if (playerTrends && playerTrends.size > 0) {
    const trend = getPlayerTrend(playerTrends, leg.player, leg.stat);
    if (
      trend &&
      trend.nLegs >= minTrendSamples &&
      Math.abs(trend.trendBoost) >= TREND_MIN_CALIB_SHIFT
    ) {
      const trendRaw = currentProb + trend.trendBoost;
      trendAdjProb = Math.max(0.01, Math.min(0.99, trendRaw));
      currentProb = trendAdjProb;
      adjustments.trendBoost = trend.trendBoost;
      adjustments.trendNLegs = trend.nLegs;
      adjustments.trendVolatility = trend.volatility;
    }
  }

  return {
    baseProb,
    structureAdjProb,
    trendAdjProb,
    finalProb: currentProb,
    finalLegEv: juiceAwareLegEv(currentProb, leg.overOdds, leg.underOdds, leg.outcome),
    adjustments,
  };
}

/**
 * Convenience: apply the pipeline to an array of legs and return a parallel array
 * of adjustments. Logs a summary of how many legs were adjusted.
 */
export function applyPipelineToLegs(
  legs: EvPick[],
  options: LegEvPipelineOptions = {}
): LegEvAdjustment[] {
  const results = legs.map((leg) => applyLegEvPipeline(leg, options));
  const structureAdj = results.filter((r) => r.structureAdjProb !== null).length;
  const trendAdj = results.filter((r) => r.trendAdjProb !== null).length;
  if (structureAdj > 0 || trendAdj > 0) {
    console.log(
      `[LegEvPipeline] ${legs.length} legs: ` +
        `${structureAdj} structure-calibrated, ${trendAdj} trend-adjusted`
    );
  }
  return results;
}

/**
 * Merge pipeline adjustments back onto legs by mutating adjEv in place.
 * Call after applyPipelineToLegs when structure/trend calibrations are available.
 * Only updates adjEv if the pipeline produced a non-trivial adjustment.
 */
export function mergePipelineAdjustments(
  legs: EvPick[],
  adjustments: LegEvAdjustment[]
): void {
  for (let i = 0; i < legs.length && i < adjustments.length; i++) {
    const adj = adjustments[i];
    if (adj.structureAdjProb !== null || adj.trendAdjProb !== null) {
      // Override adjEv with pipeline-computed finalLegEv
      legs[i].adjEv = adj.finalLegEv;
    }
  }
}
