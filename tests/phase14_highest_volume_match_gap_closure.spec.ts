import type { RawPick, InternalPlayerPropOdds } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

import { mergeWithSnapshot } from "../src/merge_odds";

type RawPickWithOutcome = RawPick & { outcome?: "over" | "under" };

function makeOddsRow(overrides: Partial<InternalPlayerPropOdds> = {}): InternalPlayerPropOdds {
  return {
    sport: "NBA",
    player: "JALEN_BRUNSON_1_NBA",
    team: "NYK",
    opponent: "BOS",
    league: "NBA",
    stat: "points" as any,
    line: 24.5,
    overOdds: -120,
    underOdds: -250,
    book: "fanduel",
    eventId: "evt14",
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
    isMainLine: true,
    ...overrides,
  };
}

function makePick(overrides: Partial<RawPickWithOutcome> = {}): RawPickWithOutcome {
  return {
    sport: "NBA",
    site: "prizepicks",
    player: "Jalen Brunson",
    team: "NYK",
    opponent: "BOS",
    league: "NBA",
    stat: "points" as any,
    line: 24.5,
    projectionId: "proj-14",
    gameId: "game-14",
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

describe("phase 14 highest-volume match gap closure (juice class, side-aware)", () => {
  it("matches explicit over rows when only opposite side is too juiced", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ projectionId: "over-should-match", outcome: "over" }) as RawPick],
      [makeOddsRow({ overOdds: -120, underOdds: -250 })],
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(out.odds).toHaveLength(1);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedPropRows).toBe(0);
  });

  it("still fail-closes when selected side itself is too juiced", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ projectionId: "over-too-juiced", outcome: "over" }) as RawPick],
      [makeOddsRow({ overOdds: -250, underOdds: -120 })],
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(out.odds).toHaveLength(0);
    expect(out.stageAccounting.unmatchedAttribution.propsByReason.juice).toBe(1);
  });

  it("keeps existing valid matches unchanged for non-juice rows", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ projectionId: "baseline-valid" }) as RawPick],
      [makeOddsRow({ overOdds: -110, underOdds: -110 })],
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(out.odds).toHaveLength(1);
    expect(out.odds[0].projectionId).toBe("baseline-valid");
  });
});
