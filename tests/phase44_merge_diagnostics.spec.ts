/**
 * Phase 44 — Merge dimensional diagnostics (additive rollups only).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { canonicalMergeDropReason, type MergeDropRecord } from "../src/merge_contract";
import { buildMergeAuditReport } from "../src/reporting/merge_audit";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";
import {
  MERGE_DIAGNOSTICS_SCHEMA_VERSION,
  buildMergeDiagnosticsReport,
  formatMergeDiagnosticsMarkdown,
  getMergeDiagnosticsPaths,
  writeMergeDiagnosticsArtifacts,
} from "../src/reporting/merge_diagnostics";
import type { MergeStageAccounting } from "../src/merge_odds";
import type { MergedPick } from "../src/types";

function baseStageAccounting(overrides: Partial<MergeStageAccounting> = {}): MergeStageAccounting {
  return {
    source: { providerUsed: "OddsAPI" },
    rawRows: 10,
    propsConsideredForMatchingRows: 10,
    totalOddsRowsConsidered: 50,
    matchedRows: 8,
    unmatchedPropRows: 2,
    unmatchedOddsRows: 0,
    emittedRows: 8,
    filteredBeforeMergeRows: 0,
    noMatchRows: 2,
    skippedByReason: {
      promoOrSpecial: 0,
      fantasyExcluded: 0,
      comboLabelExcluded: 0,
      noOddsStat: 0,
      escalatorFiltered: 0,
      noCandidate: 2,
      lineDiff: 0,
      juice: 0,
    },
    unmatchedAttribution: { propsBySite: {}, propsByReason: {}, oddsByBook: {} },
    explicitAliasResolutionHits: 0,
    multiBookConsensusPickCount: 0,
    ...overrides,
  };
}

function minimalMerged(overrides: Partial<MergedPick> = {}): MergedPick {
  return {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "A",
    team: "DEN",
    opponent: "LAL",
    stat: "points" as MergedPick["stat"],
    line: 24.5,
    projectionId: "p",
    gameId: "g",
    startTime: null,
    book: "fanduel",
    overOdds: -110,
    underOdds: -110,
    trueProb: 0.5,
    fairOverOdds: -110,
    fairUnderOdds: -110,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    ...overrides,
  };
}

describe("Phase 44 buildMergeDiagnosticsReport", () => {
  it("aggregates drops by site, stat, sport × canonical reason", () => {
    const drops: MergeDropRecord[] = [
      {
        site: "prizepicks",
        sport: "NBA",
        player: "P1",
        stat: "points",
        line: 25,
        internalReason: "no_candidate",
        canonicalReason: canonicalMergeDropReason("no_candidate"),
      },
      {
        site: "underdog",
        sport: "NBA",
        player: "P2",
        stat: "rebounds",
        line: 10,
        internalReason: "line_diff",
        canonicalReason: canonicalMergeDropReason("line_diff"),
      },
    ];
    const report = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting(),
      platformStats: {
        prizepicks: {
          rawProps: 5,
          matchEligible: 5,
          mergedExact: 3,
          mergedNearest: 0,
          noCandidate: 1,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
        underdog: {
          rawProps: 5,
          matchEligible: 5,
          mergedExact: 2,
          mergedNearest: 0,
          noCandidate: 0,
          lineDiff: 1,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: drops,
      altLineFallbackCount: 0,
      exactLineMatchCount: 5,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: { "0": 5 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const d = buildMergeDiagnosticsReport({
      generatedAtUtc: "g1",
      report,
      merged: [],
    });
    expect(d.drops.bySiteCanonical.prizepicks[canonicalMergeDropReason("no_candidate")]).toBe(1);
    expect(d.drops.bySiteCanonical.underdog[canonicalMergeDropReason("line_diff")]).toBe(1);
    expect(d.drops.byStatCanonical.points[canonicalMergeDropReason("no_candidate")]).toBe(1);
    expect(d.drops.byStatCanonical.rebounds[canonicalMergeDropReason("line_diff")]).toBe(1);
    expect(d.drops.bySportCanonical.NBA[canonicalMergeDropReason("no_candidate")]).toBe(1);
    expect(d.drops.bySportCanonical.NBA[canonicalMergeDropReason("line_diff")]).toBe(1);
  });

  it("aggregates match types and line deltas from merged picks", () => {
    const report = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting({ matchedRows: 3, unmatchedPropRows: 0, noMatchRows: 0 }),
      platformStats: {
        prizepicks: {
          rawProps: 2,
          matchEligible: 2,
          mergedExact: 1,
          mergedNearest: 1,
          noCandidate: 0,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: [],
      altLineFallbackCount: 1,
      exactLineMatchCount: 1,
      nearestWithinToleranceCount: 1,
      mergedLineDeltaHistogram: { "0": 1, "0.50": 1 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const merged: MergedPick[] = [
      minimalMerged({ matchType: "main", altMatchDelta: 0 }),
      minimalMerged({ matchType: "alt", altMatchDelta: 0, stat: "rebounds" as MergedPick["stat"] }),
    ];
    const d = buildMergeDiagnosticsReport({ generatedAtUtc: "g1", report, merged });
    expect(d.matches.lineKindBySite.prizepicks).toEqual({ exact: 1, nearest: 1, total: 2 });
    expect(d.matches.matchTypeBySite.prizepicks).toEqual({ main: 1, alt: 1 });
    expect(d.matches.altPoolMatchesBySite.prizepicks).toBe(1);
    expect(d.merged.altPoolMatchCountByStat.rebounds).toBe(1);
    expect(d.merged.lineDeltaHistogramByStat.points["0"]).toBe(1);
    expect(d.merged.lineDeltaHistogramByStat.rebounds["0"]).toBe(1);
  });

  it("treats omitted matchType as main", () => {
    const report = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting({ matchedRows: 1, unmatchedPropRows: 0, noMatchRows: 0 }),
      platformStats: {
        prizepicks: {
          rawProps: 1,
          matchEligible: 1,
          mergedExact: 1,
          mergedNearest: 0,
          noCandidate: 0,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 1,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: { "0": 1 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = minimalMerged();
    delete (m as Partial<MergedPick>).matchType;
    const d = buildMergeDiagnosticsReport({ generatedAtUtc: "g1", report, merged: [m] });
    expect(d.matches.matchTypeBySite.prizepicks).toEqual({ main: 1, alt: 0 });
  });
});

describe("Phase 44 artifacts", () => {
  it("writes deterministic JSON (stable keys)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "md44-"));
    const drops: MergeDropRecord[] = [
      {
        site: "prizepicks",
        sport: "NBA",
        player: "P1",
        stat: "points",
        line: 25,
        internalReason: "no_candidate",
        canonicalReason: canonicalMergeDropReason("no_candidate"),
      },
    ];
    const report = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting(),
      platformStats: {
        prizepicks: {
          rawProps: 1,
          matchEligible: 1,
          mergedExact: 0,
          mergedNearest: 0,
          noCandidate: 1,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: drops,
      altLineFallbackCount: 0,
      exactLineMatchCount: 0,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const diag = buildMergeDiagnosticsReport({ generatedAtUtc: "g1", report, merged: [] });
    writeMergeDiagnosticsArtifacts(tmp, diag);
    const { jsonPath, mdPath } = getMergeDiagnosticsPaths(tmp);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(MERGE_DIAGNOSTICS_SCHEMA_VERSION);
    const twice = stableStringifyForObservability(parsed);
    expect(twice).toBe(stableStringifyForObservability(JSON.parse(twice)));
    expect(formatMergeDiagnosticsMarkdown(diag)).toContain("Merge diagnostics");
  });
});
