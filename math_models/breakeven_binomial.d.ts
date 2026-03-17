/**
 * math_models/breakeven_binomial.ts
 * Breakeven p* from binomial ER(p)=Σ C(n,k) p^k (1-p)^{n-k} payout[k], EV(p)=ER(p)-1, solve EV(p*)=0.
 * EXTRACTED FROM: src/config/binomial_breakeven.ts — do not change formulas without peer-review.
 */
/** Binomial coefficient C(n, k) */
export declare function binom(n: number, k: number): number;
/** PMF P(X = k) for X ~ Bin(n, p) */
export declare function binomPmf(k: number, n: number, p: number): number;
/**
 * Expected return per unit staked (i.i.d. legs each with prob p).
 * ER(p) = Σ_{k=0..n} C(n,k) p^k (1-p)^{n-k} * payoutByHits[k]
 * EV(p) = ER(p) - 1
 */
export declare function expectedReturnBinomial(n: number, payoutByHits: Record<number, number>, p: number): number;
/**
 * Solve for p* where EV(p*)=0. Autobracket then bisection.
 */
export declare function solveBreakevenProbability(n: number, payoutByHits: Record<number, number>, maxIter?: number, tol?: number): number;
/**
 * American odds from probability q (0<q<1).
 * q >= 0.5: American = -100*q/(1-q)
 * q < 0.5:  American = 100*(1-q)/q
 */
export declare function probToAmerican(q: number): number;
