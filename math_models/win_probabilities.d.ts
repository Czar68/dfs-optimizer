/**
 * math_models/win_probabilities.ts
 * Win probabilities (winProbCash, winProbAny) from i.i.d. binomial + payout table.
 * EXTRACTED FROM: src/card_ev.ts — do not change formulas without peer-review.
 */
/**
 * winProbCash = probability of positive profit (payout > stake)
 * winProbAny  = probability of any non-zero payout (includes break-even)
 * payouts: hits -> multiplier (e.g. from PP structure)
 */
export declare function computeWinProbs(payouts: Record<number, number>, picks: number, avgProb: number): {
    winProbCash: number;
    winProbAny: number;
};
