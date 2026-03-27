# Tracker temporal integrity (gameStartTime)

Generated: 2026-03-22T00:15:21.961Z
Schema: 1

## Summary
- Apply: **no** (perf_tracker written: **no**)
- Total rows: 22
- Resolved rows: 16

## Coverage (before → after)
| Metric | Before | After | Δ |
|---|---:|---:|---:|
| Rows with valid gameStartTime | 6 | 6 | 0 |
| Resolved with gameStartTime | 0 | 0 | 0 |
| Resolved missing gameStartTime | 16 | 16 | 0 |
| Overall coverage rate | 27.27% | 27.27% | 0.00 pp |
| Resolved coverage rate | 0.00% | 0.00% | 0.00 pp |

## Enrichment pass
```json
{
  "rowsScanned": 22,
  "rowsAlreadyTimed": 6,
  "skippedInvalidExisting": 0,
  "rowsBackfilledThisPass": 0,
  "rowsStillUntimed": 16,
  "sourceAttribution": {
    "from_legs_csv": 0,
    "from_legs_json": 0,
    "from_oddsapi_today": 0
  },
  "legacySourceCounts": {},
  "skippedConflicting": 0,
  "skippedNoCandidate": 16,
  "fromSnapshotEvent": 0,
  "reasonBreakdownUntimed": {
    "invalid_existing_game_start": 0,
    "ambiguous_or_conflicting_candidates": 0,
    "no_grounded_source": 16
  }
}
```

## Source attribution (this pass)
| Key | Count |
|---|---:|
| from_legs_csv | 0 |
| from_legs_json | 0 |
| from_oddsapi_today | 0 |
| fromSnapshotEvent | 0 |

## Untimed rows — reason breakdown (after scan)
| Reason | Count |
|---|---:|
| invalid_existing_game_start | 0 |
| ambiguous_or_conflicting_candidates | 0 |
| no_grounded_source | 16 |

## Phase 67 / impliedProb
No new grounded gameStartTime values this pass; impliedProb recovery unchanged unless other fields change.

## Notes
- gameStartTime must be ISO-parseable; invalid non-empty strings are not overwritten and count toward invalid_existing_game_start.
- Backfill order: legs CSV (leg_id), then legs JSON / oddsapi_today (deterministic; ambiguous → skip). OddsAPI snapshot rows do not expose per-market commence times here (fromSnapshotEvent = 0).
- Phase 67 snapshot implied recovery requires gameStartTime; more resolved rows with valid times can participate after this pass.
- Dry-run: no write to data/perf_tracker.jsonl; use npm run backfill:tracker-start-times to persist.
