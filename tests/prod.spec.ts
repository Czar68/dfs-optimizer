import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

import {
  EvPick, MergedPick, Card, OptimizerConfig, OptimizerResult,
  DEFAULT_CONFIG, VOLUME_OVERRIDES, PP_PAYOUTS, UD_PAYOUTS,
} from '../src/types';
import { parseCliArgs } from '../src/cli_args';
import { clampProb, calculateLegEv, calculateEvForPicks, filterByEv, filterByEdge } from '../src/calculate_ev';
import { mergeOdds } from '../src/merge_odds';
import { generateMockLegs, PLAYERS, STATS } from '../src/mock_legs';
import { runOptimizer } from '../src/run_optimizer';
import { runUnderdogOptimizer } from '../src/run_underdog_optimizer';
import { pushToTelegram, formatCard } from '../src/telegram_pusher';

function makePick(overrides?: Partial<EvPick>): EvPick {
  return {
    playerName: 'Test Player',
    stat: 'points',
    line: 25.5,
    overUnder: 'over',
    trueProb: 0.55,
    impliedProb: 0.50,
    edge: 0.05,
    ev: 0.10,
    platform: 'pp',
    source: 'test',
    isSynthetic: false,
    ...overrides,
  };
}

function makeVolumeConfig(overrides?: Partial<OptimizerConfig>): OptimizerConfig {
  return {
    ...DEFAULT_CONFIG,
    volume: true,
    minLegEv: 0.003,
    minEdge: 0.003,
    maxLegsPerPlayer: 3,
    ...overrides,
  };
}

function makeStandardConfig(overrides?: Partial<OptimizerConfig>): OptimizerConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

let logSpy: jest.SpyInstance;

beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  logSpy.mockClear();
  (fs.writeFileSync as jest.Mock).mockClear();
});

// ====================== TYPES (8) ======================

describe('types', () => {
  it('EvPick is constructable with all required fields', () => {
    const pick = makePick();
    expect(pick.playerName).toBe('Test Player');
    expect(pick.stat).toBe('points');
    expect(pick.line).toBe(25.5);
  });

  it('EvPick trueProb is numeric', () => {
    const pick = makePick({ trueProb: 0.55 });
    expect(typeof pick.trueProb).toBe('number');
    expect(pick.trueProb).toBe(0.55);
  });

  it('MergedPick extends EvPick with mergedSources', () => {
    const merged: MergedPick = {
      ...makePick(),
      mergedSources: ['test', 'sgo'],
      confidence: 0.67,
      mergedTrueProb: 0.55,
    };
    expect(merged.mergedSources).toEqual(['test', 'sgo']);
    expect(merged.playerName).toBe('Test Player');
  });

  it('MergedPick has confidence field', () => {
    const merged: MergedPick = {
      ...makePick(),
      mergedSources: ['test'],
      confidence: 0.33,
      mergedTrueProb: 0.55,
    };
    expect(merged.confidence).toBe(0.33);
  });

  it('Card has legs array and totalEv', () => {
    const card: Card = {
      id: 1, legs: [], totalEv: 0.15, totalEdge: 0.08,
      platform: 'pp', bankrollFraction: 0.08, entryCount: 2,
    };
    expect(Array.isArray(card.legs)).toBe(true);
    expect(card.totalEv).toBe(0.15);
  });

  it('Card has platform field', () => {
    const card: Card = {
      id: 1, legs: [], totalEv: 0, totalEdge: 0,
      platform: 'ud', bankrollFraction: 0, entryCount: 1,
    };
    expect(card.platform).toBe('ud');
  });

  it('DEFAULT_CONFIG has correct defaults', () => {
    expect(DEFAULT_CONFIG.platform).toBe('pp');
    expect(DEFAULT_CONFIG.volume).toBe(false);
    expect(DEFAULT_CONFIG.minLegEv).toBe(0.03);
    expect(DEFAULT_CONFIG.minEdge).toBe(0.03);
    expect(DEFAULT_CONFIG.maxLegsPerPlayer).toBe(2);
    expect(DEFAULT_CONFIG.bankroll).toBe(200);
    expect(DEFAULT_CONFIG.mockEnabled).toBe(true);
    expect(DEFAULT_CONFIG.noMocks).toBe(false);
  });

  it('VOLUME_OVERRIDES has relaxed thresholds', () => {
    expect(VOLUME_OVERRIDES.minLegEv).toBe(0.003);
    expect(VOLUME_OVERRIDES.minEdge).toBe(0.003);
    expect(VOLUME_OVERRIDES.maxLegsPerPlayer).toBe(3);
  });
});

