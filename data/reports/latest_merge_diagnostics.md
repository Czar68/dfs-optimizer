# Merge diagnostics (dimensional rollups)

- **Generated (UTC):** 2026-03-31T21:59:09.987Z
- **Source audit (UTC):** 2026-03-31T21:59:09.987Z
- **Schema:** merge_diagnostics v1

## Drops by site × canonical reason

- **prizepicks**
  - combo_label_excluded: 100
  - fantasy_excluded: 171
  - invalid_odds: 708
  - line_mismatch: 1340
  - no_match: 520

## Drops by stat × canonical reason (top lines)

- **assists**
  - combo_label_excluded: 19
  - invalid_odds: 130
  - line_mismatch: 25
  - no_match: 67
- **fantasy_score**
  - fantasy_excluded: 171
- **points**
  - combo_label_excluded: 45
  - invalid_odds: 169
  - line_mismatch: 98
  - no_match: 17
- **points_assists**
  - line_mismatch: 236
  - no_match: 5
- **points_rebounds**
  - line_mismatch: 338
  - no_match: 8
- **pra**
  - line_mismatch: 380
  - no_match: 12
- **rebounds**
  - combo_label_excluded: 17
  - invalid_odds: 213
  - line_mismatch: 29
  - no_match: 29
- **rebounds_assists**
  - line_mismatch: 219
  - no_match: 69
- **steals**
  - invalid_odds: 29
  - line_mismatch: 8
  - no_match: 154
- **stocks**
  - no_match: 105
- **threes**
  - combo_label_excluded: 19
  - invalid_odds: 158
  - line_mismatch: 7
- **turnovers**
  - invalid_odds: 9
  - no_match: 54

## Drops by sport × canonical reason

- **NBA**
  - combo_label_excluded: 100
  - fantasy_excluded: 171
  - invalid_odds: 708
  - line_mismatch: 1340
  - no_match: 520

## Matches: line kind by site (exact / nearest)

- prizepicks: exact=1128, nearest=418, total=1546

## Matches: main vs alt pool by site

- prizepicks: main=1095, alt=451

## Alt-pool matches by site

- prizepicks: 451

## Alt-pool matches by stat

- assists: 58
- points: 205
- rebounds: 124
- threes: 59
- turnovers: 5

## Line-delta histogram by stat (sample)

- **assists**
  - Δ=0: 131
  - Δ=1.00: 38
- **points**
  - Δ=0: 301
  - Δ=0.50: 1
  - Δ=1.00: 34
  - Δ=2.00: 1
- **points_assists**
  - Δ=0: 83
  - Δ=0.50: 1
  - Δ=1.00: 44
- **points_rebounds**
  - Δ=0: 89
  - Δ=1.00: 54
- **pra**
  - Δ=0: 95
  - Δ=1.00: 56
- **rebounds**
  - Δ=0: 215
  - Δ=1.00: 19
  - Δ=2.00: 1
- **rebounds_assists**
  - Δ=0: 76
  - Δ=0.50: 2
  - Δ=1.00: 128
- **steals**
  - Δ=0: 18
  - Δ=1.00: 25
- **stocks**
  - Δ=0: 11
  - Δ=1.00: 3
- **threes**
  - Δ=0: 93
  - Δ=1.00: 11
- **turnovers**
  - Δ=0: 16

## Global line-delta histogram (audit echo)

- Δ=0: 1128
- Δ=0.50: 4
- Δ=1.00: 412
- Δ=2.00: 2
