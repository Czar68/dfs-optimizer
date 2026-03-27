/**
 * Phase 16J: Clipboard / Telegram labels must reflect platform + canonical structure id
 * (never UD slips labeled as PrizePicks).
 */
import { formatCardClipTag, generateClipboardString } from "../src/exporter/clipboard_generator";
import { getSupportedStructures } from "../src/config/prizepicks_payouts";
import type { CardEvResult, EvPick, FlexType } from "../src/types";

function minimalPick(overrides: Partial<EvPick>): EvPick {
  const base: EvPick = {
    id: "leg-1",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "Test Player",
    team: "T1",
    opponent: "T2",
    stat: "points",
    line: 22.5,
    projectionId: "p1",
    gameId: "g1",
    startTime: null,
    outcome: "over",
    trueProb: 0.55,
    fairOdds: -110,
    edge: 0.05,
    book: null,
    overOdds: -110,
    underOdds: -110,
    legEv: 0.04,
    isNonStandardOdds: false,
  };
  return { ...base, ...overrides };
}

function minimalCard(partial: Partial<CardEvResult> & Pick<CardEvResult, "flexType" | "legs">): CardEvResult {
  const legs = partial.legs;
  const n = legs.length;
  const avgProb = legs.reduce((s, l) => s + l.pick.trueProb, 0) / n;
  const defaults: CardEvResult = {
    flexType: partial.flexType,
    legs: partial.legs,
    stake: 1,
    totalReturn: 1.1,
    expectedValue: 0.1,
    winProbability: 0.2,
    cardEv: 0.1,
    winProbCash: 0.15,
    winProbAny: 0.25,
    avgProb,
    avgEdgePct: 5,
    hitDistribution: { [n]: 1 },
  };
  return { ...defaults, ...partial };
}

describe("Phase 16J card labels", () => {
  it("uses UD canonical structure id in the tag (not [PP …]) for Underdog EV math", () => {
    const leg = minimalPick({ site: "underdog", player: "A", id: "a" });
    const card = minimalCard({
      flexType: "8P" as FlexType,
      site: "underdog",
      structureId: "UD_8P_STD",
      legs: [{ pick: leg, side: "over" }],
      cardEv: 0.08,
    });
    expect(formatCardClipTag(card)).toBe("[UD UD_8P_STD]");
    expect(generateClipboardString(card)).toMatch(/^\[UD UD_8P_STD\]/);
    expect(generateClipboardString(card)).not.toMatch(/\[PP/);
  });

  it("uses PrizePicks slip code when site is prizepicks", () => {
    const leg = minimalPick({ site: "prizepicks" });
    const card = minimalCard({
      flexType: "5F",
      site: "prizepicks",
      structureId: "5F",
      legs: [
        { pick: { ...leg, id: "1", player: "A" }, side: "over" },
        { pick: { ...leg, id: "2", player: "B" }, side: "over" },
        { pick: { ...leg, id: "3", player: "C" }, side: "over" },
        { pick: { ...leg, id: "4", player: "D" }, side: "over" },
        { pick: { ...leg, id: "5", player: "E" }, side: "over" },
      ],
      cardEv: 0.05,
    });
    expect(formatCardClipTag(card)).toBe("[PP 5F]");
  });

  it("infers Underdog from leg site when card.site is missing (legacy)", () => {
    const leg = minimalPick({ site: "underdog" });
    const card = minimalCard({
      flexType: "7P" as FlexType,
      structureId: "UD_7P_STD",
      legs: [{ pick: leg, side: "over" }],
      cardEv: 0.06,
    });
    expect(formatCardClipTag(card)).toBe("[UD UD_7P_STD]");
  });

  it("PrizePicks supported structures are at most 6 legs (no 7–8 PP slips)", () => {
    for (const id of getSupportedStructures()) {
      const n = parseInt(id.replace(/\D/g, ""), 10);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("UD flex 7–8 uses canonical id in tag when present", () => {
    const leg = minimalPick({ site: "underdog" });
    const card = minimalCard({
      flexType: "8F",
      site: "underdog",
      structureId: "UD_8F_FLX",
      legs: Array.from({ length: 8 }, (_, i) => ({
        pick: { ...leg, id: `x${i}`, player: `P${i}` },
        side: "over" as const,
      })),
      cardEv: 0.04,
    });
    expect(formatCardClipTag(card)).toBe("[UD UD_8F_FLX]");
  });
});
