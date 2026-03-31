# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-31T17:04:35.465Z
- **Source audit (UTC):** 2026-03-31T17:04:35.465Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 502
- **distinct normalized player keys:** 87
- **Concentration:** top-1 share=0.08167330677290836 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **nic claxton**: 41
- **keon ellis**: 30
- **jordan miller**: 12
- **matisse thybulle**: 11
- **kris murray**: 10
- **max strus**: 10
- **brook lopez**: 9
- **derrick jones**: 9
- **jaxson hayes**: 9
- **jevon carter**: 9
- **john collins**: 9
- **kevin huerter**: 9
- **kris dunn**: 9
- **mitchell robinson**: 9
- **moussa diabate**: 9
- **ryan kalkbrenner**: 9
- **tari eason**: 9
- **jabari smith**: 8
- **jalen duren**: 8
- **noah clowney**: 8
- **bennedict mathurin**: 7
- **grant williams**: 7
- **jakobe walter**: 7
- **nicolas batum**: 7
- **sandro mamukelashvili**: 7
- **sidy cissoko**: 7
- **tristan da silva**: 7
- **wendell carter**: 7
- **donovan clingan**: 6
- **drake powell**: 6
- **jakob poeltl**: 6
- **jose alvarado**: 6
- **oso ighodaro**: 6
- **royce oneale**: 6
- **sion james**: 6
- **dillon brooks**: 5
- **grayson allen**: 5
- **jamal shead**: 5
- **jarrett allen**: 5
- **josh hart**: 5
- **karlanthony towns**: 5
- **miles bridges**: 5
- **myles turner**: 5
- **ousmane dieng**: 5
- **ziaire williams**: 5
- **alperen sengun**: 4
- **daniss jenkins**: 4
- **deandre ayton**: 4
- **deni avdija**: 4
- **evan mobley**: 4

## Sample: player × stat (first 15 keys alphabetically)

- **alperen sengun**
  - stat steals: 2
  - stat stocks: 2
- **amen thompson**
  - stat stocks: 2
  - stat turnovers: 1
- **ausar thompson**
  - stat turnovers: 1
- **bennedict mathurin**
  - stat assists: 3
  - stat steals: 3
  - stat turnovers: 1
- **brandon ingram**
  - stat steals: 3
- **brandon miller**
  - stat steals: 3
- **brook lopez**
  - stat assists: 3
  - stat steals: 3
  - stat stocks: 2
  - stat turnovers: 1
- **collin gillespie**
  - stat stocks: 1
  - stat turnovers: 1
- **daniss jenkins**
  - stat steals: 3
  - stat stocks: 1
- **darius garland**
  - stat steals: 3
- **deandre ayton**
  - stat assists: 1
  - stat steals: 1
  - stat stocks: 1
  - stat turnovers: 1
- **deni avdija**
  - stat steals: 2
  - stat stocks: 2
- **derrick jones**
  - stat assists: 3
  - stat steals: 3
  - stat stocks: 2
  - stat turnovers: 1
- **desmond bane**
  - stat stocks: 1
  - stat turnovers: 1
- **devin booker**
  - stat steals: 2
  - stat stocks: 1
- … (72 more player keys omitted)
