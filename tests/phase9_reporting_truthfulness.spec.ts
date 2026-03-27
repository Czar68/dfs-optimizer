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
  providerUsed: "OddsAPI",
  originalProvider: "OddsAPI",
};

describe("phase 9 backtest/reporting truthfulness hardening", () => {
  it("does not count filtered/no-match rows as modeled-emitted", async () => {
    const rows: RawPick[] = [
      makePick({ projectionId: "valid" }),
      makePick({ projectionId: "filtered-demon", isDemon: true }),
      makePick({ projectionId: "no-match", player: "Unknown Player" }),
    ];
    const out = await mergeWithSnapshot(rows, [makeOddsRow()], META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.rawRows).toBe(3);
    expect(out.stageAccounting.filteredBeforeMergeRows).toBe(1);
    expect(out.stageAccounting.noMatchRows).toBe(1);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.emittedRows).toBe(1);
    expect(out.odds).toHaveLength(1);
  });

  it("keeps existing valid merged-row behavior unchanged", async () => {
    const out = await mergeWithSnapshot(
      [makePick({ projectionId: "valid-only" })],
      [makeOddsRow({ overOdds: -120, underOdds: +100 })],
      META,
      undefined,
      getDefaultCliArgs()
    );

    expect(out.odds).toHaveLength(1);
    expect(out.odds[0].projectionId).toBe("valid-only");
    expect(out.stageAccounting.emittedRows).toBe(out.odds.length);
  });
});