// ====================== CLI_ARGS (16) ======================

describe('cli_args', () => {
  it('returns defaults with no args', () => {
    const config = parseCliArgs([]);
    expect(config.platform).toBe('pp');
    expect(config.volume).toBe(false);
    expect(config.bankroll).toBe(200);
  });

  it('defaults platform to pp', () => {
    expect(parseCliArgs([]).platform).toBe('pp');
  });

  it('parses --platform pp', () => {
    expect(parseCliArgs(['--platform', 'pp']).platform).toBe('pp');
  });

  it('parses --platform ud', () => {
    expect(parseCliArgs(['--platform', 'ud']).platform).toBe('ud');
  });

  it('parses --platform both', () => {
    expect(parseCliArgs(['--platform', 'both']).platform).toBe('both');
  });

  it('parses --pp shorthand', () => {
    expect(parseCliArgs(['--pp']).platform).toBe('pp');
  });

  it('parses --ud shorthand', () => {
    expect(parseCliArgs(['--ud']).platform).toBe('ud');
  });

  it('parses --both shorthand', () => {
    expect(parseCliArgs(['--both']).platform).toBe('both');
  });

  it('parses --volume flag', () => {
    expect(parseCliArgs(['--volume']).volume).toBe(true);
  });

  it('volume sets minLegEv to 0.003', () => {
    expect(parseCliArgs(['--volume']).minLegEv).toBe(0.003);
  });

  it('volume sets minEdge to 0.003', () => {
    expect(parseCliArgs(['--volume']).minEdge).toBe(0.003);
  });

  it('volume sets maxLegsPerPlayer to 3', () => {
    expect(parseCliArgs(['--volume']).maxLegsPerPlayer).toBe(3);
  });

  it('parses --bankroll value', () => {
    expect(parseCliArgs(['--bankroll', '600']).bankroll).toBe(600);
  });

  it('--minLegEv overrides volume default', () => {
    expect(parseCliArgs(['--volume', '--minLegEv', '0.01']).minLegEv).toBe(0.01);
  });

  it('--minEdge overrides volume default', () => {
    expect(parseCliArgs(['--volume', '--minEdge', '0.02']).minEdge).toBe(0.02);
  });

  it('propagates volume config for UD', () => {
    const config = parseCliArgs(['--ud', '--volume']);
    expect(config.platform).toBe('ud');
    expect(config.volume).toBe(true);
    expect(config.minLegEv).toBe(0.003);
  });

  it('parses --no-mocks flag', () => {
    expect(parseCliArgs(['--no-mocks']).noMocks).toBe(true);
  });

  it('--no-mocks takes priority over volume for mock skip', () => {
    const config = parseCliArgs(['--pp', '--volume', '--no-mocks']);
    expect(config.noMocks).toBe(true);
    expect(config.volume).toBe(true);
  });
});

// ====================== CALCULATE_EV (20) ======================

