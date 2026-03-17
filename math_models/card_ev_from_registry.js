"use strict";
/**
 * math_models/card_ev_from_registry.ts
 * Card EV using registry payouts and exact outcome-based formula:
 *   EV = sum over outcomes of P(outcome) * Payout(outcome)  -  1
 * No inline math elsewhere; this is the single canonical card-EV-from-outcomes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardEvFromRegistry = cardEvFromRegistry;
exports.winProbsFromRegistry = winProbsFromRegistry;
const registry_1 = require("./registry");
/**
 * Card expected value from hit distribution and registry payouts.
 * EV = Σ P(k hits) × Payout(k) - 1  (per unit staked).
 */
function cardEvFromRegistry(distribution, structureId) {
    const payouts = (0, registry_1.getPayoutByHitsFromRegistry)(structureId);
    if (!payouts)
        return 0;
    let expectedReturn = 0;
    for (const [hitsStr, prob] of Object.entries(distribution)) {
        const hits = Number(hitsStr);
        const p = Number(prob);
        if (!Number.isFinite(p) || p <= 0)
            continue;
        const mult = payouts[hits] ?? 0;
        expectedReturn += p * mult;
    }
    return expectedReturn - 1;
}
/**
 * Win probability (any positive return) and cash probability (multiplier > 1).
 */
function winProbsFromRegistry(distribution, structureId) {
    const payouts = (0, registry_1.getPayoutByHitsFromRegistry)(structureId);
    if (!payouts)
        return { winProbCash: 0, winProbAny: 0 };
    let winProbCash = 0;
    let winProbAny = 0;
    for (const [hitsStr, prob] of Object.entries(distribution)) {
        const hits = Number(hitsStr);
        const p = Number(prob);
        if (!Number.isFinite(p) || p <= 0)
            continue;
        const mult = payouts[hits] ?? 0;
        if (mult > 1)
            winProbCash += p;
        if (mult > 0)
            winProbAny += p;
    }
    return { winProbCash, winProbAny };
}
//# sourceMappingURL=card_ev_from_registry.js.map