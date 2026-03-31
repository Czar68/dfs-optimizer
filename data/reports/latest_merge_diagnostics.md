# Merge diagnostics (dimensional rollups)

- **Generated (UTC):** 2026-03-31T17:04:35.465Z
- **Source audit (UTC):** 2026-03-31T17:04:35.465Z
- **Schema:** merge_diagnostics v1

## Drops by site × canonical reason

- **prizepicks**
  - combo_label_excluded: 99
  - fantasy_excluded: 186
  - invalid_odds: 481
  - line_mismatch: 1390
  - no_match: 502

## Drops by stat × canonical reason (top lines)

- **assists**
  - combo_label_excluded: 17
  - invalid_odds: 97
  - line_mismatch: 38
  - no_match: 83
- **fantasy_score**
  - fantasy_excluded: 186
- **points**
  - combo_label_excluded: 45
  - invalid_odds: 71
  - line_mismatch: 240
  - no_match: 11
- **points_assists**
  - line_mismatch: 193
  - no_match: 6
- **points_rebounds**
  - line_mismatch: 262
  - no_match: 6
- **pra**
  - line_mismatch: 365
  - no_match: 12
- **rebounds**
  - combo_label_excluded: 17
  - invalid_odds: 148
  - line_mismatch: 69
  - no_match: 18
- **rebounds_assists**
  - line_mismatch: 200
  - no_match: 69
- **steals**
  - invalid_odds: 32
  - line_mismatch: 7
  - no_match: 138
- **stocks**
  - no_match: 98
- **threes**
  - combo_label_excluded: 20
  - invalid_odds: 122
  - line_mismatch: 16
  - no_match: 3
- **turnovers**
  - invalid_odds: 11
  - no_match: 58

## Drops by sport × canonical reason

- **NBA**
  - combo_label_excluded: 99
  - fantasy_excluded: 186
  - invalid_odds: 481
  - line_mismatch: 1390
  - no_match: 502

## Matches: line kind by site (exact / nearest)

- prizepicks: exact=863, nearest=512, total=1375

## Matches: main vs alt pool by site

- prizepicks: main=1172, alt=203

## Alt-pool matches by site

- prizepicks: 203

## Alt-pool matches by stat

- assists: 23
- points: 78
- rebounds: 65
- threes: 30
- turnovers: 7

## Line-delta histogram by stat (sample)

- **assists**
  - Δ=0: 106
  - Δ=0.50: 2
  - Δ=1.00: 38
- **points**
  - Δ=0: 166
  - Δ=0.50: 3
  - Δ=1.00: 60
  - Δ=2.00: 7
- **points_assists**
  - Δ=0: 69
  - Δ=0.50: 3
  - Δ=1.00: 39
- **points_rebounds**
  - Δ=0: 73
  - Δ=1.00: 58
- **pra**
  - Δ=0: 82
  - Δ=1.00: 56
- **rebounds**
  - Δ=0: 170
  - Δ=0.50: 6
  - Δ=1.00: 51
  - Δ=2.00: 1
- **rebounds_assists**
  - Δ=0: 70
  - Δ=0.50: 5
  - Δ=1.00: 123
- **steals**
  - Δ=0: 17
  - Δ=1.00: 24
- **stocks**
  - Δ=0: 13
  - Δ=1.00: 4
- **threes**
  - Δ=0: 82
  - Δ=1.00: 32
- **turnovers**
  - Δ=0: 15

## Global line-delta histogram (audit echo)

- Δ=0: 863
- Δ=0.50: 19
- Δ=1.00: 485
- Δ=2.00: 8