describe('calculate_ev', () => {
  it('clamps null trueProb to 0.5', () => {
    expect(clampProb(null)).toBe(0.5);
  });

  it('clamps undefined trueProb to 0.5', () => {
    expect(clampProb(undefined)).toBe(0.5);
  });

  it('clamps NaN trueProb to 0.5', () => {
    expect(clampProb(NaN)).toBe(0.5);
  });

  it('clamps below 0.01 to 0.01', () => {
    expect(clampProb(0)).toBe(0.01);
    expect(clampProb(-0.5)).toBe(0.01);
  });

  it('clamps above 0.99 to 0.99', () => {
    expect(clampProb(1.0)).toBe(0.99);
    expect(clampProb(1.5)).toBe(0.99);
  });

  it('passes valid prob unchanged', () => {
    expect(clampProb(0.55)).toBe(0.55);
    expect(clampProb(0.01)).toBe(0.01);
    expect(clampProb(0.99)).toBe(0.99);
  });

  it('calculates positive EV for edge pick', () => {
    const result = calculateLegEv(0.55, 0.50);
    expect(result.ev).toBeGreaterThan(0);
  });

  it('calculates negative EV for bad pick', () => {
    const result = calculateLegEv(0.40, 0.50);
    expect(result.ev).toBeLessThan(0);
  });

  it('handles null trueProb in calculateLegEv', () => {
    const result = calculateLegEv(null, 0.50);
    expect(result.clampedTrueProb).toBe(0.5);
    expect(result.ev).toBeCloseTo(0, 5);
  });

  it('handles zero impliedProb safely', () => {
    const result = calculateLegEv(0.50, 0);
    expect(result.ev).toBeDefined();
    expect(isFinite(result.ev)).toBe(true);
  });

  it('edge equals trueProb minus impliedProb', () => {
    const result = calculateLegEv(0.60, 0.50);
    expect(result.edge).toBeCloseTo(0.10, 5);
  });

  it('EV equals trueProb/impliedProb - 1', () => {
    const result = calculateLegEv(0.60, 0.50);
    expect(result.ev).toBeCloseTo(0.60 / 0.50 - 1, 5);
  });

  it('processes array of picks', () => {
    const picks = [
      { playerName: 'A', trueProb: 0.55, impliedProb: 0.50 },
      { playerName: 'B', trueProb: 0.60, impliedProb: 0.50 },
    ];
    expect(calculateEvForPicks(picks)).toHaveLength(2);
  });

  it('sorts by EV descending', () => {
    const picks = [
      { playerName: 'Low', trueProb: 0.52, impliedProb: 0.50 },
      { playerName: 'High', trueProb: 0.70, impliedProb: 0.50 },
    ];
    const result = calculateEvForPicks(picks);
    expect(result[0].playerName).toBe('High');
  });

  it('handles empty array', () => {
    expect(calculateEvForPicks([])).toHaveLength(0);
  });

  it('preserves player metadata', () => {
    const picks = [{
      playerName: 'LeBron', stat: 'rebounds', line: 8.5,
      overUnder: 'over' as const, trueProb: 0.55, impliedProb: 0.50,
    }];
    const result = calculateEvForPicks(picks);
    expect(result[0].playerName).toBe('LeBron');
    expect(result[0].stat).toBe('rebounds');
    expect(result[0].line).toBe(8.5);
  });

  it('calculates batch of varied picks correctly', () => {
    const picks = Array.from({ length: 10 }, (_, i) => ({
      playerName: `Player${i}`, trueProb: 0.50 + i * 0.03, impliedProb: 0.50,
    }));
    const result = calculateEvForPicks(picks);
    expect(result).toHaveLength(10);
    expect(result[0].ev).toBeGreaterThan(result[9].ev);
  });

  it('filterByEv keeps high EV picks', () => {
    const picks = [makePick({ ev: 0.10 }), makePick({ ev: 0.001 })];
    const filtered = filterByEv(picks, 0.05);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].ev).toBe(0.10);
  });

  it('filterByEdge keeps high edge picks', () => {
    const picks = [makePick({ edge: 0.08 }), makePick({ edge: 0.002 })];
    const filtered = filterByEdge(picks, 0.05);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].edge).toBe(0.08);
  });

  it('filters remove below threshold', () => {
    const picks = [
      makePick({ ev: 0.001, edge: 0.001 }),
      makePick({ ev: 0.10, edge: 0.08 }),
      makePick({ ev: 0.05, edge: 0.04 }),
    ];
    expect(filterByEv(picks, 0.03)).toHaveLength(2);
    expect(filterByEdge(picks, 0.03)).toHaveLength(2);
  });
});

