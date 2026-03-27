/**
 * Phase 19D — Odds calibration step-3 helpers (migrated from src/__tests__/step3_odds_calibration.test.ts).
 */
import { americanToImpliedProb } from "../src/odds_math";
import { getOddsBucket } from "../src/odds_buckets";
import {
  decayWeight,
  computeBucketCalibrationsFromRows,
  getOddsBucketCalibrationHaircut,
  isUnderBonusBackedByOddsBucket,
  PRIMARY_LOOKBACK_DAYS,
  DECAY_HALFLIFE_DAYS,
} from "../src/calibrate_leg_ev";
import { computeOddsCalibrationReport } from "../src/odds_calibration_report";
import { PerfTrackerRow, inferSide } from "../src/perf_tracker_types";

describe("americanToImpliedProb", () => {
  it("-110 ≈ 0.5238", () => {
    const p = americanToImpliedProb(-110);
    expect(p).toBeCloseTo(110 / 210, 4);
    expect(p).toBeCloseTo(0.5238, 3);
  });

  it("+100 = 0.5", () => {
    expect(americanToImpliedProb(100)).toBe(0.5);
  });

  it("-200 ≈ 0.6667", () => {
    const p = americanToImpliedProb(-200);
    expect(p).toBeCloseTo(200 / 300, 4);
    expect(p).toBeCloseTo(0.6667, 3);
  });

  it("+150 = 0.4", () => {
    expect(americanToImpliedProb(150)).toBeCloseTo(100 / 250, 4);
    expect(americanToImpliedProb(150)).toBeCloseTo(0.4, 3);
  });
});

describe("getOddsBucket", () => {
  it("assigns -110 over to -115:-105", () => {
    expect(getOddsBucket(-110, -110, "over")).toBe("-115:-105");
  });

  it("assigns -120 over to -125:-115", () => {
    expect(getOddsBucket(-120, -100, "over")).toBe("-125:-115");
  });

  it("assigns +100 to plus-money bucket", () => {
    const b = getOddsBucket(100, -120, "over");
    expect(b).toMatch(/^\+/);
  });

  it("returns null when odds missing", () => {
    expect(getOddsBucket(undefined, -110, "over")).toBeNull();
    expect(getOddsBucket(-110, undefined, "under")).toBeNull();
  });
});

describe("time-decay weighting", () => {
  it("decayWeight(0) = 1", () => {
    expect(decayWeight(0)).toBe(1);
  });

  it("decayWeight(30) ≈ 0.5 for halflife 30", () => {
    expect(decayWeight(30, 30)).toBeCloseTo(0.5, 4);
  });

  it("decayWeight(60) ≈ 0.25 for halflife 30", () => {
    expect(decayWeight(60, 30)).toBeCloseTo(0.25, 3);
  });

  it("config constants exported", () => {
    expect(PRIMARY_LOOKBACK_DAYS).toBe(90);
    expect(DECAY_HALFLIFE_DAYS).toBe(30);
  });

  it("computeBucketCalibrationsFromRows produces n_eff distinct from legs when weights vary", () => {
    const ref = new Date("2026-03-01");
    const rows: PerfTrackerRow[] = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(ref);
      date.setDate(date.getDate() - i * 10);
      rows.push({
        date: date.toISOString().slice(0, 10),
        leg_id: `leg-${i}`,
        player: "SamePlayer",
        stat: "points",
        line: 20,
        book: "fd",
        trueProb: 0.55,
        projectedEV: 0.05,
        playedEV: 0.05,
        kelly: 0.1,
        card_tier: 1,
        result: i % 2 as 0 | 1,
      });
    }
    const cal = computeBucketCalibrationsFromRows(rows, ref);
    expect(cal.length).toBeGreaterThan(0);
    const b = cal[0];
    expect(b.legs).toBe(10);
    expect(typeof b.n_eff).toBe("number");
    expect(b.n_eff).toBeGreaterThan(0);
    expect(b.n_eff).toBeLessThanOrEqual(10);
  });
});

describe("odds calibration report", () => {
  it("computeOddsCalibrationReport on synthetic rows with result+impliedProb returns non-empty when data present", () => {
    const rows: PerfTrackerRow[] = [
      {
        date: "2026-02-01",
        leg_id: "a",
        player: "P",
        stat: "pts",
        line: 20,
        book: "fd",
        trueProb: 0.52,
        projectedEV: 0.02,
        playedEV: 0.02,
        kelly: 0.1,
        card_tier: 1,
        result: 1,
        overOdds: -110,
        underOdds: -110,
        side: "over",
        impliedProb: 0.5238,
        oddsBucket: "-115:-105",
      },
      {
        date: "2026-02-01",
        leg_id: "b",
        player: "P",
        stat: "pts",
        line: 20,
        book: "fd",
        trueProb: 0.52,
        projectedEV: 0.02,
        playedEV: 0.02,
        kelly: 0.1,
        card_tier: 1,
        result: 0,
        overOdds: -110,
        underOdds: -110,
        side: "over",
        impliedProb: 0.5238,
        oddsBucket: "-115:-105",
      },
    ];
    const report = computeOddsCalibrationReport(rows, false);
    expect(report.length).toBeGreaterThan(0);
    expect(report[0].bucket).toBeDefined();
    expect(report[0].N).toBe(2);
    expect(report[0].hitPct).toBe(50);
    expect(report[0].impliedPct).toBeCloseTo(52.38, 0);
    expect(typeof report[0].delta).toBe("number");
  });

  it("report empty when no result or no impliedProb", () => {
    const rowsNoResult: PerfTrackerRow[] = [
      {
        date: "2026-02-01",
        leg_id: "a",
        player: "P",
        stat: "pts",
        line: 20,
        book: "fd",
        trueProb: 0.52,
        projectedEV: 0.02,
        playedEV: 0.02,
        kelly: 0.1,
        card_tier: 1,
        overOdds: -110,
        underOdds: -110,
      },
    ];
    const report = computeOddsCalibrationReport(rowsNoResult, false);
    expect(report.length).toBe(0);
  });
});

describe("inferSide", () => {
  it("returns under when leg_id contains UNDER", () => {
    expect(inferSide("prizepicks-1-UNDER-points-20")).toBe("under");
  });
  it("returns over when leg_id contains OVER", () => {
    expect(inferSide("prizepicks-1-OVER-points-20")).toBe("over");
  });
  it("defaults to over when neither", () => {
    expect(inferSide("prizepicks-1-points-20")).toBe("over");
  });
});

describe("feature flag USE_ODDS_BUCKET_CALIB off", () => {
  const orig = process.env.USE_ODDS_BUCKET_CALIB;
  afterEach(() => {
    process.env.USE_ODDS_BUCKET_CALIB = orig;
  });

  it("getOddsBucketCalibrationHaircut returns 0 when USE_ODDS_BUCKET_CALIB not set", () => {
    delete process.env.USE_ODDS_BUCKET_CALIB;
    expect(getOddsBucketCalibrationHaircut(-110, -110, "over")).toBe(0);
  });

  it("isUnderBonusBackedByOddsBucket returns true when flag off (allow bonus)", () => {
    delete process.env.USE_ODDS_BUCKET_CALIB;
    expect(isUnderBonusBackedByOddsBucket(-110, -110)).toBe(true);
  });
});
