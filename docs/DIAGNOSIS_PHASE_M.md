# Phase M — PP post-parity signal diagnosis

**Mode:** diagnosis only (no pipeline fixes, no formula/threshold/gating/card changes).

## Assumptions

- **Parity leg edge** means production `EvPick.edge` after Phase L: `juiceAwareLegEv(effectiveTrueProb, fairOverOdds, fairUnderOdds, side)` while exported book prices remain the matched sportsbook.
- On an idealized identity chain, **consensus `trueProb` (pre-calibration)** and **two-way fair from `fairOver/UnderOdds`** describe the same center; **calibration/haircuts** are the only intentional asymmetric movers. Residuals at float precision are expected.
- One live diagnostic run is **representative of structure** (flat vs consensus); exact counts drift with slate/cache (`fetchPrizePicksRawProps` + merge).
- **`USE_ODDS_BUCKET_CALIB`** was **off** (default), so “haircut bucket” collapses to **no applied odds-bucket haircut** in this run.

## Files inspected

- `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE_GUARDRAILS.md`, `docs/OPERATIONS_RUNBOOK.md`
- `src/calculate_ev.ts` (parity edge path — read-only)
- `src/merge_odds.ts` (consensus + `fairOver/UnderOdds` — read-only)
- `src/calibrate_leg_ev.ts` (when haircut can apply — read-only)
- `src/odds_buckets.ts` (book-odds bucket labels for slices — read-only)
- `scripts/diag_pp_post_parity_signal.ts` (added for grouped output)

## Files changed

- `scripts/diag_pp_post_parity_signal.ts` — **new** grouped summary only (no `src/` or `math_models/` changes).
- `docs/DIAGNOSIS_PHASE_M.md` — this document.
- `docs/CURRENT_STATE.md` — Phase M bullet.

## Exact behavior changed

- **None** in the optimizer/EV merge path. Only **diagnostic scripting** and documentation.

## Required answers

### 1) After parity correction, how much positive PP edge remains?

- **`gte0015Share` = 0** (no legs ≥ `0.015` parity edge).
- **Economically meaningful positives (edge > `1e-6`):** **`countEdgeGtEpsilon` = 0** on the captured run (`n=351`).
- Global **mean / percentiles** are **~0** aside from floating-point dust (`~1e-16` scale).

**Conclusion:** There is **no material positive** parity edge on this slate at any practical threshold.

### 2) Is any remaining signal concentrated (stat / book / side / line / haircut / other)?

- **By stat (n≥5):** all inspected categories show **mean edge ≈ 0**, **max edge ≈ 0** at printed precision — **no slice stands out** with durable positive EV vs parity.
- **By matched book:** same — **no meaningful positive concentration** (FanDuel/DraftKings/PrizePicks/etc. all ~flat).
- **By side:** diagnostic population was **100% `over`** legs on this run (`351/351`), so **under cannot be compared** here (PP raw feed / merge shape for this fetch).
- **By line bucket:** highest “positive share” in ranking reflects **tiny float > 0**, not economic edge; **`countEdgeGtEpsilon` stays 0** when aggregating globally.
- **Haircut bucket:** all rows in **`no_haircut`** with default env — **no odds-bucket haircut slice** to analyze.

### 3) Any slices still meaningfully positive after calibration/haircuts?

- **No.** With default calibration/haircut behavior on this run, **no slice** shows mean or max parity edge above numerical noise, and **none** exceed **`1e-6`**.

### 4) Is the current PP slate functionally flat versus consensus?

- **Yes.** Under Phase L’s parity benchmark, the merged PP slate is **indistinguishable from flat** versus consensus fair: **zero** legs with edge **`> 1e-6`**, **`0`** at or above **`0.015`**.

### 5) Single next phase recommendation

**Phase N — PP `effectiveTrueProb` decomposition audit (read-only):** trace `rawTrueProb` → calibration buckets → `effectiveTrueProb` on the same merged rows and quantify whether **probability calibration** (not parity fair) introduces any **systematic directional residual** large enough to matter vs **`1e-6`–`0.015`**; re-run with **`USE_ODDS_BUCKET_CALIB=1`** only in a **diagnostic** harness to see if haircut buckets create any asymmetric mass **without** changing production defaults.

(If Phase N also shows near-zero directional residuals, the honest conclusion is that **consensus-aligned PP legs cannot self-generate edge** until **trueProb construction or external signal** changes — that becomes an explicit implementation/product decision in a later phase.)

## Validation commands run

```powershell
npx ts-node scripts/diag_pp_post_parity_signal.ts
```

(Optional cross-check for min-edge bucket parity vs book replay: `npx ts-node scripts/diag_pp_post_merge_edge_buckets.ts`.)

## Evidence snapshot (example run)

Captured fields from `diag_pp_post_parity_signal.ts` output (`2026-03-24`):

| Metric | Value |
|--------|--------|
| `totalEvRows` | 351 |
| `meanEdge` | ~0 (float dust) |
| `gte0015` | **0** |
| `countEdgeGtEpsilon` (`1e-6`) | **0** |
| `USE_ODDS_BUCKET_CALIB` | off |

Grouping tables in the JSON showed **mean ≈ 0, max ≈ 0** for stat/book/line/odds-bucket slices at reported precision.
