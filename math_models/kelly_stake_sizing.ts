/**
 * math_models/kelly_stake_sizing.ts
 * Kelly-based stake sizing and portfolio allocation.
 * EXTRACTED FROM: src/kelly_stake_sizing.ts — do not change formulas without peer-review.
 */

import type { Sport, FlexType } from '../src/types';

export interface StakeSizingInput {
  cardEv: number;
  winProb: number;
  kellyFraction: number;
  bankroll: number;
  maxKellyMultiplier: number;
  sport?: Sport;
  structure?: FlexType;
}

export interface StakeSizingOutput {
  fullKellyStake: number;
  recommendedStake: number;
  expectedProfit: number;
  maxPotentialWin: number;
  riskAdjustment: string;
  kellyPercentage: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export interface BankrollConfig {
  currentBankroll: number;
  maxDailyRisk: number;
  maxKellyMultiplier: number;
  sportWeights: Record<Sport, number>;
  structureWeights: Record<FlexType, number>;
  minStake: number;
  maxStake: number;
}

export interface PortfolioAllocation {
  totalRecommendedStake: number;
  totalKellyAllocation: number;
  bankrollAtRisk: number;
  riskPercentage: number;
  scalingApplied: boolean;
  scaledStakes: Record<string, number>;
  droppedCards: string[];
}

export const DEFAULT_BANKROLL_CONFIG: BankrollConfig = {
  currentBankroll: 750,
  maxDailyRisk: 0.10,
  maxKellyMultiplier: 0.5,
  sportWeights: {
    NBA: 1.0, NFL: 0.8, MLB: 0.7, NHL: 0.5, NCAAB: 0.6, NCAAF: 0.6,
  },
  structureWeights: {
    '2P': 0.25, '3P': 0.5, '4P': 0.75, '5P': 0.9, '3F': 0.5, '4F': 0.75,
    '5F': 1.0, '6F': 1.0, '6P': 0.9, '7P': 0.5, '7F': 0.8, '8P': 0.4, '8F': 0.7,
  },
  minStake: 5.0,
  maxStake: 100.0,
};

/**
 * fullKellyStake = bankroll * kellyFraction; recommendedStake = fullKellyStake * effectiveKellyMultiplier; clamp to min/max.
 * effectiveKellyMultiplier = maxKellyMultiplier * sportWeight * structureWeight.
 * expectedProfit = recommendedStake * cardEv; maxPotentialWin = recommendedStake * 20 (approximation).
 */
export function computeStake(input: StakeSizingInput): StakeSizingOutput {
  const {
    cardEv,
    kellyFraction,
    bankroll,
    maxKellyMultiplier,
    sport = 'NBA',
    structure = '5F',
  } = input;

  const sportWeight = DEFAULT_BANKROLL_CONFIG.sportWeights[sport] || 1.0;
  const structureWeight = DEFAULT_BANKROLL_CONFIG.structureWeights[structure] || 1.0;
  const effectiveKellyMultiplier = maxKellyMultiplier * sportWeight * structureWeight;

  const fullKellyStake = bankroll * kellyFraction;
  let recommendedStake = fullKellyStake * effectiveKellyMultiplier;
  recommendedStake = Math.max(DEFAULT_BANKROLL_CONFIG.minStake, recommendedStake);
  recommendedStake = Math.min(DEFAULT_BANKROLL_CONFIG.maxStake, recommendedStake);

  const expectedProfit = recommendedStake * cardEv;
  const maxPotentialWin = recommendedStake * 20;

  let riskAdjustment: string;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  if (effectiveKellyMultiplier >= 0.9) {
    riskAdjustment = 'FULL_KELLY';
    riskLevel = cardEv > 0.10 ? 'HIGH' : 'MEDIUM';
  } else if (effectiveKellyMultiplier >= 0.5) {
    riskAdjustment = 'HALF_KELLY';
    riskLevel = 'MEDIUM';
  } else if (effectiveKellyMultiplier >= 0.25) {
    riskAdjustment = 'QUARTER_KELLY';
    riskLevel = 'LOW';
  } else {
    riskAdjustment = 'CONSERVATIVE';
    riskLevel = 'LOW';
  }
  if (cardEv > 0.15) riskLevel = 'VERY_HIGH';
  else if (cardEv > 0.10 && riskLevel === 'MEDIUM') riskLevel = 'HIGH';

  return {
    fullKellyStake,
    recommendedStake,
    expectedProfit,
    maxPotentialWin,
    riskAdjustment,
    kellyPercentage: (recommendedStake / bankroll) * 100,
    riskLevel,
  };
}

/**
 * If riskPercentage > maxDailyRisk, scale stakes by maxDailyRisk/riskPercentage; drop cards below minStake.
 */
export function computePortfolioAllocation(
  stakes: Array<{ id: string; stake: number; kellyFraction: number }>,
  config: BankrollConfig = DEFAULT_BANKROLL_CONFIG
): PortfolioAllocation {
  const totalRecommendedStake = stakes.reduce((sum, s) => sum + s.stake, 0);
  const totalKellyAllocation = stakes.reduce((sum, s) => sum + s.kellyFraction, 0);
  const bankrollAtRisk = totalRecommendedStake;
  const riskPercentage = bankrollAtRisk / config.currentBankroll;

  let scalingApplied = false;
  const scaledStakes: Record<string, number> = {};
  const droppedCards: string[] = [];

  if (riskPercentage > config.maxDailyRisk) {
    scalingApplied = true;
    const scalingFactor = config.maxDailyRisk / riskPercentage;
    for (const stake of stakes) {
      const scaledStake = stake.stake * scalingFactor;
      if (scaledStake < config.minStake) {
        droppedCards.push(stake.id);
        scaledStakes[stake.id] = 0;
      } else {
        scaledStakes[stake.id] = scaledStake;
      }
    }
  } else {
    for (const stake of stakes) {
      scaledStakes[stake.id] = stake.stake;
    }
  }

  const finalTotalStake = Object.values(scaledStakes).reduce((sum, s) => sum + s, 0);
  const finalRiskPercentage = finalTotalStake / config.currentBankroll;

  return {
    totalRecommendedStake: finalTotalStake,
    totalKellyAllocation,
    bankrollAtRisk: finalTotalStake,
    riskPercentage: finalRiskPercentage,
    scalingApplied,
    scaledStakes,
    droppedCards,
  };
}
