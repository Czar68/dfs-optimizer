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
export declare const DEFAULT_BANKROLL_CONFIG: BankrollConfig;
/**
 * fullKellyStake = bankroll * kellyFraction; recommendedStake = fullKellyStake * effectiveKellyMultiplier; clamp to min/max.
 * effectiveKellyMultiplier = maxKellyMultiplier * sportWeight * structureWeight.
 * expectedProfit = recommendedStake * cardEv; maxPotentialWin = recommendedStake * 20 (approximation).
 */
export declare function computeStake(input: StakeSizingInput): StakeSizingOutput;
/**
 * If riskPercentage > maxDailyRisk, scale stakes by maxDailyRisk/riskPercentage; drop cards below minStake.
 */
export declare function computePortfolioAllocation(stakes: Array<{
    id: string;
    stake: number;
    kellyFraction: number;
}>, config?: BankrollConfig): PortfolioAllocation;
