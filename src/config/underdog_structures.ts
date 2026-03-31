// src/config/underdog_structures.ts
// Underdog Fantasy Pick'em structures. Payouts canonical in parlay_structures.ts.
//
// Underdog exposes exactly TWO modes in the UI:
//   • Standard — all picks must hit; single all-or-nothing payout.
//   • Flex     — tiered payout ladder that pays on partial hits.
//                3–5 pick Flex = 1-loss ladder (pays on n and n−1 hits).
//                6–8 pick Flex = 2-loss ladder (pays on n, n−1, and n−2 hits).
//
// There is NO separate "Insured" toggle in the app.  The insurance-like
// behaviour is simply the reduced-payout tiers within the Flex ladder.

import { getPayoutByHits } from "./parlay_structures";
import { getBreakevenForStructure } from "./binomial_breakeven";

export type UnderdogStructureType = 'standard' | 'flex';

export interface UnderdogStructure {
  id: string;
  size: number;
  type: UnderdogStructureType;
  displayName: string;
  payouts: Record<number, number>;
  breakEvenLegWinRate?: number;
}

/**
 * COMPLETE UNDERDOG STRUCTURES — aligned with official payout chart
 *
 * Source: underdogfantasy.com/games/pickem, rotogrinders.com/sports-betting/underdog-fantasy/flex
 *
 * STANDARD (all-or-nothing):
 *   | Picks | Payout |
 *   |-------|--------|
 *   |   2   |  3.5×  |
 *   |   3   |  6.5×  |
 *   |   4   |  10×   |
 *   |   5   |  20×   |
 *   |   6   |  35×   |
 *
 * FLEX (tiered — 1-loss for 3–5 picks, 2-loss for 6–8 picks):
 *   | Picks | All Hit | 1 Miss | 2 Miss |
 *   |-------|---------|--------|--------|
 *   |   3   |  3.25×  | 1.09×  |   —    |
 *   |   4   |   6×    |  1.5×  |   —    |
 *   |   5   |  10×    |  2.5×  |   —    |
 *   |   6   |  25×    |  2.6×  | 0.25×  |
 *   |   7   |  40×    |  2.75× | 0.5×   |
 *   |   8   |  80×    |  3×    | 1×     |
 */

// ---- STANDARD structures (all-or-nothing) ----
export const UNDERDOG_STANDARD_STRUCTURES: UnderdogStructure[] = [
  {
    id: 'UD_2P_STD',
    size: 2,
    type: 'standard',
    displayName: '2-Pick Standard (3.5×)',
    payouts: { 2: 3.5 },
    breakEvenLegWinRate: 0.5345, // (1/3.5)^(1/2) = 53.45%
  },
  {
    id: 'UD_3P_STD',
    size: 3,
    type: 'standard',
    displayName: '3-Pick Standard (6.5×)',
    payouts: { 3: 6.5 },
    breakEvenLegWinRate: 0.5358, // (1/6.5)^(1/3) = 53.58%
  },
  {
    id: 'UD_4P_STD',
    size: 4,
    type: 'standard',
    displayName: '4-Pick Standard (10×)',
    payouts: { 4: 10 },
    breakEvenLegWinRate: 0.5623, // (1/10)^(1/4) = 56.23%
  },
  {
    id: 'UD_5P_STD',
    size: 5,
    type: 'standard',
    displayName: '5-Pick Standard (20×)',
    payouts: { 5: 20 },
    breakEvenLegWinRate: 0.5493, // (1/20)^(1/5) = 54.93%
  },
  {
    id: 'UD_6P_STD',
    size: 6,
    type: 'standard',
    displayName: '6-Pick Standard (35×)',
    payouts: { 6: 35 },
    breakEvenLegWinRate: 0.5466, // (1/35)^(1/6) = 54.66%
  },
  {
    id: 'UD_7P_STD',
    size: 7,
    type: 'standard',
    displayName: '7-Pick Standard (65×)',
    payouts: { 7: 65 },
    breakEvenLegWinRate: 0.5508, // (1/65)^(1/7) ≈ 55.08%
  },
  {
    id: 'UD_8P_STD',
    size: 8,
    type: 'standard',
    displayName: '8-Pick Standard (120×)',
    payouts: { 8: 120 },
    breakEvenLegWinRate: 0.5497, // (1/120)^(1/8) ≈ 54.97%
  },
];

