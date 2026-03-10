/**
 * math_models/card_ev_distribution.ts
 * Card expected value from hit distribution and payout schedule.
 * EXTRACTED FROM: src/payout_math.ts — do not change formulas without peer-review.
 */

// Types inlined to avoid circular deps; must match src/types and src/payouts
export type CardHitDistribution = Record<number, number>;
export interface FlexPayout {
  hits: number;
  multiplier: number;
}

/**
 * Compute card expected value from hit distribution and payout schedule
 *
 * For each possible outcome (0 to n hits):
 *   profit = (payout_multiplier * stake) - stake  [if payout exists]
 *   profit = -stake                              [if no payout]
 *   contribution_to_EV = profit * probability
 *
 * Final EV = sum(contributions) / stake
 *
 * cardEv = Expected profit per 1 unit staked (e.g., 0.05 = +5% edge)
 * winProbCash = Probability of the top/cash outcome (profit > 0)
 * winProbAny = Probability of any positive return (including partial payouts)
 */
export function computeCardEvFromDistribution(
  stake: number,
  distribution: CardHitDistribution,
  payoutSchedule: FlexPayout[]
): {
  cardEv: number;
  winProbCash: number;
  winProbAny: number;
} {
  let ev = 0;
  let winProbCash = 0;
  let winProbAny = 0;

  for (const [hitsStr, prob] of Object.entries(distribution)) {
    const hits = Number(hitsStr);
    const probNum = Number(prob);
    if (!Number.isFinite(hits) || !Number.isFinite(probNum) || probNum <= 0) {
      continue;
    }

    const payout = payoutSchedule.find((p) => p.hits === hits);

    let profit: number;
    if (payout) {
      const returnAmount = payout.multiplier * stake;
      profit = returnAmount - stake;
    } else {
      profit = -stake;
    }

    ev += profit * probNum;

    if (profit > 0) {
      winProbCash += probNum;
    }
    if (payout && payout.multiplier * stake > 0) {
      winProbAny += probNum;
    }
  }

  return {
    cardEv: ev / stake,
    winProbCash,
    winProbAny,
  };
}
