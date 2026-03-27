import { buildRollingFormContextRecordsFromHistoricalRow } from "../src/feature_input/rolling_form_context_features";
import { buildContextRecordsForFeatureValidation } from "../src/reporting/feature_validation_export";
import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import { HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";

function historical(overrides: Partial<HistoricalFeatureRow> = {}): HistoricalFeatureRow {
  return {
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
    formPriorSampleSize: 8,
    formL5HitRate: 0.6,
    formL10HitRate: 0.5,
    formL20HitRate: null,
    formL5ScrapeStatMean: null,
    formL10ScrapeStatMean: null,
    formL5HitVariance: null,
    formL10HitVariance: null,
    formL10HitTrendSlope: 0.03,
    homeAway: null,
    daysRest: null,
    isBackToBack: null,
    playerGamesInLast4CalendarDays: null,
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
    provenance: {},
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 120 — rolling form context alignment", () => {
  it("emits rolling_form records from grounded historical fields", () => {
    const r = buildRollingFormContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-15T23:59:59.000Z",
      historical: historical(),
    });
    const keys = new Set(r.map((x) => x.key));
    expect(keys.has("rolling_form_l5_hit_rate")).toBe(true);
    expect(keys.has("rolling_form_l10_hit_rate")).toBe(true);
    expect(keys.has("rolling_form_prior_sample_size")).toBe(true);
    expect(keys.has("rolling_form_l10_hit_trend_slope")).toBe(true);
    expect(r.find((x) => x.key === "rolling_form_prior_sample_size")?.value).toBe(8);
  });

  it("skips missing rolling values conservatively", () => {
    const r = buildRollingFormContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-15T23:59:59.000Z",
      historical: historical({
        formPriorSampleSize: 0,
        formL5HitRate: null,
        formL10HitRate: null,
        formL20HitRate: null,
        formL10HitTrendSlope: null,
      }),
    });
    expect(r.some((x) => x.key === "rolling_form_l5_hit_rate")).toBe(false);
    expect(r.some((x) => x.key === "rolling_form_l10_hit_rate")).toBe(false);
    expect(r.find((x) => x.key === "rolling_form_prior_sample_size")?.value).toBe(0);
  });

  it("feature validation context includes rolling_form when historical row provided", () => {
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
    const rec = buildContextRecordsForFeatureValidation(row, leg, historical());
    expect(rec.some((c) => c.family === "rolling_form")).toBe(true);
  });
});
