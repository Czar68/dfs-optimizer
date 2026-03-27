import { buildScheduleHomeAwayContextRecords } from "../src/feature_input/schedule_home_away_context_features";
import { buildContextRecordsForFeatureValidation } from "../src/reporting/feature_validation_export";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import { HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION } from "../src/modeling/historical_feature_registry";

describe("Phase 119 — schedule / home-away context records", () => {
  const baseInput = {
    subjectId: "leg-1",
    asOfUtc: "2025-01-15T23:59:59.000Z",
    provenance: "test",
  };

  it("buildScheduleHomeAwayContextRecords emits home_away_split when home/away set", () => {
    const r = buildScheduleHomeAwayContextRecords({
      ...baseInput,
      homeAway: "home",
      daysRest: null,
      isBackToBack: null,
      playerGamesInLast4CalendarDays: null,
    });
    expect(r.some((x) => x.family === "home_away_split" && x.key === "home_away_role" && x.value === "home")).toBe(
      true
    );
  });

  it("buildScheduleHomeAwayContextRecords skips home_away when null", () => {
    const r = buildScheduleHomeAwayContextRecords({
      ...baseInput,
      homeAway: null,
      daysRest: null,
      isBackToBack: null,
      playerGamesInLast4CalendarDays: null,
    });
    expect(r.filter((x) => x.family === "home_away_split")).toHaveLength(0);
  });

  it("buildScheduleHomeAwayContextRecords emits schedule_rest for grounded numeric/boolean fields", () => {
    const r = buildScheduleHomeAwayContextRecords({
      ...baseInput,
      homeAway: null,
      daysRest: 2,
      isBackToBack: true,
      playerGamesInLast4CalendarDays: 3,
    });
    const keys = new Set(r.map((x) => x.key));
    expect(keys.has("days_rest")).toBe(true);
    expect(keys.has("is_back_to_back")).toBe(true);
    expect(keys.has("player_games_last_4_calendar_days")).toBe(true);
    expect(r.find((x) => x.key === "is_back_to_back")?.value).toBe(1);
  });

  it("buildContextRecordsForFeatureValidation merges defense + schedule when historical row present", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-15",
      leg_id: "x",
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      opponent: "BOS",
      homeAway: "away",
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      league: "NBA",
      opponent: "BOS",
      trueProb: 0.5,
      legEv: 0,
    };
    const hist: HistoricalFeatureRow = {
      schemaVersion: HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION,
      rowKey: "x|2025-01-15",
      legId: "x",
      date: "2025-01-15",
      gameStartTime: null,
      platform: null,
      player: "P",
      stat: "points",
      statNormalized: "pts",
      line: 20,
      side: "over",
      book: null,
      marketGroupKey: "k",
      formPriorSampleSize: 0,
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
      opponentDefRankForStat: 15,
      opponentContextProvenance: "opp_adjust_static_nba_rankings",
      openImpliedProb: null,
      closeImpliedProb: null,
      impliedProbDeltaCloseMinusOpen: null,
      clvDelta: null,
      clvPct: null,
      oddsBucket: null,
      roleMinutesTrend: null,
      roleStabilityNote: "schema_only_no_minutes_series_in_repo",
      provenance: {},
      missingnessNotes: [],
    };
    const rec = buildContextRecordsForFeatureValidation(row, leg, hist);
    expect(rec.some((c) => c.family === "team_defense_context")).toBe(true);
    expect(rec.find((c) => c.key === "home_away_role")?.value).toBe("home");
    expect(rec.find((c) => c.key === "days_rest")?.value).toBe(2);
  });

  it("buildContextRecordsForFeatureValidation uses tracker homeAway when historical omitted", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-15",
      leg_id: "x",
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
      homeAway: "away",
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "points",
      line: 20,
      book: "b",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    const rec = buildContextRecordsForFeatureValidation(row, leg, null);
    expect(rec.find((c) => c.key === "home_away_role")?.value).toBe("away");
  });
});
