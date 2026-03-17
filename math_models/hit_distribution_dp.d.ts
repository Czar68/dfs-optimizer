/**
 * math_models/hit_distribution_dp.ts
 * Hit distribution: DP for non-iid legs, binomial PMF for iid.
 * EXTRACTED FROM: src/engine_interface.ts, src/underdog_card_ev.ts, src/card_ev.ts, src/kelly_mean_variance.ts
 * Do not change formulas without peer-review.
 */
export type CardHitDistribution = Record<number, number>;
/** Binomial coefficient C(n, k) */
export declare function binom(n: number, k: number): number;
/** Binomial PMF: P(X = k) for X ~ Bin(n, p). */
export declare function binomPmf(k: number, n: number, p: number): number;
/**
 * DP: P(exactly j hits) over n legs with per-leg probs.
 * dp[j] = P(exactly j hits so far). Iterate legs, then dp[k] * payout[k].
 */
export declare function computeHitDistributionDP(probs: number[]): number[];
/**
 * Same DP returning Record<number, number> for compatibility.
 */
export declare function computeHitDistributionRecord(probs: number[]): CardHitDistribution;
/**
 * PrizePicks i.i.d. approximation: avgProb for all legs, binomial PMF.
 * P(X=k) = C(n,k) × p^k × (1-p)^(n-k)
 */
export declare function computePrizePicksHitDistributionIid(legTrueProbs: number[], _flexType: string): CardHitDistribution;