// ---- FLEX structures (tiered payout ladders) ----
// 3–5 pick Flex: 1-loss ladder (pays on all-hit and 1-miss).
// 6–8 pick Flex: 2-loss ladder (pays on all-hit, 1-miss, and 2-miss).
export const UNDERDOG_FLEX_STRUCTURES: UnderdogStructure[] = [
  {
    id: 'UD_3F_FLX',
    size: 3,
    type: 'flex',
    displayName: '3-Pick Flex (3.25×/1.09×)',
    payouts: { 3: 3.25, 2: 1.09 },
    breakEvenLegWinRate: 0.5500, // Solved numerically: EV = 3.25p³ + 3.27p²(1-p) - 1 = 0 → p ≈ 55.00%
  },
  {
    id: 'UD_4F_FLX',
    size: 4,
    type: 'flex',
    displayName: '4-Pick Flex (6×/1.5×)',
    payouts: { 4: 6, 3: 1.5 },
    breakEvenLegWinRate: 0.5503, // Solved: 6p³−1 = 0 → p = (1/6)^(1/3) = 55.03%
  },
  {
    id: 'UD_5F_FLX',
    size: 5,
    type: 'flex',
    displayName: '5-Pick Flex (10×/2.5×)',
    payouts: { 5: 10, 4: 2.5 },
    breakEvenLegWinRate: 0.5340, // Solved numerically = 53.40%
  },
  {
    id: 'UD_6F_FLX',
    size: 6,
    type: 'flex',
    displayName: '6-Pick Flex (25×/2.6×)',
    // ⚠️ GOSPEL: NO 4/6 consolation payout (verified UD Help Center Dec 31, 2025)
    payouts: { 6: 25, 5: 2.6, 4: 0 },
    breakEvenLegWinRate: 0.5345, // Gospel: 53.45%
  },
  {
    id: 'UD_7F_FLX',
    size: 7,
    type: 'flex',
    displayName: '7-Pick Flex (40×/2.75×)',
    // ⚠️ GOSPEL: NO 5/7 consolation payout (verified UD Help Center Dec 31, 2025)
    payouts: { 7: 40, 6: 2.75, 5: 0 },
    breakEvenLegWinRate: 0.5421, // Gospel: 54.21%
  },
  {
    id: 'UD_8F_FLX',
    size: 8,
    type: 'flex',
    displayName: '8-Pick Flex (80×/3×)',
    // ⚠️ GOSPEL: NO 6/8 consolation payout (verified UD Help Center Dec 31, 2025)
    payouts: { 8: 80, 7: 3, 6: 0 },
    breakEvenLegWinRate: 0.5503, // Gospel: 55.03%
  },
];

// Combined all structures for easy lookup
export const ALL_UNDERDOG_STRUCTURES: UnderdogStructure[] = [
  ...UNDERDOG_STANDARD_STRUCTURES,
  ...UNDERDOG_FLEX_STRUCTURES,
];

// Canonical payouts from parlay_structures; BE from binomial_breakeven
export function getUnderdogStructureById(id: string): UnderdogStructure | undefined {
  const structure = ALL_UNDERDOG_STRUCTURES.find(s => s.id === id);
  if (!structure) return undefined;
  const canonicalPayouts = getPayoutByHits(id);
  const payouts = canonicalPayouts ?? structure.payouts;
  const breakEvenLegWinRate = getBreakevenForStructure(id);
  return { ...structure, payouts, breakEvenLegWinRate };
}

export function getUnderdogStructuresBySize(size: number): UnderdogStructure[] {
  return ALL_UNDERDOG_STRUCTURES.filter(structure => structure.size === size);
}

export function getUnderdogStructuresByType(type: UnderdogStructureType): UnderdogStructure[] {
  return ALL_UNDERDOG_STRUCTURES.filter(structure => structure.type === type);
}

export function getUnderdogStructureId(size: number, type: UnderdogStructureType): string | undefined {
  const structures = getUnderdogStructuresBySize(size).filter(s => s.type === type);
  return structures.length > 0 ? structures[0].id : undefined;
}

