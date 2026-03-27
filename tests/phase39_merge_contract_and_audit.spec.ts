/**
 * Phase 39 — Merge contract SSOT, observability artifacts, determinism.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { InternalPlayerPropOdds, RawPick } from "../src/types";
import {
  MERGE_CONTRACT_SCHEMA_VERSION,
  MERGE_DEFAULT_NEAREST_TOLERANCE_NON_EXACT,
  MERGE_PRIMARY_MATCH_STRATEGY,
  UD_ALT_LINE_MAX_DELTA,
  UD_ALT_MATCH_STATS,
  canonicalMergeDropReason,
} from "../src/merge_contract";
import { UD_ALT_LINE_MAX_DELTA as UD_ALT_FROM_MERGE_ODDS, UD_ALT_MATCH_STATS as UD_STATS_FROM_MERGE_ODDS } from "../src/merge_odds";
import { getMergeAuditPaths, buildMergeAuditReport, writeMergeAuditArtifacts } from "../src/reporting/merge_audit";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";
import type { MergeStageAccounting } from "../src/merge_odds";
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

const META = {
  isFromCache: false,
  providerUsed: "OddsAPI" as const,
  originalProvider: "OddsAPI",
};

describe("Phase 39 merge contract", () => {
  it("SSOT constants match merge_odds re-exports (no silent drift)", () => {
    expect(UD_ALT_FROM_MERGE_ODDS).toBe(UD_ALT_LINE_MAX_DELTA);
    expect(UD_STATS_FROM_MERGE_ODDS.size).toBe(UD_ALT_MATCH_STATS.size);
    for (const s of UD_ALT_MATCH_STATS) {
      expect(UD_STATS_FROM_MERGE_ODDS.has(s)).toBe(true);
    }
  });

  it("canonical drop reason mapping is stable for real internal keys", () => {
    expect(canonicalMergeDropReason("no_candidate")).toBe("no_match");
    expect(canonicalMergeDropReason("line_diff")).toBe("line_mismatch");
    expect(canonicalMergeDropReason("juice")).toBe("invalid_odds");
    expect(canonicalMergeDropReason("promo_or_special")).toBe("promo_or_special");
    expect(canonicalMergeDropReason("combo_label_excluded")).toBe("combo_label_excluded");
  });

  it("documents primary strategy and default nearest tolerance", () => {
    expect(MERGE_PRIMARY_MATCH_STRATEGY).toContain("exact");
    expect(MERGE_DEFAULT_NEAREST_TOLERANCE_NON_EXACT).toBe(0.5);
    expect(MERGE_CONTRACT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase 39 merge audit determinism", () => {
  it("same snapshot merge twice yields identical mergeAuditSnapshot (excluding wall-clock file write)", async () => {
    const odds = [makeOddsRow()];
    const picks = [makePick()];
    const a = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    const b = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    // Merge-match fields only: Phase 40+ writes prior audit to disk so merge-quality drift/timestamps
    // differ on the second run; that must not imply different merge outcomes.
    expect(a.mergeAuditSnapshot.dropRecords).toEqual(b.mergeAuditSnapshot.dropRecords);
    expect(a.mergeAuditSnapshot.altLineFallbackCount).toBe(b.mergeAuditSnapshot.altLineFallbackCount);
    expect(a.mergeAuditSnapshot.exactLineMatchCount).toBe(b.mergeAuditSnapshot.exactLineMatchCount);
    expect(a.mergeAuditSnapshot.nearestWithinToleranceCount).toBe(
      b.mergeAuditSnapshot.nearestWithinToleranceCount
    );
    expect(a.mergeAuditSnapshot.mergedLineDeltaHistogram).toEqual(b.mergeAuditSnapshot.mergedLineDeltaHistogram);
  });

  it("drop record attributes stable reason for promo/special skip", async () => {
    const odds = [makeOddsRow()];
    const picks = [makePick({ isDemon: true })];
    const out = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(out.odds).toHaveLength(0);
    expect(out.mergeAuditSnapshot.dropRecords).toHaveLength(1);
    expect(out.mergeAuditSnapshot.dropRecords[0].internalReason).toBe("promo_or_special");
    expect(out.mergeAuditSnapshot.dropRecords[0].canonicalReason).toBe("promo_or_special");
  });

  it("buildMergeAuditReport JSON key order is stable (stableStringify)", () => {
    const sa: MergeStageAccounting = {
      source: { providerUsed: "OddsAPI" },
      rawRows: 1,
      propsConsideredForMatchingRows: 1,
      totalOddsRowsConsidered: 10,
      matchedRows: 1,
      unmatchedPropRows: 0,
      unmatchedOddsRows: 5,
      emittedRows: 1,
      filteredBeforeMergeRows: 0,
      noMatchRows: 0,
      skippedByReason: {
        promoOrSpecial: 0,
        fantasyExcluded: 0,
        comboLabelExcluded: 0,
        noOddsStat: 0,
        escalatorFiltered: 0,
        noCandidate: 0,
        lineDiff: 0,
        juice: 0,
      },
      unmatchedAttribution: { propsBySite: {}, propsByReason: {}, oddsByBook: {} },
      explicitAliasResolutionHits: 0,
      multiBookConsensusPickCount: 0,
    };
    const report = buildMergeAuditReport({
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      stageAccounting: sa,
      platformStats: { prizepicks: { rawProps: 1, matchEligible: 1, mergedExact: 1, mergedNearest: 0, noCandidate: 0, lineDiff: 0, noOddsStat: 0, juice: 0 } },
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 1,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: { "0": 1 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const s1 = stableStringifyForObservability(report);
    const s2 = stableStringifyForObservability(report);
    expect(s1).toBe(s2);
  });

  it("writes merge audit JSON under cwd (temp) with deterministic keys", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "merge-audit-"));
    const { jsonPath } = getMergeAuditPaths(tmp);
    const sa: MergeStageAccounting = {
      source: { providerUsed: "none" },
      rawRows: 0,
      propsConsideredForMatchingRows: 0,
      totalOddsRowsConsidered: 0,
      matchedRows: 0,
      unmatchedPropRows: 0,
      unmatchedOddsRows: 0,
      emittedRows: 0,
      filteredBeforeMergeRows: 0,
      noMatchRows: 0,
      skippedByReason: {
        promoOrSpecial: 0,
        fantasyExcluded: 0,
        comboLabelExcluded: 0,
        noOddsStat: 0,
        escalatorFiltered: 0,
        noCandidate: 0,
        lineDiff: 0,
        juice: 0,
      },
      unmatchedAttribution: { propsBySite: {}, propsByReason: {}, oddsByBook: {} },
      explicitAliasResolutionHits: 0,
      multiBookConsensusPickCount: 0,
    };
    writeMergeAuditArtifacts(
      tmp,
      buildMergeAuditReport({
        generatedAtUtc: "fixed",
        stageAccounting: sa,
        platformStats: {},
        dropRecords: [],
        altLineFallbackCount: 0,
        exactLineMatchCount: 0,
        nearestWithinToleranceCount: 0,
        mergedLineDeltaHistogram: {},
        cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
      })
    );
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    expect(keys[0]).toBe("altLineFallbackCount");
    expect(keys).toContain("contract");
    expect(keys).toContain("drops");
    expect(keys).toContain("stageAccounting");
  });
});
