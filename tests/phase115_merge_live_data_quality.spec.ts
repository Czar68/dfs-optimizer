/**
 * Phase 115 — Live merge / data quality metrics (grounded; no math_models).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MergeStageAccounting } from "../src/merge_odds";
import { buildMergeAuditReport } from "../src/reporting/merge_audit";
import {
  computeLiveMergeQualityMetrics,
  readLiveMergeInputForRunStatus,
  writeMergeQualityArtifacts,
} from "../src/reporting/merge_quality";
import {
  upsertMergePlatformQualityByPass,
  readMergePlatformQualityByPassIfExists,
} from "../src/reporting/merge_platform_quality_by_pass";

function baseSa(overrides: Partial<MergeStageAccounting> = {}): MergeStageAccounting {
  return {
    source: { providerUsed: "OddsAPI" },
    rawRows: 100,
    propsConsideredForMatchingRows: 80,
    totalOddsRowsConsidered: 200,
    matchedRows: 70,
    unmatchedPropRows: 10,
    unmatchedOddsRows: 50,
    emittedRows: 70,
    filteredBeforeMergeRows: 20,
    noMatchRows: 10,
    skippedByReason: {
      promoOrSpecial: 0,
      fantasyExcluded: 0,
      comboLabelExcluded: 0,
      noOddsStat: 0,
      noCandidate: 5,
      lineDiff: 3,
      juice: 2,
    },
    unmatchedAttribution: { propsBySite: {}, propsByReason: {}, oddsByBook: {} },
    explicitAliasResolutionHits: 2,
    multiBookConsensusPickCount: 4,
    ...overrides,
  };
}

describe("Phase 115 merge live data quality", () => {
  it("computeLiveMergeQualityMetrics uses audit + by-pass PP when last pass UD-only", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseSa(),
      platformStats: {
        underdog: {
          rawProps: 60,
          matchEligible: 50,
          mergedExact: 40,
          mergedNearest: 5,
          noCandidate: 3,
          lineDiff: 1,
          noOddsStat: 1,
          juice: 1,
        },
      },
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 40,
      nearestWithinToleranceCount: 5,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const byPass = {
      schemaVersion: 1 as const,
      updatedAtUtc: "t1",
      prizepicks: {
        capturedAtUtc: "t1",
        match_rate: 0.81,
        rawProps: 100,
        matchEligible: 90,
        merged: 73,
        unmatched_legs_count: 10,
        explicitAliasResolutionHits: 2,
        multiBookConsensusPickCount: 4,
        alias_resolution_rate: 0.025,
        dropped_due_to_missing_market: 5,
        dropped_due_to_line_diff: 3,
        oddsFetchedAtUtc: "x",
        oddsSnapshotAgeMinutes: 12,
      },
      underdog: null,
      note: "test",
    };
    const m = computeLiveMergeQualityMetrics(audit, byPass);
    expect(m.match_rate_ud).toBeCloseTo(0.9, 6);
    expect(m.match_rate_pp).toBeCloseTo(0.81, 6);
    expect(m.unmatched_legs_count).toBe(10);
    expect(m.alias_resolution_rate).toBeCloseTo(0.025, 6);
    expect(m.dropped_due_to_missing_market).toBe(0);
  });

  it("upsertMergePlatformQualityByPass retains the other platform", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p115-"));
    upsertMergePlatformQualityByPass(tmp, {
      pass: "prizepicks",
      platformStats: {
        prizepicks: {
          rawProps: 10,
          matchEligible: 8,
          mergedExact: 6,
          mergedNearest: 1,
          noCandidate: 1,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      stageAccounting: baseSa({ unmatchedPropRows: 1 }),
      oddsFetchedAtUtc: "2026-01-01T00:00:00.000Z",
      oddsSnapshotAgeMinutes: 5,
    });
    upsertMergePlatformQualityByPass(tmp, {
      pass: "underdog",
      platformStats: {
        underdog: {
          rawProps: 5,
          matchEligible: 4,
          mergedExact: 3,
          mergedNearest: 0,
          noCandidate: 1,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      stageAccounting: baseSa({ unmatchedPropRows: 2 }),
      oddsFetchedAtUtc: "2026-01-01T00:00:00.000Z",
      oddsSnapshotAgeMinutes: 6,
    });
    const r = readMergePlatformQualityByPassIfExists(tmp);
    expect(r?.prizepicks?.merged).toBe(7);
    expect(r?.underdog?.merged).toBe(3);
  });

  it("readLiveMergeInputForRunStatus reads merge_quality_status.json", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "p115-rs-"));
    const dir = path.join(tmp, "data", "reports");
    fs.mkdirSync(dir, { recursive: true });
    writeMergeQualityArtifacts(
      tmp,
      buildMergeAuditReport({
        generatedAtUtc: "t0",
        stageAccounting: baseSa(),
        platformStats: {
          prizepicks: {
            rawProps: 10,
            matchEligible: 10,
            mergedExact: 8,
            mergedNearest: 2,
            noCandidate: 0,
            lineDiff: 0,
            noOddsStat: 0,
            juice: 0,
          },
        },
        dropRecords: [],
        altLineFallbackCount: 0,
        exactLineMatchCount: 8,
        nearestWithinToleranceCount: 2,
        mergedLineDeltaHistogram: {},
        cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
      }),
      null,
      "2026-01-01T00:00:00.000Z",
      {
        oddsFetchedAtUtc: "2026-01-01T00:00:00.000Z",
        oddsSnapshotAgeMinutes: 1,
        mergeWallClockUtc: "2026-01-01T00:01:00.000Z",
        oddsIsFromCache: true,
      }
    );
    const li = readLiveMergeInputForRunStatus(tmp);
    expect(li?.mergeQualityStatusRel).toBe("data/reports/merge_quality_status.json");
    expect(li?.liveMergeQualityLine).toContain("match_rate_pp=");
  });
});
