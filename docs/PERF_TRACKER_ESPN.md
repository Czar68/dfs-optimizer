# Perf Tracker: ESPN Scraper + Backfill

## Overview

- **DB:** `data/perf_tracker.jsonl` (one JSON object per leg per line).
- **Backfill:** `.\scripts\init_perf_tracker.ps1` creates `data/` and backfills from current `tier1.csv` / `tier2.csv` + `prizepicks-legs.csv` / `underdog-legs.csv` (by leg IDs and runTimestamp). Run after `npm run compile` for 100+ rows if tier/leg CSVs are populated.
- **Scrape results:** `.\scripts\track-results.ps1` runs the ESPN scraper to fill `result` (HIT/MISS) and `scrape_stat` (actual stat value) for rows missing result. Rate: 1s delay between game summary requests.
- **Perf report:** `.\scripts\perf-report.ps1` prints top buckets (min 5 legs): **Player | Stat | Line | Book | Legs | Hit% | Mult | UnderBonus? | EV_adj boost**.

## ESPN Endpoints (no key)

- **Scoreboard (games by date):**  
  `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`  
  Returns `events[]` with `id` (gameId) for that date.

- **Summary (box score per game):**  
  `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={gameId}`  
  Returns `boxscore` with team/player statistics. Player-level stats are under `boxscore.teams[].athletes[]` (or discovered via fallback walk) with `displayName` and `statistics[]` (e.g. `name`/`displayValue` for points, rebounds, assists, threePointFieldGoalsMade).

## Sample box score (summary) JSON

```json
{
  "boxscore": {
    "teams": [
      {
        "team": { "displayName": "Orlando Magic" },
        "athletes": [
          {
            "displayName": "Wendell Carter Jr.",
            "statistics": [
              { "name": "points", "displayValue": "18" },
              { "name": "rebounds", "displayValue": "9" },
              { "name": "assists", "displayValue": "2" }
            ]
          }
        ]
      }
    ]
  }
}
```

Actual response may use different keys (e.g. `label`/`value`); the parser normalizes and walks the summary to find athlete-like objects with `displayName` + `statistics`.

## Scrape sample (5 legs ESPN actual/result)

After running `track-results.ps1` on a tracker that has rows for a completed game date, logs look like:

```
ESPN: Wendell Carter Jr. 02/22 rebounds=9
02/22 Wendell Carter Jr. rebounds 9 >= 7.5 HIT EV3.2%
ESPN: GG Jackson 02/22 rebounds=6
02/22 GG Jackson rebounds 6 >= 5.5 HIT EV3.2%
...
[Scraper] updated=80 skipped=40 noData=0
```

## Optimizer integration

- **adjEV:** In `run_optimizer.ts`, after leg EV filter we load calibration, set `leg.adjEv` when a bucket exists (min 5 legs), filter by `effectiveEv >= 0.03`, sort by effective EV. Cards use `adjEv ?? legEv` in `build_innovative_cards`.
- **Logs:** e.g. `Calib: Wendell Carter rebounds adjEV=3.8% (mult=1.2 hist67%)`. Tier1 uses effectiveEv; no fragile demotion change.

## Tests

- **Mock ESPN:** `tests/prod.spec.ts` includes:
  - `ESPN getStatValueFromBox maps points/rebounds/assists/3pm`
  - `fetchActualStatFromNba with mocked ESPN returns stat (no network)` (mock `fetchAllPlayerStatsForDate`).
- Target: **37 tests** (or project total) with no network in unit tests.

## Blockers / next

- **ESPN gameID lookup:** Done via scoreboard by date; player matched by normalized name / last name.
- **Rate:** 1s delay between summary requests to avoid throttling.
- **Next:** Auto daily `track-results.ps1` (cron/scheduled task) after games final.
