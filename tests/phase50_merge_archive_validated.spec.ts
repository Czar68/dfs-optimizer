/**
 * Phase 50 — PP `pts_rebs` / `pts+rebs` → `points_rebounds` (STAT_MAP parity with `fetch_props.mapStatType`).
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
    stat: "points_rebounds" as InternalPlayerPropOdds["stat"],
    line: 38.5,
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
    stat: "points_rebounds" as RawPick["stat"],
    line: 38.5,
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

describe("Phase 50 PP points+rebounds combo aliases → points_rebounds", () => {
  it("matches OddsAPI points_rebounds when pick stat is pts_rebs", async () => {
    const odds = [makeOddsRow({ stat: "points_rebounds" as InternalPlayerPropOdds["stat"], line: 38.5 })];
    const picks = [makePick({ stat: "pts_rebs" as RawPick["stat"], line: 38.5 })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
    expect(merged[0].legKey).toBeDefined();
  });

  it("matches OddsAPI points_rebounds when pick stat is pts+rebs", async () => {
    const odds = [makeOddsRow({ stat: "points_rebounds" as InternalPlayerPropOdds["stat"], line: 38.5 })];
    const picks = [makePick({ stat: "pts+rebs" as RawPick["stat"], line: 38.5 })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
  });
});

describe("Phase 50 archive diff fixtures (A vs B)", () => {
  const left = path.join(__dirname, "fixtures/merge_archive_phase50/snapshot_A_baseline");
  const right = path.join(__dirname, "fixtures/merge_archive_phase50/snapshot_B_after_stat_alias");

  it("shows higher mergeCoverage and fewer no_odds_stat drops (representative post-fix)", () => {
    const d = buildMergeArchiveDiffReport(left, right);
    expect(d.keyMetrics.mergeCoverageDelta).toBeCloseTo(0.3, 5);
    expect(d.keyMetrics.dropRateDelta).toBeCloseTo(-0.3, 5);
    expect(d.auditTotals.matchedDelta).toBe(6);
    expect(d.auditTotals.droppedDelta).toBe(-6);
    expect(d.droppedByCanonicalReasonDelta.no_odds_stat).toBe(-6);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("pts_rebs"))).toBe(true);
  });
});
