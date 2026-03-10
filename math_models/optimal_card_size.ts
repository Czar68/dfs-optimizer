/**
 * math_models/optimal_card_size.ts
 * Anti-dilution: choose leg count that maximizes Card EV.
 * If adding the Nth leg would drop total CardEV below 3-leg or 4-leg EV,
 * the system forces the lower leg count. All math via registry + card_ev_from_registry.
 */

import { getRegistryEntry } from "./registry";
import { cardEvFromRegistry } from "./card_ev_from_registry";
import { computeHitDistributionRecord } from "./hit_distribution_dp";

export type Platform = "PP" | "UD";
export type StructureKind = "Power" | "Flex";

const PP_POWER_IDS = ["2P", "3P", "4P", "5P", "6P"];
const PP_FLEX_IDS = ["3F", "4F", "5F", "6F"];
const UD_POWER_IDS = ["UD_2P_STD", "UD_3P_STD", "UD_4P_STD", "UD_5P_STD", "UD_6P_STD"];
const UD_FLEX_IDS = ["UD_3F_FLX", "UD_4F_FLX", "UD_5F_FLX", "UD_6F_FLX"];

function getStructureIdsFor(platform: Platform, kind: StructureKind): string[] {
  if (platform === "PP") return kind === "Flex" ? PP_FLEX_IDS : PP_POWER_IDS;
  return kind === "Flex" ? UD_FLEX_IDS : UD_POWER_IDS;
}

export interface OptimalCardSizeResult {
  legCount: number;
  structureId: string;
  cardEv: number;
}

/**
 * Among 2..6 leg structures for this platform and kind, returns the leg count
 * and structure that maximize Card EV for the given leg probabilities.
 * Used for anti-dilution: if we built a 6-leg card but 4-leg EV is higher, use 4.
 */
export function getOptimalCardSize(
  probs: number[],
  platform: Platform,
  kind: StructureKind
): OptimalCardSizeResult | null {
  const structureIds = getStructureIdsFor(platform, kind);
  let best: OptimalCardSizeResult | null = null;

  for (const structureId of structureIds) {
    const entry = getRegistryEntry(structureId);
    if (!entry || entry.size > probs.length) continue;
    const slice = probs.slice(0, entry.size);
    const dist = computeHitDistributionRecord(slice);
    const ev = cardEvFromRegistry(dist, structureId);
    if (best === null || ev > best.cardEv) {
      best = { legCount: entry.size, structureId, cardEv: ev };
    }
  }
  return best;
}
