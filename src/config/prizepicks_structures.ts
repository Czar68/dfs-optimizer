// src/config/prizepicks_structures.ts
// PrizePicks structure definitions and thresholds

import { FlexType } from "../types";

export interface PrizePicksStructure {
  id: FlexType;
  name: string;
  size: number;
  payoutMultiplier: number;
  description: string;
}

export interface PrizePicksStructureThreshold {
  minCardEv: number;        // Minimum entry-level EV to accept a card
  minAvgLegEdge?: number;   // Minimum average leg edge vs break-even (optional)
}

// PrizePicks structure definitions
export const PRIZEPICKS_STRUCTURES: Record<FlexType, PrizePicksStructure> = {
  '2P': { id: '2P', name: '2-Pick Power', size: 2, payoutMultiplier: 6.0, description: '2-pick standard power play' },
  '3P': { id: '3P', name: '3-Pick Power', size: 3, payoutMultiplier: 6.0, description: '3-pick standard power play' },
  '4P': { id: '4P', name: '4-Pick Power', size: 4, payoutMultiplier: 10.0, description: '4-pick standard power play' },
  '5P': { id: '5P', name: '5-Pick Power', size: 5, payoutMultiplier: 20.0, description: '5-pick standard power play' },
  '6P': { id: '6P', name: '6-Pick Power', size: 6, payoutMultiplier: 37.5, description: '6-pick standard power play' },
  '7P': { id: '7P', name: '7-Pick Power', size: 7, payoutMultiplier: 50.0, description: '7-pick standard power play' },
  '8P': { id: '8P', name: '8-Pick Power', size: 8, payoutMultiplier: 75.0, description: '8-pick standard power play' },
  '3F': { id: '3F', name: '3-Pick Flex', size: 3, payoutMultiplier: 3.0, description: '3-pick flex (1-loss allowed)' },
  '4F': { id: '4F', name: '4-Pick Flex', size: 4, payoutMultiplier: 4.0, description: '4-pick flex (1-loss allowed)' },
  '5F': { id: '5F', name: '5-Pick Flex', size: 5, payoutMultiplier: 5.0, description: '5-pick flex (1-loss allowed)' },
  '6F': { id: '6F', name: '6-Pick Flex', size: 6, payoutMultiplier: 6.0, description: '6-pick flex (1-loss allowed)' },
  '7F': { id: '7F', name: '7-Pick Flex', size: 7, payoutMultiplier: 7.0, description: '7-pick flex (1-loss allowed)' },
  '8F': { id: '8F', name: '8-Pick Flex', size: 8, payoutMultiplier: 8.0, description: '8-pick flex (1-loss allowed)' },
};

// PrizePicks structure-level EV thresholds (3-5% range to match Underdog)
// PrizePicks has higher breakeven points than Underdog, so thresholds should be comparable
export const PRIZEPICKS_STRUCTURE_THRESHOLDS: Record<FlexType, PrizePicksStructureThreshold> = {
  // Standard structures - 3-5% range
  '2P': { minCardEv: 0.030 },    // 2-pick: 3.0%
  '3P': { minCardEv: 0.030 },    // 3-pick: 3.0%
  '4P': { minCardEv: 0.045 },    // 4-pick: 4.5%
  '5P': { minCardEv: 0.040 },    // 5-pick: 4.0%
  '6P': { minCardEv: 0.040 },    // 6-pick: 4.0%
  '7P': { minCardEv: 0.045 },    // 7-pick: 4.5%
  '8P': { minCardEv: 0.050 },    // 8-pick: 5.0%

  // Flex structures - slightly lower due to insurance
  '3F': { minCardEv: 0.030 },    // 3-pick Flex: 3.0%
  '4F': { minCardEv: 0.035 },    // 4-pick Flex: 3.5%
  '5F': { minCardEv: 0.040 },    // 5-pick Flex: 4.0%
  '6F': { minCardEv: 0.040 },    // 6-pick Flex: 4.0%
  '7F': { minCardEv: 0.045 },    // 7-pick Flex: 4.5%
  '8F': { minCardEv: 0.050 },    // 8-pick Flex: 5.0%
};

/**
 * Get PrizePicks structure by type
 */
export function getPrizePicksStructure(flexType: FlexType): PrizePicksStructure | undefined {
  return PRIZEPICKS_STRUCTURES[flexType];
}

/**
 * Get PrizePicks structure threshold by type
 */
export function getPrizePicksStructureThreshold(flexType: FlexType): PrizePicksStructureThreshold {
  return PRIZEPICKS_STRUCTURE_THRESHOLDS[flexType] || { minCardEv: 0.03 }; // Default fallback
}

/**
 * Get all PrizePicks structure IDs
 */
export function getPrizePicksStructureIds(): FlexType[] {
  return Object.keys(PRIZEPICKS_STRUCTURES) as FlexType[];
}

/**
 * Check if a card meets PrizePicks structure threshold
 */
export function meetsPrizePicksThreshold(flexType: FlexType, cardEv: number): boolean {
  const threshold = getPrizePicksStructureThreshold(flexType);
  return cardEv >= threshold.minCardEv;
}
