# Phase O — PP merge-time `trueProb` / consensus aggregator counterfactuals

**Mode:** diagnosis only — **no** production merge output change, **no** EV/ threshold / gating / card changes.

## Assumptions

- **Same population:** one `fetchPrizePicksRawProps(['NBA'])` → `mergeOddsWithPropsWithMetadata` run; counterfactuals use **`getLastMergeOddsMarketsSnapshot()`** (final `oddsMarkets` after composite synthesis, **identical** reference as merge).
- **Same book pool:** `buildPpConsensusBookMatchesForDiagnostics` mirrors merge Phase 7.3 (exact-first line pool, PrizePicks Phase K non-PP preference).
- **Production consensus:** sharp-**weighted** mean of per-book `devigTwoWay` over overs = merged `trueProb` (recomputed mismatch count **0** in sample).
- **Counterfactual residual:** \( \text{alt}_{\text{over}} - \text{fairProbChosenSide}(\text{production fairOver}, \text{fairUnder}, \text{over}) \), which is ≈ \( \text{alt} - \text{production trueOver} \) for parity-consistent production fair lines.
- **“Material”** discussed against **`0.015`** (min-edge scale) and **`1e-6`** (numerical).

## Files inspected

- `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE_GUARDRAILS.md`, `docs/OPERATIONS_RUNBOOK.md`
- `src/merge_odds.ts` (consensus loop + new read-only hooks)
- `src/odds_math.ts`, `src/odds/book_ranker.ts`, `math_models/juice_adjust.ts` (fair side — formula untouched)

## Files changed

- `src/merge_odds.ts` — **read-only plumbing only:**
  - `lastMergeOddsMarketsForDiagnostics` assigned once `oddsMarkets` is final post-composite.
  - `getLastMergeOddsMarketsSnapshot()`
  - `buildPpConsensusBookMatchesForDiagnostics()` — **exact mirror** of merge book-pool rules for diagnostics.
- `scripts/diag_pp_consensus_counterfactuals.ts` — new counterfactual harness.
- `docs/DIAGNOSIS_PHASE_O.md` — this doc.
- `docs/CURRENT_STATE.md` — Phase O bullet.

## Exact behavior changed (merged picks / EV)

- **None.** Merge emission, `trueProb`, and downstream EV are **unchanged**. Only a retained **reference** to the same `oddsMarkets` array and exported diagnostic builders.

## Alternates tested (per row, when books exist)

- **weighted_mean** — must match production `trueProb` (validation).
- **unweighted_mean**, **median**, **trim_mean** (if ≥3 books).
- **max_weight_book** / **min_weight_book** (single book at weight extremes).
- **draftkings_only** / **fanduel_only** when that book appears in the pool (**subset** of rows; `pinnacle` rarely present — omitted from stable summary if `n` tiny).

## Validation commands run

```powershell
npx ts-node scripts/diag_pp_consensus_counterfactuals.ts
```

## Representative results (example JSON run, `~352` PP rows)

| Metric | Interpretation |
|--------|----------------|
| `weightedRecomputeMismatchCount` | **0** — diagnostic pool matches production weighting. |
| `meanBookDevigSpread` | ~**0.014** — typical cross-book de-vig dispersion on over prob (books do **not** agree to many decimals). |
| `meanCrossAggregatorSpreadPerRow` | ~**0.01** — alternate rules usually stay near weighted center. |
| **Mean residual vs production parity** (all full-`n` alternates) | **≈ 0** (order **1e−4**); **no directional systematic lift** across the slate. |
| **`nAbsGte0015`** (weighted / unweighted / median / trim) | **O(5)** on **`~352`** rows — **narrow** tail, not broad 0.015-level mass. |
| **`min_weight_book`** | Larger **max** positive residual (**cherry-pick** softest book) — **unstable** policy, not a centered consensus. |
| **`fanduel_only`**, **`draftkings_only`** | Only on rows where that book is in pool; **mean** residual still **~0**; **`nAbsGte0015`** modest on **subset** — not slate-wide signal vs parity **after** Phase L alignment. |
| **Slice (`stat`)** | Slightly higher **cross-alt spread** for **`threes`** — **low `n`**, **unstable**; other stats cluster similarly. |

## Required answers

1. **Current vs alternates:** Production **weighted** consensus sits **near the middle** of unweighted/median/trim; **extreme-book** picks diverge **by design**.
2. **Material positive `trueProb − parityFair`?** **No broad signal:** mean residuals **~0**; only **small counts** beyond **`0.015`** on **full-row** alternates; **book-only** subsets show **no** large positive **mean** residual.
3. **Broad vs narrow vs unstable:** Any **`0.015`**-scale tail is **narrow**; **min-weight** and **single-book** paths are **unstable** / **non-consensus**.
4. **Aggregator vs market:** **Not** “wrong weighted formula”: recomputation **matches** merge; **dispersion** ~**0.014** shows **real** book disagreement, but **aggregated center** is **stable** and **near** 50%. Flatness is **multi-book market tight around consensus**, not downstream processing.
5. **Single next phase:** **Phase P — Surface PP consensus dispersion in operator artifacts** (`nConsensusBooks`, per-book spread / `bookDevigSpread`) in **`latest_merge_quality`** or leg-level diagnostics — **read-only reporting** so operators see when books **disagree** vs when the **slate is genuinely tight**, **without** changing `trueProb` or gates.
