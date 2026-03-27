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
    eventId: "evt13",
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
    projectionId: "proj-13",
    gameId: "game-13",
    startTime: null,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    ...overrides,
  };
}

describe("phase 13 source-aware match gap attribution", () => {
  it("attributes unmatched props deterministically by site and reason class", async () => {
    const meta: OddsSourceMetadata = {
      isFromCache: false,
      providerUsed: "OddsAPI",
      originalProvider: "SportGamesOnline",
    };
    const out = await mergeWithSnapshot(
      [
        makePick({ projectionId: "matched" }),
        makePick({ projectionId: "no-candidate", player: "Unknown Player" }),
        makePick({ projectionId: "promo", isGoblin: true }),
      ],
      [makeOddsRow()],
      meta,
      undefined,
      getDefaultCliArgs()
    );

    expect(out.stageAccounting.source.providerUsed).toBe("OddsAPI");
    expect(out.stageAccounting.source.originalProvider).toBe("SportGamesOnline");
    expect(out.stageAccounting.unmatchedAttribution.propsBySite.prizepicks).toBe(2);
    expect(out.stageAccounting.unmatchedAttribution.propsByReason.no_candidate).toBe(1);
    expect(out.stageAccounting.unmatchedAttribution.propsByReason.promo_or_special).toBe(1);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedPropRows).toBe(1);
  });

  it("attributes unmatched odds by book while matched rows are not miscounted as unmatched", async () => {
    const meta: OddsSourceMetadata = {
      isFromCache: true,
      providerUsed: "OddsAPI",
      originalProvider: "TheRundown",
    };
    const out = await mergeWithSnapshot(
      [makePick({ projectionId: "matched-only" })],
      [
        makeOddsRow({ book: "fanduel" }),
        makeOddsRow({ player: "LEBRON_JAMES_1_NBA", line: 27.5, book: "draftkings" }),
      ],
      meta,
      undefined,
      getDefaultCliArgs()
    );

    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedPropRows).toBe(0);
    expect(out.stageAccounting.unmatchedAttribution.oddsByBook.fanduel ?? 0).toBe(0);
    expect(out.stageAccounting.unmatchedAttribution.oddsByBook.draftkings).toBe(1);
  });
});
