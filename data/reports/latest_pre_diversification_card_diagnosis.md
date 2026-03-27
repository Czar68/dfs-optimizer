# Phase 76 — Pre-diversification card diagnosis

Generated: **2026-03-27T19:32:38.997Z**

- **Root cause:** `non_zero_cards_reach_export`
- **Dominant drop stage:** export_cap_or_diversification_only

## PrizePicks

| Stage | Count |
|---|---:|
| Eligible legs (runner filters) | 24 |
| Min legs required | 6 |
| Early exit (too few legs) | no |
| No viable structures (max leg EV) | no |
| Cards after builder (post structure dedupe) | 695 |
| After per-type min EV | 695 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 0 |
| After SelectionEngine | 695 |
| After primary rank sort | 695 |
| Input to diversification / cap (sorted candidates) | 695 |
| Exported | 400 |

### Per-structure builder

- **5F** (5 leg): pool=24 attempts=200 evCalls=200 preDedupe=200 postDedupe=200 ev[min,max,med]=0.1512, 0.5666, 0.3614
- **6F** (6 leg): pool=24 attempts=150 evCalls=150 preDedupe=150 postDedupe=150 ev[min,max,med]=0.2133, 0.9497, 0.5548
- **5P** (5 leg): pool=24 attempts=75 evCalls=75 preDedupe=75 postDedupe=75 ev[min,max,med]=0.1454, 0.8352, 0.4469
- **6P** (6 leg): pool=24 attempts=50 evCalls=50 preDedupe=50 postDedupe=50 ev[min,max,med]=0.2997, 0.9607, 0.6020
- **4F** (4 leg): pool=24 attempts=75 evCalls=75 preDedupe=75 postDedupe=74 ev[min,max,med]=0.0995, 0.4439, 0.2499
- **4P** (4 leg): pool=24 attempts=50 evCalls=50 preDedupe=50 postDedupe=50 ev[min,max,med]=0.0409, 0.4539, 0.2349
- **3F** (3 leg): pool=24 attempts=50 evCalls=50 preDedupe=39 postDedupe=35 ev[min,max,med]=0.0197, 0.1163, 0.0728
- **3P** (3 leg): pool=24 attempts=50 evCalls=50 preDedupe=50 postDedupe=47 ev[min,max,med]=0.0650, 0.4231, 0.2639
- **2P** (2 leg): pool=24 attempts=25 evCalls=25 preDedupe=19 postDedupe=14 ev[min,max,med]=0.0302, 0.1439, 0.0782

## Underdog

| Stage | Count |
|---|---:|
| Eligible legs | 30 |
| k-combination combos enumerated | 720 |
| Passed construction gate | 712 |
| Passed structure threshold | 712 |
| Pre-dedupe cards | 1510 |
| Post-dedupe cards | 1060 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 284 |
| After SelectionEngine | 1060 |
| Pre-div input | 1060 |
| Exported | 400 |
