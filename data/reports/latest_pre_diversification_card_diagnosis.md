# Phase 76 — Pre-diversification card diagnosis

Generated: **2026-03-28T21:52:05.190Z**

- **Root cause:** `ud_builder_zero_accepted_candidates`
- **Dominant drop stage:** ud:construction_gate_or_structure_threshold

## PrizePicks

| Stage | Count |
|---|---:|
| Eligible legs (runner filters) | 51 |
| Min legs required | 6 |
| Early exit (too few legs) | no |
| No viable structures (max leg EV) | no |
| Cards after builder (post structure dedupe) | 681 |
| After per-type min EV | 681 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 8 |
| After SelectionEngine | 681 |
| After primary rank sort | 681 |
| Input to diversification / cap (sorted candidates) | 681 |
| Exported | 400 |

### Per-structure builder

- **5F** (5 leg): pool=30 attempts=200 evCalls=200 preDedupe=200 postDedupe=200 ev[min,max,med]=0.1223, 1.0900, 0.4850
- **6F** (6 leg): pool=30 attempts=150 evCalls=150 preDedupe=150 postDedupe=150 ev[min,max,med]=0.2726, 1.9550, 0.7052
- **5P** (5 leg): pool=30 attempts=75 evCalls=75 preDedupe=75 postDedupe=75 ev[min,max,med]=0.1576, 1.4726, 0.7045
- **6P** (6 leg): pool=30 attempts=50 evCalls=50 preDedupe=50 postDedupe=50 ev[min,max,med]=0.3245, 2.2548, 1.0113
- **4F** (4 leg): pool=30 attempts=75 evCalls=75 preDedupe=75 postDedupe=75 ev[min,max,med]=0.1036, 0.8510, 0.3841
- **4P** (4 leg): pool=30 attempts=50 evCalls=50 preDedupe=47 postDedupe=47 ev[min,max,med]=0.0795, 1.0454, 0.3073
- **3F** (3 leg): pool=30 attempts=50 evCalls=49 preDedupe=26 postDedupe=26 ev[min,max,med]=0.0937, 0.3705, 0.1753
- **3P** (3 leg): pool=30 attempts=50 evCalls=49 preDedupe=49 postDedupe=48 ev[min,max,med]=0.0787, 0.9788, 0.3339
- **2P** (2 leg): pool=30 attempts=25 evCalls=24 preDedupe=10 postDedupe=10 ev[min,max,med]=0.1469, 0.4932, 0.2225

## Underdog

| Stage | Count |
|---|---:|
| Eligible legs | 7 |
| k-combination combos enumerated | 16 |
| Passed construction gate | 16 |
| Passed structure threshold | 0 |
| Pre-dedupe cards | 0 |
| Post-dedupe cards | 0 |
| SelectionEngine breakeven dropped | 0 |
| Anti-dilution adjustments | 0 |
| After SelectionEngine | 0 |
| Pre-div input | 0 |
| Exported | 0 |
