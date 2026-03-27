# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-24T21:04:37.311Z
- **Source audit (UTC):** 2026-03-24T21:04:37.311Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 125
- **distinct normalized player keys:** 22
- **Concentration:** top-1 share=0.088 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **alperen sengun**: 11
- **julius randle**: 11
- **kevin durant**: 11
- **amen thompson**: 10
- **ayo dosunmu**: 10
- **reed sheppard**: 10
- **jabari smith**: 8
- **jaden mcdaniels**: 8
- **rudy gobert**: 7
- **donte divincenzo**: 6
- **naz reid**: 6
- **bones hyland**: 5
- **cam johnson**: 5
- **kyle anderson**: 4
- **aaron holiday**: 3
- **tari eason**: 3
- **doug mcdermott**: 2
- **dejounte murray**: 1
- **desmond bane**: 1
- **devin carter**: 1
- **dylan cardwell**: 1
- **karlanthony towns**: 1

## Sample: player × stat (first 15 keys alphabetically)

- **aaron holiday**
  - stat assists: 1
  - stat points: 1
  - stat rebounds: 1
- **alperen sengun**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- **amen thompson**
  - stat assists: 1
  - stat points: 6
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- **ayo dosunmu**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
  - stat steals: 1
- **bones hyland**
  - stat assists: 1
  - stat points: 3
  - stat rebounds: 1
- **cam johnson**
  - stat assists: 1
  - stat points: 3
  - stat rebounds: 1
- **dejounte murray**
  - stat steals: 1
- **desmond bane**
  - stat steals: 1
- **devin carter**
  - stat steals: 1
- **donte divincenzo**
  - stat assists: 1
  - stat points: 3
  - stat rebounds: 1
  - stat steals: 1
- **doug mcdermott**
  - stat assists: 1
  - stat rebounds: 1
- **dylan cardwell**
  - stat blocks: 1
- **jabari smith**
  - stat assists: 1
  - stat points: 6
  - stat rebounds: 1
- **jaden mcdaniels**
  - stat assists: 1
  - stat points: 5
  - stat rebounds: 1
  - stat steals: 1
- **julius randle**
  - stat assists: 1
  - stat points: 7
  - stat rebounds: 1
  - stat steals: 1
  - stat turnovers: 1
- … (7 more player keys omitted)
