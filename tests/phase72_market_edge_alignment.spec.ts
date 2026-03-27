import {
  enrichMetrics,
  fairProbChosenSide,
  inferSideFromLegIdCanonical,
  naiveLegMetric,
} from "../src/reporting/market_edge_alignment_analysis";

describe("Phase 72 market edge alignment helpers", () => {
  it("does not treat underdog as under side", () => {
    expect(inferSideFromLegIdCanonical("underdog-abc-points-20.5")).toBe("over");
  });

  it("detects -over / -under suffixes", () => {
    expect(inferSideFromLegIdCanonical("prizepicks-x-stat-1-over")).toBe("over");
    expect(inferSideFromLegIdCanonical("prizepicks-x-stat-1-under")).toBe("under");
  });

  it("deltaNaiveVsMarketFair equals fairChosen - 0.5 for over", () => {
    const legs = [
      {
        id: "t-over",
        trueProb: 0.6,
        overOdds: -150,
        underOdds: 120,
        legEv: 0.1,
        edge: 0.1,
        side: "over" as const,
      },
    ];
    const e = enrichMetrics(legs)[0];
    const fair = fairProbChosenSide(-150, 120, "over");
    expect(e.deltaNaiveVsMarketFair).toBeCloseTo(fair - 0.5, 10);
    expect(e.naiveMetric).toBeCloseTo(naiveLegMetric(0.6), 10);
  });
});
