import type { RawPick, InternalPlayerPropOdds } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

import { mergeWithSnapshot } from "../src/merge_odds";

function makeOddsRow(overrides: Partial<InternalPlayerPropOdds> = {}): InternalPlayerPropOdds {
  return {
    sport: "NBA",
    player: "TJ_MCCONNELL_1_NBA",
    team: "IND",
    opponent: "NYK",
    league: "NBA",
    stat: "assists" as any,
    line: 5.5,
    overOdds: -110,
    underOdds: -110,
    book: "fanduel",
    eventId: "evt12",
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
    player: "T.J. McConnell",
    team: "IND",
    opponent: "NYK",
    league: "NBA",
    stat: "assists" as any,
    line: 5.5,
    projectionId: "proj-12",
    gameId: "game-12",
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

describe("phase 12 matching quality improvement (false-join-safe)", () => {
  it("matches safe punctuation drift names that previously missed", async () => {
    const out = await mergeWithSnapshot([makePick()], [makeOddsRow()], META, undefined, getDefaultCliArgs());
    expect(out.odds).toHaveLength(1);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedPropRows).toBe(0);
  });

  it("keeps existing correct matches unchanged", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ player: "TJ McConnell", projectionId: "already-matched" })],
      [makeOddsRow()],
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(out.odds).toHaveLength(1);
    expect(out.odds[0].projectionId).toBe("already-matched");
  });

  it("still fail-closes low-confidence collisions (name-only near miss)", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ player: "TJ McConnel", projectionId: "typo-low-confidence" })],
      [makeOddsRow()],
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(out.odds).toHaveLength(0);
    expect(out.stageAccounting.unmatchedPropRows).toBe(1);
    expect(out.stageAccounting.matchedRows).toBe(0);
  });
});
