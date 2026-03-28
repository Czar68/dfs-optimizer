import fs from "fs";
import {
  ppCombinedFloor,
  findMinimalCombinedFloorTStar,
  enrichLegsWithPlayer,
  type LegWithPlayer,
} from "../src/reporting/threshold_rebalancing_analysis";
import { exportThresholdRebalancingAnalysis, buildThresholdRebalancingAnalysis } from "../src/reporting/export_threshold_rebalancing_analysis";
import { computePpRunnerLegEligibility, computeUdRunnerLegEligibility } from "../src/policy/eligibility_policy";
import { getDefaultCliArgs } from "../src/cli_args";

describe("Phase 74 threshold rebalancing", () => {
  it("ppCombinedFloor is max of three PP gates", () => {
    expect(ppCombinedFloor(0.015, 0.02, 0.0225)).toBeCloseTo(0.0225, 8);
  });

  it("findMinimalCombinedFloorTStar reaches goal with synthetic legs", () => {
    const raw: LegWithPlayer[] = [];
    for (let i = 0; i < 8; i++) {
      raw.push({
        id: `p${i}-over`,
        player: `Player${i}`,
        trueProb: 0.55 + i * 0.002,
        overOdds: -110,
        underOdds: -110,
        legEv: 0.05,
        edge: 0.05,
        side: "over",
      });
    }
    const enriched = enrichLegsWithPlayer(raw);
    const r = findMinimalCombinedFloorTStar(enriched, 1, 6);
    expect(r.impossibleForGoal).toBe(false);
    expect(r.tStar).not.toBeNull();
    expect(r.maxAchievableLegsAfterCap).toBeGreaterThanOrEqual(6);
  });

  it("computePpRunnerLegEligibility uses Phase 74 adjusted EV floor", () => {
    const p = computePpRunnerLegEligibility(getDefaultCliArgs());
    // @ts-ignore
    expect(p.adjustedEvThreshold).toBe(0.0225);
  });

  it("computeUdRunnerLegEligibility uses Phase 74 udMinEdge default", () => {
    expect(computeUdRunnerLegEligibility(getDefaultCliArgs()).udMinEdge).toBe(0.006);
  });

  it("writes latest_threshold_rebalancing_analysis artifacts", () => {
    const { jsonPath, mdPath, report } = exportThresholdRebalancingAnalysis({ cwd: process.cwd() });
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(report.phase).toBe(74);
    expect(report.pp).toBeDefined();
    expect(report.ud).toBeDefined();
  });

  it("buildThresholdRebalancingAnalysis is deterministic for empty cwd legs", () => {
    const a = buildThresholdRebalancingAnalysis(process.cwd());
    const b = buildThresholdRebalancingAnalysis(process.cwd());
    expect(a.baseline.pp.adjustedEvThreshold).toBe(b.baseline.pp.adjustedEvThreshold);
  });
});
