# Tracker integrity (perf_tracker calibration inputs)

Generated: 2026-03-22T00:15:22.036Z
Schema: 1

## Summary
- Apply pass: **no** (perf_tracker written: **no**)
- Resolved rows: 16
- Fully calibratable (before → after): 7 → 7 (Δ 0)
- impliedProb coverage: 43.75% → 43.75%

## Coverage rates (after)
| Metric | Rate |
|---|---:|
| platform | 100.00% |
| trueProb | 100.00% |
| impliedProb | 43.75% |
| projectedEV | 100.00% |
| fully calibratable | 43.75% |

## Primary reason — resolved, not fully calibratable (after)
| Reason | Count |
|---|---:|
| missing_platform | 0 |
| missing_true_prob | 0 |
| missing_implied_prob | 9 |
| missing_projected_ev | 0 |

## Enrichment stats
```json
{
  "rowsScanned": 22,
  "impliedFilledFromOpenImpliedProb": 0,
  "impliedFilledFromOpenOddsAmerican": 0,
  "impliedFilledFromOverUnderSide": 0,
  "impliedFilledFromSnapshot": 0,
  "skippedSnapshotAmbiguous": 0,
  "skippedSnapshotNoGameStart": 9,
  "skippedSnapshotNoMatch": 0,
  "legsCsvMergedOdds": 0,
  "trueProbFilledFromLegsCsv": 0,
  "projectedEvFilledFromLegsCsv": 0,
  "platformFilledFromInference": 9,
  "openOddsAmericanFilledFromLegs": 0,
  "oddsBucketRecomputed": 0
}
```

## Resolved rows still missing impliedProb (after)
- Count: 9

### Snapshot pass (all rows that attempted snapshot while implied missing)
| Skip reason | Count |
|---|---:|
| ambiguous | 0 |
| no game start | 9 |
| no match | 0 |

### Residual missing implied (diagnostic)
- missing_game_start: 9
- missing_leg_odds_and_no_snapshot_match: 0
- ambiguous_snapshot_only: 0

## Notes
- fully_calibratable = resolved + platform + trueProb + impliedProb + projectedEV (platform may be inferred from leg_id).
- Snapshot recovery: earliest pre-start OddsAPI snapshot with unique chosen-side odds; ambiguous → skip.
- Leg CSV merge: existingLegCsvPaths + loadLegsMap (same as perf tracker backfill).
- Dry-run: enrichment applied in memory only; use --apply to persist data/perf_tracker.jsonl.
