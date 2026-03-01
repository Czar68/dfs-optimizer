# Perf backfill horizon decision

## Decision: **A only** (120 days + current season to date)

## Why

- **Runtime:** Backfill is from current tier/leg CSVs only (no 30-day file history). Scrape runtime = (unique dates in tracker) × (1 scoreboard + N summaries × 1s). 120 days of dates would mean many scoreboard+summary calls; in practice we only have as many dates as appear in tier runs. So runtime is bounded by data we have, not by 120 vs 365.
- **Bucket coverage:** More legs per bucket (player+stat+line_bucket+book) need min 5. 120 days of played legs gives faster signal; prior season (B) adds drift risk (roster/role changes) and we do not yet have time decay in the model.
- **Drift:** Prior-season data (B) would need lower weight or decay; that’s not implemented. Adding B without decay would dilute recent signal. So we cap to **A only** and cap backfill to the date range for which ESPN returns valid box scores (see ESPN probe).

## ESPN historical cap

If the ESPN probe shows older dates (e.g. 2024-02-15) return 404/empty or wrong boxscore shape, cap backfill to the newest working season range (e.g. current season only).
