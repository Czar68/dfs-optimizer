# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-31T21:59:09.987Z
- **Source audit (UTC):** 2026-03-31T21:59:09.987Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 520
- **distinct normalized player keys:** 97
- **Concentration:** top-1 share=0.07692307692307693 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **nic claxton**: 40
- **grant williams**: 14
- **jordan miller**: 11
- **jose alvarado**: 11
- **kris murray**: 10
- **matisse thybulle**: 10
- **aaron holiday**: 9
- **brook lopez**: 9
- **derrick jones**: 9
- **john collins**: 9
- **kris dunn**: 9
- **mitchell robinson**: 9
- **moussa diabate**: 9
- **nicolas batum**: 9
- **collin murrayboyles**: 8
- **donovan clingan**: 8
- **gary trent**: 8
- **jakobe walter**: 8
- **jevon carter**: 8
- **jordan clarkson**: 8
- **noah clowney**: 8
- **ryan kalkbrenner**: 8
- **keon ellis**: 7
- **rui hachimura**: 7
- **sidy cissoko**: 7
- **tristan da silva**: 7
- **wendell carter**: 7
- **drake powell**: 6
- **jaxson hayes**: 6
- **karlanthony towns**: 6
- **royce oneale**: 6
- **alperen sengun**: 5
- **dillon brooks**: 5
- **grayson allen**: 5
- **jabari smith**: 5
- **jakob poeltl**: 5
- **jalen duren**: 5
- **jarrett allen**: 5
- **kevin huerter**: 5
- **max christie**: 5
- **max strus**: 5
- **miles bridges**: 5
- **myles turner**: 5
- **oso ighodaro**: 5
- **sion james**: 5
- **tari eason**: 5
- **taurean prince**: 5
- **ziaire williams**: 5
- **brandon williams**: 4
- **daniel gafford**: 4

## Sample: player × stat (first 15 keys alphabetically)

- **aaron holiday**
  - stat assists: 3
  - stat points: 4
  - stat rebounds: 2
- **aj green**
  - stat points_rebounds: 1
  - stat stocks: 1
- **alperen sengun**
  - stat steals: 3
  - stat stocks: 2
- **amen thompson**
  - stat stocks: 2
  - stat turnovers: 1
- **bennedict mathurin**
  - stat steals: 2
  - stat turnovers: 1
- **brandon ingram**
  - stat steals: 3
- **brandon miller**
  - stat steals: 3
- **brandon williams**
  - stat steals: 2
  - stat stocks: 1
  - stat turnovers: 1
- **brook lopez**
  - stat assists: 3
  - stat steals: 3
  - stat stocks: 2
  - stat turnovers: 1
- **collin gillespie**
  - stat stocks: 1
  - stat turnovers: 1
- **collin murrayboyles**
  - stat points: 3
  - stat rebounds: 5
- **cooper flagg**
  - stat stocks: 2
- **daniel gafford**
  - stat steals: 2
  - stat stocks: 1
  - stat turnovers: 1
- **daniss jenkins**
  - stat steals: 3
- **darius garland**
  - stat steals: 3
- … (82 more player keys omitted)
