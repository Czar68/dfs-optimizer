import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { buildMarketContextRecordsFromHistoricalRow } from "../src/feature_input/market_context_features";
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
    line: 20,
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
    opponentAbbrevResolved: null,
    opponentDefRankForStat: null,
    opponentContextProvenance: null,
    openImpliedProb: 0.49,
    closeImpliedProb: 0.53,
    impliedProbDeltaCloseMinusOpen: 0.04,
    clvDelta: 0.03,
    clvPct: 0.06,
    oddsBucket: "minus_120_to_minus_105",
    roleMinutesTrend: null,
    roleStabilityNote: "schema_only_no_minutes_series_in_repo",
    provenance: {
      market_context: "perf_tracker_row",
      recent_form: "n/a",
      schedule: "n/a",
      opponent_context: "n/a",
      role_stability: "n/a",
    },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 125 — market-context alignment", () => {
  it("maps historical market fields into ContextFeatureRecord rows", () => {
    const records = buildMarketContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    const keys = records.map((r) => r.key).sort();
    expect(keys).toEqual([
      "market_close_implied_prob",
      "market_clv_delta",
      "market_clv_pct",
      "market_implied_prob_delta_close_minus_open",
      "market_odds_bucket",
      "market_open_implied_prob",
    ]);
    expect(records.every((r) => r.family === "market_context")).toBe(true);
  });

  it("skips null/non-finite market fields conservatively", () => {
    const records = buildMarketContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({
        openImpliedProb: null,
        closeImpliedProb: Number.NaN,
        impliedProbDeltaCloseMinusOpen: null,
        clvDelta: null,
        clvPct: null,
        oddsBucket: null,
      }),
    });
    expect(records).toEqual([]);
  });

  it("feature validation context builder includes market records when historical row is present", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-01",
      leg_id: "leg-1",
      player: "P",
      stat: "points",
      line: 20,
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
      line: 20,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    const records = buildContextRecordsForFeatureValidation(row, leg, mkHistorical());
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("market_open_implied_prob")).toBe(true);
    expect(keys.has("market_close_implied_prob")).toBe(true);
    expect(keys.has("market_clv_pct")).toBe(true);
  });
});
