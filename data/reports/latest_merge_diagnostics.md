# Merge diagnostics (dimensional rollups)

- **Generated (UTC):** 2026-03-29T00:38:11.234Z
- **Source audit (UTC):** 2026-03-29T00:38:11.234Z
- **Schema:** merge_diagnostics v1

## Drops by site × canonical reason

- **underdog**
  - invalid_odds: 22
  - line_mismatch: 275
  - no_match: 239

## Drops by stat × canonical reason (top lines)

- **assists**
  - invalid_odds: 3
  - no_match: 21
- **blocks**
  - no_match: 4
- **points**
  - invalid_odds: 9
  - line_mismatch: 275
  - no_match: 165
- **rebounds**
  - invalid_odds: 2
  - no_match: 24
- **steals**
  - invalid_odds: 2
  - no_match: 14
- **turnovers**
  - invalid_odds: 6
  - no_match: 11

## Drops by sport × canonical reason

- **NBA**
  - invalid_odds: 22
  - line_mismatch: 275
  - no_match: 239

## Matches: line kind by site (exact / nearest)

- underdog: exact=110, nearest=11, total=121

## Matches: main vs alt pool by site

- underdog: main=87, alt=34

## Alt-pool matches by site

- underdog: 34

## Alt-pool matches by stat

- assists: 7
- points: 12
- rebounds: 10
- turnovers: 5

## Line-delta histogram by stat (sample)

- **assists**
  - Δ=0: 23
  - Δ=1.00: 3
- **points**
  - Δ=0: 44
  - Δ=1.00: 8
- **rebounds**
  - Δ=0: 35
- **steals**
  - Δ=0: 3
- **turnovers**
  - Δ=0: 5

## Global line-delta histogram (audit echo)

- Δ=0: 110
- Δ=1.00: 11
