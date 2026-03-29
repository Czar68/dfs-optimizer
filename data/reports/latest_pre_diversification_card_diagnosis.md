# Phase 76 — Pre-diversification card diagnosis

Generated: **2026-03-29T00:38:11.250Z**

- **Root cause:** `ud_builder_zero_accepted_candidates`
- **Dominant drop stage:** ud:no_k_combinations_or_structure_precheck

## PrizePicks

| Stage | Count |
|---|---:|
| Eligible legs (runner filters) | 54 |
| Min legs required | 6 |
| Early exit (too few legs) | no |
| No viable structures (max leg EV) | no |
| Cards after builder (post structure dedupe) | 616 |
| After per-type min EV | 616 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 9 |
| After SelectionEngine | 616 |
| After primary rank sort | 616 |
| Input to diversification / cap (sorted candidates) | 616 |
| Exported | 400 |

### Per-structure builder

- **5F** (5 leg): pool=30 attempts=200 evCalls=200 preDedupe=196 postDedupe=196 ev[min,max,med]=0.0525, 0.9316, 0.3540
- **6F** (6 leg): pool=30 attempts=150 evCalls=150 preDedupe=146 postDedupe=146 ev[min,max,med]=0.0633, 1.5945, 0.5213
- **5P** (5 leg): pool=30 attempts=75 evCalls=75 preDedupe=71 postDedupe=71 ev[min,max,med]=0.0608, 1.3367, 0.3832
- **6P** (6 leg): pool=30 attempts=50 evCalls=50 preDedupe=49 postDedupe=49 ev[min,max,med]=0.1765, 1.6478, 0.6061
- **4F** (4 leg): pool=30 attempts=75 evCalls=75 preDedupe=57 postDedupe=57 ev[min,max,med]=0.0667, 0.8991, 0.2869
- **4P** (4 leg): pool=30 attempts=50 evCalls=50 preDedupe=35 postDedupe=35 ev[min,max,med]=0.0780, 0.9757, 0.3003
- **3F** (3 leg): pool=30 attempts=50 evCalls=50 preDedupe=17 postDedupe=17 ev[min,max,med]=0.1310, 0.4495, 0.1930
- **3P** (3 leg): pool=30 attempts=50 evCalls=50 preDedupe=35 postDedupe=35 ev[min,max,med]=0.0611, 0.7981, 0.3525
- **2P** (2 leg): pool=30 attempts=25 evCalls=25 preDedupe=11 postDedupe=10 ev[min,max,med]=0.0959, 0.3677, 0.2679

## Underdog

| Stage | Count |
|---|---:|
| Eligible legs | 1 |
| k-combination combos enumerated | 0 |
| Passed construction gate | 0 |
| Passed structure threshold | 0 |
| Pre-dedupe cards | 0 |
| Post-dedupe cards | 0 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 0 |
| After SelectionEngine | 0 |
| Pre-div input | 0 |
| Exported | 0 |
