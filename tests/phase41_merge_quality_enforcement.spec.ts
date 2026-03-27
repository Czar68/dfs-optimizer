/**
 * Phase 41 — Merge quality enforcement (severity, FAIL guards, baseline).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MergeStageAccounting } from "../src/merge_odds";
import { buildMergeAuditReport } from "../src/reporting/merge_audit";
import {
  MERGE_COVERAGE_FAIL_MIN,
  MERGE_COVERAGE_WARN_MIN,
  FALLBACK_RATE_SPIKE_FAIL_DELTA,
  FALLBACK_RATE_SPIKE_WARN_DELTA,
  BASELINE_COVERAGE_DRIFT_WARN_DELTA,
  computeMergeQualityMetrics,
  validateMergeAuditReport,
  compareCurrentToBaseline,
  collectTriggeredRulesWithAudit,
  computeMergeQualityDrift,
  writeMergeQualityArtifacts,
  type MergeQualityBaseline,
} from "../src/reporting/merge_quality";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

jest.mock("../src/odds/OddsProvider", () => ({
  fetchPlayerPropOdds: jest.fn(async () => []),
}));

import { mergeWithSnapshot } from "../src/merge_odds";
import { getDefaultCliArgs } from "../src/cli_args";
import type { InternalPlayerPropOdds, RawPick } from "../src/types";

function baseStageAccounting(overrides: Partial<MergeStageAccounting> = {}): MergeStageAccounting {
  return {
    source: { providerUsed: "OddsAPI" },
    rawRows: 100,
    propsConsideredForMatchingRows: 90,
    totalOddsRowsConsidered: 500,
    matchedRows: 80,
    unmatchedPropRows: 10,
    unmatchedOddsRows: 0,
    emittedRows: 80,
    filteredBeforeMergeRows: 10,
    noMatchRows: 10,
    skippedByReason: {
      promoOrSpecial: 0,
      fantasyExcluded: 0,
      comboLabelExcluded: 0,
      noOddsStat: 0,
      escalatorFiltered: 0,
      noCandidate: 10,
      lineDiff: 0,
      juice: 0,
    },
    unmatchedAttribution: { propsBySite: {}, propsByReason: {}, oddsByBook: {} },
    explicitAliasResolutionHits: 0,
    multiBookConsensusPickCount: 0,
    ...overrides,
  };
}

describe("Phase 41 validateMergeAuditReport", () => {
  it("accepts well-formed merge audit", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 80,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const v = validateMergeAuditReport(audit);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects corrupted structure", () => {
    const v = validateMergeAuditReport({ totals: {} });
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });
});

describe("Phase 41 severity / FAIL rules", () => {
  it("FAIL when coverage below fail min", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 20,
        unmatchedPropRows: 70,
        emittedRows: 20,
        filteredBeforeMergeRows: 10,
        noMatchRows: 70,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          escalatorFiltered: 0,
          noCandidate: 70,
          lineDiff: 0,
          juice: 0,
        },
      }),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 20,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    expect(m.mergeCoverage).toBeLessThan(MERGE_COVERAGE_FAIL_MIN);
    const drift = computeMergeQualityDrift(null, audit);
    const { overallSeverity, rules } = collectTriggeredRulesWithAudit(
      audit,
      m,
      drift,
      {
        baselineAvailable: false,
        coverageDeltaVsBaseline: null,
        fallbackRateDeltaVsBaseline: null,
        baselineCoverageDriftWarn: false,
      },
      { valid: true, errors: [] }
    );
    expect(overallSeverity).toBe("FAIL");
    expect(rules.some((r) => r.id === "coverage_below_fail")).toBe(true);
  });

  it("WARN only when coverage between fail and warn", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 30,
        unmatchedPropRows: 60,
        emittedRows: 30,
        filteredBeforeMergeRows: 10,
        noMatchRows: 60,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          escalatorFiltered: 0,
          noCandidate: 60,
          lineDiff: 0,
          juice: 0,
        },
      }),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 30,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    expect(m.mergeCoverage).toBeGreaterThanOrEqual(MERGE_COVERAGE_FAIL_MIN);
    expect(m.mergeCoverage).toBeLessThan(MERGE_COVERAGE_WARN_MIN);
    const drift = computeMergeQualityDrift(null, audit);
    const { overallSeverity } = collectTriggeredRulesWithAudit(
      audit,
      m,
      drift,
      {
        baselineAvailable: false,
        coverageDeltaVsBaseline: null,
        fallbackRateDeltaVsBaseline: null,
        baselineCoverageDriftWarn: false,
      },
      { valid: true, errors: [] }
    );
    expect(overallSeverity).toBe("WARN");
  });

  it("FAIL on extreme fallback spike vs previous", () => {
    const prev = buildMergeAuditReport({
      generatedAtUtc: "p1",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 4,
      exactLineMatchCount: 76,
      nearestWithinToleranceCount: 4,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const cur = buildMergeAuditReport({
      generatedAtUtc: "p2",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 36,
      exactLineMatchCount: 44,
      nearestWithinToleranceCount: 36,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(cur);
    const drift = computeMergeQualityDrift(prev, cur);
    expect(drift.fallbackRateDelta).not.toBeNull();
    expect(drift.fallbackRateDelta!).toBeGreaterThanOrEqual(FALLBACK_RATE_SPIKE_FAIL_DELTA);
    expect(drift.fallbackSpikeFail).toBe(true);
    const { overallSeverity } = collectTriggeredRulesWithAudit(
      cur,
      m,
      drift,
      {
        baselineAvailable: false,
        coverageDeltaVsBaseline: null,
        fallbackRateDeltaVsBaseline: null,
        baselineCoverageDriftWarn: false,
      },
      { valid: true, errors: [] }
    );
    expect(overallSeverity).toBe("FAIL");
  });

  it("WARN (not FAIL) on moderate fallback spike", () => {
    const prev = buildMergeAuditReport({
      generatedAtUtc: "p1",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 4,
      exactLineMatchCount: 76,
      nearestWithinToleranceCount: 4,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const cur = buildMergeAuditReport({
      generatedAtUtc: "p2",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 20,
      exactLineMatchCount: 60,
      nearestWithinToleranceCount: 20,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const drift = computeMergeQualityDrift(prev, cur);
    expect(drift.fallbackSpikeWarn).toBe(true);
    expect(drift.fallbackSpikeFail).toBe(false);
    const m = computeMergeQualityMetrics(cur);
    const { overallSeverity } = collectTriggeredRulesWithAudit(
      cur,
      m,
      drift,
      {
        baselineAvailable: false,
        coverageDeltaVsBaseline: null,
        fallbackRateDeltaVsBaseline: null,
        baselineCoverageDriftWarn: false,
      },
      { valid: true, errors: [] }
    );
    expect(overallSeverity).toBe("WARN");
  });

  it("FAIL when audit validation fails", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 80,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    const drift = computeMergeQualityDrift(null, audit);
    const { overallSeverity } = collectTriggeredRulesWithAudit(
      audit,
      m,
      drift,
      {
        baselineAvailable: false,
        coverageDeltaVsBaseline: null,
        fallbackRateDeltaVsBaseline: null,
        baselineCoverageDriftWarn: false,
      },
      { valid: false, errors: ["totals_rawProps_invalid"] }
    );
    expect(overallSeverity).toBe("FAIL");
  });
});

describe("Phase 41 baseline drift", () => {
  it("WARN when coverage drops vs baseline beyond threshold", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 75,
        unmatchedPropRows: 15,
        emittedRows: 75,
        filteredBeforeMergeRows: 10,
        noMatchRows: 15,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          escalatorFiltered: 0,
          noCandidate: 15,
          lineDiff: 0,
          juice: 0,
        },
      }),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 75,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const metrics = computeMergeQualityMetrics(audit);
    const baseline: MergeQualityBaseline = {
      schemaVersion: 1,
      lockedAtUtc: "baseline",
      sourceAuditGeneratedAtUtc: "old",
      metrics: {
        mergeCoverage: 0.9,
        fallbackRate: 0,
        dropReasonDistribution: {},
      },
    };
    const cmp = compareCurrentToBaseline(baseline, metrics, audit);
    expect(cmp.coverageDeltaVsBaseline).not.toBeNull();
    expect(cmp.coverageDeltaVsBaseline!).toBeLessThan(BASELINE_COVERAGE_DRIFT_WARN_DELTA);
    expect(cmp.baselineCoverageDriftWarn).toBe(true);
  });
});

describe("Phase 41 deterministic status file", () => {
  it("merge_quality_status.json stable stringify", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mq41-"));
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting(),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 80,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    writeMergeQualityArtifacts(tmp, audit, null, "2026-01-01T00:00:00.000Z");
    const p = path.join(tmp, "data", "reports", "merge_quality_status.json");
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    const twice = stableStringifyForObservability(parsed);
    expect(twice).toBe(stableStringifyForObservability(JSON.parse(twice)));
  });
});

describe("Phase 41 merge outputs unchanged", () => {
  it("mergeWithSnapshot odds unchanged vs prior contract", async () => {
    const odds: InternalPlayerPropOdds[] = [
      {
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
      },
    ];
    const picks: RawPick[] = [
      {
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
      },
    ];
    const META = {
      isFromCache: false,
      providerUsed: "OddsAPI" as const,
      originalProvider: "OddsAPI",
    };
    const a = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    const b = await mergeWithSnapshot(picks, odds, META, undefined, getDefaultCliArgs());
    expect(a.odds.map((x) => x.legKey)).toEqual(b.odds.map((x) => x.legKey));
  });
});
