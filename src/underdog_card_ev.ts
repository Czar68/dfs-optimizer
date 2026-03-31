// src/underdog_card_ev.ts
//
// Underdog card EV evaluation.  Two modes only — Standard and Flex — matching
// the two modes exposed in the Underdog Pick'em UI.
//
// Standard: all-or-nothing (single payout tier).
// Flex:     tiered payout ladder (1-loss for 3–5 picks, 2-loss for 6–8 picks).
//
// Both functions use the exact non-identical hit distribution (DP), not the
// i.i.d. binomial approximation used by the PrizePicks engine.

import { CardLegInput, EvPick } from "./types";
import { 
  getUnderdogStructureById, 
  getUnderdogStructureId, 
  calculateBreakEvenLegWinRate 
} from "./config/underdog_structures";
import { computeKellyForCard, DEFAULT_KELLY_CONFIG } from "./kelly_mean_variance";
import {
  computeCardEvFromPayouts,
  computeLegFactorProduct,
  scalePayouts,
  computeHitDistribution,
} from "../math_models/card_ev_underdog";

export interface UdCardResult {
  stake: number;
  totalReturn: number;
  expectedValue: number;
  winProbability: number;
  hitDistribution: number[];
  structureId: string;
  structureType: string;
  breakEvenLegWinRate: number;
  kellyResult: any;
  factorProduct: number;
}

// Basic correlation handling for joint probability (same as PrizePicks)
function applyCorrelationAdjustment(legs: CardLegInput[]): number {
  // Check for same-team correlations (using team as proxy for game correlation)
  const teams = new Map<string, CardLegInput[]>();
  for (const leg of legs) {
    const team = leg.team || leg.player; // Use team or fallback to player name
    if (!teams.has(team)) teams.set(team, []);
    teams.get(team)!.push(leg);
  }
  
  // Apply correlation adjustments
  let totalAdjustment = 1.0;
  let correlationLog: string[] = [];
  
  for (const [team, teamLegs] of teams) {
    if (teamLegs.length >= 2) {
      // Same team correlation: increase joint probability slightly
      const overCount = teamLegs.filter(l => l.outcome === "over").length;
      const underCount = teamLegs.filter(l => l.outcome === "under").length;
      
      let adjustment = 1.0;
      let reason = "";
      
      if (overCount >= 2) {
        adjustment = 1.05; // 5% boost for correlated overs
        reason = "correlated overs";
      } else if (underCount >= 2) {
        adjustment = 1.10; // 10% boost for correlated unders
        reason = "correlated unders";
      } else {
        adjustment = 1.03; // 3% boost for mixed same-team legs
        reason = "mixed same-team legs";
      }
      
      totalAdjustment *= adjustment;
      correlationLog.push(`${team}: ${teamLegs.length} legs, ${reason}, +${((adjustment - 1) * 100).toFixed(1)}%`);
    }
  }
  
  // Log correlation adjustments if any were applied
  if (correlationLog.length > 0) {
    console.log(`🔗 UD Correlation adjustment applied: ${correlationLog.join("; ")} (total: +${((totalAdjustment - 1) * 100).toFixed(1)}%)`);
  }
  
  return totalAdjustment;
}

