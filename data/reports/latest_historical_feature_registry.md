# Phase 80 — Historical feature registry (backtest)

Generated: **2026-03-23T21:10:19.595Z**

- **Source:** `C:\Dev\Projects\dfs-optimizer\data\perf_tracker.jsonl`
- **Rows:** 22 | **Market groups:** 22
- **JSONL:** `artifacts/historical_feature_rows.jsonl` (full rows)

## Feature families

- **recent_form:** Rolling outcomes from perf_tracker prior rows (same market group), no leakage: only games strictly before this row.

- **schedule:** Derived from perf_tracker date / gameStartTime and prior games for the same player (any market).

- **opponent_context:** Opponent team defensive rank from src/matchups/opp_adjust.ts static NBA table (same source as Phase 8 opp adjust, read-only here).

- **market_context:** Fields already on PerfTrackerRow (open/close implied, CLV). No new snapshot fetches in Phase 80.

- **role_stability:** Schema placeholder — no minutes/usage time series in repo yet.

## Coverage (non-null fraction)

| Field | Non-null | % |
|---|---:|---:|
| formL5HitRate | 0 | 0.0% |
| formL10HitRate | 0 | 0.0% |
| formL20HitRate | 0 | 0.0% |
| formL5ScrapeStatMean | 0 | 0.0% |
| formL10HitTrendSlope | 0 | 0.0% |
| daysRest | 1 | 4.5% |
| gameTotal | 0 | 0.0% |
| spread | 0 | 0.0% |
| opponentDefRankForStat | 0 | 0.0% |
| openImpliedProb | 13 | 59.1% |
| closeImpliedProb | 2 | 9.1% |
| clvDelta | 2 | 9.1% |

## Missingness by family

### recent_form

Requires prior resolved rows (result 0/1) in same market group; early rows null.

- Fields: formL5HitRate, formL10HitRate, formL20HitRate, formL10HitTrendSlope

### schedule

daysRest needs prior game for player; homeAway/gameTotal/spread only when present on tracker row.

- Fields: daysRest, isBackToBack, playerGamesInLast4CalendarDays, homeAway, gameTotal, spread

### opponent_context

Static NBA table in opp_adjust; null if opponent missing or stat not mapped.

- Fields: opponentDefRankForStat

### market_context

From tracker columns; older rows may lack close/CLV.

- Fields: openImpliedProb, closeImpliedProb, clvDelta

### role_stability

Placeholder only — no minutes feed wired.

- Fields: roleMinutesTrend

## Sample rows (truncated in JSON)