// Structure validation
export function isValidUnderdogStructure(id: string): boolean {
  return getUnderdogStructureById(id) !== undefined;
}

// Break-even leg win rate calculation
// Uses pre-computed values based on Underdog payout math
export function calculateBreakEvenLegWinRate(structure: UnderdogStructure): number {
  // Return the pre-computed break-even rate from the structure
  if (structure.breakEvenLegWinRate !== undefined) {
    return structure.breakEvenLegWinRate;
  }
  
  // Fallback calculation for structures without pre-computed values
  const { size, payouts } = structure;
  
  if (Object.keys(payouts).length > 1) {
    // For flex structures with partial payouts, use approximation
    const maxPayout = Math.max(...Object.values(payouts));
    return 1 / Math.pow(maxPayout, 1/size) * 0.95; // Slightly lower due to partial payouts
  } else {
    // For standard structures: p^size * payout = 1, so p = (1/payout)^(1/size)
    const maxPayout = Math.max(...Object.values(payouts));
    return Math.pow(1 / maxPayout, 1 / size);
  }
}

// Export structure IDs for easy reference
export const UNDERDOG_STRUCTURE_IDS = {
  // Standard (all-or-nothing)
  UD_2P_STD: 'UD_2P_STD',
  UD_3P_STD: 'UD_3P_STD',
  UD_4P_STD: 'UD_4P_STD',
  UD_5P_STD: 'UD_5P_STD',
  UD_6P_STD: 'UD_6P_STD',
  UD_7P_STD: 'UD_7P_STD',
  UD_8P_STD: 'UD_8P_STD',

  // Flex (tiered payout ladders)
  UD_3F_FLX: 'UD_3F_FLX',
  UD_4F_FLX: 'UD_4F_FLX',
  UD_5F_FLX: 'UD_5F_FLX',
  UD_6F_FLX: 'UD_6F_FLX',  // 2-loss ladder
  UD_7F_FLX: 'UD_7F_FLX',  // 2-loss ladder
  UD_8F_FLX: 'UD_8F_FLX',  // 2-loss ladder
} as const;

export type UnderdogStructureId = typeof UNDERDOG_STRUCTURE_IDS[keyof typeof UNDERDOG_STRUCTURE_IDS];

/**
 * Phase 16K — product rule: 7–8 leg Underdog cards are Flex-only.
 * Standard UD_7P_STD / UD_8P_STD remain in {@link UNDERDOG_STANDARD_STRUCTURES} and
 * in parlay_structures for breakeven / registry math; they must not be selected for generation.
 */
export const UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION: UnderdogStructureId[] =
  UNDERDOG_STANDARD_STRUCTURES.filter((s) => s.size <= 6).map(
    (s) => s.id as UnderdogStructureId
  );

// ============================================================================
// UNDERDOG THRESHOLDS AND ACCEPTANCE CRITERIA
// ============================================================================

/**
 * Global Underdog leg EV floor
 * Legs below this EV will be filtered out before card building
 * Separate from PrizePicks to allow platform-specific tuning
 */
// Lowered from 2% to 1% to match UD's more favorable breakeven curve
// (UD 6-leg flex breaks even at 52.4% vs PP 6-leg at 55%  → 2-3% lower floor).
// The edge/EV filters in run_underdog_optimizer.ts can further tighten at runtime
// via --min-ev and --min-edge CLI flags.
export const UNDERDOG_GLOBAL_LEG_EV_FLOOR = 0.01; // 1% minimum leg EV

/**
 * Underdog attempt budgeting configuration
 * Controls how many attempts each structure type gets
 */
export const UNDERDOG_TARGET_ACCEPTED_CARDS: Record<UnderdogStructureType, number> = {
  standard: 8,   // Standard structures — moderate target
  flex: 6,       // Flex structures — slightly conservative (ladders reduce variance)
};

export const UNDERDOG_BASE_ATTEMPTS_PER_CARD = 20; // Attempts per target accepted card
export const UNDERDOG_MAX_ATTEMPTS_FRACTION_OF_GLOBAL = 0.35; // Max 35% of global attempts per structure

