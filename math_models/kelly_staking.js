"use strict";
/**
 * math_models/kelly_staking.ts
 * Kelly stake constants and calculateKellyStake pipeline.
 * EXTRACTED FROM: src/kelly_staking.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_STAKE = exports.MAX_BANKROLL_PCT_PER_CARD = exports.MAX_STAKE_PER_CARD = exports.CONSERVATIVE_KELLY_DIVISOR = exports.SPORT_KELLY_FRACTIONS = void 0;
exports.calculateKellyStake = calculateKellyStake;
exports.getKellyFraction = getKellyFraction;
exports.SPORT_KELLY_FRACTIONS = {
    NBA: 0.25,
    NHL: 0.20,
    NCAAB: 0.15,
    NFL: 0.30,
    MLB: 0.22,
    NCAAF: 0.18,
};
exports.CONSERVATIVE_KELLY_DIVISOR = 1.5;
exports.MAX_STAKE_PER_CARD = 25.0;
exports.MAX_BANKROLL_PCT_PER_CARD = 0.035;
exports.MIN_STAKE = 1.0;
/**
 * Pipeline: bankroll × sportFrac × cardEv → /1.5 → clamp(min, min(maxDollar, bankroll×3.5%))
 */
function calculateKellyStake(cardEv, bankroll = 600, sport) {
    const frac = exports.SPORT_KELLY_FRACTIONS[sport];
    const fullKellyStake = bankroll * frac * cardEv;
    const conservativeStake = fullKellyStake / exports.CONSERVATIVE_KELLY_DIVISOR;
    const maxForBankroll = bankroll * exports.MAX_BANKROLL_PCT_PER_CARD;
    const capped = Math.min(conservativeStake, exports.MAX_STAKE_PER_CARD, maxForBankroll);
    return Math.max(exports.MIN_STAKE, Math.round(capped * 100) / 100);
}
function getKellyFraction(sport) {
    return exports.SPORT_KELLY_FRACTIONS[sport];
}
//# sourceMappingURL=kelly_staking.js.map