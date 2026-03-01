/**
 * Parity test: mock 10 legs, EV table for PP and UD, structures load, parity diff < 10%.
 * Run with: npm test
 */
import {
  UNDERDOG_STANDARD_STRUCTURES,
  UNDERDOG_FLEX_STRUCTURES,
  getUnderdogStructureById,
} from "../src/config/underdog_structures";
import { getPayoutsAsRecord } from "../src/config/prizepicks_payouts";
import { evaluateUdStandardCard, evaluateUdFlexCard } from "../src/underdog_card_ev";
import type { CardLegInput } from "../src/types";

const PP_SLIP_TYPES = ["2P", "3P", "4P", "5P", "6P", "3F", "4F", "5F", "6F"];

function makeMockLeg(i: number, trueProb: number = 0.60): CardLegInput {
  return {
    sport: "NBA",
    player: `Player${i}`,
    team: `T${(i % 5) + 1}`,
    opponent: null,
    league: "NBA",
    stat: "points",
    line: 20 + i,
    outcome: "over",
    trueProb,
    projectionId: `proj-${i}`,
    gameId: `game-${i}`,
    startTime: null,
    udPickFactor: 1.0,
  };
}

/** Hit distribution for n legs with given trueProbs (DP). */
function hitDistribution(legs: CardLegInput[]): number[] {
  const n = legs.length;
  const dist = new Array(n + 1).fill(0);
  dist[0] = 1;
  for (const leg of legs) {
    const p = leg.trueProb;
    for (let k = n; k >= 0; k--) {
      const prev = dist[k];
      dist[k] = prev * (1 - p) + (k > 0 ? dist[k - 1] * p : 0);
    }
  }
  return dist;
}

/** Sync PP card EV for a given slip type (stake=1). */
function ppCardEv(legs: CardLegInput[], flexType: string): number {
  const payouts = getPayoutsAsRecord(flexType);
  const hitProbs = hitDistribution(legs);
  let expectedReturn = 0;
  hitProbs.forEach((prob, hits) => {
    const mult = payouts[hits] ?? 0;
    expectedReturn += prob * mult;
  });
  return expectedReturn - 1;
}

/** PP win probability (all hit) for power slips = product of trueProbs. */
function ppWinProbabilityAllHit(legs: CardLegInput[]): number {
  return legs.reduce((p, leg) => p * leg.trueProb, 1);
}

describe("Structures load", () => {
  it("loads 13 Underdog structures (7 Standard + 6 Flex)", () => {
    const std = UNDERDOG_STANDARD_STRUCTURES.length;
    const flex = UNDERDOG_FLEX_STRUCTURES.length;
    expect(std).toBe(7);
    expect(flex).toBe(6);
    expect(std + flex).toBe(13);
  });

  it("loads 9 PrizePicks slip types", () => {
    expect(PP_SLIP_TYPES.length).toBe(9);
    PP_SLIP_TYPES.forEach((t) => {
      const payouts = getPayoutsAsRecord(t);
      expect(Object.keys(payouts).length).toBeGreaterThan(0);
    });
  });

  it("UD 7P/8P structures exist with correct thresholds", () => {
    const s7 = getUnderdogStructureById("UD_7P_STD");
    const s8 = getUnderdogStructureById("UD_8P_STD");
    expect(s7).toBeDefined();
    expect(s8).toBeDefined();
    expect(s7?.size).toBe(7);
    expect(s8?.size).toBe(8);
    expect(s7?.payouts[7]).toBe(65); // canonical parlay_structures.ts UD_7P_STD
    expect(s8?.payouts[8]).toBe(120); // canonical parlay_structures.ts UD_8P_STD
  });
});