/**
 * Underdog structure-level EV thresholds
 * Conservative defaults; higher thresholds for larger flex ladders
 */
export interface UnderdogStructureThreshold {
  minCardEv: number;        // Minimum entry-level EV to accept a card
  minAvgLegEdge?: number;   // Minimum average leg edge vs break-even (optional)
}

// Thresholds calibrated to UD's more favorable payout curve vs PP.
// UD breakeven per leg: 2-pick 57.1%, 3-pick 55.6%, 6-pick 52.4%
// PP breakeven per leg: 2-pick 62.5%, 3-pick 59.5%, 6-pick 55%
// UD thresholds can therefore be 2-3% lower than their PP equivalents.
export const UNDERDOG_STRUCTURE_THRESHOLDS: Record<UnderdogStructureId, UnderdogStructureThreshold> = {
  // Standard structures - lowered to 3-5% range
  UD_2P_STD: { minCardEv: 0.030 },    // 2-pick: 3.0%
  UD_3P_STD: { minCardEv: 0.030 },    // 3-pick: 3.0%
  UD_4P_STD: { minCardEv: 0.045 },    // 4-pick: 4.5%
  UD_5P_STD: { minCardEv: 0.040 },    // 5-pick: 4.0%
  UD_6P_STD: { minCardEv: 0.040 },    // 6-pick: 4.0%
  UD_7P_STD: { minCardEv: 0.045 },    // 7-pick: 4.5%
  UD_8P_STD: { minCardEv: 0.050 },    // 8-pick: 5.0%

  // Flex structures - lowered to 3-5% range
  UD_3F_FLX: { minCardEv: 0.030 },    // 3-pick Flex: 3.0%
  UD_4F_FLX: { minCardEv: 0.035 },    // 4-pick Flex: 3.5%
  UD_5F_FLX: { minCardEv: 0.040 },    // 5-pick Flex: 4.0%
  UD_6F_FLX: { minCardEv: 0.040 },    // 6-pick Flex: 4.0%
  UD_7F_FLX: { minCardEv: 0.045 },    // 7-pick Flex: 4.5%
  UD_8F_FLX: { minCardEv: 0.050 },    // 8-pick Flex: 5.0%
};

/**
 * Get Underdog structure threshold by structure ID
 */
export function getUnderdogStructureThreshold(structureId: UnderdogStructureId): UnderdogStructureThreshold {
  return UNDERDOG_STRUCTURE_THRESHOLDS[structureId] || { minCardEv: 0.02 }; // Default fallback
}

/**
 * Check if a leg meets Underdog's global EV floor
 */
export function meetsUnderdogLegEvFloor(legEv: number): boolean {
  return legEv >= UNDERDOG_GLOBAL_LEG_EV_FLOOR;
}

/**
 * Check if a card EV meets the structure's minimum threshold
 */
export function meetsUnderdogStructureThreshold(structureId: UnderdogStructureId, cardEv: number): boolean {
  const threshold = getUnderdogStructureThreshold(structureId);
  return cardEv >= threshold.minCardEv;
}

/**
 * Calculate if legs can potentially meet structure threshold
 * Used for early pruning during card building
 */
export function canLegsMeetStructureThreshold(
  structureId: UnderdogStructureId,
  legEvs: number[],
  structure: UnderdogStructure,
  volumeMode?: boolean
): boolean {
  const threshold = getUnderdogStructureThreshold(structureId);
  const maxLegEv = legEvs.length ? Math.max(...legEvs) : 0;
  const factor = volumeMode ? 0.15 : 0.3; // 15% when --ud-volume (looser), else 30%
  const theoreticalMaxEv = maxLegEv * structure.size;
  return theoreticalMaxEv >= threshold.minCardEv * factor;
}

/**
 * Compute maximum attempts for an Underdog structure
 * Similar to PrizePicks getMaxAttemptsForStructure but for Underdog
 */
