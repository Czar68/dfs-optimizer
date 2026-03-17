"use strict";
/**
 * math_models/hit_distribution_dp.ts
 * Hit distribution: DP for non-iid legs, binomial PMF for iid.
 * EXTRACTED FROM: src/engine_interface.ts, src/underdog_card_ev.ts, src/card_ev.ts, src/kelly_mean_variance.ts
 * Do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.binom = binom;
exports.binomPmf = binomPmf;
exports.computeHitDistributionDP = computeHitDistributionDP;
exports.computeHitDistributionRecord = computeHitDistributionRecord;
exports.computePrizePicksHitDistributionIid = computePrizePicksHitDistributionIid;
/** Binomial coefficient C(n, k) */
function binom(n, k) {
    if (k < 0 || k > n)
        return 0;
    let c = 1;
    for (let i = 0; i < k; i++) {
        c = (c * (n - i)) / (i + 1);
    }
    return c;
}
/** Binomial PMF: P(X = k) for X ~ Bin(n, p). */
function binomPmf(k, n, p) {
    if (k < 0 || k > n)
        return 0;
    return binom(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}
/**
 * DP: P(exactly j hits) over n legs with per-leg probs.
 * dp[j] = P(exactly j hits so far). Iterate legs, then dp[k] * payout[k].
 */
function computeHitDistributionDP(probs) {
    const n = probs.length;
    let dp = new Array(n + 1).fill(0);
    dp[0] = 1;
    for (let i = 0; i < n; i++) {
        const p = probs[i];
        const next = new Array(n + 1).fill(0);
        for (let j = 0; j <= i; j++) {
            if (dp[j] === 0)
                continue;
            next[j] += dp[j] * (1 - p);
            next[j + 1] += dp[j] * p;
        }
        dp = next;
    }
    return dp;
}
/**
 * Same DP returning Record<number, number> for compatibility.
 */
function computeHitDistributionRecord(probs) {
    const arr = computeHitDistributionDP(probs);
    const out = {};
    arr.forEach((prob, k) => {
        if (prob > 0)
            out[k] = prob;
    });
    return out;
}
/**
 * PrizePicks i.i.d. approximation: avgProb for all legs, binomial PMF.
 * P(X=k) = C(n,k) × p^k × (1-p)^(n-k)
 */
function computePrizePicksHitDistributionIid(legTrueProbs, _flexType) {
    const n = legTrueProbs.length;
    const avgProb = legTrueProbs.reduce((s, p) => s + p, 0) / n;
    const distribution = {};
    for (let k = 0; k <= n; k++) {
        let coeff = 1;
        for (let i = 0; i < k; i++) {
            coeff = (coeff * (n - i)) / (i + 1);
        }
        distribution[k] = coeff * Math.pow(avgProb, k) * Math.pow(1 - avgProb, n - k);
    }
    return distribution;
}
//# sourceMappingURL=hit_distribution_dp.js.map