/**
 * math_models/breakeven_from_registry.ts
 * Breakeven probability per structure from registry payouts.
 * Uses breakeven_binomial.solveBreakevenProbability; no inline math.
 * Single source for "required fair probability" for a given structure.
 */

import { solveBreakevenProbability } from "./breakeven_binomial";
import { getRegistryEntry, getPayoutByHitsFromRegistry } from "./registry";

/**
 * Required fair (breakeven) leg win probability for the given structure.
 * If average leg win probability < this value, the card is -EV.
 * Returns 0 if structure not in registry.
 */
export function getBreakevenThreshold(structureId: string): number {
  const entry = getRegistryEntry(structureId);
  if (!entry) return 0;
  const payoutByHits = getPayoutByHitsFromRegistry(structureId);
  if (!payoutByHits) return 0;
  return solveBreakevenProbability(entry.size, payoutByHits);
}
