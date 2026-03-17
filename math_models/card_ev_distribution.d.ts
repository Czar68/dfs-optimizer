/**
 * math_models/card_ev_distribution.ts
 * Card expected value from hit distribution and payout schedule.
 * EXTRACTED FROM: src/payout_math.ts — do not change formulas without peer-review.
 */
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
export declare function computeCardEvFromDistribution(stake: number, distribution: CardHitDistribution, payoutSchedule: FlexPayout[]): {
    cardEv: number;
    winProbCash: number;
    winProbAny: number;
};
