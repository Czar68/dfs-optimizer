/**
 * Phase 60 — PP combo-label exclusion before matching (deterministic).
 */
import type { RawPick, InternalPlayerPropOdds } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";
import { canonicalMergeDropReason, MERGE_DROP_REASON } from "../src/merge_contract";
import { mergeWithSnapshot } from "../src/merge_odds";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

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

describe("Phase 60 PP combo_label_excluded", () => {
  it("canonical reason maps to MERGE_DROP_REASON", () => {
    expect(canonicalMergeDropReason("combo_label_excluded")).toBe(MERGE_DROP_REASON.combo_label_excluded);
  });

  it("excludes PP combo labels before matching; no matchEligible increment", async () => {
    const props: RawPick[] = [
      makePick({ projectionId: "combo-1", player: "Player A + Player B", line: 20.5 }),
      makePick({ projectionId: "single-1", player: "Nikola Jokic" }),
    ];
    const odds = [makeOddsRow()];
    const out = await mergeWithSnapshot(props, odds, META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.skippedByReason.comboLabelExcluded).toBe(1);
    expect(out.stageAccounting.propsConsideredForMatchingRows).toBe(1);
    expect(out.stageAccounting.filteredBeforeMergeRows).toBe(1);
    expect(out.stageAccounting.matchedRows).toBe(1);
    const comboDrop = out.mergeAuditSnapshot.dropRecords.find((d) => d.player === "Player A + Player B");
    expect(comboDrop?.internalReason).toBe("combo_label_excluded");
    expect(comboDrop?.canonicalReason).toBe(MERGE_DROP_REASON.combo_label_excluded);
  });

  it("does not apply combo rule to Underdog picks", async () => {
    const props: RawPick[] = [
      makePick({ site: "underdog", projectionId: "ud-1", player: "A + B", line: 20.5 }),
      makePick({ site: "underdog", projectionId: "ud-2", player: "Nikola Jokic" }),
    ];
    const odds = [makeOddsRow(), makeOddsRow({ player: "LEBRON_JAMES_1_NBA", line: 27.5 })];
    const out = await mergeWithSnapshot(props, odds, META, undefined, getDefaultCliArgs());

    expect(out.stageAccounting.skippedByReason.comboLabelExcluded).toBe(0);
  });
});
