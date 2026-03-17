/**
 * math_models/card_ev_underdog.ts
 * Underdog card EV from hit distribution and payout structure (Standard + Flex).
 * EXTRACTED FROM: src/underdog_card_ev.ts
 * Do not change formulas without peer-review.
 */
export interface CardLegInput {
    trueProb: number;
    udPickFactor?: number | null;
}
/**
 * expectedReturn = Σ hitProbs[hits] * payouts[hits] * stake
 * expectedValue = (expectedReturn - stake) / stake
 * winProbability = Σ hitProbs where payout > 0
 */
export declare function computeCardEvFromPayouts(hitProbs: number[], payouts: {
    [hits: number]: number;
}, stake: number): {
    expectedReturn: number;
    expectedValue: number;
    winProbability: number;
};
/** Product of per-leg UD payout factors; missing/invalid treated as 1.0. */
export declare function computeLegFactorProduct(legs: CardLegInput[]): number;
/** Scale all payout multipliers by factor. */
export declare function scalePayouts(payouts: {
    [hits: number]: number;
}, factor: number): {
    [hits: number]: number;
};
/**
 * DP: distribution of hits from independent leg probabilities.
 * dist[0]=1; for each leg with prob p: dist[k] = prev*dist[k]*(1-p) + prev*dist[k-1]*p.
 */
export declare function computeHitDistribution(legs: CardLegInput[]): number[];