```json
[
  {
    "schemaVersion": 1,
    "rowKey": "prizepicks-10056650-rebounds-5.5|2026-02-22",
    "legId": "prizepicks-10056650-rebounds-5.5",
    "date": "2026-02-22",
    "gameStartTime": null,
    "platform": null,
    "player": "GG Jackson",
    "stat": "rebounds",
    "statNormalized": "rebounds",
    "line": 5.5,
    "side": "over",
    "book": "fanduel",
    "marketGroupKey": "pid_6901654560dc50|mid_4110fcdaca5482bd",
    "formPriorSampleSize": 0,
    "formL5HitRate": null,
    "formL10HitRate": null,
    "formL20HitRate": null,
    "formL5ScrapeStatMean": null,
    "formL10ScrapeStatMean": null,
    "formL5HitVariance": null,
    "formL10HitVariance": null,
    "formL10HitTrendSlope": null,
    "homeAway": null,
    "daysRest": null,
    "isBackToBack": null,
    "playerGamesInLast4CalendarDays": null,
    "gameTotal": null,
    "spread": null,
    "opponentAbbrevResolved": null,
    "opponentDefRankForStat": null,
    "opponentContextProvenance": "no_opponent_on_row",
    "openImpliedProb": null,
    "closeImpliedProb": null,
    "impliedProbDeltaCloseMinusOpen": null,
    "clvDelta": null,
    "clvPct": null,
    "oddsBucket": null,
    "roleMinutesTrend": null,
    "roleStabilityNote": "schema_only_no_minutes_series_in_repo",
    "provenance": {
      "source": "perf_tracker_jsonl",
      "marketGroupKey": "stablePlayerId+stableMarketId_or_row_fields",
      "rollingWindow": "prior_rows_same_market_group_chronological",
      "opponentRank": "no_opponent_on_row"
    },
    "missingnessNotes": [
      "formL5_insufficient_prior_games",
      "formL10_insufficient_prior_games",
      "formL20_insufficient_prior_games",
      "opponent_missing",
      "open_implied_missing"
    ]
  },
  {
    "schemaVersion": 1,
    "rowKey": "prizepicks-10062826-points-8.5|2026-02-22",
    "legId": "prizepicks-10062826-points-8.5",
    "date": "2026-02-22",
    "gameStartTime": null,
    "platform": null,
    "player": "Ausar Thompson",
    "stat": "points",
    "statNormalized": "points",
    "line": 8.5,
    "side": "over",
    "book": "fanduel",
    "marketGroupKey": "pid_fd6bdfc57f3658|mid_22ca4285e3b760b9",
    "formPriorSampleSize": 0,
    "formL5HitRate": null,
    "formL10HitRate": null,
    "formL20HitRate": null,
    "formL5ScrapeStatMean": null,
    "formL10ScrapeStatMean": null,
    "formL5HitVariance": null,
    "formL10HitVariance": null,
    "formL10HitTrendSlope": null,
    "homeAway": null,
    "daysRest": null,
    "isBackToBack": null,
    "playerGamesInLast4CalendarDays": null,
    "gameTotal": null,
    "spread": null,
    "opponentAbbrevResolved": null,
    "opponentDefRankForStat": null,
    "opponentContextProvenance": "no_opponent_on_row",
    "openImpliedProb": null,
    "closeImpliedProb": null,
    "impliedProbDeltaCloseMinusOpen": null,
    "clvDelta": null,
    "clvPct": null,
    "oddsBucket": null,
    "roleMinutesTrend": null,
    "roleStabilityNote": "schema_only_no_minutes_series_in_repo",
    "provenance": {
      "source": "perf_tracker_jsonl",
      "marketGroupKey": "stablePlayerId+stableMarketId_or_row_fields",
      "rollingWindow": "prior_rows_same_market_group_chronological",
      "opponentRank": "no_opponent_on_row"
    },
    "missingnessNotes": [
      "formL5_insufficient_prior_games",
      "formL10_insufficient_prior_games",
      "formL20_insufficient_prior_games",
      "opponent_missing",
      "open_implied_missing"
    ]
  },
  {
    "schemaVersion": 1,
    "rowKey": "prizepicks-10062843-assists-1.5|2026-02-22",
    "legId": "prizepicks-10062843-assists-1.5",
    "date": "2026-02-22",
    "gameStartTime": null,
    "platform": null,
    "player": "Devin Vassell",
    "stat": "assists",
    "statNormalized": "assists",
    "line": 1.5,
    "side": "over",
    "book": "fanduel",
    "marketGroupKey": "pid_7defedac7e0fba|mid_5cd86a8c9b79c7b0",
    "formPriorSampleSize": 0,
    "formL5HitRate": null,
    "formL10HitRate": null,
    "formL20HitRate": null,
    "formL5ScrapeStatMean": null,
    "formL10ScrapeStatMean": null,
    "formL5HitVariance": null,
    "formL10HitVariance": null,
    "formL10HitTrendSlope": null,
    "homeAway": null,
    "daysRest": null,
    "isBackToBack": null,
    "playerGamesInLast4CalendarDays": null,
    "gameTotal": null,
    "spread": null,
    "opponentAbbrevResolved": null,
    "opponentDefRankForStat": null,
    "opponentContextProvenance": "no_opponent_on_row",
    "openImpliedProb": null,
    "closeImpliedProb": null,
    "impliedProbDeltaCloseMinusOpen": null,
    "clvDelta": null,
    "clvPct": null,
    "oddsBucket": null,
    "roleMinutesTrend": null,
    "roleStabilityNote": "schema_only_no_minutes_series_in_repo",
    "provenance": {
      "source": "perf_tracker_jsonl",
      "marketGroupKey": "stablePlayerId+stableMarketId_or_row_fields",
      "rollingWindow": "prior_rows_same_market_group_chronological",
      "opponentRank": "no_opponent_on_row"
    },
    "missingnessNotes": [
      "formL5_insufficient_prior_games",
      "formL10_insufficient_prior_games",
      "formL20_insufficient_prior_games",
      "opponent_missing",
      "open_implied_missing"
    ]
  }
]
```
