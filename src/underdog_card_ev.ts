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

// Simple helper to compute card EV from hit distribution and payout structure
function computeCardEvFromPayouts(
  hitProbs: number[], // index = hits, value = probability
  payouts: { [hits: number]: number }, // hits -> payout multiple
  stake: number
) {
  let expectedReturn = 0;

  hitProbs.forEach((prob, hits) => {
    const multiple = payouts[hits] ?? 0;
    expectedReturn += prob * multiple * stake;
  });

  const expectedValue = (expectedReturn - stake) / stake;
  const winProbability = hitProbs.reduce((acc, prob, hits) => {
    const multiple = payouts[hits] ?? 0;
    return acc + (multiple > 0 ? prob : 0);
  }, 0);

  return { expectedReturn, expectedValue, winProbability };
}

// Compute the product of all per-leg UD payout factors.
// Each leg's factor independently scales the entire card's payout.
// Standard legs (no factor / factor === null) contribute 1.0.
function computeLegFactorProduct(legs: CardLegInput[]): number {
  return legs.reduce((product, leg) => {
    const f = leg.udPickFactor;
    if (f !== null && f !== undefined && Number.isFinite(f) && f > 0) {
      return product * f;
    }
    return product; // treat missing/invalid as 1.0
  }, 1.0);
}

// Scale all payout multipliers by a factor (used to apply the cumulative UD pick factor)
function scalePayouts(
  payouts: { [hits: number]: number },
  factor: number
): { [hits: number]: number } {
  if (factor === 1.0) return payouts;
  const scaled: { [hits: number]: number } = {};
  for (const [hits, mult] of Object.entries(payouts)) {
    scaled[Number(hits)] = mult * factor;
  }
  return scaled;
}

// Compute distribution of hits from independent leg probabilities (DP)
function computeHitDistribution(legs: CardLegInput[]): number[] {
  const n = legs.length;
  const dist = new Array(n + 1).fill(0);
  dist[0] = 1;

  for (const leg of legs) {
    const p = leg.trueProb;
    for (let k = n; k >= 0; k--) {
      const prev = dist[k];
      dist[k] = prev * (1 - p) + (k > 0 ? dist[k - 1] * p : 0);
    }
  }

  return dist;
}

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
