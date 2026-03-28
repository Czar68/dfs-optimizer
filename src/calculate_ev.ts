// src/calculate_ev.ts

import { EvPick, MergedPick } from "./types";
import { getOddsBucketCalibrationHaircut } from "./calibrate_leg_ev";
import { computeCanonicalLegMarketEdge } from "../math_models/nonstandard_canonical_leg_math";
import {
  fairProbChosenSide as fairProbChosenSideFromTwoWay,
  legacyNaiveLegMetric as computeLegacyNaiveLegMetric,
} from "../math_models/juice_adjust";
import { mapEvPickToCanonicalLegMathInput } from "./nonstandard_canonical_mapping";
import { validateModelInputPick } from "./validation/model_input_guardrail";
import {
  applyProbabilityCalibration,
  getActiveProbabilityCalibration,
} from "./modeling/probability_calibration";

export function computeCanonicalEdgeForInput(params: {
  pick: MergedPick;
  side: "over" | "under";
  effectiveTrueProb: number;
  fairOdds: number;
}): number {
  const canonicalMapping = mapEvPickToCanonicalLegMathInput({
    id: "",
    sport: params.pick.sport,
    site: params.pick.site,
    league: params.pick.league,
    player: params.pick.player,
    team: params.pick.team,
    opponent: params.pick.opponent,
    stat: params.pick.stat,
    line: params.pick.line,
    projectionId: params.pick.projectionId,
    gameId: params.pick.gameId,
    startTime: params.pick.startTime,
    outcome: params.side,
    trueProb: params.effectiveTrueProb,
    fairOdds: params.fairOdds,
    edge: 0,
    book: params.pick.book,
    overOdds: params.pick.overOdds,
    underOdds: params.pick.underOdds,
    legEv: 0,
    isNonStandardOdds: params.pick.isNonStandardOdds ?? false,
    udPickFactor: params.pick.udPickFactor ?? null,
    nonStandard: params.pick.nonStandard,
    legKey: params.pick.legKey,
    legLabel: params.pick.legLabel,
  });
  return computeCanonicalLegMarketEdge(canonicalMapping.canonicalLeg);
}

