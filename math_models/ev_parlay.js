"use strict";
/**
 * math_models/ev_parlay.ts
 * EV per unit, parlay decimal odds, Kelly stake for parlays.
 * EXTRACTED FROM: src/ev_parlay.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PARLAY_LEGS = exports.MIN_EV_DECIMAL = void 0;
exports.ev = ev;
exports.parlayOdds = parlayOdds;
exports.kellyStake = kellyStake;
exports.evFilter = evFilter;
/** EV per unit: odds * prob - 1 (decimal). */
function ev(odds, prob) {
    return odds * prob - 1;
}
/** Parlay decimal odds = product of leg decimals. */
function parlayOdds(legs) {
    return legs.reduce((acc, leg) => acc * leg.odds, 1);
}
/** Kelly stake (fraction of bankroll): ev / (odds - 1) for decimal, capped to fraction. */
function kellyStake(evVal, odds, fraction = 0.25) {
    if (odds <= 1)
        return 0;
    const b = odds - 1;
    const f = evVal / b;
    return Math.max(0, Math.min(fraction, f * 0.25));
}
exports.MIN_EV_DECIMAL = 1.05;
exports.MAX_PARLAY_LEGS = 5;
/** Filter legs with EV >= minEv (e.g. 1.05 = 5% edge). minEdge = minEvDecimal - 1. */
function evFilter(legs, minEvDecimal = exports.MIN_EV_DECIMAL) {
    const minEdge = minEvDecimal - 1;
    return legs.filter((leg) => leg.ev >= minEdge);
}
//# sourceMappingURL=ev_parlay.js.map