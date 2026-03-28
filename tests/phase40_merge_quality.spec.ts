/**
 * Phase 40 — Merge quality metrics, soft guards, drift (no merge logic changes).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MergeStageAccounting } from "../src/merge_odds";
import { buildMergeAuditReport } from "../src/reporting/merge_audit";
import {
  MERGE_COVERAGE_WARN_MIN,
  FALLBACK_RATE_WARN_MAX,
  INVALID_ODDS_DROP_SHARE_WARN_MAX,
  FALLBACK_RATE_SPIKE_DELTA,
  computeMergeQualityMetrics,
  evaluateSoftGuards,
  computeMergeQualityDrift,
  buildMergeQualityReport,
  writeMergeQualityArtifacts,
  readMergeAuditFromDiskIfExists,
} from "../src/reporting/merge_quality";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

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

describe("Phase 40 merge quality metrics", () => {
  it("computes rates from rawProps / matched (totals)", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting(),
      platformStats: {
        prizepicks: {
          rawProps: 100,
          matchEligible: 90,
          mergedExact: 70,
          mergedNearest: 10,
          noCandidate: 0,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: [],
      altLineFallbackCount: 8,
      exactLineMatchCount: 70,
      nearestWithinToleranceCount: 10,
      mergedLineDeltaHistogram: { "0": 70, "0.50": 10 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    expect(m.totalRawProps).toBe(100);
    expect(m.matched).toBe(80);
    expect(m.dropped).toBe(20);
    expect(m.mergeCoverage).toBeCloseTo(0.8, 6);
    expect(m.dropRate).toBeCloseTo(0.2, 6);
    expect(m.fallbackRate).toBeCloseTo(0.1, 6);
    expect(m.exactMatchRate).toBeCloseTo(0.875, 6);
  });

  it("null rates when denominators are zero", () => {
    const sa = baseStageAccounting({
      rawRows: 0,
      propsConsideredForMatchingRows: 0,
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
        noCandidate: 0,
        lineDiff: 0,
        juice: 0,
      },
    });
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: sa,
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 0,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    expect(m.mergeCoverage).toBeNull();
    expect(m.fallbackRate).toBeNull();
    expect(m.exactMatchRate).toBeNull();
  });
});

describe("Phase 40 soft guards", () => {
  it("WARNs on low coverage", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 20,
        unmatchedPropRows: 70,
        unmatchedOddsRows: 0,
        emittedRows: 20,
        filteredBeforeMergeRows: 10,
        noMatchRows: 70,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
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
      mergedLineDeltaHistogram: { "0": 20 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    const g = evaluateSoftGuards(audit, m);
    expect(m.mergeCoverage).toBeLessThan(MERGE_COVERAGE_WARN_MIN);
    expect(g.coverageStatus).toBe("warn");
    expect(g.warnings.some((w) => w.includes("[coverage]"))).toBe(true);
  });

  it("WARNs when fallback rate exceeds threshold", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 80,
        unmatchedPropRows: 10,
        emittedRows: 80,
        filteredBeforeMergeRows: 10,
        noMatchRows: 10,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          noCandidate: 10,
          lineDiff: 0,
          juice: 0,
        },
      }),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 40,
      exactLineMatchCount: 40,
      nearestWithinToleranceCount: 40,
      mergedLineDeltaHistogram: {},
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    const m = computeMergeQualityMetrics(audit);
    expect(m.fallbackRate).toBeCloseTo(0.5, 6);
    const g = evaluateSoftGuards(audit, m);
    expect(m.fallbackRate!).toBeGreaterThan(FALLBACK_RATE_WARN_MAX);
    expect(g.fallbackStatus).toBe("warn");
    expect(g.warnings.some((w) => w.includes("[fallback]"))).toBe(true);
  });

  it("WARNs when invalid_odds share of drops exceeds threshold", () => {
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 50,
        unmatchedPropRows: 40,
        unmatchedOddsRows: 0,
        emittedRows: 50,
        filteredBeforeMergeRows: 10,
        noMatchRows: 40,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          noCandidate: 0,
          lineDiff: 0,
          juice: 0,
        },
      }),
      platformStats: {},
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 50,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: { "0": 50 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    audit.droppedByCanonicalReason = { invalid_odds: 20, no_match: 30 };
    const m = computeMergeQualityMetrics(audit);
    const g = evaluateSoftGuards(audit, m);
    expect(20 / 50).toBeGreaterThan(INVALID_ODDS_DROP_SHARE_WARN_MAX);
    expect(g.invalidOddsDropShareStatus).toBe("warn");
  });
});

describe("Phase 40 drift", () => {
  it("detects coverage delta and fallback spike vs mock previous", () => {
    const prev = buildMergeAuditReport({
      generatedAtUtc: "p1",
      stageAccounting: baseStageAccounting({
        rawRows: 100,
        matchedRows: 80,
        unmatchedPropRows: 10,
        emittedRows: 80,
        filteredBeforeMergeRows: 10,
        noMatchRows: 10,
    skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          noCandidate: 10,
          lineDiff: 0,
          juice: 0,
        },
      }),
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
    expect(drift.previousAuditAvailable).toBe(true);
    expect(drift.coverageDelta).toBe(0);
    const prevFb = computeMergeQualityMetrics(prev).fallbackRate!;
    const curFb = computeMergeQualityMetrics(cur).fallbackRate!;
    expect(curFb - prevFb).toBeGreaterThanOrEqual(FALLBACK_RATE_SPIKE_DELTA);
    expect(drift.fallbackSpikeWarn).toBe(true);
    expect(drift.fallbackSpikeFail).toBe(false);
  });
});

describe("Phase 40 artifacts", () => {
  it("writes deterministic JSON (stable keys)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mq-"));
    const audit = buildMergeAuditReport({
      generatedAtUtc: "t0",
      stageAccounting: baseStageAccounting(),
      platformStats: {
        prizepicks: {
          rawProps: 100,
          matchEligible: 90,
          mergedExact: 80,
          mergedNearest: 0,
          noCandidate: 0,
          lineDiff: 0,
          noOddsStat: 0,
          juice: 0,
        },
      },
      dropRecords: [],
      altLineFallbackCount: 0,
      exactLineMatchCount: 80,
      nearestWithinToleranceCount: 0,
      mergedLineDeltaHistogram: { "0": 80 },
      cli: { exactLine: false, maxLineDiffUsed: 0.5, ppMaxJuice: 180, udMaxJuice: 200 },
    });
    writeMergeQualityArtifacts(tmp, audit, null, "2026-01-01T00:00:00.000Z");
    const qPath = path.join(tmp, "data", "reports", "latest_merge_quality.json");
    const sPath = path.join(tmp, "data", "reports", "merge_quality_summary.json");
    const stPath = path.join(tmp, "data", "reports", "merge_quality_status.json");
    const raw = fs.readFileSync(qPath, "utf8");
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    expect(keys[0]).toBe("auditValidation");
    const twice = stableStringifyForObservability(parsed);
    expect(twice).toBe(stableStringifyForObservability(JSON.parse(twice)));
    expect(fs.existsSync(sPath)).toBe(true);
    expect(fs.existsSync(stPath)).toBe(true);
    expect(fs.existsSync(path.join(tmp, "data", "reports", "merge_quality_baseline.json"))).toBe(true);
  });

  it("readMergeAuditFromDiskIfExists returns null when missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mq-"));
    expect(readMergeAuditFromDiskIfExists(tmp)).toBeNull();
  });
});

describe("Phase 40 buildMergeQualityReport shape", () => {
  it("matches snapshot thresholds export", () => {
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
    const r = buildMergeQualityReport({
      generatedAtUtc: "g1",
      currentAudit: audit,
      previousAudit: null,
      baseline: null,
      auditValidation: { valid: true, errors: [] },
      platformByPass: null,
    });
    expect(r.thresholds.mergeCoverageWarnMin).toBe(MERGE_COVERAGE_WARN_MIN);
    expect(r.thresholds.fallbackRateWarnMax).toBe(FALLBACK_RATE_WARN_MAX);
    expect(r.thresholds.fallbackSpikeWarnDelta).toBe(FALLBACK_RATE_SPIKE_DELTA);
  });
});
