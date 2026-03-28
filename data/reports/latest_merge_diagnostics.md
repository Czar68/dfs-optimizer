# Merge diagnostics (dimensional rollups)

- **Generated (UTC):** 2026-03-28T21:52:05.171Z
- **Source audit (UTC):** 2026-03-28T21:52:05.171Z
- **Schema:** merge_diagnostics v1

## Drops by site × canonical reason

- **underdog**
  - invalid_odds: 59
  - line_mismatch: 267
  - no_match: 158

## Drops by stat × canonical reason (top lines)

- **assists**
  - invalid_odds: 4
  - no_match: 12
- **blocks**
  - invalid_odds: 3
  - no_match: 1
- **points**
  - invalid_odds: 38
  - line_mismatch: 267
  - no_match: 113
- **rebounds**
  - invalid_odds: 2
  - no_match: 15
- **steals**
  - invalid_odds: 5
  - no_match: 13
- **turnovers**
  - invalid_odds: 7
  - no_match: 4

## Drops by sport × canonical reason

- **NBA**
  - invalid_odds: 59
  - line_mismatch: 267
  - no_match: 158

## Matches: line kind by site (exact / nearest)

- underdog: exact=143, nearest=10, total=153

## Matches: main vs alt pool by site

- underdog: main=102, alt=51

## Alt-pool matches by site

- underdog: 51

## Alt-pool matches by stat

- assists: 2
- points: 41
- rebounds: 4
- turnovers: 4

## Line-delta histogram by stat (sample)

- **assists**
  - Δ=0: 24
- **blocks**
  - Δ=0: 1
- **points**
  - Δ=0: 67
  - Δ=1.00: 9
- **rebounds**
  - Δ=0: 40
  - Δ=1.00: 1
- **steals**
  - Δ=0: 3
- **turnovers**
  - Δ=0: 8

## Global line-delta histogram (audit echo)

- Δ=0: 143
- Δ=1.00: 10
