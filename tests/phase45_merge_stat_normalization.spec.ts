/**
 * Phase 45 — Case-insensitive stat alias resolution for merge (no line/EV changes).
 */
import type { InternalPlayerPropOdds, RawPick } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

import { mergeWithSnapshot } from "../src/merge_odds";

function makeOddsRow(overrides: Partial<InternalPlayerPropOdds> = {}): InternalPlayerPropOdds {
  return {
    sport: "NBA",
    player: "NIKOLA_JOKIC_1_NBA",
    team: "DEN",
    opponent: "LAL",
    league: "NBA",
    stat: "points" as InternalPlayerPropOdds["stat"],
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
    stat: "points" as RawPick["stat"],
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
  providerUsed: "OddsAPI",
  originalProvider: "OddsAPI",
};

describe("Phase 45 merge stat normalization (case-insensitive STAT_MAP)", () => {
  it("matches when pick stat uses PTS alias casing and odds use points", async () => {
    const odds = [makeOddsRow({ stat: "points" as InternalPlayerPropOdds["stat"] })];
    const picks = [makePick({ stat: "PTS" as RawPick["stat"] })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
    expect(merged[0].legKey).toBeDefined();
  });

  it("matches when odds row stat uses uppercase PTS and pick uses points", async () => {
    const odds = [makeOddsRow({ stat: "PTS" as InternalPlayerPropOdds["stat"] })];
    const picks = [makePick({ stat: "points" as RawPick["stat"] })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
  });

  it("matches threes when feed uses THREESMADE (camelCase key lowercased)", async () => {
    const odds = [
      makeOddsRow({
        stat: "threes" as InternalPlayerPropOdds["stat"],
        line: 2.5,
      }),
    ];
    const picks = [
      makePick({
        stat: "THREESMADE" as RawPick["stat"],
        line: 2.5,
      }),
    ];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
  });

  it("preserves unknown stat string when unmapped (no silent remap)", async () => {
    const odds = [
      makeOddsRow({
        stat: "points" as InternalPlayerPropOdds["stat"],
        player: "X_PLAYER_NBA",
      }),
    ];
    const picks = [
      makePick({
        stat: "totally_unknown_stat_xyz" as RawPick["stat"],
        player: "Unknown Player",
      }),
    ];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(0);
  });
});
