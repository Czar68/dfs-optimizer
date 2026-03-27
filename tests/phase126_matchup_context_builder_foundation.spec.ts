import type { HistoricalFeatureRow } from "../src/modeling/historical_feature_registry";
import type { PerfTrackerRow } from "../src/perf_tracker_types";
import type { LegCsvRecord } from "../src/tracking/legs_csv_index";
import { buildMatchupContextRecordsFromHistoricalRow } from "../src/feature_input/matchup_context_features";
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
    opponentAbbrevResolved: "BOS",
    opponentDefRankForStat: 7,
    opponentContextProvenance: "opp_adjust.ts",
    openImpliedProb: null,
    closeImpliedProb: null,
    impliedProbDeltaCloseMinusOpen: null,
    clvDelta: null,
    clvPct: null,
    oddsBucket: null,
    roleMinutesTrend: null,
    roleStabilityNote: "schema_only_no_minutes_series_in_repo",
    provenance: {
      market_context: "perf_tracker_row",
      recent_form: "n/a",
      schedule: "n/a",
      opponent_context: "historical_feature_extract",
      role_stability: "n/a",
    },
    missingnessNotes: [],
    ...overrides,
  };
}

describe("Phase 126 — matchup context builder foundation", () => {
  it("maps grounded historical opponent fields into matchup_context records", () => {
    const records = buildMatchupContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical(),
    });
    const keys = records.map((r) => r.key).sort();
    expect(keys).toEqual(["matchup_opponent_abbrev", "matchup_opponent_def_rank_for_stat"]);
    expect(records.every((r) => r.family === "matchup_context")).toBe(true);
  });

  it("skips null/non-finite matchup values conservatively", () => {
    const records = buildMatchupContextRecordsFromHistoricalRow({
      subjectId: "leg-1",
      asOfUtc: "2025-01-01T23:59:59.000Z",
      historical: mkHistorical({
        opponentAbbrevResolved: null,
        opponentDefRankForStat: Number.NaN,
      }),
    });
    expect(records).toEqual([]);
  });

  it("feature validation context builder includes matchup_context keys when historical row exists", () => {
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
      opponent: "BOS",
    };
    const records = buildContextRecordsForFeatureValidation(row, leg, mkHistorical());
    const keys = new Set(records.map((r) => r.key));
    expect(keys.has("matchup_opponent_abbrev")).toBe(true);
    expect(keys.has("matchup_opponent_def_rank_for_stat")).toBe(true);
  });
});
