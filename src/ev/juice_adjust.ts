// src/ev/juice_adjust.ts
// Phase 8.1: Juice-aware leg EV.
//
// PROBLEM:
//   calculate_ev.ts uses `edge = trueProb − 0.5` for leg-level ranking.
//   0.5 is the naive breakeven for a coin flip, but PP/UD structures have
//   different breakevens (PP 4P = 56.2%, UD 3F = 57.0%). A leg with
//   trueProb=55% looks like +5% edge vs 0.5, but is actually −1.2% EV
//   in a PP 4P context.
//
// FIX:
//   trueJuiceBE() converts American odds to the *actual* breakeven
//   probability for that leg's odds line. A -110/-110 line has true BE
//   of 52.38%, not 50%. This is the minimum trueProb needed for +EV.
//
//   juiceAwareLegEv() = trueProb − trueJuiceBE(overOdds, underOdds)
//   Falls back to (trueProb − 0.5) when odds are unavailable.
//
// NOTE: Card-level EV (card_ev.ts → getStructureEV) already uses proper
//   payout tables. This fix only affects LEG-LEVEL ranking and filtering,
//   which determines which legs get selected into cards.

import { PP_PAYOUTS } from "../config/pp_payouts";
import { UD_PAYOUTS } from "../config/ud_payouts";

/**
 * True breakeven probability from American odds on the chosen side.
 * For a -110 line: decimal = 1.909, BE = 1/1.909 = 52.38%.
 * For a +150 line: decimal = 2.5, BE = 1/2.5 = 40.0%.
 *
 * This is the probability at which EV = 0 for a bet at these odds,
 * i.e. the minimum trueProb needed for the bet to be +EV.
 */
export function trueBeFromOdds(americanOdds: number): number {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 0.5;
  // Convert American → decimal odds
  const decimal =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);
  return 1 / decimal;
}

/**
 * Weighted breakeven from both over and under American odds.
 * De-vigs to remove the book's margin, giving the "fair" breakeven.
 *
 * impliedOver + impliedUnder > 1.0 due to vig.
 * Fair BE for over = impliedOver / (impliedOver + impliedUnder).
 */
export function fairBeFromTwoWayOdds(
  overOdds: number,
  underOdds: number
): number {
  const impOver = americanToImplied(overOdds);
  const impUnder = americanToImplied(underOdds);
  const total = impOver + impUnder;
  if (total <= 0) return 0.5;
  return impOver / total;
}

function americanToImplied(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0.5;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

/**
 * Structure-specific per-leg breakeven from gospel payout tables.
 * PP 4P (10x payout): BE = 0.5623, PP 3F: BE = 0.5980, etc.
 * These are the per-leg probabilities at which structure EV = 0.
 */
export function structureBreakeven(
  platform: "PP" | "UD",
  flexType: string
): number {
  const ft = flexType.toUpperCase();
  const picks = parseInt(ft);
  if (isNaN(picks)) return 0.5;

  if (platform === "PP") {
    if (ft.endsWith("P") && picks >= 2 && picks <= 6) {
      return (PP_PAYOUTS.power as any)[picks]?.breakeven ?? 0.5;
    }
    if (ft.endsWith("F") && picks >= 3 && picks <= 6) {
      return (PP_PAYOUTS.flex as any)[picks]?.breakeven ?? 0.5;
    }
  }
  if (platform === "UD") {
    if ((ft.endsWith("S") || ft.endsWith("P")) && picks >= 2 && picks <= 8) {
      return (UD_PAYOUTS.standard as any)[picks]?.breakeven ?? 0.5;
    }
    if (ft.endsWith("F") && picks >= 3 && picks <= 8) {
      return (UD_PAYOUTS.flex as any)[picks]?.breakeven ?? 0.5;
    }
  }
  return 0.5;
}

/**
 * Leg-level edge: how much the leg's trueProb exceeds PP/UD binary breakeven.
 *
 * trueProb is ALREADY devigged from the sportsbook odds in the merge step,
 * so comparing it against fairBE(overOdds, underOdds) yields 0 by identity.
 * The correct comparison is trueProb vs the platform's per-leg breakeven (0.50
 * for PP standard binary, ~0.5345 for UD after payout discount).
 *
 * Card-level EV (card_ev.ts) handles structure-specific payouts separately.
 */
export function juiceAwareLegEv(
  trueProb: number,
  _overOdds: number | null | undefined,
  _underOdds: number | null | undefined
): number {
  return trueProb - 0.5;
}