// ====================== MERGE_ODDS (16) ======================

describe('merge_odds', () => {
  it('merges single source', () => {
    const { merged } = mergeOdds([[makePick()]]);
    expect(merged.length).toBeGreaterThan(0);
  });

  it('merges two sources', () => {
    const src1 = [makePick({ source: 'src1' })];
    const src2 = [makePick({ source: 'src2' })];
    const { merged } = mergeOdds([src1, src2]);
    expect(merged).toHaveLength(1);
  });

  it('merges three sources', () => {
    const pick = { playerName: 'X', stat: 'points', line: 25.5, overUnder: 'over' as const };
    const { merged } = mergeOdds([
      [makePick({ ...pick, source: 's1' })],
      [makePick({ ...pick, source: 's2' })],
      [makePick({ ...pick, source: 's3' })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].mergedSources.length).toBeGreaterThanOrEqual(3);
  });

  it('always calls SGO enrichment', () => {
    const { merged } = mergeOdds([[makePick()]]);
    const allSources = merged.flatMap((m) => m.mergedSources);
    expect(allSources).toContain('sgo');
  });

  it('merge rate >= 80%', () => {
    const picks = Array.from({ length: 20 }, (_, i) =>
      makePick({ playerName: `Player${i}`, stat: 'points', line: 20 + i }),
    );
    const { mergeRate } = mergeOdds([picks]);
    expect(mergeRate).toBeGreaterThanOrEqual(0.8);
  });

  it('handles empty sources', () => {
    const { merged, mergeRate } = mergeOdds([[]]);
    expect(merged).toHaveLength(0);
    expect(mergeRate).toBe(0);
  });

  it('handles single pick per source', () => {
    const { merged } = mergeOdds([[makePick()]]);
    expect(merged).toHaveLength(1);
  });

  it('deduplicates by player+stat+line', () => {
    const pick1 = makePick({ playerName: 'A', stat: 'points', line: 25.5, source: 's1' });
    const pick2 = makePick({ playerName: 'A', stat: 'points', line: 25.5, source: 's2' });
    const { merged } = mergeOdds([[pick1], [pick2]]);
    expect(merged).toHaveLength(1);
  });

  it('averages trueProb across sources', () => {
    const pick1 = makePick({ trueProb: 0.50, source: 's1' });
    const pick2 = makePick({ trueProb: 0.60, source: 's2' });
    const { merged } = mergeOdds([[pick1], [pick2]]);
    expect(merged[0].trueProb).toBeGreaterThan(0.49);
    expect(merged[0].trueProb).toBeLessThan(0.61);
  });

  it('tracks merged sources array', () => {
    const { merged } = mergeOdds([[makePick({ source: 'alpha' })]]);
    expect(Array.isArray(merged[0].mergedSources)).toBe(true);
    expect(merged[0].mergedSources.length).toBeGreaterThanOrEqual(1);
  });

  it('calculates confidence from source count', () => {
    const { merged } = mergeOdds([[makePick({ source: 's1' })]]);
    expect(merged[0].confidence).toBeGreaterThan(0);
    expect(merged[0].confidence).toBeLessThanOrEqual(1);
  });

  it('confidence maxes at 1.0', () => {
    const pick = { playerName: 'X', stat: 'points', line: 25.5, overUnder: 'over' as const };
    const { merged } = mergeOdds([
      [makePick({ ...pick, source: 's1' })],
      [makePick({ ...pick, source: 's2' })],
      [makePick({ ...pick, source: 's3' })],
      [makePick({ ...pick, source: 's4' })],
    ]);
    expect(merged[0].confidence).toBeLessThanOrEqual(1);
  });

  it('preserves platform from primary source', () => {
    const { merged } = mergeOdds([[makePick({ platform: 'ud' })]]);
    expect(merged[0].platform).toBe('ud');
  });

  it('handles partial overlap between sources', () => {
    const src1 = [
      makePick({ playerName: 'A', source: 's1' }),
      makePick({ playerName: 'B', source: 's1', stat: 'rebounds', line: 8 }),
    ];
    const src2 = [makePick({ playerName: 'A', source: 's2' })];
    const { merged } = mergeOdds([src1, src2]);
    expect(merged.length).toBe(2);
  });

  it('returns sorted by EV descending', () => {
    const picks = [
      makePick({ playerName: 'Low', trueProb: 0.52, impliedProb: 0.50, stat: 'assists', line: 5 }),
      makePick({ playerName: 'High', trueProb: 0.70, impliedProb: 0.50, stat: 'rebounds', line: 10 }),
    ];
    const { merged } = mergeOdds([picks]);
    expect(merged[0].ev).toBeGreaterThanOrEqual(merged[merged.length - 1].ev);
  });

  it('merge rate calculation is correct', () => {
    const picks = Array.from({ length: 10 }, (_, i) =>
      makePick({ playerName: `P${i}`, stat: 'pts', line: 20 + i }),
    );
    const { mergeRate } = mergeOdds([picks]);
    expect(mergeRate).toBeGreaterThanOrEqual(0);
    expect(mergeRate).toBeLessThanOrEqual(1);
  });
});

// ====================== MOCK_LEGS (12) ======================

describe('mock_legs', () => {
  it('generates 60 legs when realLegs < 10', () => {
    const result = generateMockLegs([makePick()], 'pp');
    expect(result.length).toBe(61);
  });

  it('generates 60 legs when realLegs = 0', () => {
    const result = generateMockLegs([], 'pp');
    expect(result.length).toBe(60);
  });

  it('returns real legs unchanged when >= 10', () => {
    const realLegs = Array.from({ length: 12 }, (_, i) => makePick({ playerName: `P${i}` }));
    const result = generateMockLegs(realLegs, 'pp');
    expect(result).toEqual(realLegs);
  });

  it('all synthetic legs have 2-12% edge', () => {
    const result = generateMockLegs([], 'pp');
    for (const leg of result) {
      expect(leg.edge).toBeGreaterThanOrEqual(0.019);
      expect(leg.edge).toBeLessThanOrEqual(0.121);
    }
  });

  it('assigns correct platform', () => {
    const ppLegs = generateMockLegs([], 'pp');
    const udLegs = generateMockLegs([], 'ud');
    expect(ppLegs.every((l) => l.platform === 'pp')).toBe(true);
    expect(udLegs.every((l) => l.platform === 'ud')).toBe(true);
  });

  it('generates 20 unique player names', () => {
    const result = generateMockLegs([], 'pp');
    const unique = new Set(result.map((l) => l.playerName));
    expect(unique.size).toBe(20);
  });

  it('covers multiple stat types', () => {
    const result = generateMockLegs([], 'pp');
    const stats = new Set(result.map((l) => l.stat));
    expect(stats.size).toBeGreaterThanOrEqual(3);
  });

  it('generates valid positive lines', () => {
    const result = generateMockLegs([], 'pp');
    for (const leg of result) {
      expect(leg.line).toBeGreaterThan(0);
    }
  });

  it('all synthetic legs have positive EV', () => {
    const result = generateMockLegs([], 'pp');
    for (const leg of result) {
      expect(leg.ev).toBeGreaterThan(0);
    }
  });

  it('marks all synthetic legs as isSynthetic', () => {
    const result = generateMockLegs([], 'pp');
    for (const leg of result) {
      expect(leg.isSynthetic).toBe(true);
    }
  });

  it('combines real and synthetic legs', () => {
    const real = [makePick({ playerName: 'Real', isSynthetic: false })];
    const result = generateMockLegs(real, 'pp');
    expect(result.length).toBe(61);
    expect(result[0].playerName).toBe('Real');
    expect(result[0].isSynthetic).toBe(false);
    expect(result[1].isSynthetic).toBe(true);
  });

  it('deterministic with same seed', () => {
    const r1 = generateMockLegs([], 'pp', 60, 123);
    const r2 = generateMockLegs([], 'pp', 60, 123);
    expect(r1.map((l) => l.line)).toEqual(r2.map((l) => l.line));
  });
});

// ====================== RUN_OPTIMIZER (20) ======================

describe('run_optimizer', () => {
  it('runs PP optimizer with empty input', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result).toBeDefined();
    expect(result.platform).toBe('pp');
  });

  it('produces OptimizerResult structure', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.cards).toBeDefined();
    expect(result.legs).toBeDefined();
    expect(result.csvPath).toBeDefined();
    expect(result.totalCards).toBeDefined();
    expect(result.totalLegs).toBeDefined();
  });

  it('cards have 2-6 legs each', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const card of result.cards) {
      expect(card.legs.length).toBeGreaterThanOrEqual(2);
      expect(card.legs.length).toBeLessThanOrEqual(6);
    }
  });

  it('no early exit in volume mode', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThan(0);
  });

  it('--no-mocks with volume uses real data only, 0 cards when no real legs', () => {
    const result = runOptimizer([], makeVolumeConfig({ noMocks: true }));
    expect(result.totalCards).toBe(0);
    expect(result.totalLegs).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('[NO-MOCKS] Skipping mocks - real data only');
  });

  it('--no-mocks with volume logs No viable legs when no real data', () => {
    runOptimizer([], makeVolumeConfig({ noMocks: true }));
    expect(logSpy).toHaveBeenCalledWith('No viable legs');
  });

  it('volume mode produces cards from mocks', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.legs.length).toBeGreaterThan(0);
  });

  it('respects minLegEv filter', () => {
    const config = makeVolumeConfig({ minLegEv: 0.50 });
    const result = runOptimizer([], config);
    expect(result.totalLegs).toBeLessThan(60);
  });

  it('respects minEdge filter', () => {
    const config = makeVolumeConfig({ minEdge: 0.50 });
    const result = runOptimizer([], config);
    expect(result.totalLegs).toBe(0);
  });

  it('enforces maxLegsPerPlayer per card', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const card of result.cards.slice(0, 100)) {
      const playerCounts = new Map<string, number>();
      for (const leg of card.legs) {
        playerCounts.set(leg.playerName, (playerCounts.get(leg.playerName) || 0) + 1);
      }
      for (const count of playerCounts.values()) {
        expect(count).toBeLessThanOrEqual(1);
      }
    }
  });

  it('cards sorted by totalEv descending', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (let i = 1; i < result.cards.length; i++) {
      expect(result.cards[i - 1].totalEv).toBeGreaterThanOrEqual(result.cards[i].totalEv);
    }
  });

  it('generates CSV path', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.csvPath).toContain('pp_cards.csv');
  });

  it('volume mode produces 500+ cards', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThanOrEqual(500);
  });

  it('standard mode produces fewer than volume', () => {
    const stdResult = runOptimizer([], makeStandardConfig());
    const volResult = runOptimizer([], makeVolumeConfig());
    expect(stdResult.totalCards).toBeLessThan(volResult.totalCards);
  });

  it('handles empty input with mock fallback when volume', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThan(0);
  });

  it('applies bankroll sizing', () => {
    const r200 = runOptimizer([], makeVolumeConfig({ bankroll: 200 }));
    const r600 = runOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(r600.totalCards).toBeGreaterThan(r200.totalCards);
  });

  it('bankroll 600 produces more cards', () => {
    const result = runOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(result.totalCards).toBeGreaterThan(600);
  });

  it('no duplicate legs within single card', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const card of result.cards.slice(0, 100)) {
      const legKeys = card.legs.map((l) => `${l.playerName}|${l.stat}|${l.line}`);
      expect(new Set(legKeys).size).toBe(legKeys.length);
    }
  });

  it('no same player twice in single card', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const card of result.cards.slice(0, 100)) {
      const players = card.legs.map((l) => l.playerName);
      expect(new Set(players).size).toBe(players.length);
    }
  });

  it('TRACE logs are emitted', () => {
    runOptimizer([], makeVolumeConfig());
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[TRACE-'));
  });

  it('mock fallback activates for <10 picks', () => {
    const result = runOptimizer([{ playerName: 'Solo' }], makeVolumeConfig());
    expect(result.totalLegs).toBeGreaterThan(1);
  });

  it('returns correct totalCards count', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBe(result.cards.length);
  });
});

