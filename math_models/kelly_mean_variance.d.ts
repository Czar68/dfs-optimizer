/**
 * math_models/kelly_mean_variance.ts
 * Mean-variance Kelly approximation for multi-outcome bets.
 * EXTRACTED FROM: src/kelly_mean_variance.ts — do not change formulas without peer-review.
 */
import type { CardHitDistribution, FlexType } from '../src/types';
export interface KellyConfig {
    bankroll: number;
    globalKellyMultiplier: number;
    maxPerCardFraction: number;
    minCardEv: number;
    maxRawKellyFraction: number;
}
export interface KellyResult {
    meanReturn: number;
    variance: number;
    rawKellyFraction: number;
    cappedKellyFraction: number;
    safeKellyFraction: number;
    finalKellyFraction: number;
    recommendedStake: number;
    expectedProfit: number;
    maxPotentialWin: number;
    riskAdjustment: string;
    isCapped: boolean;
    capReasons: string[];
}
export declare const DEFAULT_KELLY_CONFIG: KellyConfig;
/**
 * f* ≈ μ/σ² where μ = Σ p[i]*r[i], σ² = Σ p[i]*(r[i]-μ)², r[i] = payout[i]-1.
 */
export declare function computeKellyForCard(cardEv: number, hitDistribution: CardHitDistribution, flexType: FlexType, site: 'prizepicks' | 'underdog', config?: KellyConfig): KellyResult;
/**
 * Binomial PMF hit distribution for PrizePicks (iid avgProb).
 */
export declare function computePrizePicksHitDistribution(legs: {
    pick: {
        trueProb: number;
    };
}[], flexType: FlexType): CardHitDistribution;
