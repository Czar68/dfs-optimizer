# Merge diagnostics (dimensional rollups)

- **Generated (UTC):** 2026-03-28T23:55:05.595Z
- **Source audit (UTC):** 2026-03-28T23:55:05.595Z
- **Schema:** merge_diagnostics v1

## Drops by site × canonical reason

- **underdog**
  - invalid_odds: 37
  - line_mismatch: 290
  - no_match: 129

## Drops by stat × canonical reason (top lines)

- **assists**
  - invalid_odds: 4
  - no_match: 13
- **blocks**
  - invalid_odds: 1
  - no_match: 2
- **points**
  - invalid_odds: 17
  - line_mismatch: 290
  - no_match: 84
- **rebounds**
  - invalid_odds: 5
  - no_match: 13
- **steals**
  - invalid_odds: 2
  - no_match: 14
- **turnovers**
  - invalid_odds: 8
  - no_match: 3

## Drops by sport × canonical reason

- **NBA**
  - invalid_odds: 37
  - line_mismatch: 290
  - no_match: 129

## Matches: line kind by site (exact / nearest)

- underdog: exact=124, nearest=7, total=131

## Matches: main vs alt pool by site

- underdog: main=82, alt=49

## Alt-pool matches by site

- underdog: 49

## Alt-pool matches by stat

- assists: 9
- points: 21
- rebounds: 12
- turnovers: 7

## Line-delta histogram by stat (sample)

- **assists**
  - Δ=0: 24
- **blocks**
  - Δ=0: 1
- **points**
  - Δ=0: 53
  - Δ=1.00: 7
- **rebounds**
  - Δ=0: 35
- **steals**
  - Δ=0: 4
- **turnovers**
  - Δ=0: 7

## Global line-delta histogram (audit echo)

- Δ=0: 124
- Δ=1.00: 7
