"use strict";
/**
 * math_models/win_probabilities.ts
 * Win probabilities (winProbCash, winProbAny) from i.i.d. binomial + payout table.
 * EXTRACTED FROM: src/card_ev.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeWinProbs = computeWinProbs;
/** Binomial PMF: P(X=k) where X ~ Bin(n, p) */
function binomPmf(k, n, p) {
    if (k < 0 || k > n)
        return 0;
    let coeff = 1;
    for (let i = 0; i < k; i++) {
        coeff = (coeff * (n - i)) / (i + 1);
    }
    return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}
/**
 * winProbCash = probability of positive profit (payout > stake)
 * winProbAny  = probability of any non-zero payout (includes break-even)
 * payouts: hits -> multiplier (e.g. from PP structure)
 */
function computeWinProbs(payouts, picks, avgProb) {
    let winProbCash = 0;
    let winProbAny = 0;
    for (let k = 0; k <= picks; k++) {
        const multiplier = payouts[k] ?? 0;
        if (multiplier <= 0)
            continue;
        const prob = binomPmf(k, picks, avgProb);
        if (multiplier > 1)
            winProbCash += prob;
        winProbAny += prob;
    }
    return { winProbCash, winProbAny };
}
//# sourceMappingURL=win_probabilities.js.map