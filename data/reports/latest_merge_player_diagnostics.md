# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-28T21:52:05.171Z
- **Source audit (UTC):** 2026-03-28T21:52:05.171Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 158
- **distinct normalized player keys:** 23
- **Concentration:** top-1 share=0.10759493670886076 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **nikola jokic**: 17
- **jamal murray**: 14
- **gui santos**: 13
- **kristaps porzingis**: 13
- **nickeil alexander walker**: 13
- **brandin podziemski**: 12
- **aaron gordon**: 10
- **deanthony melton**: 10
- **collin sexton**: 9
- **draymond green**: 9
- **walter clayton**: 8
- **christian braun**: 6
- **patrick williams**: 6
- **cam johnson**: 5
- **quentin grimes**: 5
- **brandon miller**: 1
- **grayson allen**: 1
- **nique clifford**: 1
- **oliviermaxence prosper**: 1
- **paul george**: 1
- **taylor hendricks**: 1
- **tre jones**: 1
- **vj edgecombe**: 1

## Sample: player × stat (first 15 keys alphabetically)

- **aaron gordon**
  - stat assists: 1
  - stat points: 8
  - stat rebounds: 1
- **brandin podziemski**
  - stat assists: 1
  - stat points: 10
  - stat rebounds: 1
- **brandon miller**
  - stat steals: 1
- **cam johnson**
  - stat points: 4
  - stat rebounds: 1
- **christian braun**
  - stat points: 5
  - stat rebounds: 1
- **collin sexton**
  - stat assists: 1
  - stat points: 6
  - stat rebounds: 1
  - stat steals: 1
- **deanthony melton**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
  - stat steals: 1
- **draymond green**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
- **grayson allen**
  - stat steals: 1
- **gui santos**
  - stat assists: 1
  - stat points: 9
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- **jamal murray**
  - stat assists: 1
  - stat points: 11
  - stat rebounds: 1
  - stat turnovers: 1
- **kristaps porzingis**
  - stat assists: 1
  - stat blocks: 1
  - stat points: 10
  - stat rebounds: 1
- **nickeil alexander walker**
  - stat assists: 1
  - stat points: 10
  - stat rebounds: 1
  - stat steals: 1
- **nikola jokic**
  - stat assists: 1
  - stat points: 13
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- **nique clifford**
  - stat steals: 1
- … (8 more player keys omitted)
