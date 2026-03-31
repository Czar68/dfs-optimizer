// src/config/platform_strategies.ts
// Platform-specific slip optimization strategies based on payout research

export interface StructurePriority {
  type: 'flex' | 'standard' | 'power';
  size: number;
  priority: number; // 1 = highest priority
}

export interface PlatformStrategy {
  name: string;
  priorityStructures: StructurePriority[];
  maxExposurePerPlayer: number; // % of bankroll
  minSlipEv: number; // Minimum slip EV threshold
  minLegEv: number; // Minimum leg EV threshold
}

// PrizePicks: 5-6 leg Flex optimal (breakeven 54.3%)
export const PRIZEPICKS_STRATEGY: PlatformStrategy = {
  name: 'prizepicks',
  priorityStructures: [
    { type: 'flex', size: 6, priority: 1 },
    { type: 'flex', size: 5, priority: 2 },
    { type: 'flex', size: 4, priority: 3 },
    { type: 'power', size: 6, priority: 4 },
    { type: 'power', size: 5, priority: 5 },
    { type: 'flex', size: 3, priority: 6 },
    { type: 'power', size: 4, priority: 7 },
    { type: 'power', size: 3, priority: 8 },
    { type: 'power', size: 2, priority: 9 },
  ],
  maxExposurePerPlayer: 0.15, // 15% max bankroll per player
  minSlipEv: 0.03, // 3% minimum slip EV
  minLegEv: 0.03, // 3% minimum leg EV
};

// Underdog: 2-3 leg Standard optimal (new 3.5x and 6.5x payouts)
export const UNDERDOG_STRATEGY: PlatformStrategy = {
  name: 'underdog',
  priorityStructures: [
    { type: 'standard', size: 2, priority: 1 }, // 3.5x payout
    { type: 'standard', size: 3, priority: 2 }, // 6.5x payout
    { type: 'flex', size: 5, priority: 3 },
    { type: 'flex', size: 6, priority: 4 },
    { type: 'standard', size: 4, priority: 5 },
    { type: 'flex', size: 4, priority: 6 },
    { type: 'standard', size: 5, priority: 7 },
    { type: 'flex', size: 3, priority: 8 },
  ],
  maxExposurePerPlayer: 0.20, // 20% max bankroll per player (more forgiving payouts)
  minSlipEv: 0.02, // 2% minimum slip EV
  minLegEv: 0.01, // 1% minimum leg EV (lower floor for Underdog)
};

export function getPlatformStrategy(platform: 'prizepicks' | 'underdog'): PlatformStrategy {
  return platform === 'prizepicks' ? PRIZEPICKS_STRATEGY : UNDERDOG_STRATEGY;
}

export function getStructurePriority(strategy: PlatformStrategy, type: string, size: number): number {
  const match = strategy.priorityStructures.find(s => s.type === type && s.size === size);
  return match?.priority ?? 999;
}
