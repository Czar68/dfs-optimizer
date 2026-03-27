# Phase G — PP merge yield / leg-count recovery diagnosis

**Scope:** Read-only. No EV math, threshold, ranking, gating, or construction changes.

**Run:** `2026-03-23T18:14:09 ET` — **`data/reports/latest_platform_survival_summary.json`** + **`artifacts/logs/run_20260323-181401.txt`**.

## Stage-by-stage PP leg funnel (counts)

| Stage | Count | Δ from prior | Source |
|-------|------:|--------------|--------|
| Raw scraped PP props | **5494** | — | `pp.rawScrapedProps` |
| Merge output (matched merged picks) | **705** | −4789 vs raw | `pp.mergeMatchedProps`; log `Merged picks: 705` |
| After `calculateEvForMergedPicks` | **705** | 0 | `pp.afterEvCompute` |
| After **`filterPpLegsByMinEdge`** (`minEdgePerLeg` **0.015**) | **40** | **−665** | `pp.afterMinEdge` |
| After **`filterPpLegsByMinLegEv`** + calibration/optional tweaks (`minLegEv` **0.02**) | **16** | −24 | `pp.afterMinLegEvBeforeAdjEv` |
| After **`filterPpLegsByEffectiveEvFloor`** (`evAdjThresh` **0.0225**) | **10** | −6 | `pp.afterAdjEvThreshold` |
| After **`filterPpLegsGlobalPlayerCap`** (max **1** leg / player) | **10** | 0 | `pp.afterPlayerCap` = final pool → `buildPpCardBuilderPool` |

Thresholds echoed in artifact:

```18:24:data/reports/latest_platform_survival_summary.json
    "thresholds": {
      "minEdgePerLeg": 0.015,
      "minLegEv": 0.02,
      "evAdjThresh": 0.0225,
      "maxLegsPerPlayer": 1,
      "volumeMode": false
    },
```

**Merge line (same run log):** `rawProps=5494 matchEligible=722 mergedExact=703 mergedNearest=2` — merge itself is **not** empty (705 merged); the largest **post-merge** drop is **not** merge-to-EV (705 preserved through EV compute).

## Where legs are removed (exact stages)

1. **Pre-merge / scrape:** 5494 raw → 722 match-eligible → **705** merged (large attrition vs raw — inventory/line/stat gating outside this table’s post-EV steps).
2. **Post-EV, pre-builder:** **`filterPpLegsByMinEdge`** removes **665** of **705** legs.
3. **`filterPpLegsByMinLegEv`** removes **24** of **40**.
4. **`filterPpLegsByEffectiveEvFloor`** removes **6** of **16**.
5. **Player cap:** removes **0** on this run.

## Dominant recovery opportunity (one stage)

**`filterPpLegsByMinEdge` (min edge 0.015): 705 → 40** — **665 legs** lost here. No later stage matches this magnitude.

Interpreting **without policy tuning:** recovery means **more merged legs naturally clearing market-relative edge ≥ 1.5pp** (better sharp-side pricing / merge alignment / feed), not lowering the gate in this phase.

## Question 4 — loss taxonomy

| Cause | Role this run |
|-------|----------------|
| Merge misses | **Large vs raw** (4789 props never merged), but **705** merged picks still feed EV — **not** the biggest drop *after* merge. |
| Missing odds/probability | Would surface as EV-calc failure or empty `withEv`; **705** after EV compute → **not** dominant. |
| **Min-edge eligibility** | **Dominant (665 removed).** |
| Min-leg-EV + adj-EV | **24 + 6** — material but secondary. |
| Player cap | **0** lost. |
| Dedupe before CSV | Not the 705→40 step; card **construction** dedupe is downstream of an empty candidate set (Phase E). |

## Single upstream blocker (for more PP legs without tuning thresholds)

**Post-merge edge scarcity:** **94%** of merged, EV-computed legs (**665 / 705**) fail **`minEdgePerLeg` (0.015)**. Until more merged props carry **≥1.5pp** market-relative edge, the builder will keep seeing **O(10)** legs regardless of merge match rate improvements alone.

## Console log caveat

One log line collapses min-leg-EV + effective-EV into **`10 of 40`**; the **authoritative** intermediate **16** is from **`latest_platform_survival_summary.json`** (`afterMinLegEvBeforeAdjEv`).

## One recommended next phase

**Phase H — Post-merge PP edge distribution attribution (read-only):** quantify **`edge` histogram / deciles** on the **705** `EvPick`s immediately after `calculateEvForMergedPicks` (offline script against a captured merge export or instrumented one-off read) to show **where** the mass sits relative to **0.015** — still **no** threshold edits; informs whether **feed/merge calibration** vs **slate** explains the gap.

## Validation commands run

None — diagnosis used **`data/reports/latest_platform_survival_summary.json`** and **`artifacts/logs/run_20260323-181401.txt`** only.
