/**
 * Phase 75 — PP merge breadth: PrizePicks stat resolution + combo spacing + merge STAT_MAP parity.
 */
import {
  mapJsonToRawPicks,
  mapPrizePicksStatType,
  resolvePrizePicksStatTypeRaw,
} from "../src/fetch_props";
import { mergeWithSnapshot } from "../src/merge_odds";
import type { InternalPlayerPropOdds, RawPick } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

const META: OddsSourceMetadata = {
  isFromCache: false,
  providerUsed: "OddsAPI",
  originalProvider: "OddsAPI",
};

function makeOddsRow(overrides: Partial<InternalPlayerPropOdds> = {}): InternalPlayerPropOdds {
  return {
    sport: "NBA",
    player: "NIKOLA_JOKIC_1_NBA",
    team: "DEN",
    opponent: "LAL",
    league: "NBA",
    stat: "points_assists",
    line: 18.5,
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
    stat: "points_assists",
    line: 18.5,
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

describe("Phase 75 mapPrizePicksStatType", () => {
  it("maps spaced combo labels to PRA / PA / PR / RA (spacing collapse)", () => {
    expect(mapPrizePicksStatType("Pts + Rebs + Asts")).toBe("pra");
    expect(mapPrizePicksStatType("Pts + Asts")).toBe("points_assists");
    expect(mapPrizePicksStatType("Pts + Rebs")).toBe("points_rebounds");
    expect(mapPrizePicksStatType("Rebs + Asts")).toBe("rebounds_assists");
  });

  it("legacy mode (no spacing collapse) leaves spaced combos unmapped", () => {
    expect(
      mapPrizePicksStatType("Pts + Rebs + Asts", { collapseComboSpacing: false })
    ).toBeNull();
  });

  it("maps explicit P+A / R+A tokens to combo stats", () => {
    expect(mapPrizePicksStatType("P+A")).toBe("points_assists");
    expect(mapPrizePicksStatType("R+A")).toBe("rebounds_assists");
  });
});

describe("Phase 75 resolvePrizePicksStatTypeRaw + mapJsonToRawPicks", () => {
  it("resolves stat_display_name when stat_type is missing", () => {
    const statTypeById = new Map<string, string>();
    const attr = {
      line_score: "20.5",
      stat_display_name: "Pts+Asts",
      projection_type: "Single Stat",
      description: "X",
      league_id: 7,
      created_at: "",
      updated_at: "",
      start_time: null,
      game_id: "g1",
    };
    const proj = {
      id: "1",
      type: "projection" as const,
      attributes: attr,
      relationships: {},
    };
    const raw = resolvePrizePicksStatTypeRaw(attr, proj, statTypeById);
    expect(raw).toBe("Pts+Asts");
    expect(mapPrizePicksStatType(raw!)).toBe("points_assists");
  });

  it("resolves included stat_type by relationship id", () => {
    const statTypeById = new Map([["244", "Pts+Asts"]]);
    const attr = {
      line_score: "20.5",
      projection_type: "Single Stat",
      description: "X",
      league_id: 7,
      created_at: "",
      updated_at: "",
      start_time: null,
      game_id: "g1",
    };
    const proj = {
      id: "1",
      type: "projection" as const,
      attributes: attr,
      relationships: {
        stat_type: { data: { type: "stat_type" as const, id: "244" } },
      },
    };
    const raw = resolvePrizePicksStatTypeRaw(attr, proj, statTypeById);
    expect(raw).toBe("Pts+Asts");
  });

  it("mapJsonToRawPicks ingests minimal JSON:API fixture", () => {
    const json = {
      data: [
        {
          type: "projection" as const,
          id: "p1",
          attributes: {
            line_score: "18.5",
            stat_type: "Pts + Asts",
            projection_type: "Single Stat",
            description: "WAS",
            league_id: 7,
            created_at: "",
            updated_at: "",
            start_time: null,
            game_id: "g1",
          },
          relationships: {
            new_player: { data: { type: "new_player" as const, id: "pl1" } },
            league: { data: { type: "league" as const, id: "7" } },
          },
        },
      ],
      included: [
        {
          type: "new_player" as const,
          id: "pl1",
          attributes: { name: "Test Player", team: "WAS", opponent: "OKC" },
        },
        {
          type: "league" as const,
          id: "7",
          attributes: { name: "NBA" },
        },
      ],
    };
    const picks = mapJsonToRawPicks(json);
    expect(picks.length).toBe(1);
    expect(picks[0].stat).toBe("points_assists");
  });
});

describe("Phase 75 merge_odds STAT_MAP (p+a / r+a)", () => {
  it("merges RawPick stat tokens p+a / r+a to OddsAPI combo markets", async () => {
    const line = 18.5;
    const oddsPa = [
      makeOddsRow({ stat: "points_assists" as InternalPlayerPropOdds["stat"], line }),
    ];
    const m1 = await mergeWithSnapshot(
      [makePick({ stat: "p+a" as unknown as RawPick["stat"], line })],
      oddsPa,
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(m1.odds).toHaveLength(1);

    const oddsRa = [
      makeOddsRow({ stat: "rebounds_assists" as InternalPlayerPropOdds["stat"], line: 8.5 }),
    ];
    const m2 = await mergeWithSnapshot(
      [makePick({ stat: "r+a" as unknown as RawPick["stat"], line: 8.5 })],
      oddsRa,
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(m2.odds).toHaveLength(1);
  });
});
