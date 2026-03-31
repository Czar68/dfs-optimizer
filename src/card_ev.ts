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
import { computeWinProbs } from "../math_models/win_probabilities";
import { SPORT_CORRELATIONS, getSportCorrelation } from "./config/platform_strategies";

// Pitcher-Batter detection for MLB
function detectPitcherBatter(legs: { pick: EvPick; side: string }[]): { hasPitcherBatter: boolean; adjustment: number } {
  // Enhanced detection: look for pitcher and batter stat names
  const hasPitcher = legs.some(l => 
    l.pick.stat?.toLowerCase().includes('pitcher') || 
    l.pick.stat?.toLowerCase().includes('strikeout') ||
    l.pick.stat?.toLowerCase().includes('k')
  );
  const hasBatter = legs.some(l => 
    l.pick.stat?.toLowerCase().includes('hit') || 
    l.pick.stat?.toLowerCase().includes('rbi') ||
    l.pick.stat?.toLowerCase().includes('home run') ||
    l.pick.stat?.toLowerCase().includes('hr')
  );
  
  if (hasPitcher && hasBatter) {
    return { hasPitcherBatter: true, adjustment: 1 + (SPORT_CORRELATIONS.MLB.pitcherBatter || -0.15) };
  }
  return { hasPitcherBatter: false, adjustment: 1.0 };
}

// Basic correlation handling for joint probability
function applyCorrelationAdjustment(legs: { pick: EvPick; side: "over" | "under" }[]): number {
  // Determine sport from first leg (assuming all legs same sport)
  const sport = legs[0]?.pick?.sport || 'NBA';
  const sportKey = sport?.toUpperCase() === 'MLB' ? 'MLB' : 
                   sport?.toUpperCase() === 'NFL' ? 'NFL' : 'NBA';
  
  // Check for same-team correlations (using team as proxy for game correlation)
  const teams = new Map<string, typeof legs>();
  for (const leg of legs) {
    const team = leg.pick.team || leg.pick.player; // Use team or fallback to player name
    if (!teams.has(team)) teams.set(team, []);
    teams.get(team)!.push(leg);
  }
  
  // Apply correlation adjustments
  let totalAdjustment = 1.0;
  let correlationLog: string[] = [];
  
  for (const [team, teamLegs] of teams) {
    if (teamLegs.length >= 2) {
      // Same team correlation: increase joint probability slightly
      const overCount = teamLegs.filter(l => l.side === "over").length;
      const underCount = teamLegs.filter(l => l.side === "under").length;
      
      let adjustment = 1.0;
      let reason = "";
      
      if (overCount >= 2) {
        adjustment = 1 + (SPORT_CORRELATIONS[sportKey].sameTeamOvers);
        reason = "correlated overs";
      } else if (underCount >= 2) {
        adjustment = 1 + (SPORT_CORRELATIONS[sportKey].sameTeamUnders);
        reason = "correlated unders";
      } else {
        adjustment = 1 + (SPORT_CORRELATIONS[sportKey].mixedTeam);
        reason = "mixed same-team legs";
      }
      
      totalAdjustment *= adjustment;
      correlationLog.push(`${team}: ${teamLegs.length} legs, ${reason}, +${((adjustment - 1) * 100).toFixed(1)}%`);
    }
  }
  
  // Check for pitcher-batter correlation in MLB
  const pitcherBatter = detectPitcherBatter(legs);
  if (pitcherBatter.hasPitcherBatter) {
    totalAdjustment *= pitcherBatter.adjustment;
    correlationLog.push(`Pitcher-Batter: ${pitcherBatter.adjustment > 1 ? '+' : ''}${((pitcherBatter.adjustment - 1) * 100).toFixed(1)}% adjustment`);
  }
  
  // Log correlation adjustments if any were applied
  if (correlationLog.length > 0) {
    console.log(`🔗 Correlation adjustment applied: ${correlationLog.join("; ")} (total: +${((totalAdjustment - 1) * 100).toFixed(1)}%)`);
  }
  
  return totalAdjustment;
}

