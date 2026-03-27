import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { buildMinutesAvailabilityRecordsFromHistoricalRow } from "../src/feature_input/minutes_availability_grounded_bridge";
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
    stat: "minutes",
    statNormalized: "minutes",
    line: 30,
    side: "over",
    book: "FD",
    marketGroupKey: "mk",
    formPriorSampleSize: 8,
    formL5HitRate: null,
    formL10HitRate: null,
    formL20HitRate: null,
    formL5ScrapeStatMean: 31.5,
    formL10ScrapeStatMean: 30.2,
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
      schedule: "n/a",
      opponent_context: "n/a",
      role_stability: "n/a",
    },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 128 — minutes availability grounded bridge", () => {
  it("maps grounded minutes-stat historical fields into minutes_availability records", () => {
    const records = buildMinutesAvailabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("minutes_l5_avg")).toBe(true);
    expect(keys.has("minutes_l10_avg")).toBe(true);
    expect(keys.has("minutes_trend_delta")).toBe(true);
    expect(keys.has("games_played_l10")).toBe(true);
    expect(records.every((r) => r.family === "minutes_availability")).toBe(true);
  });

  it("skips non-minutes stats and non-finite minute fields conservatively", () => {
    const notMinutes = buildMinutesAvailabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({ statNormalized: "points" }),
    });
    expect(notMinutes).toEqual([]);

    const nonFinite = buildMinutesAvailabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({
        formL5ScrapeStatMean: Number.NaN,
        formL10ScrapeStatMean: Number.NaN,
        formPriorSampleSize: Number.NaN as unknown as number,
      }),
    });
    expect(nonFinite).toEqual([]);
  });

  it("feature validation context builder includes minutes_availability keys for minutes historical rows", () => {
    const row: PerfTrackerRow = {
      date: "2025-01-01",
      leg_id: "leg-1",
      player: "P",
      stat: "minutes",
      line: 30,
      book: "FD",
      trueProb: 0.5,
      projectedEV: 0,
      playedEV: 0,
      kelly: 0,
      card_tier: 1,
    };
    const leg: LegCsvRecord = {
      player: "P",
      stat: "minutes",
      line: 30,
      book: "FD",
      league: "NBA",
      trueProb: 0.5,
      legEv: 0,
    };
    const records = buildContextRecordsForFeatureValidation(row, leg, mkHistorical());
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("minutes_l5_avg")).toBe(true);
    expect(keys.has("minutes_l10_avg")).toBe(true);
  });
});
