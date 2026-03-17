/**
 * Apply fantasy-score nudge to adjEv when ENABLE_FANTASY_EV is on.
 * Runs after applyEspnAdjEv so adjEv chain is: legEv → calibration → espnNudge → fantasyNudge.
 */

import type { EvPick } from "./types";
import type { UnifiedProp } from "./types/unified-prop";
import { calculateFantasyScore } from "./services/fantasyAggregator";
import { FLAGS } from "./constants/featureFlags";

/** Baseline fantasy score for signal normalization (tune after live validation). */
export const FANTASY_BASELINE = 0;
/** Scale so signal = (score - FANTASY_BASELINE) / FANTASY_SCALE (tune after live validation). */
export const FANTASY_SCALE = 100;

/** Default scoring map for single-leg fantasy score (typical NBA weights). */
const DEFAULT_SCORING_MAP: Record<string, number> = {
  points: 1,
  rebounds: 1.2,
  assists: 1.5,
  threes: 1,
  blocks: 1,
  steals: 1,
  turnovers: -0.5,
  pra: 1,
  stocks: 1,
};

function evPickToUnifiedProp(leg: EvPick): UnifiedProp {
  const provider = leg.site === "prizepicks" ? "PP" : "UD";
  return {
    id: leg.id,
    provider,
    player: leg.player,
    statType: leg.stat,
    lineValue: leg.line,
    breakeven: 0.5,
    odds: { over: leg.overOdds ?? -110, under: leg.underOdds ?? -110 },
    raw: {},
    isDerived: false,
  };
}

/**
 * Nudge adjEv by fantasy score signal (8% weight, signal capped ±20%). Returns leg unchanged if flag off.
 */
export function applyFantasyAdjEv(leg: EvPick): EvPick {
  if (!FLAGS.fantasyEv) return leg;

  const props = [evPickToUnifiedProp(leg)];
  const result = calculateFantasyScore(props, DEFAULT_SCORING_MAP);
  const fantasyScore = result.length > 0 ? result[0]!.lineValue : 0;

  const signalRaw = (fantasyScore - FANTASY_BASELINE) / FANTASY_SCALE;
  const signal = Math.max(-0.2, Math.min(0.2, signalRaw));
  const nudge = signal * 0.08;

  leg.fantasyEv = nudge;
  leg.adjEv = (leg.adjEv ?? leg.legEv) * (1 + nudge);
  return leg;
}
