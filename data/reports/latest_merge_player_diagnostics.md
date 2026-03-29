# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-29T00:38:11.234Z
- **Source audit (UTC):** 2026-03-29T00:38:11.234Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 239
- **distinct normalized player keys:** 35
- **Concentration:** top-1 share=0.07112970711297072 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **nikola jokic**: 17
- **deni avdija**: 16
- **jamal murray**: 14
- **jrue holiday**: 14
- **gui santos**: 13
- **kristaps porzingis**: 13
- **will riley**: 13
- **brandin podziemski**: 12
- **donovan clingan**: 12
- **scoot henderson**: 11
- **toumani camara**: 11
- **aaron gordon**: 10
- **deanthony melton**: 10
- **bub carrington**: 9
- **draymond green**: 9
- **bilal coulibaly**: 8
- **tristan vukcevic**: 7
- **cam johnson**: 6
- **christian braun**: 6
- **lu dort**: 5
- **sidy cissoko**: 4
- **bam adebayo**: 3
- **davion mitchell**: 2
- **shai gilgeousalexander**: 2
- **tyler herro**: 2
- **alperen sengun**: 1
- **amen thompson**: 1
- **chet holmgren**: 1
- **grayson allen**: 1
- **jalen brunson**: 1
- **karlanthony towns**: 1
- **norman powell**: 1
- **og anunoby**: 1
- **reed sheppard**: 1
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
- **bilal coulibaly**
  - stat assists: 1
  - stat points: 5
  - stat rebounds: 1
  - stat steals: 1
- **brandin podziemski**
  - stat assists: 1
  - stat points: 10
  - stat rebounds: 1
- **bub carrington**
  - stat assists: 1
  - stat points: 6
  - stat rebounds: 1
  - stat turnovers: 1
- **cam johnson**
  - stat assists: 1
  - stat points: 4
  - stat rebounds: 1
- **chet holmgren**
  - stat blocks: 1
- **christian braun**
  - stat points: 5
  - stat rebounds: 1
- **davion mitchell**
  - stat assists: 1
  - stat rebounds: 1
- **deanthony melton**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
  - stat steals: 1
- **deni avdija**
  - stat assists: 1
  - stat points: 12
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- **donovan clingan**
  - stat assists: 1
  - stat blocks: 1
  - stat points: 9
  - stat rebounds: 1
- **draymond green**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
- … (20 more player keys omitted)
