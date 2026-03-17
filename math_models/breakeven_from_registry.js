"use strict";
/**
 * math_models/breakeven_from_registry.ts
 * Breakeven probability per structure from registry payouts.
 * Uses breakeven_binomial.solveBreakevenProbability; no inline math.
 * Single source for "required fair probability" for a given structure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBreakevenThreshold = getBreakevenThreshold;
const breakeven_binomial_1 = require("./breakeven_binomial");
const registry_1 = require("./registry");
/**
 * Required fair (breakeven) leg win probability for the given structure.
 * If average leg win probability < this value, the card is -EV.
 * Returns 0 if structure not in registry.
 */
function getBreakevenThreshold(structureId) {
    const entry = (0, registry_1.getRegistryEntry)(structureId);
    if (!entry)
        return 0;
    const payoutByHits = (0, registry_1.getPayoutByHitsFromRegistry)(structureId);
    if (!payoutByHits)
        return 0;
    return (0, breakeven_binomial_1.solveBreakevenProbability)(entry.size, payoutByHits);
}
//# sourceMappingURL=breakeven_from_registry.js.map