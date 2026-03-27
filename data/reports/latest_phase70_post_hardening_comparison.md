# Phase 70 — Post-hardening validation snapshot

Generated: 2026-03-22T00:15:22.046Z

## Key metrics (after regeneration)
| Metric | Value |
|---|---:|
| Backfill appended | 0 |
| Backfill skipped (duplicate date+leg) | 15 |
| Creation-tagged rows | 0 |
| Creation calibratable rate (tagged) | 0.00% |
| Resolved fully calibratable | 7 / 16 |
| Resolved impliedProb coverage rate | 43.75% |
| Resolved gameStart coverage rate | 0.00% |
| Calibration edge_unavailable resolved legs | 9 |

## Blocker (if any)
- **no_new_tier_leg_pairs**: Backfill found no new (date, leg_id) pairs: all tier1.csv / tier2.csv legs for their run dates already exist in data/perf_tracker.jsonl.
  - Required: Fresh optimizer output: data/output_logs/tier1.csv (or tier2) with runTimestamp + leg*n*Id columns, and matching prizepicks-legs.csv / underdog-legs.csv (or data/legs_archive) so loadLegsMap(leg_id) succeeds.
- Retry: `npx ts-node src/backfill_perf_tracker.ts`
- Root tier1.csv / tier2.csv in this repo are already fully reflected in perf_tracker; tagged rows require new appends after Phase 69.

## Note
No new rows appended; metrics match post-hardening inventory only (creation-tagged count remains 0 until a fresh tier+legs batch produces new keys).
