# Phase F — PP builder pool / merged-leg viability audit

**Scope:** Read-only. No changes to EV math, thresholds, ranking, gating, card construction, or selection.

**Inputs analyzed:** Current repo **`prizepicks-legs.csv`** (10 data rows; run timestamp **2026-03-23T18:14:09 ET** in file), plus code paths **`buildPpCardBuilderPool`**, **`buildCardsForSize`**, PP leg filtering in **`run_optimizer.ts`**.

## 1. Exact inputs entering the PP builder pool

**Source chain (order matters):**

1. **`merged`** PP picks from merge → **`calculateEvForMergedPicks`**
2. **`filterPpLegsByMinEdge`** (`PP_LEG_POLICY.minEdgePerLeg`)
3. **`filterPpLegsByMinLegEv`** (`PP_LEG_POLICY.minLegEv`)
4. Optional calibration / opp adjust / corr adjust (when flags on)
5. **`filterPpLegsByEffectiveEvFloor`** (`ppEvAdjThresh`)
6. **`filterPpLegsGlobalPlayerCap`** → this is **`filtered`**
7. In structure build: **`sortedByEdge = [...filtered].sort((a,b)=>b.edge-a.edge)`**
8. **`buildCardsForSize(sortedByEdge, ...)`** calls **`buildPpCardBuilderPool(legs)`** which is: **sort by `edge` desc, take top 30** (`PP_CARD_BUILDER_MAX_POOL_LEGS`)

```12:16:src/policy/pp_card_builder_pool.ts
export function buildPpCardBuilderPool(legs: EvPick[]): EvPick[] {
  return [...legs]
    .sort((a, b) => b.edge - a.edge)
    .slice(0, PP_CARD_BUILDER_MAX_POOL_LEGS);
}
```

With **10** post-filter legs, the builder pool is **all 10 legs**, ranked by **`edge`** (same ordering intent as `sortedByEdge`).

## 2. Distribution of merged-leg fields (current `prizepicks-legs.csv`)

Computed on disk (10 legs):

| Field | min | max | mean |
|-------|-----|-----|------|
| `trueProb` | 0.4778 | 0.5269 | **0.4955** |
| `edge` | 0.0225 | 0.0310 | 0.0264 |
| `legEv` | 0.0225 | 0.0310 | 0.0264 |
| `fairProbChosenSide` | 0.4489 | 0.5000 | 0.4691 |

**Side mix:** CSV rows are **over** picks only (no under legs in this export sample).

**Builder-facing note:** Pool is **not** filtered again by trueProb vs structure breakeven in `buildPpCardBuilderPool` (Phase 78 — that legacy screen was removed precisely because it could hide this choke).

## 3. Why the pool is too weak (dominant factors)

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| Merge-output quality | **Plausible major contributor** | Only **10** legs reach export; global merge health is still WARN in Phase D (`mergeCoverage` ~0.32, many drops). Fewer merged legs → smaller pool → fewer high-edge combinations. |
| Too few usable legs | **Yes — binding** | **10** legs for structures up to **6** unique players; `latest_pre_diversification_card_diagnosis.json` shows `poolLegsAfterTrueProbFilter: 10` per structure. |
| Skewed / low `trueProb` distribution | **Yes — binding** | Mean **0.495**, max **0.527**; PP card EV uses pooled average prob into **`getStructureEV`** then vs **`sportCardEvThreshold`** (`latest_card_ev_viability.json`: **`countPassingSportThreshold: 0`**, best-case avg prob still **below** required breakeven avg prob — Phase E). |
| Bad side mix | **Not the primary story here** | Sample is **all overs**; choke is still **card-level EV vs threshold**, not under/over balance in this file. |
| Stale merged fields | **Ruled down as dominant** | Phase D refreshed odds; zero-card persisted; freshness is not the remaining PP blocker. |
| Dedupe / export mismatch | **No** | Failure is before any PP candidate append (`evaluateFlexCard` null — Phase E). |

## 4. Mathematically incapable under unchanged rules?

**Yes, for this merged leg set:** Viability sampling on the same legs shows **no** structure draws with raw EV ≥ sport threshold; best-case average leg probability remains **below** structure breakeven requirements (`latest_card_ev_viability.json`, Phase E). With **trueProb** capped near **0.527** on the slate, **averaging 5–6 legs** stays near **~0.50**, which does not support positive **`structureEV.ev`** vs **0.008** floor in **`evaluateFlexCard`**.

So: **the current pool, as produced by merge + filters, does not contain the implied-probability headroom** needed for structure-passing cards **without** changing rules or inputs.

## 5. Single dominant upstream blocker (for improvement without policy tuning)

**Too few high–true-probability PP legs after merge + eligibility filters** — manifesting as a **10-leg pool** with a **tight band of `trueProb` (~0.48–0.53)** and **mean ~0.50**, which cannot produce positive structure EV under unchanged evaluation.

Improving PP zero-card outcomes **without** tuning gates requires **more and/or sharper merged legs** upstream (merge coverage, match quality, and/or raw prop breadth), not a different sort inside the builder.

## One recommended next phase

**Phase G — PP merge yield / leg-count recovery diagnosis:** trace **`merged.length` → post-EV counts** in a single run log and **`latest_merge_quality.json`** to quantify where legs are lost (drops vs filters), still **without** changing thresholds — targets the **upstream** blocker identified here.

## Validation command run

```bash
node -e "/* Papa parse prizepicks-legs.csv; print min/max/mean for trueProb, edge, legEv, fairProbChosenSide */"
```

(Executed in this workspace; output captured in §2.)