export function getUnderdogMaxAttemptsForStructure(params: {
  structure: UnderdogStructure;
  viableLegCount: number;
  targetAcceptedCards: number;
  globalMaxAttempts: number;
}): number {
  const { structure, viableLegCount, targetAcceptedCards, globalMaxAttempts } = params;
  
  // If not enough viable legs, no attempts possible
  if (viableLegCount < structure.size) {
    return 0;
  }
  
  // Compute combinatorial ceiling (safe upper bound)
  // Using approximation: C(n, k) <= (n * e / k)^k for n >= k
  const combinatorialCeiling = viableLegCount > structure.size 
    ? Math.min(
        // Simple approximation for combinations
        Math.pow(viableLegCount, structure.size) / factorial(structure.size),
        // Cap at reasonable number to prevent overflow
        1000000
      )
    : 1;
  
  // Compute desired attempts based on target cards
  const desiredAttempts = targetAcceptedCards * UNDERDOG_BASE_ATTEMPTS_PER_CARD;
  
  // Compute maximum allowed per structure
  const maxPerStructure = Math.floor(UNDERDOG_MAX_ATTEMPTS_FRACTION_OF_GLOBAL * globalMaxAttempts);
  
  // Return the minimum of all constraints, coerced to integer >= 0
  const maxAttempts = Math.min(
    combinatorialCeiling,
    desiredAttempts,
    maxPerStructure
  );
  
  return Math.max(0, Math.floor(maxAttempts));
}

/**
 * Simple factorial function for combinatorial calculations
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Underdog structure metrics tracking
 */
export interface UnderdogStructureMetrics {
  structureId: string;
  attemptsAllocated: number;
  attemptsUsed: number;
  evCallsMade: number;
  cardsAccepted: number;
}

/**
 * Create initial metrics for a structure
 */
export function createUnderdogStructureMetrics(structureId: string): UnderdogStructureMetrics {
  return {
    structureId,
    attemptsAllocated: 0,
    attemptsUsed: 0,
    evCallsMade: 0,
    cardsAccepted: 0,
  };
}

/**
 * Log metrics for an Underdog structure
 */
export function logUnderdogStructureMetrics(metrics: UnderdogStructureMetrics): void {
  console.log(
    `${metrics.structureId}: attempts ${metrics.attemptsUsed}/${metrics.attemptsAllocated}, ` +
    `EV calls ${metrics.evCallsMade}, accepted ${metrics.cardsAccepted}`
  );
}

// ============================================================================
// USAGE INTEGRATION POINTS (Documentation)
// ============================================================================

/*
HOW TO USE THESE THRESHOLDS IN UNDERDOG CARD BUILDING:

1. FILTER LEGS BY GLOBAL FLOOR:
   ```typescript
   const qualifiedLegs = allLegs.filter(leg => meetsUnderdogLegEvFloor(leg.legEv));
   ```

2. CHECK STRUCTURE FEASIBILITY:
   ```typescript
   const structure = getUnderdogStructureById(structureId);
   if (!canLegsMeetStructureThreshold(structureId, legEvs, structure)) {
     // Skip this structure — legs can't possibly meet threshold
     continue;
   }
   ```

3. EVALUATE AND FILTER CARDS:
   ```typescript
   // For Standard structures use evaluateUdStandardCard;
   // for Flex structures use evaluateUdFlexCard.
   const cardEv = evaluateUdStandardCard(cardLegs, structureId).expectedValue;
   if (!meetsUnderdogStructureThreshold(structureId, cardEv)) {
     continue;
   }
   ```

4. STRUCTURE-SPECIFIC LOGIC:
   ```typescript
   // For large Flex ladders (7–8 picks, 2-loss) apply extra scrutiny
   if (structure.type === 'flex' && structure.size >= 7) {
     const threshold = getUnderdogStructureThreshold(structureId);
     if (cardEv < threshold.minCardEv * 1.2) {
       continue; // Require 20% above threshold for 7+ pick Flex
     }
   }
   ```

INTEGRATION WITH EXISTING UNDERDOG OPTIMIZER:

The `run_underdog_optimizer.ts` uses this config to:
- Filter legs using `meetsUnderdogLegEvFloor()` before card building
- Use `getUnderdogStructureThreshold()` to set acceptance criteria
- Apply `canLegsMeetStructureThreshold()` for early pruning
- Replace hardcoded EV checks with `meetsUnderdogStructureThreshold()`

This mirrors PrizePicks' threshold approach but uses Underdog-specific numbers
and keeps all configuration separate for easy tuning.
*/
