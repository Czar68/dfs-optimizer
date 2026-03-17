/**
 * math_models/card_ev_from_registry.ts
 * Card EV using registry payouts and exact outcome-based formula:
 *   EV = sum over outcomes of P(outcome) * Payout(outcome)  -  1
 * No inline math elsewhere; this is the single canonical card-EV-from-outcomes.
 */
export type HitDistribution = Record<number, number>;
/**
 * Card expected value from hit distribution and registry payouts.
 * EV = Σ P(k hits) × Payout(k) - 1  (per unit staked).
 */
export declare function cardEvFromRegistry(distribution: HitDistribution, structureId: string): number;
/**
 * Win probability (any positive return) and cash probability (multiplier > 1).
 */
export declare function winProbsFromRegistry(distribution: HitDistribution, structureId: string): {
    winProbCash: number;
    winProbAny: number;
};
