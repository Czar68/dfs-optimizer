/**
 * math_models/ev_dp_prizepicks.ts
 * Exact card EV via DP hit distribution (non-iid) and i.i.d. binomial EV.
 * EXTRACTED FROM: src/engine_interface.ts
 * Do not change formulas without peer-review.
 */
/**
 * Compute EV locally using i.i.d. binomial model.
 * expectedReturn = Σ_k binomPmf(k, picks, avgProb) * payout[k]; return expectedReturn - 1.
 */
export declare function computeLocalEv(structure: string, picks: number, avgProb: number): number;
/**
 * Compute exact card EV via DP hit distribution (non-iid).
 * probs[i] = trueProb for leg i.  Returns EV = Σ P(k hits) × payout(k) - 1.
 * dp[j] = P(exactly j hits so far); recurrence: next[j] += dp[j]*(1-p), next[j+1] += dp[j]*p.
 */
export declare function computeLocalEvDP(structure: string, probs: number[]): number;
