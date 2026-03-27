/**
 * Phase 48 — One merge-only stat alias (`three_pointers_*` → `threes`) + archive diff fixtures.
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
    player: "STEPHEN_CURRY_1_NBA",
    team: "GSW",
    opponent: "LAL",
    league: "NBA",
    stat: "threes" as InternalPlayerPropOdds["stat"],
    line: 4.5,
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
    site: "underdog",
    player: "Stephen Curry",
    team: "GSW",
    opponent: "LAL",
    league: "NBA",
    stat: "threes" as RawPick["stat"],
    line: 4.5,
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

describe("Phase 48 three_pointers_* → threes (STAT_MAP)", () => {
  it("matches OddsAPI threes when pick stat is three_pointers_made (UD import shape)", async () => {
    const odds = [makeOddsRow({ stat: "threes" as InternalPlayerPropOdds["stat"], line: 4.5 })];
    const picks = [makePick({ stat: "three_pointers_made" as RawPick["stat"], line: 4.5 })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
    expect(merged[0].legKey).toBeDefined();
  });

  it("matches OddsAPI threes when pick stat is three_pointers", async () => {
    const odds = [makeOddsRow({ stat: "threes" as InternalPlayerPropOdds["stat"], line: 4.5 })];
    const picks = [makePick({ stat: "three_pointers" as RawPick["stat"], line: 4.5 })];
    const { odds: merged } = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(merged).toHaveLength(1);
  });
});

describe("Phase 48 archive diff fixtures (A vs B)", () => {
  const left = path.join(__dirname, "fixtures/merge_archive_phase48/snapshot_A_baseline");
  const right = path.join(__dirname, "fixtures/merge_archive_phase48/snapshot_B_after_stat_alias");

  it("shows positive mergeCoverage delta and fewer no_match drops (representative post-fix)", () => {
    const d = buildMergeArchiveDiffReport(left, right);
    expect(d.keyMetrics.mergeCoverageDelta).toBeCloseTo(0.45, 5);
    expect(d.keyMetrics.dropRateDelta).toBeCloseTo(-0.45, 5);
    expect(d.keyMetrics.fallbackRateDelta).toBe(0);
    expect(d.auditTotals.matchedDelta).toBe(9);
    expect(d.auditTotals.droppedDelta).toBe(-9);
    expect(d.droppedByCanonicalReasonDelta.no_match).toBe(-9);
    expect(d.diagnosticsByStatCanonicalDeltaLines.some((l) => l.includes("three_pointers_made"))).toBe(true);
  });
});
