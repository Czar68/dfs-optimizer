// src/kelly_mean_variance.ts
// Mean-variance Kelly approximation for multi-outcome bets

import { CardHitDistribution, FlexType } from './types';
import { getPayoutsAsRecord, getMaxPayoutMultiplier } from './config/prizepicks_payouts';
import { getUnderdogStructureById } from './config/underdog_structures';

export interface KellyConfig {
  bankroll: number;
  globalKellyMultiplier: number;    // e.g., 0.5 for half-Kelly
  maxPerCardFraction: number;       // e.g., 0.05 for 5% max per card
  minCardEv: number;                // e.g., 0.03 for 3% minimum EV
  maxRawKellyFraction: number;      // e.g., 0.10 for 10% raw Kelly cap
}

export interface KellyResult {
  // Raw calculations
  meanReturn: number;               // μ: Expected net return per unit stake
  variance: number;                 // σ²: Variance of net returns
  rawKellyFraction: number;         // μ/σ²: Raw mean-variance Kelly
  
  // Applied constraints
  cappedKellyFraction: number;      // After maxRawKellyFraction cap
  safeKellyFraction: number;        // After globalKellyMultiplier
  finalKellyFraction: number;       // After maxPerCardFraction cap
  
  // Dollar amounts
  recommendedStake: number;         // Final dollar stake
  expectedProfit: number;           // Expected profit (stake × cardEv)
  maxPotentialWin: number;          // Max possible win (stake × (maxPayout - 1))
  
  // Diagnostics
  riskAdjustment: string;           // 'FULL_KELLY', 'HALF_KELLY', 'QUARTER_KELLY', 'CONSERVATIVE'
  isCapped: boolean;                // True if any constraint was hit
  capReasons: string[];             // Which constraints were applied
}

export const DEFAULT_KELLY_CONFIG: KellyConfig = {
  bankroll: 750,
  globalKellyMultiplier: 0.5,      // Half-Kelly
  maxPerCardFraction: 0.05,         // 5% max per card
  minCardEv: 0.03,                  // 3% minimum EV
  maxRawKellyFraction: 0.10,        // 10% raw Kelly cap
};

/**
 * Compute mean-variance Kelly for a card with full outcome distribution
 * 
 * Formula: f* ≈ μ/σ² where:
 *   μ = Σ p[i] × r[i] (expected net return)
 *   σ² = Σ p[i] × (r[i] - μ)² (variance of net returns)
 *   r[i] = payout[i] - 1 (net return multiplier)
 */
export function computeKellyForCard(
  cardEv: number,
  hitDistribution: CardHitDistribution,
  flexType: FlexType,
  site: 'prizepicks' | 'underdog',
  config: KellyConfig = DEFAULT_KELLY_CONFIG
): KellyResult {
  
  // Get payout structure
  const payouts = getPayoutsForCard(flexType, site);
  
  // Compute μ (mean net return) and σ² (variance)
  let meanReturn = 0;
  let variance = 0;
  
  // First pass: compute mean return
  for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
    const hits = Number(hitsStr);
    const probNum = Number(prob);
    
    if (!Number.isFinite(probNum) || probNum <= 0) continue;
    
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1; // Net return multiplier (profit/loss per unit)
    
    meanReturn += probNum * netReturn;
  }
  
  // Second pass: compute variance
  for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
    const hits = Number(hitsStr);
    const probNum = Number(prob);
    
    if (!Number.isFinite(probNum) || probNum <= 0) continue;
    
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1;
    
    variance += probNum * Math.pow(netReturn - meanReturn, 2);
  }
  
  // Edge case: zero variance (shouldn't happen with real data)
  if (variance < 1e-10) {
    return createZeroKellyResult(config, 'ZERO_VARIANCE');
  }
  
  // Raw mean-variance Kelly
  const rawKellyFraction = meanReturn / variance;
  
  // Apply constraints
  const capReasons: string[] = [];
  let cappedKellyFraction = rawKellyFraction;
  
  // Cap raw Kelly to prevent extreme bets
  if (rawKellyFraction > config.maxRawKellyFraction) {
    cappedKellyFraction = config.maxRawKellyFraction;
    capReasons.push('RAW_KELLY_CAP');
  }
  
  // Apply global Kelly multiplier (half-Kelly safety)
  const safeKellyFraction = cappedKellyFraction * config.globalKellyMultiplier;
  if (config.globalKellyMultiplier < 1.0) {
    capReasons.push('GLOBAL_MULTIPLIER');
  }
  
  // Apply per-card absolute cap
  let finalKellyFraction = safeKellyFraction;
  if (safeKellyFraction > config.maxPerCardFraction) {
    finalKellyFraction = config.maxPerCardFraction;
    capReasons.push('PER_CARD_CAP');
  }
  
  // Skip if EV too low
  if (cardEv < config.minCardEv) {
    return createZeroKellyResult(config, 'BELOW_MIN_EV');
  }
  
  // Skip if Kelly fraction is negative or zero
  if (finalKellyFraction <= 0) {
    return createZeroKellyResult(config, 'NEGATIVE_KELLY');
  }
  
  // Calculate dollar amounts
  const recommendedStake = config.bankroll * finalKellyFraction;
  const expectedProfit = recommendedStake * cardEv;
  const maxPayout = getMaxPayoutForCard(flexType, site);
  const maxPotentialWin = recommendedStake * (maxPayout - 1);
  
  // Determine risk adjustment label
  const riskAdjustment = determineRiskAdjustment(finalKellyFraction, rawKellyFraction, config.globalKellyMultiplier);
  
  return {
    meanReturn,
    variance,
    rawKellyFraction,
    cappedKellyFraction,
    safeKellyFraction,
    finalKellyFraction,
    recommendedStake,
    expectedProfit,
    maxPotentialWin,
    riskAdjustment,
    isCapped: capReasons.length > 0,
    capReasons,
  };
}