// ====================== RUN_UNDERDOG_OPTIMIZER (16) ======================

describe('run_underdog_optimizer', () => {
  it('runs UD optimizer', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig({ platform: 'ud' }));
    expect(result).toBeDefined();
    expect(result.platform).toBe('ud');
  });

  it('inherits bankroll from CLI config', () => {
    const r300 = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 300 }));
    const r600 = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(r300.totalCards).not.toBe(r600.totalCards);
  });

  it('does NOT use hardcoded bankroll 10000', () => {
    const r100 = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 100 }));
    const r600 = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(r100.totalCards).toBeLessThan(r600.totalCards);
  });

  it('respects bankroll 100', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 100 }));
    expect(result.totalCards).toBeGreaterThan(0);
    expect(result.totalCards).toBeLessThan(2000);
  });

  it('respects bankroll 600', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(result.totalCards).toBeGreaterThan(500);
  });

  it('volume mode produces 300+ cards', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThanOrEqual(300);
  });

  it('cards have valid structure', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    for (const card of result.cards.slice(0, 50)) {
      expect(card.id).toBeDefined();
      expect(card.legs.length).toBeGreaterThanOrEqual(2);
      expect(card.totalEv).toBeDefined();
    }
  });

  it('no early exit in volume mode', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThan(0);
  });

  it('mock fallback activates', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.totalLegs).toBeGreaterThan(0);
  });

  it('generates CSV output path', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.csvPath).toContain('ud_cards.csv');
  });

  it('applies UD-specific payouts', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.cards[0].platform).toBe('ud');
  });

  it('handles empty odds data with mock', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThan(0);
  });

  it('TRACE logs are emitted', () => {
    runUnderdogOptimizer([], makeVolumeConfig());
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[TRACE-'));
  });

  it('returns OptimizerResult type', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    expect(result).toHaveProperty('cards');
    expect(result).toHaveProperty('legs');
    expect(result).toHaveProperty('platform');
    expect(result).toHaveProperty('csvPath');
    expect(result).toHaveProperty('totalCards');
    expect(result).toHaveProperty('totalLegs');
  });

  it('bankroll 600 produces more than default', () => {
    const rDefault = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 200 }));
    const r600 = runUnderdogOptimizer([], makeVolumeConfig({ bankroll: 600 }));
    expect(r600.totalCards).toBeGreaterThan(rDefault.totalCards);
  });

  it('all legs marked as UD platform', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig());
    for (const leg of result.legs) {
      expect(leg.platform).toBe('ud');
    }
  });
});

