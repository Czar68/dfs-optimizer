# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-28T23:55:05.595Z
- **Source audit (UTC):** 2026-03-28T23:55:05.595Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 129
- **distinct normalized player keys:** 25
- **Concentration:** top-1 share=0.13178294573643412 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **nikola jokic**: 17
- **jamal murray**: 14
- **gui santos**: 13
- **kristaps porzingis**: 13
- **brandin podziemski**: 12
- **aaron gordon**: 10
- **deanthony melton**: 10
- **draymond green**: 9
- **cam johnson**: 6
- **christian braun**: 6
- **bam adebayo**: 3
- **davion mitchell**: 2
- **tyler herro**: 2
- **alperen sengun**: 1
- **amen thompson**: 1
- **collin sexton**: 1
- **grayson allen**: 1
- **javon small**: 1
- **norman powell**: 1
- **oliviermaxence prosper**: 1
- **rayan rupert**: 1
- **reed sheppard**: 1
- **saddiq bey**: 1
- **tre jones**: 1
- **trey murphy**: 1

## Sample: player × stat (first 15 keys alphabetically)

- **aaron gordon**
  - stat assists: 1
  - stat points: 8
  - stat rebounds: 1
- **alperen sengun**
  - stat blocks: 1
- **amen thompson**
  - stat steals: 1
- **bam adebayo**
  - stat assists: 1
  - stat rebounds: 1
  - stat steals: 1
- **brandin podziemski**
  - stat assists: 1
  - stat points: 10
  - stat rebounds: 1
- **cam johnson**
  - stat assists: 1
  - stat points: 4
  - stat rebounds: 1
- **christian braun**
  - stat points: 5
  - stat rebounds: 1
- **collin sexton**
  - stat steals: 1
- **davion mitchell**
  - stat assists: 1
  - stat rebounds: 1
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
- **javon small**
  - stat steals: 1
- … (10 more player keys omitted)
