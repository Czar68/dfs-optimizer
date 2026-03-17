"use strict";
/**
 * math_models/breakeven_binomial.ts
 * Breakeven p* from binomial ER(p)=Σ C(n,k) p^k (1-p)^{n-k} payout[k], EV(p)=ER(p)-1, solve EV(p*)=0.
 * EXTRACTED FROM: src/config/binomial_breakeven.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.binom = binom;
exports.binomPmf = binomPmf;
exports.expectedReturnBinomial = expectedReturnBinomial;
exports.solveBreakevenProbability = solveBreakevenProbability;
exports.probToAmerican = probToAmerican;
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
/** PMF P(X = k) for X ~ Bin(n, p) */
function binomPmf(k, n, p) {
    if (k < 0 || k > n)
        return 0;
    return binom(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}
/**
 * Expected return per unit staked (i.i.d. legs each with prob p).
 * ER(p) = Σ_{k=0..n} C(n,k) p^k (1-p)^{n-k} * payoutByHits[k]
 * EV(p) = ER(p) - 1
 */
function expectedReturnBinomial(n, payoutByHits, p) {
    let er = 0;
    for (let k = 0; k <= n; k++) {
        const mult = payoutByHits[k] ?? 0;
        er += binomPmf(k, n, p) * mult;
    }
    return er - 1;
}
function findBracket(n, payoutByHits, pMin = 0.01, pMax = 0.99, step = 0.01) {
    let evPrev = expectedReturnBinomial(n, payoutByHits, pMin);
    for (let p = pMin + step; p <= pMax; p += step) {
        const ev = expectedReturnBinomial(n, payoutByHits, p);
        if (evPrev * ev <= 0 && evPrev !== ev) {
            return { pLo: p - step, pHi: p };
        }
        evPrev = ev;
    }
    throw new Error(`Breakeven autobracket failed: no sign change for structure n=${n} in [${pMin}, ${pMax}].`);
}
/**
 * Solve for p* where EV(p*)=0. Autobracket then bisection.
 */
function solveBreakevenProbability(n, payoutByHits, maxIter = 80, tol = 1e-8) {
    const { pLo, pHi } = findBracket(n, payoutByHits);
    let lo = pLo;
    let hi = pHi;
    for (let i = 0; i < maxIter; i++) {
        const mid = (lo + hi) / 2;
        const evMid = expectedReturnBinomial(n, payoutByHits, mid);
        if (Math.abs(evMid) < tol)
            return mid;
        if (evMid < 0)
            lo = mid;
        else
            hi = mid;
    }
    return (lo + hi) / 2;
}
/**
 * American odds from probability q (0<q<1).
 * q >= 0.5: American = -100*q/(1-q)
 * q < 0.5:  American = 100*(1-q)/q
 */
function probToAmerican(q) {
    if (q <= 0 || q >= 1)
        return 0;
    if (q >= 0.5)
        return (-100 * q) / (1 - q);
    return (100 * (1 - q)) / q;
}
//# sourceMappingURL=breakeven_binomial.js.map