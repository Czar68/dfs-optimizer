// src/card_ev.ts

import {
  CardEvResult,
  EvPick,
  FlexType,
  Sport,
} from "./types";

import { getStructureEV } from "./engine_interface";
import { computeKellyForCard, computePrizePicksHitDistribution, DEFAULT_KELLY_CONFIG } from "./kelly_mean_variance";
import { getPayoutsAsRecord } from "./config/prizepicks_payouts";
import { cliArgs } from "./cli_args";

// Per-sport EV thresholds for cards (defaults — overridable via --min-card-ev)
const SPORT_EV_THRESHOLDS: Record<Sport, number> = {
  'NBA': 0.015,     // 1.5% (lowered from 2% to avoid 0-card on thin slates)
  'NHL': 0.020,
  'NCAAB': 0.015,
  'NFL': 0.025,
  'MLB': 0.015,
  'NCAAF': 0.030,
};

const MIN_CARD_EV = cliArgs.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.015);

// PrizePicks payout tables (hits → multiplier) — DEPRECATED: Use config/prizepicks_payouts.ts
// Keeping for backward compatibility during transition
const PP_PAYOUTS: Record<string, Record<number, number>> = {
  '2P': getPayoutsAsRecord('2P'),
  '3P': getPayoutsAsRecord('3P'),
  '4P': getPayoutsAsRecord('4P'),
  '5P': getPayoutsAsRecord('5P'),
  '6P': getPayoutsAsRecord('6P'),
  '3F': getPayoutsAsRecord('3F'),
  '4F': getPayoutsAsRecord('4F'),
  '5F': getPayoutsAsRecord('5F'),
  '6F': getPayoutsAsRecord('6F'),
};

/** Binomial PMF: P(X=k) where X ~ Bin(n, p) */
function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  let coeff = 1;
  for (let i = 0; i < k; i++) {
    coeff = coeff * (n - i) / (i + 1);
  }
  return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Compute winProbCash and winProbAny locally using i.i.d. binomial model.
 *
 * winProbCash = probability of positive profit (payout > stake)
 * winProbAny  = probability of any non-zero payout (includes break-even)
 */
function computeWinProbs(flexType: string, picks: number, avgProb: number): { winProbCash: number; winProbAny: number } {
  const payouts = PP_PAYOUTS[flexType];
  if (!payouts) return { winProbCash: 0, winProbAny: 0 };

  let winProbCash = 0;
  let winProbAny = 0;

  for (let k = 0; k <= picks; k++) {
    const multiplier = payouts[k] ?? 0;
    if (multiplier <= 0) continue;
    const prob = binomPmf(k, picks, avgProb);
    if (multiplier > 1) winProbCash += prob; // profit > 0
    winProbAny += prob;                       // any positive return
  }

  return { winProbCash, winProbAny };
}

/**
 * Evaluate a flex card using Google Sheets Windshark engine
 * 
 * This function consumes EV/ROI values from the Google Sheets engine rather than
 * calculating them in code, following Windshark rules where Sheets is the
 * single source of truth for PrizePicks payouts and EV math.
 * 
 * Key outputs:
 * - cardEv: Expected profit per 1 unit staked (consumed from Sheets engine)
 * - roi: Return on investment (consumed from Sheets engine)
 * - avgProb: Average of leg true probabilities (computed locally for diagnostics)
 * - avgEdgePct: Average leg edge in percent (computed locally for diagnostics)
 * - winProbCash/winProbAny: Computed locally from i.i.d. binomial + payout table
 * 
 * @param flexType - PrizePicks slip type (2P, 3F, etc.)
 * @param legs - Array of legs with their true probabilities
 * @param stake - Amount staked (default 1 for per-unit EV)
 * @returns Complete card EV result with metrics from Sheets engine, or null if below EV threshold
 */
export async function evaluateFlexCard(
  flexType: FlexType,
  legs: { pick: EvPick; side: "over" | "under" }[],
  stake = 1
): Promise<CardEvResult | null> {
  // Step 1: Compute card-level diagnostic metrics (local calculations only)
  const n = legs.length;
  const avgProb = legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / n;
  const avgEdge = legs.reduce((sum, leg) => sum + (leg.pick.trueProb - 0.5), 0) / n;
  const avgEdgePct = avgEdge * 100; // Convert to percentage

  // Step 2: Get structure EV from Google Sheets engine (or local binomial)
  const roundedAvgProb = Math.round(avgProb * 10000) / 10000;
  const structureEV = await getStructureEV(flexType, roundedAvgProb);
  if (!structureEV) return null;

  // Step 3: Sport-specific EV threshold
  const cardSport = legs[0]?.pick?.sport || 'NBA';
  const sportThreshold = SPORT_EV_THRESHOLDS[cardSport] ?? MIN_CARD_EV;
  if (structureEV.ev < sportThreshold) return null;

  // Step 4: Total expected return
  const totalReturn = (structureEV.ev + 1) * stake;

  // Step 5: Win probabilities from i.i.d. binomial + payout table
  const { winProbCash, winProbAny } = computeWinProbs(flexType, n, roundedAvgProb);

  // Step 6: Kelly sizing via proper hit distribution (non-iid DP)
  const hitDistribution = computePrizePicksHitDistribution(legs, flexType);
  const kellyResult = computeKellyForCard(
    structureEV.ev,
    hitDistribution,
    flexType,
    'prizepicks',
    DEFAULT_KELLY_CONFIG
  );

  return {
    flexType,
    legs,
    stake,
    totalReturn,
    expectedValue: structureEV.ev,
    winProbability: winProbCash,
    cardEv: structureEV.ev, // Expected profit per 1 unit staked (from Sheets engine)
    winProbCash,
    winProbAny,
    avgProb, // Average of leg true probabilities (computed locally for diagnostics)
    avgEdgePct, // Average leg edge in percent (computed locally for diagnostics)
    hitDistribution, // Full hit distribution for Kelly calculations
    kellyResult, // Kelly sizing results
  };
}
