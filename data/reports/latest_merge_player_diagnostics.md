# Merge player diagnostics (`no_candidate` only)

- **Generated (UTC):** 2026-03-28T03:16:10.303Z
- **Source audit (UTC):** 2026-03-28T03:16:10.303Z
- **Schema:** merge_player_diagnostics v1
- **Normalization:** `normalizePickPlayerKeyForDiagnostics` (pick-side; same as merge matching)

## Totals

- **no_candidate drops:** 13
- **distinct normalized player keys:** 13
- **Concentration:** top-1 share=0.07692307692307693 → **distributed**

## Interpretation (non-exhaustive)

- **high_top_key_concentration:** a single normalized key accounts for ≥50% of `no_candidate` drops — investigate that player’s name alignment vs OddsAPI IDs **or** missing markets for that player.
- **distributed:** many distinct keys — more consistent with **missing markets**, **slate** mismatches, or **stat** gaps than a single alias bug.
- **insufficient_data:** zero `no_candidate` drops in this run — cannot use this artifact to rank name vs market causes.

## Top normalized player keys (up to 50)

- **ausar thompson**: 1
- **brandon miller**: 1
- **daniss jenkins**: 1
- **deaaron fox**: 1
- **donte divincenzo**: 1
- **julius randle**: 1
- **moussa diabate**: 1
- **naz reid**: 1
- **paul george**: 1
- **rudy gobert**: 1
- **ryan rollins**: 1
- **stephon castle**: 1
- **vj edgecombe**: 1

## Sample: player × stat (first 15 keys alphabetically)

- **ausar thompson**
  - stat steals: 1
- **brandon miller**
  - stat steals: 1
- **daniss jenkins**
  - stat steals: 1
- **deaaron fox**
  - stat steals: 1
- **donte divincenzo**
  - stat steals: 1
- **julius randle**
  - stat steals: 1
- **moussa diabate**
  - stat blocks: 1
- **naz reid**
  - stat blocks: 1
- **paul george**
  - stat steals: 1
- **rudy gobert**
  - stat blocks: 1
- **ryan rollins**
  - stat steals: 1
- **stephon castle**
  - stat steals: 1
- **vj edgecombe**
  - stat steals: 1
