// src/__tests__/exact_line_merge.test.ts
// Tests: exact-first merge, multi-line support, legKey/legLabel stamping.

import type { SgoPlayerPropOdds, RawPick } from "../types";
import type { OddsSourceMetadata } from "../merge_odds";
import { mergeWithSnapshot } from "../merge_odds";

function makeOddsRow(overrides: Partial<SgoPlayerPropOdds> = {}): SgoPlayerPropOdds {
  return {
    sport: "NBA",
    player: "NIKOLA_JOKIC_1_NBA",
    team: "DEN",
    opponent: "LAL",
    league: "NBA",
    stat: "points" as any,
    line: 24.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel",
    eventId: "evt1",
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
    isMainLine: true,
    ...overrides,
  };
}

function makePick(overrides: Partial<RawPick> = {}): RawPick {
  return {
    sport: "NBA",
    site: "prizepicks",
    player: "Nikola Jokic",
    team: "DEN",
    opponent: "LAL",
    league: "NBA",
    stat: "points" as any,
    line: 24.5,
    projectionId: "proj-1",
    gameId: "game-1",
    startTime: null,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    ...overrides,
  };
}

const META: OddsSourceMetadata = {
  isFromCache: false,
  providerUsed: "SGO",
  originalProvider: "SGO",
};

describe("exact-line merge (Prompt 3)", () => {
  it("two alt lines for same player/stat both merge and remain distinct", async () => {
    const odds = [
      makeOddsRow({ line: 19.5, isMainLine: false, overOdds: -130, underOdds: +110 }),
      makeOddsRow({ line: 21.5, isMainLine: false, overOdds: -105, underOdds: -115 }),
      makeOddsRow({ line: 24.5, isMainLine: true,  overOdds: -110, underOdds: -110 }),
    ];

    const picks = [
      makePick({ line: 19.5, projectionId: "proj-alt1" }),
      makePick({ line: 21.5, projectionId: "proj-alt2" }),
    ];

    const { odds: merged } = await mergeWithSnapshot(picks, odds, META);

    expect(merged).toHaveLength(2);

    const lines = merged.map((m) => m.line).sort();
    expect(lines).toEqual([19.5, 21.5]);

    for (const m of merged) {
      expect(m.altMatchDelta).toBe(0);
    }

    const keys = merged.map((m) => m.legKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("exact match takes priority over nearer alt line", async () => {
    const odds = [
      makeOddsRow({ line: 20.0, isMainLine: false, overOdds: -120, underOdds: +100 }),
      makeOddsRow({ line: 20.5, isMainLine: false, overOdds: -115, underOdds: -105 }),
    ];

    const pick = makePick({ line: 20.5 });

    const { odds: merged } = await mergeWithSnapshot([pick], odds, META);

    expect(merged).toHaveLength(1);
    expect(merged[0].line).toBe(20.5);
    expect(merged[0].overOdds).toBe(-115);
    expect(merged[0].altMatchDelta).toBe(0);
  });

  it("nearest fallback when no exact match, within tolerance", async () => {
    const odds = [
      makeOddsRow({ line: 24.5, overOdds: -110, underOdds: -110 }),
    ];

    const pick = makePick({ line: 24.0 });

    const { odds: merged } = await mergeWithSnapshot([pick], odds, META);

    expect(merged).toHaveLength(1);
    expect(merged[0].altMatchDelta).toBe(0.5);
  });

  it("legKey and legLabel are stamped on merged picks", async () => {
    const odds = [makeOddsRow()];
    const pick = makePick();

    const { odds: merged } = await mergeWithSnapshot([pick], odds, META);

    expect(merged).toHaveLength(1);
    expect(merged[0].legKey).toBeDefined();
    expect(merged[0].legKey).toContain("prizepicks");
    expect(merged[0].legKey).toContain("points");
    expect(merged[0].legKey).toContain("24.5");

    expect(merged[0].legLabel).toBeDefined();
    expect(merged[0].legLabel).toContain("Nikola Jokic");
    expect(merged[0].legLabel).toContain("Points");
    expect(merged[0].legLabel).toContain("24.5");
  });

  it("multiple picks at same line both merge (1:1 per pick)", async () => {
    const odds = [
      makeOddsRow({ line: 24.5, book: "fanduel" }),
      makeOddsRow({ line: 24.5, book: "draftkings" }),
    ];

    const picks = [
      makePick({ line: 24.5, projectionId: "proj-a" }),
      makePick({ line: 24.5, projectionId: "proj-b" }),
    ];

    const { odds: merged } = await mergeWithSnapshot(picks, odds, META);

    expect(merged).toHaveLength(2);
    for (const m of merged) {
      expect(m.altMatchDelta).toBe(0);
    }
  });
});
