"use strict";
/**
 * math_models/juice_adjust.ts
 * Juice-aware leg EV: true BE from odds, fair BE from two-way, structure breakeven.
 * EXTRACTED FROM: src/ev/juice_adjust.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.trueBeFromOdds = trueBeFromOdds;
exports.fairBeFromTwoWayOdds = fairBeFromTwoWayOdds;
exports.structureBreakeven = structureBreakeven;
exports.juiceAwareLegEv = juiceAwareLegEv;
const pp_payouts_1 = require("../src/config/pp_payouts");
const ud_payouts_1 = require("../src/config/ud_payouts");
/**
 * True breakeven probability from American odds on the chosen side.
 * decimal = american>0 ? 1+american/100 : 1+100/|american|; return 1/decimal.
 */
function trueBeFromOdds(americanOdds) {
    if (!Number.isFinite(americanOdds) || americanOdds === 0)
        return 0.5;
    const decimal = americanOdds > 0
        ? 1 + americanOdds / 100
        : 1 + 100 / Math.abs(americanOdds);
    return 1 / decimal;
}
function americanToImplied(american) {
    if (!Number.isFinite(american) || american === 0)
        return 0.5;
    if (american > 0)
        return 100 / (american + 100);
    return Math.abs(american) / (Math.abs(american) + 100);
}
/**
 * Fair breakeven from two-way odds: impliedOver / (impliedOver + impliedUnder).
 */
function fairBeFromTwoWayOdds(overOdds, underOdds) {
    const impOver = americanToImplied(overOdds);
    const impUnder = americanToImplied(underOdds);
    const total = impOver + impUnder;
    if (total <= 0)
        return 0.5;
    return impOver / total;
}
/**
 * Structure-specific per-leg breakeven from gospel payout tables (PP/UD).
 */
function structureBreakeven(platform, flexType) {
    const ft = flexType.toUpperCase();
    const picks = parseInt(ft);
    if (isNaN(picks))
        return 0.5;
    if (platform === 'PP') {
        if (ft.endsWith('P') && picks >= 2 && picks <= 6) {
            return pp_payouts_1.PP_PAYOUTS.power[picks]?.breakeven ?? 0.5;
        }
        if (ft.endsWith('F') && picks >= 3 && picks <= 6) {
            return pp_payouts_1.PP_PAYOUTS.flex[picks]?.breakeven ?? 0.5;
        }
    }
    if (platform === 'UD') {
        if ((ft.endsWith('S') || ft.endsWith('P')) && picks >= 2 && picks <= 8) {
            return ud_payouts_1.UD_PAYOUTS.standard[picks]?.breakeven ?? 0.5;
        }
        if (ft.endsWith('F') && picks >= 3 && picks <= 8) {
            return ud_payouts_1.UD_PAYOUTS.flex[picks]?.breakeven ?? 0.5;
        }
    }
    return 0.5;
}
/**
 * Leg-level edge: trueProb - 0.5 (naive breakeven). Card-level EV uses structure payouts separately.
 */
function juiceAwareLegEv(trueProb, _overOdds, _underOdds) {
    return trueProb - 0.5;
}
//# sourceMappingURL=juice_adjust.js.map