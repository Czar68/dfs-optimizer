import { evaluateSignalPerformance, signalValueBucket } from "../src/feature_input/feature_outcome_validation";
import type { EvPick } from "../src/types";

function basePick(id: string): EvPick {
  return {
    id,
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "X",
    team: null,
    opponent: null,
    stat: "points",
    line: 20,
    projectionId: "p",
    gameId: null,
    startTime: null,
    outcome: "over",
    trueProb: 0.5,
    fairOdds: -110,
    edge: 0,
    book: null,
    overOdds: null,
    underOdds: null,
    legEv: 0,
    isNonStandardOdds: false,
  };
}

function withSignals(
  id: string,
  signals: { minutes: number; usage: number; env: number; def: number },
  graded: "hit" | "miss" | "push"
): EvPick {
  return {
    ...basePick(id),
    gradedLegOutcome: graded,
    featureSignals: {
      subjectId: id,
      asOfUtc: "2025-03-22T12:00:00.000Z",
      signals: {
        minutes_signal: signals.minutes,
        usage_signal: signals.usage,
        environment_signal: signals.env,
        defense_signal: signals.def,
      },
    },
  };
}

describe("Phase 97 — signal vs outcome validation", () => {
  it("signalValueBucket boundaries (0.33 / 0.66 splits)", () => {
    expect(signalValueBucket(0)).toBe("low");
    expect(signalValueBucket(0.32)).toBe("low");
    expect(signalValueBucket(0.33)).toBe("mid");
    expect(signalValueBucket(0.65)).toBe("mid");
    expect(signalValueBucket(0.66)).toBe("high");
    expect(signalValueBucket(1)).toBe("high");
    expect(signalValueBucket(Number.NaN)).toBeNull();
  });

  it("clamps out-of-range values into buckets", () => {
    expect(signalValueBucket(-1)).toBe("low");
    expect(signalValueBucket(2)).toBe("high");
  });

  it("empty input yields zero counts and zero hit_rate", () => {
    const r = evaluateSignalPerformance([]);
    for (const axis of ["minutes_signal", "usage_signal", "environment_signal", "defense_signal"] as const) {
      const a = r[axis];
      expect(a.overall.count).toBe(0);
      expect(a.overall.hit_rate).toBe(0);
      expect(a.low_bucket.count).toBe(0);
      expect(a.mid_bucket.count).toBe(0);
      expect(a.high_bucket.count).toBe(0);
    }
  });

  it("skips picks without featureSignals or gradedLegOutcome", () => {
    const r = evaluateSignalPerformance([basePick("a"), { ...basePick("b"), gradedLegOutcome: "hit" }]);
    expect(r.minutes_signal.overall.count).toBe(0);
  });

  it("aggregates hit_rate excluding pushes from denominator", () => {
    const picks: EvPick[] = [
      withSignals("a", { minutes: 0.1, usage: 0.5, env: 0.5, def: 0.5 }, "hit"),
      withSignals("b", { minutes: 0.1, usage: 0.5, env: 0.5, def: 0.5 }, "miss"),
      withSignals("c", { minutes: 0.1, usage: 0.5, env: 0.5, def: 0.5 }, "hit"),
      withSignals("d", { minutes: 0.1, usage: 0.5, env: 0.5, def: 0.5 }, "push"),
    ];
    const r = evaluateSignalPerformance(picks);
    const m = r.minutes_signal.low_bucket;
    expect(m.count).toBe(4);
    expect(m.hit_rate).toBeCloseTo(2 / 3, 6);
  });

  it("per-axis skips when that signal is non-finite", () => {
    const p: EvPick = {
      ...basePick("x"),
      gradedLegOutcome: "hit",
      featureSignals: {
        subjectId: "x",
        asOfUtc: "t",
        signals: {
          minutes_signal: Number.NaN,
          usage_signal: 0.5,
          environment_signal: 0.5,
          defense_signal: 0.5,
        },
      },
    };
    const r = evaluateSignalPerformance([p]);
    expect(r.minutes_signal.overall.count).toBe(0);
    expect(r.usage_signal.overall.count).toBe(1);
    expect(r.usage_signal.overall.hit_rate).toBe(1);
  });
});
