import fs from "fs";
import os from "os";
import path from "path";
import { calculateEvForMergedPick } from "../src/calculate_ev";
import { enforceMonotonicBuckets, loadProbabilityCalibration } from "../src/modeling/probability_calibration";
import { buildProbabilityCalibrationArtifact } from "../src/tracking/export_probability_calibration";
import type { MergedPick } from "../src/types";

describe("Phase 16R probability calibration", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("enforces monotonic calibrated probabilities", () => {
    const monotonic = enforceMonotonicBuckets([
      {
        bucketLabel: "0.50-0.55",
        minProb: 0.5,
        maxProb: 0.55,
        sampleCount: 30,
        predictedAvgProb: 0.52,
        realizedHitRate: 0.55,
        calibratedProb: 0.53,
        mode: "calibrated",
      },
      {
        bucketLabel: "0.55-0.60",
        minProb: 0.55,
        maxProb: 0.6,
        sampleCount: 30,
        predictedAvgProb: 0.57,
        realizedHitRate: 0.49,
        calibratedProb: 0.51,
        mode: "calibrated",
      },
    ]);
    expect(monotonic[1].calibratedProb).toBeGreaterThanOrEqual(monotonic[0].calibratedProb);
  });

  it("keeps sparse buckets conservative (identity mode)", () => {
    const rows = [
      { trueProb: 0.52, result: 1 },
      { trueProb: 0.53, result: 0 },
    ] as any[];
    const artifact = buildProbabilityCalibrationArtifact(rows, { minSamplesPerBucket: 25 });
    const b = artifact.buckets.find((x) => x.bucketLabel === "0.50-0.55");
    expect(b?.mode).toBe("identity_sparse");
  });

  it("preserves raw probability when calibrated is active", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase16r-"));
    const artDir = path.join(root, "artifacts");
    fs.mkdirSync(artDir, { recursive: true });
    fs.writeFileSync(
      path.join(artDir, "probability_calibration.json"),
      JSON.stringify(
        {
          generatedAtUtc: "2026-03-20T00:00:00.000Z",
          source: "test",
          activeInOptimizer: true,
          minSamplesPerBucket: 1,
          totalResolvedRows: 100,
          notes: [],
          buckets: [
            {
              bucketLabel: "0.50-0.55",
              minProb: 0.5,
              maxProb: 0.55,
              sampleCount: 100,
              predictedAvgProb: 0.52,
              realizedHitRate: 0.6,
              calibratedProb: 0.6,
              mode: "calibrated",
            },
          ],
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(artDir, "calibration_readiness.json"),
      JSON.stringify(
        {
          status: "ready",
          activationRecommendation: "eligible_for_review",
        },
        null,
        2
      ),
      "utf8"
    );
    jest.spyOn(process, "cwd").mockReturnValue(root);
    loadProbabilityCalibration(true);
    const pick: MergedPick = {
      sport: "NBA",
      site: "prizepicks",
      league: "NBA",
      player: "Test Player",
      team: null,
      opponent: null,
      stat: "points",
      line: 20.5,
      projectionId: "x",
      gameId: null,
      startTime: null,
      book: "draftkings",
      overOdds: -110,
      underOdds: -110,
      trueProb: 0.52,
      fairOverOdds: 0,
      fairUnderOdds: 0,
      isDemon: false,
      isGoblin: false,
      isPromo: false,
      isNonStandardOdds: false,
      outcome: "over",
    };
    const ev = calculateEvForMergedPick(pick);
    expect(ev).not.toBeNull();
    expect(ev?.rawTrueProb).toBeCloseTo(0.52, 6);
    expect(ev?.trueProb).toBeCloseTo(0.6, 6);
    expect(ev?.probCalibrationApplied).toBe(true);
  });
});

