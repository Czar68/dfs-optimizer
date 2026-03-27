import { buildCalibrationBuckets, buildModelEvaluation, computeScoring } from "../src/tracking/export_model_evaluation";
import type { PerfTrackerRow } from "../src/perf_tracker_types";

function mkRow(partial: Partial<PerfTrackerRow>): PerfTrackerRow {
  return {
    date: "2026-03-20",
    leg_id: "x",
    player: "P",
    stat: "points",
    line: 10.5,
    book: "FanDuel",
    trueProb: 0.55,
    projectedEV: 0.02,
    playedEV: 0.02,
    kelly: 0.1,
    card_tier: 1,
    result: 1,
    ...partial,
  };
}

describe("Phase 16Q model evaluation", () => {
  it("buildCalibrationBuckets groups deterministically", () => {
    const rows = [
      mkRow({ trueProb: 0.51, result: 1 }),
      mkRow({ trueProb: 0.52, result: 0 }),
      mkRow({ trueProb: 0.57, result: 1 }),
    ];
    const buckets = buildCalibrationBuckets(rows, 0.5, 0.6, 0.05);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].bucketLabel).toBe("0.50-0.55");
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].count).toBe(1);
  });

  it("computeScoring computes brier and logloss", () => {
    const rows = [
      mkRow({ trueProb: 0.8, result: 1 }),
      mkRow({ trueProb: 0.2, result: 0 }),
    ];
    const s = computeScoring(rows);
    expect(s.brierScore).toBeCloseTo(0.04, 6);
    expect(s.logLoss).toBeGreaterThan(0);
    expect(s.avgPredictedProb).toBeCloseTo(0.5, 6);
    expect(s.realizedHitRate).toBeCloseTo(0.5, 6);
  });

  it("CLV grouping positive vs negative", () => {
    const rows = [
      mkRow({ clvDelta: 0.02, clvPct: 3, result: 1, openOddsAmerican: -110, side: "over" }),
      mkRow({ clvDelta: -0.03, clvPct: -5, result: 0, openOddsAmerican: -110, side: "over" }),
    ];
    const e = buildModelEvaluation(rows);
    expect(e.clvEvaluation.countWithClv).toBe(2);
    expect(e.clvEvaluation.positiveClv.count).toBe(1);
    expect(e.clvEvaluation.negativeClv.count).toBe(1);
  });

  it("excludes unresolved rows from scoring", () => {
    const rows = [
      mkRow({ result: 1 }),
      mkRow({ result: 0 }),
      mkRow({ result: undefined }),
    ];
    const e = buildModelEvaluation(rows);
    expect(e.rowCounts.totalRows).toBe(3);
    expect(e.rowCounts.resolvedRows).toBe(2);
  });
});

