# Phase 76 — Pre-diversification card diagnosis

Generated: **2026-03-31T21:59:10.818Z**

- **Root cause:** `ud_builder_zero_accepted_candidates`
- **Dominant drop stage:** ud:no_k_combinations_or_structure_precheck

## PrizePicks

| Stage | Count |
|---|---:|
| Eligible legs (runner filters) | 94 |
| Min legs required | 6 |
| Early exit (too few legs) | no |
| No viable structures (max leg EV) | no |
| Cards after builder (post structure dedupe) | 6 |
| After per-type min EV | 6 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 0 |
| After SelectionEngine | 6 |
| After primary rank sort | 6 |
| Input to diversification / cap (sorted candidates) | 6 |
| Exported | 2 |

### Per-structure builder

- **5F** (5 leg): pool=30 attempts=200 evCalls=198 preDedupe=2 postDedupe=2 ev[min,max,med]=0.7644, 0.7930, 0.7787
- **6F** (6 leg): pool=30 attempts=150 evCalls=150 preDedupe=1 postDedupe=1 ev[min,max,med]=0.5090, 0.5090, 0.5090
- **5P** (5 leg): pool=30 attempts=75 evCalls=75 preDedupe=1 postDedupe=1 ev[min,max,med]=0.4384, 0.4384, 0.4384
- **6P** (6 leg): pool=30 attempts=50 evCalls=50 preDedupe=0 postDedupe=0 ev[min,max,med]=n/a, n/a, n/a
- **4F** (4 leg): pool=30 attempts=75 evCalls=74 preDedupe=0 postDedupe=0 ev[min,max,med]=n/a, n/a, n/a
- **4P** (4 leg): pool=30 attempts=50 evCalls=49 preDedupe=0 postDedupe=0 ev[min,max,med]=n/a, n/a, n/a
- **3F** (3 leg): pool=30 attempts=50 evCalls=50 preDedupe=0 postDedupe=0 ev[min,max,med]=n/a, n/a, n/a
- **3P** (3 leg): pool=30 attempts=50 evCalls=48 preDedupe=2 postDedupe=2 ev[min,max,med]=0.0914, 0.3916, 0.2415
- **2P** (2 leg): pool=30 attempts=25 evCalls=23 preDedupe=0 postDedupe=0 ev[min,max,med]=n/a, n/a, n/a

## Underdog

| Stage | Count |
|---|---:|
| Eligible legs | 9 |
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
