/**
 * src/SelectionEngine.ts
 * Professional +EV selection: breakeven filter and anti-dilution.
 * All math from math_models only; this module only orchestrates.
 */

import type { CardEvResult } from "./types";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";
import { getOptimalCardSize, type Platform } from "../math_models/optimal_card_size";
import { computeHitDistributionRecord } from "../math_models/hit_distribution_dp";
import { winProbsFromRegistry } from "../math_models/card_ev_from_registry";
import { getRegistryEntry } from "../math_models/registry";

/**
 * Registry id for selection/breakeven: prefer canonical `structureId` when present (UD `UD_*` vs abbreviated `flexType`).
 */
export function resolveSelectionRegistryStructureId(card: CardEvResult): string {
  if (card.structureId) {
    const e = getRegistryEntry(card.structureId);
    if (e) return card.structureId;
  }
  return card.flexType;
}

/** Discard card if average leg win probability does not meet or exceed structure breakeven. */
export function passesBreakevenFilter(card: CardEvResult): boolean {
  const required = getBreakevenThreshold(resolveSelectionRegistryStructureId(card));
  if (required <= 0) return true;
  return card.avgProb >= required;
}

function structureKind(flexType: string): "Power" | "Flex" {
  return flexType.endsWith("F") ? "Flex" : "Power";
}

/**
 * If adding the Nth leg would drop CardEV below a lower-leg structure's EV,
 * returns a trimmed card at the optimal leg count; otherwise returns the original.
 */
export function applyAntiDilution(card: CardEvResult, platform: Platform): CardEvResult {
  const n = card.legs.length;
  if (n < 5) return card;

  const probs = card.legs.map((leg) => leg.pick.trueProb);
  const kind = structureKind(card.flexType);
  const optimal = getOptimalCardSize(probs, platform, kind);
  if (!optimal || optimal.legCount >= n) return card;
  // Force lower leg count when it yields higher EV (anti-dilution).

  const trimmedLegs = card.legs.slice(0, optimal.legCount);
  const trimmedProbs = probs.slice(0, optimal.legCount);
  const dist = computeHitDistributionRecord(trimmedProbs);
  const { winProbCash, winProbAny } = winProbsFromRegistry(dist, optimal.structureId);
  const avgProb =
    trimmedProbs.reduce((s, p) => s + p, 0) / trimmedProbs.length;
  const avgEdgePct =
    trimmedProbs.reduce((s, p) => s + (p - 0.5), 0) / trimmedProbs.length * 100;
  const breakeven = getBreakevenThreshold(optimal.structureId);

  const trimmed: CardEvResult = {
    ...card,
    flexType: optimal.structureId as CardEvResult["flexType"],
    structureId: optimal.structureId,
    site: card.site ?? "prizepicks",
    legs: trimmedLegs,
    cardEv: optimal.cardEv,
    expectedValue: optimal.cardEv,
    winProbCash,
    winProbAny,
    winProbability: winProbCash,
    avgProb,
    avgEdgePct,
    hitDistribution: dist,
    totalReturn: (optimal.cardEv + 1) * (card.stake ?? 1),
    breakevenGap: avgProb - breakeven,
  };
  return trimmed;
}

/**
 * Filter by breakeven and apply anti-dilution. Returns only +EV cards at optimal leg count.
 */
export function filterAndOptimize(
  cards: CardEvResult[],
  platform: Platform
): CardEvResult[] {
  const out: CardEvResult[] = [];
  for (const card of cards) {
    if (!passesBreakevenFilter(card)) continue;
    const optimized = applyAntiDilution(card, platform);
    const required = getBreakevenThreshold(optimized.flexType);
    const breakevenGap = optimized.avgProb - required;
    out.push({ ...optimized, breakevenGap });
  }
  return out;
}