describe("Parity: mock 10 legs → EV table", () => {
  // trueProb 0.60 is above both PP and UD 2P/3P breakeven (~53–58%)
  const MOCK_LEGS_10 = Array.from({ length: 10 }, (_, i) => makeMockLeg(i, 0.60));

  it("builds UD EV table for 2P and 3P (standard)", () => {
    const legs2 = MOCK_LEGS_10.slice(0, 2);
    const legs3 = MOCK_LEGS_10.slice(0, 3);

    const ud2 = evaluateUdStandardCard(legs2, "UD_2P_STD");
    const ud3 = evaluateUdStandardCard(legs3, "UD_3P_STD");

    expect(ud2.expectedValue).toBeGreaterThan(0);
    expect(ud3.expectedValue).toBeGreaterThan(0);
    expect(Number.isFinite(ud2.expectedValue)).toBe(true);
    expect(Number.isFinite(ud3.expectedValue)).toBe(true);
  });

  it("builds PP EV table for 2P and 3P (sync)", () => {
    const legs2 = MOCK_LEGS_10.slice(0, 2);
    const legs3 = MOCK_LEGS_10.slice(0, 3);

    const pp2 = ppCardEv(legs2, "2P");
    const pp3 = ppCardEv(legs3, "3P");

    expect(pp2).toBeGreaterThan(0);
    expect(pp3).toBeGreaterThan(0);
    expect(Number.isFinite(pp2)).toBe(true);
    expect(Number.isFinite(pp3)).toBe(true);
  });

  it("parity: same 2 legs, pre-paytable winProbability diff < 0.1%", () => {
    const legs2 = MOCK_LEGS_10.slice(0, 2);
    const ppWinProb = ppWinProbabilityAllHit(legs2);
    const udRes = evaluateUdStandardCard(legs2, "UD_2P_STD");
    const udWinProb = udRes.winProbability;
    expect(Math.abs(ppWinProb - udWinProb)).toBeLessThan(0.001);
  });

  it("parity: same 3 legs, pre-paytable winProbability diff < 0.1%", () => {
    const legs3 = MOCK_LEGS_10.slice(0, 3);
    const ppWinProb = ppWinProbabilityAllHit(legs3);
    const udRes = evaluateUdStandardCard(legs3, "UD_3P_STD");
    const udWinProb = udRes.winProbability;
    expect(Math.abs(ppWinProb - udWinProb)).toBeLessThan(0.001);
  });

  it("parity: same 2 legs, PP 2P and UD 2P both +EV, absolute EV diff < 0.20", () => {
    const legs2 = MOCK_LEGS_10.slice(0, 2);
    const ppEv = ppCardEv(legs2, "2P");
    const udEv = evaluateUdStandardCard(legs2, "UD_2P_STD").expectedValue;
    expect(ppEv).toBeGreaterThan(0);
    expect(udEv).toBeGreaterThan(0);
    expect(Math.abs(ppEv - udEv)).toBeLessThan(0.20);
  });

  it("parity: same 3 legs, PP 3P and UD 3P both +EV, absolute EV diff < 0.20", () => {
    const legs3 = MOCK_LEGS_10.slice(0, 3);
    const ppEv = ppCardEv(legs3, "3P");
    const udEv = evaluateUdStandardCard(legs3, "UD_3P_STD").expectedValue;
    expect(ppEv).toBeGreaterThan(0);
    expect(udEv).toBeGreaterThan(0);
    expect(Math.abs(ppEv - udEv)).toBeLessThan(0.20);
  });

  it("parity: same 4 legs, pre-paytable winProbability diff < 0.1%", () => {
    const legs4 = MOCK_LEGS_10.slice(0, 4);
    const ppWinProb = ppWinProbabilityAllHit(legs4);
    const udRes = evaluateUdStandardCard(legs4, "UD_4P_STD");
    expect(Math.abs(ppWinProb - udRes.winProbability)).toBeLessThan(0.001);
  });

  it("UD Flex 3F evaluates without error", () => {
    const legs3 = MOCK_LEGS_10.slice(0, 3);
    const res = evaluateUdFlexCard(legs3, "UD_3F_FLX");
    expect(Number.isFinite(res.expectedValue)).toBe(true);
  });
});

describe("Mock legs module", () => {
  it("createSyntheticEvPicks returns N legs with valid trueProb and legEv", () => {
    const { createSyntheticEvPicks } = require("../src/mock_legs");
    const pp = createSyntheticEvPicks(10, "prizepicks");
    const ud = createSyntheticEvPicks(12, "underdog");
    expect(pp.length).toBe(10);
    expect(ud.length).toBe(12);
    pp.forEach((p: { trueProb: number; legEv: number; site: string }) => {
      expect(p.trueProb).toBeGreaterThanOrEqual(0.55);
      expect(p.trueProb).toBeLessThanOrEqual(0.65);
      expect(p.legEv).toBeGreaterThanOrEqual(0.02);
      expect(p.legEv).toBeLessThanOrEqual(0.06);
      expect(p.site).toBe("prizepicks");
    });
    ud.forEach((p: { site: string }) => expect(p.site).toBe("underdog"));
  });
});

describe("Tier1 / Kelly parity: mock legs → innovative cards", () => {
  const { createSyntheticEvPicks } = require("../src/mock_legs");
  const { buildInnovativeCards, writeTieredCsvs } = require("../src/build_innovative_cards");
  const fs = require("fs");
  const path = require("path");

  const legs = createSyntheticEvPicks(12, "prizepicks");
  const { cards } = buildInnovativeCards(legs, { bankroll: 1000, maxCards: 10 });

  it("buildInnovativeCards returns cards with kellyStake, cardEV, tier", () => {
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((c: { kellyStake: number; cardEV: number; tier: number }) => {
      expect(Number.isFinite(c.kellyStake)).toBe(true);
      expect(Number.isFinite(c.cardEV)).toBe(true);
      expect([1, 2, 3]).toContain(c.tier);
    });
  });

  it("writeTieredCsvs produces tier1/tier2 CSV with kellyStake, cardEV, tier columns", () => {
    const outDir = path.join(process.cwd(), "test-tier-output");
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const { tier1Count, tier2Count } = writeTieredCsvs(cards, outDir, "test-run", "PP");
      const tier2Path = path.join(outDir, "tier2.csv");
      if (tier2Count > 0 && fs.existsSync(tier2Path)) {
        const content = fs.readFileSync(tier2Path, "utf8");
        expect(content).toContain("kellyStake");
        expect(content).toContain("cardEV");
        expect(content).toContain("tier");
      }
    } finally {
      if (fs.existsSync(path.join(outDir, "tier1.csv"))) fs.unlinkSync(path.join(outDir, "tier1.csv"));
      if (fs.existsSync(path.join(outDir, "tier2.csv"))) fs.unlinkSync(path.join(outDir, "tier2.csv"));
      try { fs.rmdirSync(outDir); } catch (_) {}
    }
  });

  it("Tier1 cards have cardEV >= 8% and kellyStake >= 0", () => {
    const tier1 = cards.filter((c: { tier: number }) => c.tier === 1);
    tier1.forEach((c: { cardEV: number; kellyStake: number }) => {
      expect(c.cardEV).toBeGreaterThanOrEqual(0.08);
      expect(c.kellyStake).toBeGreaterThanOrEqual(0);
    });
  });

  it("Kelly table: all innovative cards have finite kellyFrac and kellyStake", () => {
    cards.forEach((c: { kellyFrac: number; kellyStake: number }) => {
      expect(Number.isFinite(c.kellyFrac)).toBe(true);
      expect(Number.isFinite(c.kellyStake)).toBe(true);
    });
  });
});
