"use strict";
/**
 * math_models/kelly_mean_variance.ts
 * Mean-variance Kelly approximation for multi-outcome bets.
 * EXTRACTED FROM: src/kelly_mean_variance.ts — do not change formulas without peer-review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_KELLY_CONFIG = void 0;
exports.computeKellyForCard = computeKellyForCard;
exports.computePrizePicksHitDistribution = computePrizePicksHitDistribution;
const prizepicks_payouts_1 = require("../src/config/prizepicks_payouts");
const underdog_structures_1 = require("../src/config/underdog_structures");
const kelly_staking_1 = require("./kelly_staking");
exports.DEFAULT_KELLY_CONFIG = {
    bankroll: 600,
    globalKellyMultiplier: 0.5,
    maxPerCardFraction: 0.035,
    minCardEv: 0.03,
    maxRawKellyFraction: 0.10,
};
/**
 * f* ≈ μ/σ² where μ = Σ p[i]*r[i], σ² = Σ p[i]*(r[i]-μ)², r[i] = payout[i]-1.
 */
function computeKellyForCard(cardEv, hitDistribution, flexType, site, config = exports.DEFAULT_KELLY_CONFIG) {
    const payouts = getPayoutsForCard(flexType, site);
    let meanReturn = 0;
    let variance = 0;
    for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
        const probNum = Number(prob);
        if (!Number.isFinite(probNum) || probNum <= 0)
            continue;
        const payout = payouts[Number(hitsStr)] || 0;
        const netReturn = payout - 1;
        meanReturn += probNum * netReturn;
    }
    for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
        const probNum = Number(prob);
        if (!Number.isFinite(probNum) || probNum <= 0)
            continue;
        const payout = payouts[Number(hitsStr)] || 0;
        const netReturn = payout - 1;
        variance += probNum * Math.pow(netReturn - meanReturn, 2);
    }
    if (variance < 1e-10) {
        return createZeroKellyResult(config, 'ZERO_VARIANCE');
    }
    const rawKellyFraction = meanReturn / variance;
    const capReasons = [];
    let cappedKellyFraction = rawKellyFraction;
    if (rawKellyFraction > config.maxRawKellyFraction) {
        cappedKellyFraction = config.maxRawKellyFraction;
        capReasons.push('RAW_KELLY_CAP');
    }
    const safeKellyFraction = cappedKellyFraction * config.globalKellyMultiplier;
    if (config.globalKellyMultiplier < 1.0)
        capReasons.push('GLOBAL_MULTIPLIER');
    let finalKellyFraction = safeKellyFraction;
    if (safeKellyFraction > config.maxPerCardFraction) {
        finalKellyFraction = config.maxPerCardFraction;
        capReasons.push('PER_CARD_CAP');
    }
    if (cardEv < config.minCardEv) {
        return createZeroKellyResult(config, 'BELOW_MIN_EV');
    }
    if (finalKellyFraction <= 0) {
        return createZeroKellyResult(config, 'NEGATIVE_KELLY');
    }
    const fullKellyStake = config.bankroll * finalKellyFraction;
    const rawConservative = fullKellyStake / kelly_staking_1.CONSERVATIVE_KELLY_DIVISOR;
    const recommendedStake = Math.max(kelly_staking_1.MIN_STAKE, Math.min(rawConservative, kelly_staking_1.MAX_STAKE_PER_CARD));
    const expectedProfit = recommendedStake * cardEv;
    const maxPayout = getMaxPayoutForCard(flexType, site);
    const maxPotentialWin = recommendedStake * (maxPayout - 1);
    const riskAdjustment = determineRiskAdjustment(finalKellyFraction, rawKellyFraction, config.globalKellyMultiplier);
    return {
        meanReturn,
        variance,
        rawKellyFraction,
        cappedKellyFraction,
        safeKellyFraction,
        finalKellyFraction,
        recommendedStake,
        expectedProfit,
        maxPotentialWin,
        riskAdjustment,
        isCapped: capReasons.length > 0,
        capReasons,
    };
}
function getPayoutsForCard(flexType, site) {
    if (site === 'prizepicks')
        return (0, prizepicks_payouts_1.getPayoutsAsRecord)(flexType);
    const structure = (0, underdog_structures_1.getUnderdogStructureById)(`UD_${flexType}`);
    return structure?.payouts || {};
}
function getMaxPayoutForCard(flexType, site) {
    if (site === 'prizepicks')
        return (0, prizepicks_payouts_1.getMaxPayoutMultiplier)(flexType);
    const structure = (0, underdog_structures_1.getUnderdogStructureById)(`UD_${flexType}`);
    if (!structure)
        return 0;
    return Math.max(...Object.values(structure.payouts));
}
function createZeroKellyResult(config, reason) {
    return {
        meanReturn: 0,
        variance: 0,
        rawKellyFraction: 0,
        cappedKellyFraction: 0,
        safeKellyFraction: 0,
        finalKellyFraction: 0,
        recommendedStake: 0,
        expectedProfit: 0,
        maxPotentialWin: 0,
        riskAdjustment: reason,
        isCapped: true,
        capReasons: [reason],
    };
}
function determineRiskAdjustment(finalFraction, rawFraction, globalMultiplier) {
    const ratio = finalFraction / (rawFraction || 1);
    if (ratio >= 0.9)
        return 'FULL_KELLY';
    if (ratio >= 0.4)
        return 'HALF_KELLY';
    if (ratio >= 0.2)
        return 'QUARTER_KELLY';
    return 'CONSERVATIVE';
}
/**
 * Binomial PMF hit distribution for PrizePicks (iid avgProb).
 */
function computePrizePicksHitDistribution(legs, flexType) {
    const n = legs.length;
    const avgProb = legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / n;
    const distribution = {};
    for (let k = 0; k <= n; k++) {
        let coeff = 1;
        for (let i = 0; i < k; i++) {
            coeff = (coeff * (n - i)) / (i + 1);
        }
        distribution[k] = coeff * Math.pow(avgProb, k) * Math.pow(1 - avgProb, n - k);
    }
    return distribution;
}
//# sourceMappingURL=kelly_mean_variance.js.map