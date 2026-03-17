/**
 * math_models/breakeven_from_registry.ts
 * Breakeven probability per structure from registry payouts.
 * Uses breakeven_binomial.solveBreakevenProbability; no inline math.
 * Single source for "required fair probability" for a given structure.
 */
/**
 * Required fair (breakeven) leg win probability for the given structure.
 * If average leg win probability < this value, the card is -EV.
 * Returns 0 if structure not in registry.
 */
export declare function getBreakevenThreshold(structureId: string): number;
