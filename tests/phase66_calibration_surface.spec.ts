import type { PerfTrackerRow } from "../src/perf_tracker_types";
import {
  aggregateRows,
  buildCalibrationSurfaceReport,
  computePredictedEdge,
  edgeBucketId,
  edgeBucketIdForRow,
  evBucketId,
  evBucketIdForRow,
  inferLegCountFromStructure,
  inferSite,
} from "../src/reporting/calibration_surface";

function mkRow(partial: Partial<PerfTrackerRow>): PerfTrackerRow {
  return {
    date: "2026-03-20",
    leg_id: "prizepicks-test-points-10.5-over",
    player: "P",
    stat: "points",
    line: 10.5,
    book: "fanduel",
    trueProb: 0.55,
    projectedEV: 0.05,
    playedEV: 0.05,
    kelly: 0.1,
    card_tier: 1,
    result: 1,
    impliedProb: 0.5,
    overOdds: -110,
    underOdds: -110,
    side: "over",
    openOddsAmerican: -110,
    ...partial,
  };
}

describe("Phase 66 calibration surface", () => {
  it("edgeBucketId is deterministic and covers mandatory tiers", () => {
    expect(edgeBucketId(0.01)).toBe("lt_2pct");
    expect(edgeBucketId(0.0199)).toBe("lt_2pct");
    expect(edgeBucketId(0.02)).toBe("2_4pct");
    expect(edgeBucketId(0.039)).toBe("2_4pct");
    expect(edgeBucketId(0.04)).toBe("4_6pct");
    expect(edgeBucketId(0.06)).toBe("6_8pct");
    expect(edgeBucketId(0.079)).toBe("6_8pct");
    expect(edgeBucketId(0.08)).toBe("ge_8pct");
    expect(edgeBucketId(0.5)).toBe("ge_8pct");
    expect(edgeBucketId(Number.NaN)).toBe("edge_unavailable");
  });

  it("evBucketId matches edge-style boundaries on EV", () => {
    expect(evBucketId(0.01)).toBe("ev_lt_2pct");
    expect(evBucketId(0.02)).toBe("ev_2_4pct");
    expect(evBucketId(0.08)).toBe("ev_ge_8pct");
  });

  it("edgeBucketIdForRow uses edge_unavailable when implied missing", () => {
    const r = mkRow({ impliedProb: undefined, trueProb: 0.6 });
    expect(computePredictedEdge(r)).toBeNull();
    expect(edgeBucketIdForRow(r)).toBe("edge_unavailable");
  });

  it("evBucketIdForRow uses ev_unavailable when projectedEV missing", () => {
    const r = mkRow({ projectedEV: Number.NaN as unknown as number });
    expect(evBucketIdForRow(r)).toBe("ev_unavailable");
  });

  it("inferSite separates PP vs UD from platform or leg_id", () => {
    expect(inferSite(mkRow({ platform: "PP", leg_id: "x" }))).toBe("PP");
    expect(inferSite(mkRow({ platform: "UD", leg_id: "x" }))).toBe("UD");
    expect(inferSite(mkRow({ platform: undefined, leg_id: "prizepicks-1-a-1" }))).toBe("PP");
    expect(inferSite(mkRow({ platform: undefined, leg_id: "underdog-1-a-1" }))).toBe("UD");
  });

  it("inferLegCountFromStructure reads parlay_structures registry", () => {
    expect(inferLegCountFromStructure("6P")).toBe(6);
    expect(inferLegCountFromStructure("UD_6F_FLX")).toBe(6);
    expect(inferLegCountFromStructure(undefined)).toBeNull();
  });

  it("aggregateRows handles empty bucket without NaN", () => {
    const empty = aggregateRows([], "empty");
    expect(empty.sampleCount).toBe(0);
    expect(empty.winRate).toBeNull();
    expect(empty.averagePredictedEdge).toBeNull();
    expect(empty.averagePredictedEv).toBeNull();
    expect(empty.realizedReturnProxy).toBeNull();
  });

  it("aggregateRows win rate avoids divide-by-zero (n>0)", () => {
    const one = aggregateRows([mkRow({ result: 1 })], "k");
    expect(one.winRate).toBe(1);
    const z = aggregateRows([mkRow({ result: 0 })], "k");
    expect(z.winRate).toBe(0);
  });

  it("buildCalibrationSurfaceReport is stable for same input order", () => {
    const rows = [
      mkRow({
        leg_id: "prizepicks-a",
        structure: "6P",
        platform: "PP",
        trueProb: 0.55,
        impliedProb: 0.5,
        projectedEV: 0.03,
        result: 1,
      }),
      mkRow({
        leg_id: "underdog-b",
        structure: "UD_3F_FLX",
        platform: "UD",
        trueProb: 0.58,
        impliedProb: 0.52,
        projectedEV: 0.04,
        result: 0,
      }),
    ];
    const a = buildCalibrationSurfaceReport(rows, "2026-01-01T00:00:00.000Z");
    const b = buildCalibrationSurfaceReport(rows, "2026-01-01T00:00:00.000Z");
    expect(JSON.stringify(a.slices)).toBe(JSON.stringify(b.slices));
    expect(a.schemaVersion).toBe(b.schemaVersion);
  });

  it("excludes unresolved legs from slices", () => {
    const rows = [mkRow({ result: 1 }), mkRow({ result: undefined })];
    const rep = buildCalibrationSurfaceReport(rows, "t");
    expect(rep.rowCounts.totalInFile).toBe(2);
    expect(rep.rowCounts.resolvedLegs).toBe(1);
    expect(rep.slices.byEdgeBucket.some((s) => s.sampleCount === 1)).toBe(true);
  });
});
