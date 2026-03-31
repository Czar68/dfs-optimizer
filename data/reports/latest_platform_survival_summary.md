# Platform survival summary (Phase 17I)

- **Run (ET):** 2026-03-31T17:58:49 ET
- **Generated UTC:** 2026-03-31T21:59:15.368Z
- **Mode:** pp

## Code map
- **PP:** src/run_optimizer.ts (fetchPrizePicksRawProps → mergeWithSnapshot → calculateEvForMergedPicks)
- **UD:** src/run_underdog_optimizer.ts (fetchUnderdogRawProps* → merge* → calculateEvForMergedPicks)
- **Math:** src/ev/juice_adjust.ts re-exports from math_models/juice_adjust

## PrizePicks stage counts
| Stage | Count |
| --- | ---: |
| Raw scraped props | 4385 |
| Merge-matched props | 1546 |
| After EV compute | 1546 |
| After min edge (per leg) | 566 |
| After min leg EV (pre adjEv gate) | 566 |
| After adjEV ≥ threshold | 0 |
| After player cap | 94 |
| Cards built (all structures, pre per-type EV) | 6 |
| After per-slip min card EV | 6 |
| After SelectionEngine | 6 |
| Exported cards | 2 |

**PP thresholds (this run):** minEdge=0.532, minLegEv=0, evAdjThresh=0, maxLegsPerPlayer=1, volume=false

**Exported by flexType:** {"5F":2}

**Notes:**
- Dedupe / gates: shared_card_construction_gates (unique players, same-underlying opposite-side, team/game density); PP+UD dedupe by sorted leg ids, best cardEv kept.
- Exported cards may be fewer than generated+filtered when --max-export / --max-cards caps apply.

## Underdog
(not run or no snapshot)

## Operator interpretation
- PP export: sortedCards by cardEv (tie-break winProbCash, leg ids), then slice by --max-export / --max-cards when platform=both.
- UD: buildUdCardsFromFiltered sorts ALL structures' cards by cardEv then --max-cards cap — 8F often ranks at top.
- Web/telegram visibility may differ from CSV (digest caps, dashboard filters) — compare to data/reports + artifacts.
