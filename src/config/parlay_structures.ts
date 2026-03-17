// src/config/parlay_structures.ts
// CANONICAL payout schedule for every PP/UD structure.
// Full payoutByHits[k] for k=0..n (include partial payouts and 1.0x = money back).
// All breakeven and EV must be derived from this; no duplicated constants.

export type Platform = "PP" | "UD";
export type StructureType = "Power" | "Flex" | "Standard";

export interface StructureDef {
  platform: Platform;
  structureId: string;
  size: number;
  type: StructureType;
  /** Full schedule: hits -> multiplier (0 = no payout, 1 = money back) */
  payoutByHits: Record<number, number>;
}

// ----- PP Power: all-or-nothing (single tier at k=n) -----
const PP_POWER: StructureDef[] = [
  { platform: "PP", structureId: "2P", size: 2, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 3 } },
  { platform: "PP", structureId: "3P", size: 3, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 6 } },
  { platform: "PP", structureId: "4P", size: 4, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 10 } },
  { platform: "PP", structureId: "5P", size: 5, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 20 } },
  { platform: "PP", structureId: "6P", size: 6, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 37.5 } },
];

// ----- PP Flex: tiered (6/6, 5/6, 4/6 etc.; 2/3=1x money back) -----
const PP_FLEX: StructureDef[] = [
  { platform: "PP", structureId: "3F", size: 3, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 1, 3: 3 } },
  { platform: "PP", structureId: "4F", size: 4, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 1.5, 4: 6 } },
  { platform: "PP", structureId: "5F", size: 5, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0.4, 4: 2, 5: 10 } },
  { platform: "PP", structureId: "6F", size: 6, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0.4, 5: 2, 6: 25 } },
];

// ----- PP Goblin: reduced payouts (~0.6x standard; 6P = 22.5x per PrizePicks) -----
const PP_GOBLIN_POWER: StructureDef[] = [
  { platform: "PP", structureId: "2P_GOBLIN", size: 2, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 1.8 } },
  { platform: "PP", structureId: "3P_GOBLIN", size: 3, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 3.6 } },
  { platform: "PP", structureId: "4P_GOBLIN", size: 4, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 6 } },
  { platform: "PP", structureId: "5P_GOBLIN", size: 5, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 12 } },
  { platform: "PP", structureId: "6P_GOBLIN", size: 6, type: "Power", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 22.5 } },
];
const PP_GOBLIN_FLEX: StructureDef[] = [
  { platform: "PP", structureId: "3F_GOBLIN", size: 3, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0.6, 3: 1.8 } },
  { platform: "PP", structureId: "4F_GOBLIN", size: 4, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0.9, 4: 3.6 } },
  { platform: "PP", structureId: "5F_GOBLIN", size: 5, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0.24, 4: 1.2, 5: 6 } },
  { platform: "PP", structureId: "6F_GOBLIN", size: 6, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0.24, 5: 1.2, 6: 15 } },
];

// ----- UD Standard: all-or-nothing -----
const UD_STANDARD: StructureDef[] = [
  { platform: "UD", structureId: "UD_2P_STD", size: 2, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 3.5 } },
  { platform: "UD", structureId: "UD_3P_STD", size: 3, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 6.5 } },
  { platform: "UD", structureId: "UD_4P_STD", size: 4, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 10 } },
  { platform: "UD", structureId: "UD_5P_STD", size: 5, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 20 } },
  { platform: "UD", structureId: "UD_6P_STD", size: 6, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 35 } },
  { platform: "UD", structureId: "UD_7P_STD", size: 7, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 65 } },
  { platform: "UD", structureId: "UD_8P_STD", size: 8, type: "Standard", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 120 } },
];

// ----- UD Flex: 1-loss (3-5), 2-loss (6-8). Include all tiers (n, n-1, n-2 where applicable) -----
const UD_FLEX: StructureDef[] = [
  { platform: "UD", structureId: "UD_3F_FLX", size: 3, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 1.09, 3: 3.25 } },
  { platform: "UD", structureId: "UD_4F_FLX", size: 4, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 1.5, 4: 6 } },
  { platform: "UD", structureId: "UD_5F_FLX", size: 5, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 2.5, 5: 10 } },
  { platform: "UD", structureId: "UD_6F_FLX", size: 6, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2.6, 6: 25 } },
  { platform: "UD", structureId: "UD_7F_FLX", size: 7, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 2.75, 7: 40 } },
  { platform: "UD", structureId: "UD_8F_FLX", size: 8, type: "Flex", payoutByHits: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 3, 8: 80 } },
];

export const ALL_STRUCTURES: StructureDef[] = [
  ...PP_POWER,
  ...PP_FLEX,
  ...PP_GOBLIN_POWER,
  ...PP_GOBLIN_FLEX,
  ...UD_STANDARD,
  ...UD_FLEX,
];

const BY_ID = new Map<string, StructureDef>();
for (const s of ALL_STRUCTURES) {
  BY_ID.set(s.structureId, s);
}

export function getStructure(structureId: string): StructureDef | undefined {
  const id = structureId.replace(/\s/g, "").toUpperCase();
  return BY_ID.get(id) ?? BY_ID.get(structureId);
}

export function getPayoutByHits(structureId: string): Record<number, number> | undefined {
  return getStructure(structureId)?.payoutByHits;
}

/** Zero-fill payout record for 0..maxHits so Monte Carlo always has a full schedule. */
export function fillZeroPayouts(
  payoutByHits: Record<number, number>,
  maxHits: number
): Record<number, number> {
  const out: Record<number, number> = {};
  for (let k = 0; k <= maxHits; k++) {
    out[k] = payoutByHits[k] ?? 0;
  }
  return out;
}

export function getAllStructureIds(): string[] {
  return ALL_STRUCTURES.map((s) => s.structureId);
}