// Per-sport EV thresholds for cards (defaults — overridable via --min-card-ev)
const SPORT_EV_THRESHOLDS: Record<Sport, number> = {
  'NBA': 0.008,     // 0.8% (lowered to avoid 0-card when leg edges are slim but diversified)
  'NHL': 0.015,
  'NCAAB': 0.010,
  'NFL': 0.020,
  'MLB': 0.010,
  'NCAAF': 0.025,
};

/** Runner-resolved fallback when sport is missing from {@link SPORT_EV_THRESHOLDS} (legacy: cli minCardEv ?? MIN_CARD_EV env ?? 0.008). */
export interface EvaluateFlexCardOptions {
  minCardEvFallback: number;
}

/** Same sport floor `evaluateFlexCard` uses (no formula change — reporting-only access). */
export function getEvaluateFlexCardSportThreshold(sport: Sport, minCardEvFallback: number): number {
  return SPORT_EV_THRESHOLDS[sport] ?? minCardEvFallback;
}

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
  stake = 1,
  options: EvaluateFlexCardOptions
): Promise<CardEvResult | null> {
  // Step 1: Apply correlation adjustment to joint probability
  const correlationFactor = applyCorrelationAdjustment(legs);
  
  // Step 2: Compute exact joint probability (product of individual leg probabilities)
  const n = legs.length;
  const baseJointProb = legs.reduce((prod, leg) => prod * leg.pick.trueProb, 1);
  const adjustedJointProb = Math.min(baseJointProb * correlationFactor, 0.95); // Cap at 95%
  
  // Step 3: EV-first filtering - compute slip EV using exact joint probability
  const payoutMultiplier = PP_PAYOUTS[flexType]?.[n] || 1;
  const slipEV = adjustedJointProb * payoutMultiplier - 1;
  
  // Apply minimum slip EV threshold (configurable via CLI or default 3%)
  const minSlipEv = 0.03; // 3% minimum slip EV
  if (slipEV < minSlipEv) {
    return null; // EV-first filtering: reject low-EV slips early
  }

  // Step 4: Compute diagnostic metrics (for reporting only)
  const avgProb = legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / n;
  const avgEdge = legs.reduce((sum, leg) => sum + (leg.pick.trueProb - 0.5), 0) / n;
  const avgEdgePct = avgEdge * 100; // Convert to percentage

  // Step 5: Get structure EV from Google Sheets engine (or local binomial)
  const roundedAvgProb = Math.round(avgProb * 10000) / 10000;
  const structureEV = await getStructureEV(flexType, roundedAvgProb);
  if (!structureEV) return null;

  // Step 6: Sport-specific EV threshold (more lenient with correlation adjustment)
  const cardSport = legs[0]?.pick?.sport || 'NBA';
  const sportThreshold = getEvaluateFlexCardSportThreshold(cardSport, options.minCardEvFallback);
  const adjustedThreshold = sportThreshold * 0.8; // 20% more lenient with correlation
  if (structureEV.ev < adjustedThreshold) return null;

  // Step 7: Total expected return
  const totalReturn = (structureEV.ev + 1) * stake;

  // Step 8: Win probabilities from i.i.d. binomial + payout table
  const { winProbCash, winProbAny } = computeWinProbs(PP_PAYOUTS[flexType] ?? {}, n, roundedAvgProb);

  // Step 9: Kelly sizing via proper hit distribution (non-iid DP)
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
    site: "prizepicks",
    structureId: flexType,
    legs,
    stake,
    totalReturn,
    expectedValue: structureEV.ev,
    winProbability: winProbCash,
    cardEv: structureEV.ev, // Expected profit per 1 unit staked (from Sheets engine)
    winProbCash,
    winProbAny,
    avgProb, // Average of leg true probabilities (for reporting)
    avgEdgePct, // Average leg edge in percent (computed locally for diagnostics)
    hitDistribution, // Full hit distribution for Kelly calculations
    kellyResult, // Kelly sizing results
  };
}
