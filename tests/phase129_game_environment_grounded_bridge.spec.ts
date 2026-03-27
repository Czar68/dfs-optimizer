import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { buildGameEnvironmentRecordsFromHistoricalRow } from "../src/feature_input/game_environment_grounded_bridge";
import { buildContextRecordsForFeatureValidation } from "../src/reporting/feature_validation_export";

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
    formPriorSampleSize: 8,
    formL5HitRate: null,
    formL10HitRate: null,
    formL20HitRate: null,
    formL5ScrapeStatMean: null,
    formL10ScrapeStatMean: null,
    formL5HitVariance: null,
    formL10HitVariance: null,
    formL10HitTrendSlope: null,
    homeAway: "home",
    daysRest: 2,
    isBackToBack: false,
    playerGamesInLast4CalendarDays: 2,
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
    provenance: {
      market_context: "n/a",
      recent_form: "historical_feature_extract",
      schedule: "historical_feature_extract",
      opponent_context: "n/a",
      role_stability: "n/a",
    },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 129 — game environment grounded bridge", () => {
  it("maps grounded historical schedule-stress fields into game_environment records", () => {
    const records = buildGameEnvironmentRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("env_days_rest")).toBe(true);
    expect(keys.has("env_back_to_back_flag")).toBe(true);
    expect(keys.has("env_schedule_density_last4d")).toBe(true);
    expect(records.every((r) => r.family === "game_environment")).toBe(true);
  });

  it("skips null/non-finite/unsupported values conservatively", () => {
    const records = buildGameEnvironmentRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({
        daysRest: Number.NaN,
        isBackToBack: null,
        playerGamesInLast4CalendarDays: Number.NaN,
      }),
    });
    expect(records).toEqual([]);
  });

  it("feature validation context builder includes game_environment bridge keys when historical row exists", () => {
    const row: PerfTrackerRow = {
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
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "points",
      line: 24.5,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    const records = buildContextRecordsForFeatureValidation(row, leg, mkHistorical());
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("env_days_rest")).toBe(true);
    expect(keys.has("env_back_to_back_flag")).toBe(true);
  });
});
