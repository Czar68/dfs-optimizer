// src/calculate_ev.ts

import { EvPick, MergedPick } from "./types";
import { getOddsBucketCalibrationHaircut } from "./calibrate_leg_ev";
import { juiceAwareLegEv } from "./ev/juice_adjust";

// Phase 8.1: Juice-aware leg EV.
// Old: edge = trueProb − 0.5 (treats 50% as breakeven, ignoring book vig).
// New: edge = trueProb − fairBE(overOdds, underOdds), where fairBE de-vigs
//   the two-way line. Falls back to 0.5 when odds are unavailable.
// Card-level EV (card_ev.ts) already uses proper payout tables — this only
// fixes leg-level RANKING and FILTERING.
export function calculateEvForMergedPick(pick: MergedPick): EvPick {
  const rawTrueProb = pick.trueProb;
  const storedTrueProb = rawTrueProb != null && Number.isFinite(Number(rawTrueProb))
    ? Math.max(0.01, Math.min(0.99, Number(rawTrueProb)))
    : 0.5;
  const side = (pick as { outcome?: string }).outcome === "under" ? "under" : "over";
  const haircut = getOddsBucketCalibrationHaircut(pick.overOdds ?? undefined, pick.underOdds ?? undefined, side);
  const effectiveTrueProb = haircut > 0 ? Math.max(0.01, storedTrueProb - haircut) : storedTrueProb;
  const fairOdds =
    storedTrueProb > 0 && storedTrueProb < 1 ? 1 / storedTrueProb - 1 : Number.NaN;

  const edge = juiceAwareLegEv(effectiveTrueProb, pick.overOdds, pick.underOdds);
  const legEv = Number.isFinite(edge) ? edge : 0;

  const id = `${pick.site}-${pick.projectionId}-${pick.stat}-${pick.line}`;

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
    outcome: "over",
    trueProb: storedTrueProb,
    fairOdds,
    edge,
    book: pick.book,
    overOdds: pick.overOdds,
    underOdds: pick.underOdds,
    legEv,
    isNonStandardOdds: pick.isNonStandardOdds ?? false,
    legKey: pick.legKey,
    legLabel: pick.legLabel,
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
