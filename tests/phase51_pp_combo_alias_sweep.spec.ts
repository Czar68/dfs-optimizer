/**
 * Phase 51 — Remaining PP combo aliases from `fetch_props.mapStatType` (PA / RA / stocks).
 */
import * as path from "path";
import type { InternalPlayerPropOdds, RawPick } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";
import { buildMergeArchiveDiffReport } from "../src/reporting/merge_archive_diff";

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

describe("Phase 51 PP combo alias sweep (STAT_MAP)", () => {
  it("maps pts_asts and pts+asts to points_assists (OddsAPI points_assists)", async () => {
    const line = 31.5;
    const odds = [makeOddsRow({ stat: "points_assists" as InternalPlayerPropOdds["stat"], line })];
    const p1 = await mergeWithSnapshot(
      [makePick({ stat: "pts_asts" as RawPick["stat"], line })],
      odds,
      META,
      undefined,
      getDefaultCliArgs()
    );
    const p2 = await mergeWithSnapshot(
      [makePick({ stat: "pts+asts" as RawPick["stat"], line })],
      odds,
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(p1.odds).toHaveLength(1);
    expect(p2.odds).toHaveLength(1);
  });

  it("maps rebs_asts and rebs+asts to rebounds_assists", async () => {
    const line = 15.5;
    const odds = [makeOddsRow({ stat: "rebounds_assists" as InternalPlayerPropOdds["stat"], line })];
    const p1 = await mergeWithSnapshot(
      [makePick({ stat: "rebs_asts" as RawPick["stat"], line })],
      odds,
      META,
      undefined,
      getDefaultCliArgs()
    );
    const p2 = await mergeWithSnapshot(
      [makePick({ stat: "rebs+asts" as RawPick["stat"], line })],
      odds,
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(p1.odds).toHaveLength(1);
    expect(p2.odds).toHaveLength(1);
  });

  it("maps blks+stls to stocks", async () => {
    const line = 2.5;
    const odds = [makeOddsRow({ stat: "stocks" as InternalPlayerPropOdds["stat"], line })];
    const { odds: merged } = await mergeWithSnapshot(
      [makePick({ stat: "blks+stls" as RawPick["stat"], line })],
      odds,
      META,
      undefined,
      getDefaultCliArgs()
    );
    expect(merged).toHaveLength(1);
  });
});

describe("Phase 51 archive diff fixtures (A vs B)", () => {
  const left = path.join(__dirname, "fixtures/merge_archive_phase51/snapshot_A_baseline");
  const right = path.join(__dirname, "fixtures/merge_archive_phase51/snapshot_B_after_pp_combo_sweep");

  it("shows higher mergeCoverage and fewer no_odds_stat drops (representative post-sweep)", () => {
    const d = buildMergeArchiveDiffReport(left, right);
    expect(d.keyMetrics.mergeCoverageDelta).toBeCloseTo(0.3, 5);
    expect(d.keyMetrics.dropRateDelta).toBeCloseTo(-0.3, 5);
    expect(d.auditTotals.matchedDelta).toBe(6);
    expect(d.droppedByCanonicalReasonDelta.no_odds_stat).toBe(-6);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("pts_asts"))).toBe(true);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("rebs_asts"))).toBe(true);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("blks+stls"))).toBe(true);
  });
});
