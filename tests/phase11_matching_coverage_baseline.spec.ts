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

describe("phase 11 matching coverage baseline", () => {
  it("counts matched and unmatched prop rows distinctly", async () => {
    const props: RawPick[] = [
      makePick({ projectionId: "matched-1" }),
      makePick({ projectionId: "unmatched-1", player: "Unknown Player" }),
      makePick({ projectionId: "filtered-1", isDemon: true }),
    ];
    const odds = [makeOddsRow(), makeOddsRow({ player: "LEBRON_JAMES_1_NBA", line: 27.5 })];
    const out = await mergeWithSnapshot(props, odds, META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.rawRows).toBe(3);
    expect(out.stageAccounting.propsConsideredForMatchingRows).toBe(2);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedPropRows).toBe(1);
    expect(out.stageAccounting.filteredBeforeMergeRows).toBe(1);
    expect(out.stageAccounting.emittedRows).toBe(1);
  });

  it("surfaces unmatched odds inventory deterministically", async () => {
    const props: RawPick[] = [makePick({ projectionId: "matched-only" })];
    const odds = [
      makeOddsRow({ player: "NIKOLA_JOKIC_1_NBA", line: 24.5 }),
      makeOddsRow({ player: "LEBRON_JAMES_1_NBA", line: 27.5 }),
      makeOddsRow({ player: "STEPHEN_CURRY_1_NBA", line: 4.5, stat: "threes" as any }),
    ];
    const out = await mergeWithSnapshot(props, odds, META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.totalOddsRowsConsidered).toBe(3);
    expect(out.stageAccounting.matchedRows).toBe(1);
    expect(out.stageAccounting.unmatchedOddsRows).toBe(2);
  });

  it("keeps explicit skip/drop reasons machine-readable", async () => {
    const props: RawPick[] = [
      makePick({ projectionId: "promo", isGoblin: true }),
      makePick({ projectionId: "fantasy", stat: "fantasy_score" as any }),
      makePick({ projectionId: "line-diff", line: 50.5 }),
      makePick({ projectionId: "juice", line: 24.5 }),
    ];
    const odds = [makeOddsRow({ underOdds: -250 })];
    const out = await mergeWithSnapshot(props, odds, META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.skippedByReason.promoOrSpecial).toBe(1);
    expect(out.stageAccounting.skippedByReason.fantasyExcluded).toBe(1);
    expect(out.stageAccounting.skippedByReason.lineDiff).toBe(1);
    expect(out.stageAccounting.skippedByReason.juice).toBe(1);
  });
});
