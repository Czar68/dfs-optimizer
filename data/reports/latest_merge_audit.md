# Merge audit

- **Generated (UTC):** 2026-03-31T21:59:09.987Z
- **Schema:** merge_audit v1, merge_contract v1

## Totals

| Raw props | Filtered pre-merge | Match-eligible | Matched | Dropped (unmatched + pre-filters in stageAccounting) |
| ---: | ---: | ---: | ---: | ---: |
| 4385 | 271 | 4114 | 1546 | 2839 |

## CLI merge knobs

- exactLine=false, maxLineDiffUsed=1, ppMaxJuice=180, udMaxJuice=200

## Match quality

- exactLineMatches=1128, nearestWithinTolerance=418, altLineFallback=451

## Dropped by canonical reason

- combo_label_excluded: 100
- fantasy_excluded: 171
- invalid_odds: 708
- line_mismatch: 1340
- no_match: 520

## Matched by site

- prizepicks: exact=1128, nearest=418, total=1546

## PP consensus dispersion (Phase P)

- nPpMerged: 1546
- meanConsensusBookCount: 1.5686
- meanDevigSpreadOver: 0.008723
- p95DevigSpreadOver: 0.040323
- shareMultiBookConsensus: 39.52%
