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
export function computeCardEvFromPayouts(
  hitProbs: number[],
  payouts: { [hits: number]: number },
  stake: number
): { expectedReturn: number; expectedValue: number; winProbability: number } {
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

/** Product of per-leg UD payout factors; missing/invalid treated as 1.0. */
export function computeLegFactorProduct(legs: CardLegInput[]): number {
  return legs.reduce((product, leg) => {
    const f = leg.udPickFactor;
    if (f != null && Number.isFinite(f) && f > 0) return product * f;
    return product;
  }, 1.0);
}

/** Scale all payout multipliers by factor. */
export function scalePayouts(
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

/**
 * DP: distribution of hits from independent leg probabilities.
 * dist[0]=1; for each leg with prob p: dist[k] = prev*dist[k]*(1-p) + prev*dist[k-1]*p.
 */
export function computeHitDistribution(legs: CardLegInput[]): number[] {
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