// ====================== TELEGRAM_PUSHER (8) ======================

describe('telegram_pusher', () => {
  function makeCard(overrides?: Partial<Card>): Card {
    return {
      id: 1,
      legs: [
        { ...makePick(), mergedSources: ['test'], confidence: 1, mergedTrueProb: 0.55 },
        { ...makePick({ playerName: 'P2' }), mergedSources: ['test'], confidence: 1, mergedTrueProb: 0.55 },
      ],
      totalEv: 0.15,
      totalEdge: 0.08,
      platform: 'pp',
      bankrollFraction: 0.08,
      entryCount: 2,
      ...overrides,
    };
  }

  it('selects top 5 cards by EV', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      makeCard({ id: i + 1, totalEv: i * 0.01 }),
    );
    pushToTelegram(cards);
    const cardCalls = logSpy.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('Card #'),
    );
    expect(cardCalls.length).toBe(5);
  });

  it('outputs TELEGRAM TOP 5 CARDS header', () => {
    pushToTelegram([makeCard()]);
    expect(logSpy).toHaveBeenCalledWith('TELEGRAM TOP 5 CARDS');
  });

  it('handles fewer than 5 cards', () => {
    pushToTelegram([makeCard(), makeCard({ id: 2 })]);
    expect(logSpy).toHaveBeenCalledWith('TELEGRAM TOP 5 CARDS');
  });

  it('handles empty cards array', () => {
    pushToTelegram([]);
    expect(logSpy).toHaveBeenCalledWith('TELEGRAM TOP 5 CARDS');
    expect(logSpy).toHaveBeenCalledWith('No cards to display.');
  });

  it('includes platform label per card', () => {
    pushToTelegram([makeCard({ platform: 'ud' })]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[UD]'));
  });

  it('includes EV for each card', () => {
    pushToTelegram([makeCard()]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('EV:'));
  });

  it('includes leg details in output', () => {
    pushToTelegram([makeCard()]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test Player'));
  });

  it('formats card output correctly', () => {
    const output = formatCard(makeCard({ id: 42, platform: 'pp' }));
    expect(output).toContain('[PP]');
    expect(output).toContain('Card #42');
    expect(output).toContain('EV:');
  });
});

