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

import { CardLegInput } from "./types";
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

// Underdog Standard (all-or-nothing) evaluation
export function evaluateUdStandardCard(legs: CardLegInput[], overrideStructureId?: string) {
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
