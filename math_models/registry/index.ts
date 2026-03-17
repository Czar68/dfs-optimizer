/**
 * math_models/registry/index.ts
 * Load payout registry JSON files. Read-only; do not modify formulas.
 */

import fs from "fs";
import path from "path";

export interface RegistryEntry {
  platform: string;
  structureId: string;
  size: number;
  type: string;
  outcomes: Record<string, number>;
}

const REGISTRY_DIR = path.join(process.cwd(), "math_models", "registry");

const cache = new Map<string, RegistryEntry>();

function outcomeKeyToHits(key: string): number {
  const m = /^(\d+)_of_\d+_hits$/.exec(key);
  return m ? parseInt(m[1], 10) : -1;
}

function loadEntry(structureId: string): RegistryEntry | null {
  const normalized = structureId.replace(/\s/g, "").toUpperCase();
  const byId: Record<string, string> = {
    "2P": "prizepicks_2p", "3P": "prizepicks_3p", "4P": "prizepicks_4p",
    "5P": "prizepicks_5p", "6P": "prizepicks_6p",
    "3F": "prizepicks_3f", "4F": "prizepicks_4f", "5F": "prizepicks_5f", "6F": "prizepicks_6f",
    "2P_GOBLIN": "prizepicks_2p_goblin", "3P_GOBLIN": "prizepicks_3p_goblin", "4P_GOBLIN": "prizepicks_4p_goblin",
    "5P_GOBLIN": "prizepicks_5p_goblin", "6P_GOBLIN": "prizepicks_6p_goblin",
    "3F_GOBLIN": "prizepicks_3f_goblin", "4F_GOBLIN": "prizepicks_4f_goblin", "5F_GOBLIN": "prizepicks_5f_goblin", "6F_GOBLIN": "prizepicks_6f_goblin",
    "UD_2P_STD": "underdog_2p_std", "UD_3P_STD": "underdog_3p_std", "UD_4P_STD": "underdog_4p_std",
    "UD_5P_STD": "underdog_5p_std", "UD_6P_STD": "underdog_6p_std", "UD_7P_STD": "underdog_7p_std", "UD_8P_STD": "underdog_8p_std",
    "UD_3F_FLX": "underdog_3f_flx", "UD_4F_FLX": "underdog_4f_flx", "UD_5F_FLX": "underdog_5f_flx",
    "UD_6F_FLX": "underdog_6f_flx", "UD_7F_FLX": "underdog_7f_flx", "UD_8F_FLX": "underdog_8f_flx",
  };
  const fileBase = byId[normalized];
  if (!fileBase) return null;
  const filePath = path.join(REGISTRY_DIR, `${fileBase}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const entry = JSON.parse(raw) as RegistryEntry;
    cache.set(normalized, entry);
    return entry;
  } catch {
    return null;
  }
}

export function getRegistryEntry(structureId: string): RegistryEntry | null {
  const normalized = structureId.replace(/\s/g, "").toUpperCase();
  return cache.get(normalized) ?? loadEntry(structureId);
}

/** Payout multiplier by number of hits (0..n). From registry outcomes. */
export function getPayoutByHitsFromRegistry(structureId: string): Record<number, number> | null {
  const entry = getRegistryEntry(structureId);
  if (!entry) return null;
  const byHits: Record<number, number> = {};
  for (const [key, mult] of Object.entries(entry.outcomes)) {
    const k = outcomeKeyToHits(key);
    if (k >= 0) byHits[k] = mult;
  }
  return byHits;
}

export function getAllRegistryStructureIds(): string[] {
  const list: string[] = [];
  const files = fs.readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(REGISTRY_DIR, f), "utf8");
      const entry = JSON.parse(raw) as RegistryEntry;
      list.push(entry.structureId);
    } catch {
      /* skip */
    }
  }
  return list;
}
