# Phase 76 — Pre-diversification card diagnosis

Generated: **2026-03-28T23:55:05.617Z**

- **Root cause:** `ud_builder_zero_accepted_candidates`
- **Dominant drop stage:** ud:no_k_combinations_or_structure_precheck

## PrizePicks

| Stage | Count |
|---|---:|
| Eligible legs (runner filters) | 58 |
| Min legs required | 6 |
| Early exit (too few legs) | no |
| No viable structures (max leg EV) | no |
| Cards after builder (post structure dedupe) | 629 |
| After per-type min EV | 629 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 9 |
| After SelectionEngine | 629 |
| After primary rank sort | 629 |
| Input to diversification / cap (sorted candidates) | 629 |
| Exported | 400 |

### Per-structure builder

- **5F** (5 leg): pool=30 attempts=200 evCalls=200 preDedupe=195 postDedupe=195 ev[min,max,med]=0.0546, 0.9766, 0.3490
- **6F** (6 leg): pool=30 attempts=150 evCalls=150 preDedupe=148 postDedupe=148 ev[min,max,med]=0.0557, 1.4882, 0.5031
- **5P** (5 leg): pool=30 attempts=75 evCalls=75 preDedupe=70 postDedupe=70 ev[min,max,med]=0.0829, 1.4408, 0.4305
- **6P** (6 leg): pool=30 attempts=50 evCalls=50 preDedupe=50 postDedupe=50 ev[min,max,med]=0.0948, 1.7406, 0.5988
- **4F** (4 leg): pool=30 attempts=75 evCalls=75 preDedupe=66 postDedupe=66 ev[min,max,med]=0.0845, 0.7597, 0.3012
- **4P** (4 leg): pool=30 attempts=50 evCalls=50 preDedupe=40 postDedupe=40 ev[min,max,med]=0.0939, 0.9828, 0.2887
- **3F** (3 leg): pool=30 attempts=50 evCalls=50 preDedupe=11 postDedupe=11 ev[min,max,med]=0.1432, 0.3251, 0.1839
- **3P** (3 leg): pool=30 attempts=50 evCalls=50 preDedupe=38 postDedupe=38 ev[min,max,med]=0.0667, 0.8428, 0.2572
- **2P** (2 leg): pool=30 attempts=25 evCalls=25 preDedupe=11 postDedupe=11 ev[min,max,med]=0.1105, 0.3876, 0.2761

## Underdog

| Stage | Count |
|---|---:|
| Eligible legs | 3 |
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
