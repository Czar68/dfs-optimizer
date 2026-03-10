/**
 * math_models/ev_dp_prizepicks.ts
 * Exact card EV via DP hit distribution (non-iid) and i.i.d. binomial EV.
 * EXTRACTED FROM: src/engine_interface.ts
 * Do not change formulas without peer-review.
 */

import { getPayoutsAsRecord } from '../src/config/prizepicks_payouts';

const PP_PAYOUTS: Record<string, Record<number, number>> = {
  '2P': getPayoutsAsRecord('2P'),
  '3P': getPayoutsAsRecord('3P'),
  '4P': getPayoutsAsRecord('4P'),
  '5P': getPayoutsAsRecord('5P'),
  '6P': getPayoutsAsRecord('6P'),
  '3F': getPayoutsAsRecord('3F'),
  '4F': getPayoutsAsRecord('4F'),
  '5F': getPayoutsAsRecord('5F'),
  '6F': getPayoutsAsRecord('6F'),
};

function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  let coeff = 1;
  for (let i = 0; i < k; i++) {
    coeff = (coeff * (n - i)) / (i + 1);
  }
  return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Compute EV locally using i.i.d. binomial model.
 * expectedReturn = Σ_k binomPmf(k, picks, avgProb) * payout[k]; return expectedReturn - 1.
 */
export function computeLocalEv(structure: string, picks: number, avgProb: number): number {
  const payouts = PP_PAYOUTS[structure];
  if (!payouts) return 0;

  let expectedReturn = 0;
  for (let k = 0; k <= picks; k++) {
    const payout = payouts[k] ?? 0;
    if (payout === 0) continue;
    expectedReturn += binomPmf(k, picks, avgProb) * payout;
  }
  return expectedReturn - 1;
}

/**
 * Compute exact card EV via DP hit distribution (non-iid).
 * probs[i] = trueProb for leg i.  Returns EV = Σ P(k hits) × payout(k) - 1.
 * dp[j] = P(exactly j hits so far); recurrence: next[j] += dp[j]*(1-p), next[j+1] += dp[j]*p.
 */
export function computeLocalEvDP(structure: string, probs: number[]): number {
  const payouts = PP_PAYOUTS[structure];
  if (!payouts || probs.length === 0) return 0;

  const n = probs.length;
  let dp = new Array(n + 1).fill(0);
  dp[0] = 1;

  for (let i = 0; i < n; i++) {
    const p = probs[i];
    const next = new Array(n + 1).fill(0);
    for (let j = 0; j <= i; j++) {
      if (dp[j] === 0) continue;
      next[j] += dp[j] * (1 - p);
      next[j + 1] += dp[j] * p;
    }
    dp = next;
  }

  let expectedReturn = 0;
  for (let k = 0; k <= n; k++) {
    const payout = payouts[k] ?? 0;
    if (payout === 0) continue;
    expectedReturn += dp[k] * payout;
  }
  return expectedReturn - 1;
}
