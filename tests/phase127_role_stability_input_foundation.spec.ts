import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { buildRoleStabilityRecordsFromHistoricalRow } from "../src/feature_input/role_stability_features";
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
      recent_form: "n/a",
      schedule: "n/a",
      opponent_context: "n/a",
      role_stability: "historical_feature_extract",
    },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 127 — role stability input foundation", () => {
  it("maps role_stability_note when present", () => {
    const records = buildRoleStabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "role_stability_note",
          family: "other",
          kind: "categorical",
          value: "schema_only_no_minutes_series_in_repo",
        }),
      ])
    );
  });

  it("maps role_minutes_trend only when finite", () => {
    const present = buildRoleStabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({ roleMinutesTrend: 0.2 as unknown as null }),
    });
    expect(present.some((r) => r.key === "role_minutes_trend")).toBe(true);

    const missing = buildRoleStabilityRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({ roleMinutesTrend: Number.NaN as unknown as null }),
    });
    expect(missing.some((r) => r.key === "role_minutes_trend")).toBe(false);
  });

  it("feature validation context builder includes role-stability keys when historical row exists", () => {
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
    const records = buildContextRecordsForFeatureValidation(
      row,
      leg,
      mkHistorical({ roleMinutesTrend: 0.1 as unknown as null })
    );
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("role_stability_note")).toBe(true);
    expect(keys.has("role_minutes_trend")).toBe(true);
  });
});
