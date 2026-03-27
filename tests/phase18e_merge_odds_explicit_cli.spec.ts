/**
 * Phase 18E — merge_odds: no hidden global CLI; explicit CliArgs at merge/fetch boundaries.
 */
import fs from "fs";
import path from "path";

import type { RawPick, InternalPlayerPropOdds } from "../src/types";
import type { OddsSourceMetadata } from "../src/merge_odds";
import { getDefaultCliArgs, parseArgs } from "../src/cli_args";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

import { mergeWithSnapshot } from "../src/merge_odds";

const root = path.join(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

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

describe("Phase 18E — merge_odds explicit CliArgs", () => {
  it("merge_odds.ts does not resolve process-global CLI (no getCliArgs / resolveMergeCli)", () => {
    const merge = readSrc("src/merge_odds.ts");
    expect(merge).not.toMatch(/\bgetCliArgs\b/);
    expect(merge).not.toMatch(/resolveMergeCli/);
    expect(merge).not.toMatch(/\bcliArgs\./);
    expect(merge).toContain("fetchFreshOdds(");
    expect(merge).toContain("cli: CliArgs");
  });

  it("mergeWithSnapshot(getDefaultCliArgs) matches parseArgs([]) for identical snapshot merge", async () => {
    const rows: RawPick[] = [makePick({ projectionId: "a" })];
    const odds = [makeOddsRow()];
    const a = await mergeWithSnapshot(rows, odds, META, undefined, getDefaultCliArgs());
    const b = await mergeWithSnapshot(rows, odds, META, undefined, parseArgs([]));
    expect(a.odds.length).toBe(b.odds.length);
    expect(a.stageAccounting.matchedRows).toBe(b.stageAccounting.matchedRows);
    expect(a.stageAccounting.emittedRows).toBe(b.stageAccounting.emittedRows);
  });

  it("non-default CLI (--exact-line) changes merge eligibility vs default (spot-check)", async () => {
    const rows: RawPick[] = [makePick({ line: 24.0, projectionId: "near" })];
    const odds = [makeOddsRow({ line: 24.5 })];
    const fuzzy = await mergeWithSnapshot(rows, odds, META, undefined, getDefaultCliArgs());
    const exact = await mergeWithSnapshot(rows, odds, META, undefined, parseArgs(["--exact-line"]));
    expect(fuzzy.odds.length).toBe(1);
    expect(exact.odds.length).toBe(0);
  });
});