// ====================== INTEGRATION (12) ======================

describe('integration', () => {
  it('volume: PP pipeline produces 500+ results', () => {
    const result = runOptimizer([], makeVolumeConfig({ platform: 'pp' }));
    expect(result.totalCards).toBeGreaterThanOrEqual(500);
  });

  it('volume: UD pipeline produces 300+ results', () => {
    const result = runUnderdogOptimizer([], makeVolumeConfig({ platform: 'ud' }));
    expect(result.totalCards).toBeGreaterThanOrEqual(300);
  });

  it('volume: both platforms produces 800+ results', () => {
    const pp = runOptimizer([], makeVolumeConfig({ platform: 'pp' }));
    const ud = runUnderdogOptimizer([], makeVolumeConfig({ platform: 'ud' }));
    expect(pp.totalCards + ud.totalCards).toBeGreaterThanOrEqual(800);
  });

  it('volume: bankroll 600 produces 1600+ total', () => {
    const pp = runOptimizer([], makeVolumeConfig({ platform: 'pp', bankroll: 600 }));
    const ud = runUnderdogOptimizer([], makeVolumeConfig({ platform: 'ud', bankroll: 600 }));
    expect(pp.totalCards + ud.totalCards).toBeGreaterThanOrEqual(1600);
  });

  it('mock: fallback generates full pipeline', () => {
    const result = runOptimizer([], makeVolumeConfig());
    expect(result.totalCards).toBeGreaterThan(0);
    expect(result.totalLegs).toBeGreaterThan(0);
  });

  it('mock: produces 800+ combined results', () => {
    const pp = runOptimizer([], makeVolumeConfig());
    const ud = runUnderdogOptimizer([], makeVolumeConfig());
    expect(pp.totalCards + ud.totalCards).toBeGreaterThanOrEqual(800);
  });

  it('mock: CSV files are generated', () => {
    runOptimizer([], makeVolumeConfig());
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('mock: CSV data is non-empty', () => {
    runOptimizer([], makeVolumeConfig());
    const calls = (fs.writeFileSync as jest.Mock).mock.calls;
    const csvData = calls[0][1] as string;
    expect(csvData.length).toBeGreaterThan(50);
  });

  it('pipeline: PP then UD sequential run', () => {
    const pp = runOptimizer([], makeVolumeConfig());
    const ud = runUnderdogOptimizer([], makeVolumeConfig());
    expect(pp.platform).toBe('pp');
    expect(ud.platform).toBe('ud');
  });

  it('pipeline: config propagates correctly', () => {
    const config = makeVolumeConfig({ bankroll: 500, platform: 'pp' });
    const result = runOptimizer([], config);
    expect(result.totalCards).toBeGreaterThan(0);
  });

  it('guardrails: max legs per player enforced', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const card of result.cards.slice(0, 50)) {
      const names = card.legs.map((l) => l.playerName);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('guardrails: EV thresholds applied', () => {
    const result = runOptimizer([], makeVolumeConfig());
    for (const leg of result.legs) {
      expect(leg.ev).toBeGreaterThanOrEqual(0.003);
      expect(leg.edge).toBeGreaterThanOrEqual(0.003);
    }
  });
});
