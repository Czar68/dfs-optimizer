// src/calculate_ev.ts

import { EvPick, MergedPick } from "./types";
import { getOddsBucketCalibrationHaircut } from "./calibrate_leg_ev";
import { computeCanonicalLegMarketEdge } from "../math_models/nonstandard_canonical_leg_math";
import { mapEvPickToCanonicalLegMathInput } from "./nonstandard_canonical_mapping";
import { validateModelInputPick } from "./validation/model_input_guardrail";

// Phase 8.1: Juice-aware leg EV.
// Old: edge = trueProb − 0.5 (treats 50% as breakeven, ignoring book vig).
// New: edge = trueProb − fairBE(overOdds, underOdds), where fairBE de-vigs
//   the two-way line. Falls back to 0.5 when odds are unavailable.
// Card-level EV (card_ev.ts) already uses proper payout tables — this only
// fixes leg-level RANKING and FILTERING.
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

  if (storedTrueProb < 0.05 || storedTrueProb > 0.95) {
    console.warn(
      `[calculate_ev] Dropping leg with extreme trueProb=${storedTrueProb.toFixed(4)}: ` +
      `${pick.player} ${pick.stat} ${pick.line} (over=${pick.overOdds} under=${pick.underOdds}) — likely invalid odds`
    );
    return null;
  }

  const side = (pick as { outcome?: string }).outcome === "under" ? "under" : "over";
  const haircut = getOddsBucketCalibrationHaircut(pick.overOdds ?? undefined, pick.underOdds ?? undefined, side);
  const effectiveTrueProb = haircut > 0 ? Math.max(0.01, storedTrueProb - haircut) : storedTrueProb;
  const fairOdds =
    storedTrueProb > 0 && storedTrueProb < 1 ? 1 / storedTrueProb - 1 : Number.NaN;

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
    overOdds: pick.overOdds,
    underOdds: pick.underOdds,
    legEv: 0,
    isNonStandardOdds: pick.isNonStandardOdds ?? false,
    udPickFactor: (pick as any).udPickFactor ?? null,
    nonStandard: pick.nonStandard,
    legKey: pick.legKey,
    legLabel: pick.legLabel,
  });
  const edge = computeCanonicalLegMarketEdge(canonicalMapping.canonicalLeg);
  const legEv = Number.isFinite(edge) ? edge : 0;

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
    trueProb: storedTrueProb,
    fairOdds,
    edge,
    book: pick.book,
    overOdds: pick.overOdds,
    underOdds: pick.underOdds,
    legEv,
    isNonStandardOdds: pick.isNonStandardOdds ?? false,
    udPickFactor: (pick as any).udPickFactor ?? null,
    nonStandard: pick.nonStandard,
    legKey: pick.legKey,
    legLabel: pick.legLabel,
    modelingClass: canonicalMapping.modelingClass,
    modelingReason: canonicalMapping.modelingReason,
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