// Phase 8.1 / Phase 73: Leg-level edge for gating vs market.
// marketEdgeFair = trueProb − fairProbChosenSide (two-way de-vig via fairBeFromTwoWayOdds).
// Falls back to trueProb − 0.5 when either side's American price is missing.
// legacyNaiveLegMetric = effectiveTrueProb − 0.5 (diagnostic only).
// Card-level EV (card_ev.ts) uses payout tables — unchanged here.
export function calculateEvForMergedPick(pick: MergedPick): EvPick | null {
  const validation = validateModelInputPick(pick);
  if (!validation.ok) {
    const id = `${pick.site}-${pick.projectionId}-${pick.stat}-${pick.line}`;
    console.warn(
      `[input_guardrail:${validation.code}] Excluding row ${id}${validation.detail ? ` (${validation.detail})` : ""}`
    );
    return null;
  }

  const rawTrueProb = pick.trueProb;
  const storedTrueProb = rawTrueProb != null && Number.isFinite(Number(rawTrueProb))
    ? Math.max(0.01, Math.min(0.99, Number(rawTrueProb)))
    : 0.5;
  const activeCalibration = getActiveProbabilityCalibration();
  const calibrationApplied = applyProbabilityCalibration(storedTrueProb, activeCalibration);
  const calibratedTrueProb = Math.max(0.01, Math.min(0.99, calibrationApplied.calibratedProb));

  if (storedTrueProb < 0.05 || storedTrueProb > 0.95) {
    console.warn(
      `[calculate_ev] Dropping leg with extreme trueProb=${storedTrueProb.toFixed(4)}: ` +
      `${pick.player} ${pick.stat} ${pick.line} (over=${pick.overOdds} under=${pick.underOdds}) — likely invalid odds`
    );
    return null;
  }

  const side = (pick as { outcome?: string }).outcome === "under" ? "under" : "over";
  const haircut = getOddsBucketCalibrationHaircut(pick.overOdds ?? undefined, pick.underOdds ?? undefined, side);
  const effectiveTrueProb = haircut > 0 ? Math.max(0.01, calibratedTrueProb - haircut) : calibratedTrueProb;
  const fairOdds = calibratedTrueProb > 0 && calibratedTrueProb < 1 ? 1 / calibratedTrueProb - 1 : Number.NaN;
  // Phase L (PP only): `trueProb` is merge-time multi-book consensus; `fairOver/UnderOdds` are the same
  // consensus as American fair lines. Using `pick.overOdds/underOdds` for fairProbChosenSide mixed consensus
  // `trueProb` with a single book’s vigged two-way — use parity fair pair for market-relative edge only.
  const mergedPickForMarketEdge: MergedPick =
    pick.site === "prizepicks" &&
    Number.isFinite(pick.fairOverOdds) &&
    Number.isFinite(pick.fairUnderOdds)
      ? { ...pick, overOdds: pick.fairOverOdds, underOdds: pick.fairUnderOdds }
      : pick;
  const edge = computeCanonicalEdgeForInput({
    pick: mergedPickForMarketEdge,
    side,
    effectiveTrueProb,
    fairOdds,
  });
  const legEv = Number.isFinite(edge) ? edge : 0;

  
  const canonicalMapping = mapEvPickToCanonicalLegMathInput({
    id: "",
    sport: pick.sport,
    site: pick.site,
    league: pick.league,
    player: pick.player,
    team: pick.team,
    opponent: pick.opponent,
    stat: pick.stat,
    line: pick.line,
    projectionId: pick.projectionId,
    gameId: pick.gameId,
    startTime: pick.startTime,
    outcome: side,
    trueProb: effectiveTrueProb,
    fairOdds,
    edge: 0,
    book: pick.book,
    overOdds: mergedPickForMarketEdge.overOdds,
    underOdds: mergedPickForMarketEdge.underOdds,
    legEv: 0,
    isNonStandardOdds: pick.isNonStandardOdds ?? false,
    udPickFactor: pick.udPickFactor ?? null,
    nonStandard: pick.nonStandard,
    legKey: pick.legKey,
    legLabel: pick.legLabel,
  });

  // Include side in the EV leg id to avoid collisions when both over/under legs exist.
  const id = `${pick.site}-${pick.projectionId}-${pick.stat}-${pick.line}-${side}`;

  return {
    id,
    sport: pick.sport,
    site: pick.site,
    league: pick.league,
    player: pick.player,
    team: pick.team,
    opponent: pick.opponent,
    stat: pick.stat,
    line: pick.line,
    projectionId: pick.projectionId,
    gameId: pick.gameId,
    startTime: pick.startTime,
    outcome: side,
    trueProb: effectiveTrueProb,
    rawTrueProb: storedTrueProb,
    calibratedTrueProb,
    probCalibrationApplied: calibrationApplied.applied,
    probCalibrationBucket: calibrationApplied.bucketLabel,
    fairOdds,
    edge,
    book: pick.book,
    overOdds: pick.overOdds,
    underOdds: pick.underOdds,
    legEv,
    legacyNaiveLegMetric: computeLegacyNaiveLegMetric(effectiveTrueProb),
    fairProbChosenSide:
      mergedPickForMarketEdge.overOdds != null &&
      mergedPickForMarketEdge.underOdds != null &&
      Number.isFinite(mergedPickForMarketEdge.overOdds) &&
      Number.isFinite(mergedPickForMarketEdge.underOdds)
        ? fairProbChosenSideFromTwoWay(
            mergedPickForMarketEdge.overOdds,
            mergedPickForMarketEdge.underOdds,
            side
          )
        : undefined,
    isNonStandardOdds: pick.isNonStandardOdds ?? false,
    udPickFactor: pick.udPickFactor ?? null,
    nonStandard: pick.nonStandard,
    legKey: pick.legKey,
    legLabel: pick.legLabel,
    modelingClass: canonicalMapping.modelingClass,
    modelingReason: canonicalMapping.modelingReason,
    ppNConsensusBooks: pick.site === "prizepicks" ? pick.ppNConsensusBooks : undefined,
    ppConsensusDevigSpreadOver: pick.site === "prizepicks" ? pick.ppConsensusDevigSpreadOver : undefined,
  };
}

export function calculateEvForMergedPicks(
  merged: MergedPick[]
): EvPick[] {
  if (!merged?.length) return [];
  return merged.map((pick) => {
    try {
      return calculateEvForMergedPick(pick);
    } catch (err) {
      const id = `${pick.site}-${pick.projectionId}-${pick.stat}-${pick.line}`;
      console.warn(`[calculate_ev] Skipped pick (invalid): ${id}`, (err as Error).message);
      return null;
    }
  }).filter((p): p is EvPick => p != null);
}
