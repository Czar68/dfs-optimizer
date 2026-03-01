// src/config/prizepicks_payouts.ts
// PrizePicks payout structures — canonical source is parlay_structures.ts

import { getPayoutByHits } from "./parlay_structures";

export interface FlexPayout {
  hits: number;
  multiplier: number;
}

const PP_IDS = ["2P", "3P", "4P", "5P", "6P", "3F", "4F", "5F", "6F"];

// Derived from parlay_structures for backward compat (array form)
function buildPrizepicksPayouts(): Record<string, FlexPayout[]> {
  const out: Record<string, FlexPayout[]> = {};
  for (const id of PP_IDS) {
    const byHits = getPayoutByHits(id);
    if (!byHits) continue;
    out[id] = Object.entries(byHits)
      .filter(([, m]) => m > 0)
      .map(([k, m]) => ({ hits: Number(k), multiplier: m }));
  }
  return out;
}

export const PRIZEPICKS_PAYOUTS: Record<string, FlexPayout[]> = buildPrizepicksPayouts();

// Canonical: from parlay_structures (used by DP EV). Return only positive tiers for backward compat.
export function getPayoutsAsRecord(flexType: string): Record<number, number> {
  const record = getPayoutByHits(flexType);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).filter(([, m]) => m > 0)) as Record<number, number>;
}

// Helper: Get max payout multiplier for a structure
export function getMaxPayoutMultiplier(flexType: string): number {
  const payouts = PRIZEPICKS_PAYOUTS[flexType] || [];
  if (payouts.length === 0) return 0;
  return Math.max(...payouts.map(p => p.multiplier));
}

// Helper: Check if structure is Power vs Flex
export function isPowerStructure(flexType: string): boolean {
  return flexType.includes('P');
}

export function getSupportedStructures(): string[] {
  return PP_IDS;
}
