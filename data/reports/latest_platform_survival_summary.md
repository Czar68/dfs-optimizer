# Platform survival summary (Phase 17I)

- **Run (ET):** 2026-03-31T12:57:24 ET
- **Generated UTC:** 2026-03-31T16:57:40.706Z
- **Mode:** pp

## Code map
- **PP:** src/run_optimizer.ts (fetchPrizePicksRawProps → mergeWithSnapshot → calculateEvForMergedPicks)
- **UD:** src/run_underdog_optimizer.ts (fetchUnderdogRawProps* → merge* → calculateEvForMergedPicks)
- **Math:** src/ev/juice_adjust.ts re-exports from math_models/juice_adjust

## PrizePicks stage counts
| Stage | Count |
| --- | ---: |
| Raw scraped props | 4344 |
| Merge-matched props | 1493 |
| After EV compute | 1493 |
| After min edge (per leg) | 410 |
| After min leg EV (pre adjEv gate) | 410 |
| After adjEV ≥ threshold | 0 |
| After player cap | 87 |
| Cards built (all structures, pre per-type EV) | 4 |
| After per-slip min card EV | 4 |
| After SelectionEngine | 4 |
| Exported cards | 4 |

**PP thresholds (this run):** minEdge=0.532, minLegEv=0, evAdjThresh=0, maxLegsPerPlayer=1, volume=false

**Exported by flexType:** {"5F":2,"6F":1,"2P":1}

**Notes:**
- Dedupe / gates: shared_card_construction_gates (unique players, same-underlying opposite-side, team/game density); PP+UD dedupe by sorted leg ids, best cardEv kept.
- Exported cards may be fewer than generated+filtered when --max-export / --max-cards caps apply.

## Underdog
(not run or no snapshot)

## Operator interpretation
- PP export: sortedCards by cardEv (tie-break winProbCash, leg ids), then slice by --max-export / --max-cards when platform=both.
- UD: buildUdCardsFromFiltered sorts ALL structures' cards by cardEv then --max-cards cap — 8F often ranks at top.
- Web/telegram visibility may differ from CSV (digest caps, dashboard filters) — compare to data/reports + artifacts.
