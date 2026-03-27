import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import { extractHistoricalFeaturesFromRows } from "../src/modeling/historical_feature_extract";
import { buildGameEnvironmentRecordsFromHistoricalRow } from "../src/feature_input/game_environment_grounded_bridge";

function mkTracker(overrides: Partial<PerfTrackerRow> = {}): PerfTrackerRow {
  return {
    date: "2025-01-01",
    leg_id: "leg-1",
    player: "P",
    stat: "points",
    line: 24.5,
    book: "FD",
    trueProb: 0.5,
    projectedEV: 0,
    playedEV: 0,
    kelly: 0,
    card_tier: 1,
    result: 1,
    ...overrides,
  };
}

function mkHistorical(overrides: Partial<HistoricalFeatureRow> = {}): HistoricalFeatureRow {
  return {
    schemaVersion: 1,
    rowKey: "leg-1|2025-01-01",
    legId: "leg-1",
    date: "2025-01-01",
    gameStartTime: null,
    platform: "PP",
    player: "P",
    stat: "points",
    statNormalized: "points",
    line: 24.5,
    side: "over",
    book: "FD",
    marketGroupKey: "mk",
    formPriorSampleSize: 0,
    formL5HitRate: null,
    formL10HitRate: null,
    formL20HitRate: null,
    formL5ScrapeStatMean: null,
    formL10ScrapeStatMean: null,
    formL5HitVariance: null,
    formL10HitVariance: null,
    formL10HitTrendSlope: null,
    homeAway: null,
    daysRest: null,
    isBackToBack: null,
    playerGamesInLast4CalendarDays: null,
    gameTotal: 232.5,
    spread: 4.5,
    opponentAbbrevResolved: null,
    opponentDefRankForStat: null,
    opponentContextProvenance: null,
    openImpliedProb: null,
    closeImpliedProb: null,
    impliedProbDeltaCloseMinusOpen: null,
    clvDelta: null,
    clvPct: null,
    oddsBucket: null,
    roleMinutesTrend: null,
    roleStabilityNote: "schema_only_no_minutes_series_in_repo",
    provenance: { schedule: "historical_feature_extract" },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 130 — game environment totals/spread grounding", () => {
  it("extractHistoricalFeaturesFromRows carries grounded gameTotal/spread when present on source rows", () => {
    const rows = [mkTracker({ gameTotal: 231.5, spread: -3.0 })];
    const out = extractHistoricalFeaturesFromRows(rows);
    expect(out.length).toBe(1);
    expect(out[0]?.gameTotal).toBe(231.5);
    expect(out[0]?.spread).toBe(-3.0);
  });

  it("buildGameEnvironmentRecordsFromHistoricalRow emits direct totals/spread environment keys", () => {
    const records = buildGameEnvironmentRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("game_total")).toBe(true);
    expect(keys.has("spread")).toBe(true);
    expect(keys.has("spread_abs")).toBe(true);
    expect(keys.has("favorite_flag")).toBe(true);
    expect(keys.has("blowout_risk_bucket")).toBe(true);
  });

  it("does not infer totals/spread keys when those grounded fields are missing", () => {
    const records = buildGameEnvironmentRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({ gameTotal: null, spread: null }),
    });
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("game_total")).toBe(false);
    expect(keys.has("spread")).toBe(false);
    expect(keys.has("spread_abs")).toBe(false);
  });
});