/**
 * Get payout structure for a card based on site and flex type
 */
function getPayoutsForCard(flexType: FlexType, site: 'prizepicks' | 'underdog'): Record<number, number> {
  if (site === 'prizepicks') {
    return getPayoutsAsRecord(flexType);
  } else {
    // Underdog structures are stored differently
    const structure = getUnderdogStructureById(`UD_${flexType}`);
    return structure?.payouts || {};
  }
}

/**
 * Get max payout for a card
 */
function getMaxPayoutForCard(flexType: FlexType, site: 'prizepicks' | 'underdog'): number {
  if (site === 'prizepicks') {
    return getMaxPayoutMultiplier(flexType);
  } else {
    const structure = getUnderdogStructureById(`UD_${flexType}`);
    if (!structure) return 0;
    return Math.max(...Object.values(structure.payouts));
  }
}

/**
 * Create zero-Kelly result for edge cases
 */
function createZeroKellyResult(config: KellyConfig, reason: string): KellyResult {
  return {
    meanReturn: 0,
    variance: 0,
    rawKellyFraction: 0,
    cappedKellyFraction: 0,
    safeKellyFraction: 0,
    finalKellyFraction: 0,
    recommendedStake: 0,
    expectedProfit: 0,
    maxPotentialWin: 0,
    riskAdjustment: reason,
    isCapped: true,
    capReasons: [reason],
  };
}

/**
 * Determine risk adjustment label based on applied multipliers
 */
function determineRiskAdjustment(
  finalFraction: number,
  rawFraction: number,
  globalMultiplier: number
): string {
  const ratio = finalFraction / (rawFraction || 1);
  
  if (ratio >= 0.9) {
    return 'FULL_KELLY';
  } else if (ratio >= 0.4) {
    return 'HALF_KELLY';
  } else if (ratio >= 0.2) {
    return 'QUARTER_KELLY';
  } else {
    return 'CONSERVATIVE';
  }
}

/**
 * Compute outcome distribution for PrizePicks card (i.i.d. binomial)
 * This is needed because PrizePicks cards don't expose hitDistribution
 */
export function computePrizePicksHitDistribution(
  legs: { pick: { trueProb: number } }[],
  flexType: FlexType
): CardHitDistribution {
  const n = legs.length;
  const avgProb = legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / n;
  
  // Binomial PMF: P(X=k) = C(n,k) × p^k × (1-p)^(n-k)
  const distribution: CardHitDistribution = {};
  
  for (let k = 0; k <= n; k++) {
    let coeff = 1;
    // Compute binomial coefficient C(n,k)
    for (let i = 0; i < k; i++) {
      coeff = coeff * (n - i) / (i + 1);
    }
    
    const prob = coeff * Math.pow(avgProb, k) * Math.pow(1 - avgProb, n - k);
    distribution[k] = prob;
  }
  
  return distribution;
}