// Underdog Standard (all-or-nothing) evaluation
export function evaluateUdStandardCard(legs: CardLegInput[], overrideStructureId?: string): UdCardResult | null {
  const size = legs.length;
  const stake = 1;

  const structureId = overrideStructureId ?? getUnderdogStructureId(size, 'standard');
  if (!structureId) {
    throw new Error(`Unsupported UD standard card size: ${size}`);
  }
  
  const structure = getUnderdogStructureById(structureId);
  if (!structure) {
    throw new Error(`Structure not found: ${structureId}`);
  }

  // Step 1: Apply correlation adjustment to joint probability
  const correlationFactor = applyCorrelationAdjustment(legs);
  
  // Step 2: Compute exact joint probability (product of individual leg probabilities)
  const baseJointProb = legs.reduce((prod, leg) => prod * leg.trueProb, 1);
  const adjustedJointProb = Math.min(baseJointProb * correlationFactor, 0.95); // Cap at 95%
  
  // Step 3: EV-first filtering - compute slip EV using exact joint probability
  const payoutMultiplier = structure.payouts[size] || 1; // All-hits payout for standard
  const slipEV = adjustedJointProb * payoutMultiplier - 1;
  
  // Apply minimum slip EV threshold (3% default)
  const minSlipEv = 0.03;
  if (slipEV < minSlipEv) {
    return null; // EV-first filtering: reject low-EV slips early
  }

  const hitProbs = computeHitDistribution(legs);
  // Apply cumulative UD per-leg factor to all payout tiers
  const factorProduct = computeLegFactorProduct(legs);
  const payouts = scalePayouts(structure.payouts, factorProduct);

  const { expectedReturn, expectedValue, winProbability } =
    computeCardEvFromPayouts(hitProbs, payouts, stake);

  // Convert hit distribution array to record format for Kelly calculation
  const hitDistributionRecord: Record<number, number> = {};
  hitProbs.forEach((prob, hits) => {
    if (prob > 0) hitDistributionRecord[hits] = prob;
  });

  // Compute Kelly sizing using mean-variance approximation
  const kellyResult = computeKellyForCard(
    expectedValue,
    hitDistributionRecord,
    structure.id.replace('UD_', '') as any, // Remove 'UD_' prefix for consistency
    'underdog',
    DEFAULT_KELLY_CONFIG
  );

  return {
    stake,
    totalReturn: expectedReturn,
    expectedValue,
    winProbability,
    hitDistribution: hitProbs,
    structureId: structure.id,
    structureType: structure.type,
    breakEvenLegWinRate: calculateBreakEvenLegWinRate(structure),
    kellyResult,
    factorProduct, // exposed for diagnostics
  };
}

// Underdog Flex evaluation (tiered payout ladder — 1-loss or 2-loss)
export function evaluateUdFlexCard(legs: CardLegInput[], overrideStructureId?: string) {
  const size = legs.length;
  const stake = 1;

  // Default to 'flex' type lookup when no override provided
  const structureId = overrideStructureId ?? getUnderdogStructureId(size, 'flex');
  if (!structureId) {
    throw new Error(`Unsupported UD flex card size: ${size}`);
  }
  
  const structure = getUnderdogStructureById(structureId);
  if (!structure) {
    throw new Error(`Structure not found: ${structureId}`);
  }

  // Verify this structure has flex-style payouts (multiple hit levels)
  const hitCount = Object.keys(structure.payouts).length;
  if (hitCount <= 1) {
    throw new Error(`Structure ${structureId} does not have flex-style payouts`);
  }

  const hitProbs = computeHitDistribution(legs);
  // Apply cumulative UD per-leg factor to all payout tiers
  const factorProduct = computeLegFactorProduct(legs);
  const payouts = scalePayouts(structure.payouts, factorProduct);

  const { expectedReturn, expectedValue, winProbability } =
    computeCardEvFromPayouts(hitProbs, payouts, stake);

  // Convert hit distribution array to record format for Kelly calculation
  const hitDistributionRecord: Record<number, number> = {};
  hitProbs.forEach((prob, hits) => {
    if (prob > 0) hitDistributionRecord[hits] = prob;
  });

  // Compute Kelly sizing using mean-variance approximation
  const kellyResult = computeKellyForCard(
    expectedValue,
    hitDistributionRecord,
    structure.id.replace('UD_', '') as any, // Remove 'UD_' prefix for consistency
    'underdog',
    DEFAULT_KELLY_CONFIG
  );

  return {
    stake,
    totalReturn: expectedReturn,
    expectedValue,
    winProbability,
    hitDistribution: hitProbs,
    structureId: structure.id,
    structureType: structure.type,
    breakEvenLegWinRate: calculateBreakEvenLegWinRate(structure),
    kellyResult,
    factorProduct, // exposed for diagnostics
  };
}

// Backward-compat alias — old code may still reference evaluateUdInsuredCard.
// Flex ladders ARE the insurance-like product; there is no separate Insured mode.
export const evaluateUdInsuredCard = evaluateUdFlexCard;
