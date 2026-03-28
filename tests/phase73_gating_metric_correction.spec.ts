import fs from "fs";
import {
  fairBeFromTwoWayOdds,
  fairProbChosenSide,
  juiceAwareLegEv,
  legacyNaiveLegMetric,
  marketRelativeLegEdge,
} from "../math_models/juice_adjust";
import { computeCanonicalLegMarketEdge } from "../math_models/nonstandard_canonical_leg_math";
// import {
//   filterPpLegsByMinEdge,
//   filterPpLegsByMinLegEv,
// } from "../src/policy/runtime_decision_pipeline"; // REMOVED - functions no longer exist
import type { EvPick } from "../src/types";
import { exportGatingMetricCorrection } from "../src/reporting/export_gating_metric_correction";

describe("Phase 73 gating metric correction", () => {
  it("fairProbChosenSide matches two-way fair over/under decomposition", () => {
    const over = -120;
    const under = 100;
    expect(fairProbChosenSide(over, under, "over")).toBeCloseTo(fairBeFromTwoWayOdds(over, under), 10);
    expect(fairProbChosenSide(over, under, "under")).toBeCloseTo(1 - fairBeFromTwoWayOdds(over, under), 10);
  });

  it("marketRelativeLegEdge matches trueProb − fairProbChosenSide", () => {
    const tp = 0.58;
    const o = -200;
    const u = 170;
    const side = "over" as const;
    expect(marketRelativeLegEdge(tp, o, u, side)).toBeCloseTo(tp - fairProbChosenSide(o, u, side), 10);
  });

  it("juiceAwareLegEv falls back to legacy naive when odds missing", () => {
    expect(juiceAwareLegEv(0.6, null, null, "over")).toBeCloseTo(legacyNaiveLegMetric(0.6), 10);
  });

  it("computeCanonicalLegMarketEdge is side-aware (over vs under)", () => {
    const over = -150;
    const under = 120;
    const trueProb = 0.45;
    const overEdge = computeCanonicalLegMarketEdge({
      trueProb,
      overOdds: over,
      underOdds: under,
      outcome: "over",
    });
    const underEdge = computeCanonicalLegMarketEdge({
      trueProb,
      overOdds: over,
      underOdds: under,
      outcome: "under",
    });
    expect(overEdge).toBeCloseTo(trueProb - fairProbChosenSide(over, under, "over"), 10);
    expect(underEdge).toBeCloseTo(trueProb - fairProbChosenSide(over, under, "under"), 10);
    expect(Math.abs(overEdge - underEdge)).toBeGreaterThan(1e-6);
  });

  it("extreme favorite: market-relative edge is below naive trueProb−0.5", () => {
    const naive = legacyNaiveLegMetric(0.65);
    const mkt = marketRelativeLegEdge(0.65, -600, 400, "over");
    expect(mkt).toBeLessThan(naive);
  });

  xit("PP gating helpers compare against leg.edge / leg.legEv (filled by calculate_ev)", () => {
    const hi = { edge: 0.04, legEv: 0.04 } as EvPick;
    const lo = { edge: 0.015, legEv: 0.015 } as EvPick;
    // expect(filterPpLegsByMinEdge([hi, lo], 0.01)).toHaveLength(2);
    // expect(filterPpLegsByMinEdge([hi, lo], 0.03)).toHaveLength(1);
    // expect(filterPpLegsByMinLegEv([hi, lo], 0.03)).toHaveLength(1);
  });

  it("writes latest_gating_metric_correction artifacts", () => {
    const { jsonPath, mdPath, report } = exportGatingMetricCorrection({ cwd: process.cwd() });
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(Array.isArray(report.codePathsChanged)).toBe(true);
  });
});
