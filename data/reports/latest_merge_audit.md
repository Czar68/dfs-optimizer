# Merge audit

- **Generated (UTC):** 2026-03-31T17:04:35.465Z
- **Schema:** merge_audit v1, merge_contract v1

## Totals

| Raw props | Filtered pre-merge | Match-eligible | Matched | Dropped (unmatched + pre-filters in stageAccounting) |
| ---: | ---: | ---: | ---: | ---: |
| 4033 | 285 | 3748 | 1375 | 2658 |

## CLI merge knobs

- exactLine=false, maxLineDiffUsed=1, ppMaxJuice=180, udMaxJuice=200

## Match quality

- exactLineMatches=863, nearestWithinTolerance=512, altLineFallback=203

## Dropped by canonical reason

- combo_label_excluded: 99
- fantasy_excluded: 186
- invalid_odds: 481
- line_mismatch: 1390
- no_match: 502

## Matched by site

- prizepicks: exact=863, nearest=512, total=1375

## PP consensus dispersion (Phase P)

- nPpMerged: 1375
- meanConsensusBookCount: 1.6225
- meanDevigSpreadOver: 0.010208
- p95DevigSpreadOver: 0.043338
- shareMultiBookConsensus: 45.60%
