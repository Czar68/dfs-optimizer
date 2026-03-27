/**
 * math_models/juice_adjust.ts
 * Juice-aware leg EV: true BE from odds, fair BE from two-way, structure breakeven.
 * EXTRACTED FROM: src/ev/juice_adjust.ts — do not change formulas without peer-review.
 */

import { PP_PAYOUTS } from '../src/config/pp_payouts';
import { UD_PAYOUTS } from '../src/config/ud_payouts';

/**
 * True breakeven probability from American odds on the chosen side.
 * decimal = american>0 ? 1+american/100 : 1+100/|american|; return 1/decimal.
 */
export function trueBeFromOdds(americanOdds: number): number {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return 0.5;
  const decimal =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);
  return 1 / decimal;
}

function americanToImplied(american: number): number {
  if (!Number.isFinite(american) || american === 0) return 0.5;
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

/**
 * Fair breakeven from two-way odds: impliedOver / (impliedOver + impliedUnder).
 */
export function fairBeFromTwoWayOdds(overOdds: number, underOdds: number): number {
  const impOver = americanToImplied(overOdds);
  const impUnder = americanToImplied(underOdds);
  const total = impOver + impUnder;
  if (total <= 0) return 0.5;
  return impOver / total;
}

/**
 * Structure-specific per-leg breakeven from gospel payout tables (PP/UD).
 */
export function structureBreakeven(platform: 'PP' | 'UD', flexType: string): number {
  const ft = flexType.toUpperCase();
  const picks = parseInt(ft);
  if (isNaN(picks)) return 0.5;

  if (platform === 'PP') {
    if (ft.endsWith('P') && picks >= 2 && picks <= 6) {
      return (PP_PAYOUTS.power as Record<number, { breakeven: number }>)[picks]?.breakeven ?? 0.5;
    }
    if (ft.endsWith('F') && picks >= 3 && picks <= 6) {
      return (PP_PAYOUTS.flex as Record<number, { breakeven: number }>)[picks]?.breakeven ?? 0.5;
    }
  }
  if (platform === 'UD') {
    if ((ft.endsWith('S') || ft.endsWith('P')) && picks >= 2 && picks <= 8) {
      return (UD_PAYOUTS.standard as Record<number, { breakeven: number }>)[picks]?.breakeven ?? 0.5;
    }
    if (ft.endsWith('F') && picks >= 3 && picks <= 8) {
      return (UD_PAYOUTS.flex as Record<number, { breakeven: number }>)[picks]?.breakeven ?? 0.5;
    }
  }
  return 0.5;
}

/**
 * Fair probability of the chosen side from a two-way de-vigged book.
 */
export function fairProbChosenSide(
  overOdds: number,
  underOdds: number,
  side: 'over' | 'under'
): number {
  const fairOver = fairBeFromTwoWayOdds(overOdds, underOdds);
  return side === 'over' ? fairOver : 1 - fairOver;
}

/**
 * Market-relative leg edge for gating: model prob minus fair chosen-side prob.
 * Falls back to naive trueProb − 0.5 when either American price is missing.
 */
export function marketRelativeLegEdge(
  trueProb: number,
  overOdds: number | null | undefined,
  underOdds: number | null | undefined,
  side: 'over' | 'under'
): number {
  if (
    overOdds != null &&
    underOdds != null &&
    Number.isFinite(overOdds) &&
    Number.isFinite(underOdds)
  ) {
    return trueProb - fairProbChosenSide(overOdds, underOdds, side);
  }
  return trueProb - 0.5;
}

/** Legacy naive comparator (trueProb − 0.5) for diagnostics only — not a market edge. */
export function legacyNaiveLegMetric(trueProb: number): number {
  return trueProb - 0.5;
}

/**
 * Canonical per-leg edge for PP/UD gating and ranking: market-relative vs two-way fair
 * when both sides are priced; else naive trueProb − 0.5.
 */
export function juiceAwareLegEv(
  trueProb: number,
  overOdds: number | null | undefined,
  underOdds: number | null | undefined,
  side: 'over' | 'under' = 'over'
): number {
  return marketRelativeLegEdge(trueProb, overOdds, underOdds, side);
}
