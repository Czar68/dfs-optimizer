import fs from "fs";
import os from "os";
import path from "path";
import { buildCalibrationReadiness } from "../src/tracking/export_calibration_readiness";
import { getActiveProbabilityCalibration, loadProbabilityCalibration } from "../src/modeling/probability_calibration";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import { refreshModelArtifacts } from "../src/tracking/refresh_model_artifacts";

function row(partial: Partial<PerfTrackerRow>): PerfTrackerRow {
  return {
    date: "2026-03-20",
    leg_id: "x",
    player: "p",
    stat: "points",
    line: 20.5,
    book: "draftkings",
    trueProb: 0.55,
    projectedEV: 0.02,
    playedEV: 0.02,
    kelly: 0.1,
    card_tier: 1,
    result: 1,
    ...partial,
  };
}

describe("Phase 16S calibration readiness", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("classifies not_ready when sparse", () => {
    const readiness = buildCalibrationReadiness([row({})], [row({})]);
    expect(readiness.status).toBe("not_ready");
    expect(readiness.activationRecommendation).toBe("keep_disabled");
  });

  it("classifies ready when thresholds met", () => {
    const resolved: PerfTrackerRow[] = [];
    for (let i = 0; i < 240; i++) {
      const bucket = i % 6;
      const p = 0.46 + bucket * 0.05 + 0.01;
      resolved.push(row({ leg_id: `id-${i}`, trueProb: p, result: i % 2 === 0 ? 1 : 0, clvDelta: 0.01 }));
    }
    const readiness = buildCalibrationReadiness(resolved, resolved, {
      minResolvedRows: 200,
      minSamplesPerBucket: 25,
      minBucketsMeetingSample: 4,
      minClvRows: 100,
    });
    expect(readiness.status).toBe("ready");
    expect(readiness.activationRecommendation).toBe("eligible_for_review");
  });

  it("activation guard blocks when readiness is not ready", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16s-"));
    const art = path.join(root, "artifacts");
    fs.mkdirSync(art, { recursive: true });
    fs.writeFileSync(
      path.join(art, "probability_calibration.json"),
      JSON.stringify(
        {
          generatedAtUtc: "2026-03-20T00:00:00.000Z",
          source: "test",
          activeInOptimizer: true,
          minSamplesPerBucket: 1,
          totalResolvedRows: 100,
          notes: [],
          buckets: [],
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(art, "calibration_readiness.json"),
      JSON.stringify(
        {
          status: "not_ready",
          activationRecommendation: "keep_disabled",
        },
        null,
        2
      ),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    loadProbabilityCalibration(true);
    expect(getActiveProbabilityCalibration()).toBeNull();
  });

  it("refresh workflow runs steps sequentially", () => {
    const calls: string[] = [];
    const result = refreshModelArtifacts([
      { name: "a", run: () => void calls.push("a") },
      { name: "b", run: () => void calls.push("b") },
      { name: "c", run: () => void calls.push("c") },
    ]);
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["a", "b", "c"]);
  });
});

