/**
 * Monte Carlo parlay simulation: sample card outcomes using leg true probabilities
 * and platform payout rules to estimate EV, win probability, and payout variance.
 */

const DEFAULT_SIMS = 50_000;

export interface MonteCarloLeg {
  trueProb: number;
}

export interface MonteCarloResult {
  monteCarloEV: number;
  monteCarloWinProb: number;
  payoutVariance: number;
}

/**
 * Simulate card outcomes with Bernoulli(trueProb) per leg and platform payout.
 * @param legs - each leg's win probability (trueProb)
 * @param payoutByHits - hits -> payout multiplier (e.g. 6 hits -> 25)
 * @param stake - stake per card (used for variance scale)
 * @param numSims - number of simulations (default 50_000)
 */
export function runMonteCarloParlay(
  legs: MonteCarloLeg[],
  payoutByHits: Record<number, number>,
  stake: number,
  numSims: number = DEFAULT_SIMS
): MonteCarloResult {
  const n = legs.length;
  if (n === 0) {
    return { monteCarloEV: 0, monteCarloWinProb: 0, payoutVariance: 0 };
  }

  const profits: number[] = [];
  let wins = 0;

  for (let s = 0; s < numSims; s++) {
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const p = Math.max(0, Math.min(1, legs[i].trueProb));
      if (Math.random() < p) hits += 1;
    }
    const mult = payoutByHits[hits] ?? 0;
    const payout = mult * stake;
    const profit = payout - stake;
    profits.push(profit);
    if (profit > 0) wins += 1;
  }

  const meanProfit = profits.reduce((a, b) => a + b, 0) / numSims;
  const monteCarloEV = stake !== 0 ? meanProfit / stake : 0;
  const monteCarloWinProb = wins / numSims;

  const variance =
    profits.reduce((sum, p) => sum + (p - meanProfit) ** 2, 0) / numSims;
  const payoutVariance = stake !== 0 ? variance / (stake * stake) : 0;

  return {
    monteCarloEV,
    monteCarloWinProb,
    payoutVariance,
  };
}
