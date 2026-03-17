"use strict";
/**
 * math_models/registry/index.ts
 * Load payout registry JSON files. Read-only; do not modify formulas.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegistryEntry = getRegistryEntry;
exports.getPayoutByHitsFromRegistry = getPayoutByHitsFromRegistry;
exports.getAllRegistryStructureIds = getAllRegistryStructureIds;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const REGISTRY_DIR = path_1.default.join(process.cwd(), "math_models", "registry");
const cache = new Map();
function outcomeKeyToHits(key) {
    const m = /^(\d+)_of_\d+_hits$/.exec(key);
    return m ? parseInt(m[1], 10) : -1;
}
function loadEntry(structureId) {
    const normalized = structureId.replace(/\s/g, "").toUpperCase();
    const byId = {
        "2P": "prizepicks_2p", "3P": "prizepicks_3p", "4P": "prizepicks_4p",
        "5P": "prizepicks_5p", "6P": "prizepicks_6p",
        "3F": "prizepicks_3f", "4F": "prizepicks_4f", "5F": "prizepicks_5f", "6F": "prizepicks_6f",
        "UD_2P_STD": "underdog_2p_std", "UD_3P_STD": "underdog_3p_std", "UD_4P_STD": "underdog_4p_std",
        "UD_5P_STD": "underdog_5p_std", "UD_6P_STD": "underdog_6p_std", "UD_7P_STD": "underdog_7p_std", "UD_8P_STD": "underdog_8p_std",
        "UD_3F_FLX": "underdog_3f_flx", "UD_4F_FLX": "underdog_4f_flx", "UD_5F_FLX": "underdog_5f_flx",
        "UD_6F_FLX": "underdog_6f_flx", "UD_7F_FLX": "underdog_7f_flx", "UD_8F_FLX": "underdog_8f_flx",
    };
    const fileBase = byId[normalized];
    if (!fileBase)
        return null;
    const filePath = path_1.default.join(REGISTRY_DIR, `${fileBase}.json`);
    try {
        const raw = fs_1.default.readFileSync(filePath, "utf8");
        const entry = JSON.parse(raw);
        cache.set(normalized, entry);
        return entry;
    }
    catch {
        return null;
    }
}
function getRegistryEntry(structureId) {
    const normalized = structureId.replace(/\s/g, "").toUpperCase();
    return cache.get(normalized) ?? loadEntry(structureId);
}
/** Payout multiplier by number of hits (0..n). From registry outcomes. */
function getPayoutByHitsFromRegistry(structureId) {
    const entry = getRegistryEntry(structureId);
    if (!entry)
        return null;
    const byHits = {};
    for (const [key, mult] of Object.entries(entry.outcomes)) {
        const k = outcomeKeyToHits(key);
        if (k >= 0)
            byHits[k] = mult;
    }
    return byHits;
}
function getAllRegistryStructureIds() {
    const list = [];
    const files = fs_1.default.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json"));
    for (const f of files) {
        try {
            const raw = fs_1.default.readFileSync(path_1.default.join(REGISTRY_DIR, f), "utf8");
            const entry = JSON.parse(raw);
            list.push(entry.structureId);
        }
        catch {
            /* skip */
        }
    }
    return list;
}
//# sourceMappingURL=index.js.map