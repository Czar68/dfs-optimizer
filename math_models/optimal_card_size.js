"use strict";
/**
 * math_models/optimal_card_size.ts
 * Anti-dilution: choose leg count that maximizes Card EV.
 * If adding the Nth leg would drop total CardEV below 3-leg or 4-leg EV,
 * the system forces the lower leg count. All math via registry + card_ev_from_registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOptimalCardSize = getOptimalCardSize;
const registry_1 = require("./registry");
const card_ev_from_registry_1 = require("./card_ev_from_registry");
const hit_distribution_dp_1 = require("./hit_distribution_dp");
const PP_POWER_IDS = ["2P", "3P", "4P", "5P", "6P"];
const PP_FLEX_IDS = ["3F", "4F", "5F", "6F"];
const UD_POWER_IDS = ["UD_2P_STD", "UD_3P_STD", "UD_4P_STD", "UD_5P_STD", "UD_6P_STD"];
const UD_FLEX_IDS = ["UD_3F_FLX", "UD_4F_FLX", "UD_5F_FLX", "UD_6F_FLX"];
function getStructureIdsFor(platform, kind) {
    if (platform === "PP")
        return kind === "Flex" ? PP_FLEX_IDS : PP_POWER_IDS;
    return kind === "Flex" ? UD_FLEX_IDS : UD_POWER_IDS;
}
/**
 * Among 2..6 leg structures for this platform and kind, returns the leg count
 * and structure that maximize Card EV for the given leg probabilities.
 * Used for anti-dilution: if we built a 6-leg card but 4-leg EV is higher, use 4.
 */
function getOptimalCardSize(probs, platform, kind) {
    const structureIds = getStructureIdsFor(platform, kind);
    let best = null;
    for (const structureId of structureIds) {
        const entry = (0, registry_1.getRegistryEntry)(structureId);
        if (!entry || entry.size > probs.length)
            continue;
        const slice = probs.slice(0, entry.size);
        const dist = (0, hit_distribution_dp_1.computeHitDistributionRecord)(slice);
        const ev = (0, card_ev_from_registry_1.cardEvFromRegistry)(dist, structureId);
        if (best === null || ev > best.cardEv) {
            best = { legCount: entry.size, structureId, cardEv: ev };
        }
    }
    return best;
}
//# sourceMappingURL=optimal_card_size.js.map