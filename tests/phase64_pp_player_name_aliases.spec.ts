/**
 * Phase 64 — Evidence-backed PLAYER_NAME_ALIASES (PP pick name → Odds feed name).
 * No fuzzy logic; pairs trace to Phase 63 / imported CSV crosswalk.
 */
import type { InternalPlayerPropOdds, RawPick } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import {
  mergeWithSnapshot,
  normalizePickPlayerKeyForDiagnostics,
} from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

function makeOddsRow(overrides: Partial<InternalPlayerPropOdds> = {}): InternalPlayerPropOdds {
  return {
    sport: "NBA",
    player: "Herb Jones",
    team: null,
    opponent: null,
    league: "NBA",
    stat: "points",
    line: 8.5,
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
    player: "Herbert Jones",
    team: null,
    opponent: null,
    league: "NBA",
    stat: "points",
    line: 8.5,
    projectionId: "proj-hj",
    gameId: "g1",
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

describe("Phase 64 — PP↔Odds explicit aliases", () => {
  it("merges Herbert Jones (PP) with Herb Jones (OddsAPI)", async () => {
    const odds = [makeOddsRow()];
    const picks = [makePick()];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
    expect(merged[0].player).toBe("Herbert Jones");
  });

  it("merges Tristan Silva (PP) with Tristan da Silva (OddsAPI)", async () => {
    const odds = [
      makeOddsRow({
        player: "Tristan da Silva",
        stat: "points",
        line: 11.5,
      }),
    ];
    const picks = [
      makePick({
        player: "Tristan Silva",
        line: 11.5,
        projectionId: "proj-ts",
      }),
    ];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
  });

  it("diagnostic key for Herbert Jones aligns with Herb Jones after alias", () => {
    expect(normalizePickPlayerKeyForDiagnostics("Herbert Jones")).toBe(
      normalizePickPlayerKeyForDiagnostics("Herb Jones")
    );
  });

  it("diagnostic key for Tristan Silva aligns with Tristan da Silva after alias", () => {
    expect(normalizePickPlayerKeyForDiagnostics("Tristan Silva")).toBe(
      normalizePickPlayerKeyForDiagnostics("Tristan da Silva")
    );
  });
});
