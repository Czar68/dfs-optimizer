# Phase L — PP fair-prob construction parity (audit + implementation)

Purpose: use a **deterministic parity fair benchmark** for PrizePicks leg-level market edge that matches merge-time consensus, without changing `juiceAwareLegEv` / de-vig formulas, thresholds, ranking, or card construction.

## Assumptions

- `MergedPick.trueProb` and `MergedPick.fairOverOdds` / `fairUnderOdds` are produced in `merge_odds.ts` from the same consensus (multi-book sharp-weighted de-vig or single-book de-vig).
- `MergedPick.overOdds` / `underOdds` remain the **matched display book** (often vigged), which can diverge from consensus.
- Leg EV still uses `math_models/juice_adjust.ts` unchanged; only the **American two-way pair** passed into `juiceAwareLegEv` for PP is switched for parity when computing `edge` / `fairProbChosenSide`, while CSV-facing `overOdds`/`underOdds` on `EvPick` stay the real book.

## 1) Fair-prob path (audit)

| Stage | Location | Role |
|-------|----------|------|
| Consensus `trueProb` + parity lines | `src/merge_odds.ts` | Weighted `devigTwoWay` across `consensusBookMatches` (PP excludes PP book when others exist — Phase K); sets `trueProb`, `fairOverOdds`, `fairUnderOdds` via `probToAmerican`. |
| Leg `edge` / `fairProbChosenSide` | `src/calculate_ev.ts` → `computeCanonicalLegMarketEdge` → `juiceAwareLegEv` | **Before L:** fair side from **`pick.overOdds` / `pick.underOdds`** (matched book) while `trueProb` was consensus → mixed basis. **After L (PP only):** fair side from **`fairOverOdds` / `fairUnderOdds`** (parity pair). |

## 2) Why Phase K was insufficient

Phase K only changed **which books feed consensus** for `trueProb`. It did not fix the downstream mismatch: EV still compared **consensus `trueProb`** (after calibration/haircut) to **single-book two-way fair** from `pick.overOdds`/`underOdds`. That bookkeeping gap alone creates spurious edge swings.

## 3) Exact behavior changed

**File:** `src/calculate_ev.ts`

- For `pick.site === "prizepicks"`, build `mergedPickForMarketEdge` = `{ ...pick, overOdds: fairOverOdds, underOdds: fairUnderOdds }`.
- Use it for: `computeCanonicalEdgeForInput`, canonical mapping odds, and `fairProbChosenSide` on the returned `EvPick`.
- Leave **exported** `EvPick.overOdds` / `underOdds` as the original matched book prices; leave haircut bucket logic on original book odds.

No changes to `math_models/*`, merge consensus math, thresholds, or card/selection code.

## 4) Before / after (same rows, min-edge 0.015)

Validation harness: `npx ts-node scripts/diag_pp_post_merge_edge_buckets.ts` (live fetch + merge + EV).

Representative run (2026-03-24, `totalEvRows=348`):

| Basis | `atOrAbove015` | `below015` | `fairGte050` pass rate |
|-------|----------------|------------|-------------------------|
| **Book two-way** (replayed: `juiceAwareLegEv(eff, book over/under, side)`) | **8** | 340 | 1 / 259 ≈ **0.39%** |
| **Parity** (production after L: `row.edge`) | **348** | 0 | 0 / 248 = **0%** |

- Mean \((\text{parity edge} - \text{book-fair edge})\) ≈ **+0.00030** on this snapshot (tiny mean shift vs large tail effect on the former “passers”).
- Interpretation: several min-edge “passes” under the old basis were **not** economic edge vs consensus; they were **book-vs-consensus fair benchmark** artifacts. Parity tightens leg edge toward calibration/haircut vs a coherent fair line.

## 5) Validation commands run

- `npx ts-node scripts/diag_pp_post_merge_edge_buckets.ts`
- `npx jest tests/phase16r_probability_calibration.spec.ts tests/phase7_model_input_guardrail.spec.ts tests/phase73_gating_metric_correction.spec.ts`

## Files changed

- `src/calculate_ev.ts` — PP parity fair benchmark for market-relative edge inputs only.
- `scripts/diag_pp_post_merge_edge_buckets.ts` — repeatable PP post-merge edge bucket + book-vs-parity replay.
- `docs/DIAGNOSIS_PHASE_L.md` — this doc.
- `docs/CURRENT_STATE.md` — Phase L bullet.

## Single next phase recommendation

**Phase M — PP post-parity signal diagnosis:** quantify, on the parity benchmark, whether any stable positive edge remains after calibration/haircuts (and where by stat/book/side), or confirm the slate is flat vs consensus — **diagnosis only** before any threshold or policy discussion.
