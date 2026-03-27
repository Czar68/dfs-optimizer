# Phase N — PP `effectiveTrueProb` decomposition audit

**Mode:** diagnosis only (no pipeline fixes; no EV / threshold / gating / card changes).

## Assumptions

- **Names** match `src/calculate_ev.ts`:
  - **rawTrueProb** → merge `trueProb`, clamped `[0.01,0.99]` as `storedTrueProb`, exposed on `EvPick` as `rawTrueProb`.
  - **calibratedTrueProb** → `applyProbabilityCalibration(storedTrueProb, activeCalibration)`.
  - **effectiveTrueProb** → `calibratedTrueProb - haircut` when `haircut > 0`, else `calibratedTrueProb`; `haircut` from `getOddsBucketCalibrationHaircut` (gated by **`USE_ODDS_BUCKET_CALIB`**).
- **Parity leg edge** remains Phase L: `fairOverOdds` / `fairUnderOdds` for `fairProbChosenSide` vs **effectiveTrueProb** in `juiceAwareLegEv`.
- Diagnostic env matches a typical dev run: **probability calibration artifact inactive** when `getActiveProbabilityCalibration()` is `null` (missing/non-active `artifacts/probability_calibration.json` and/or readiness gate).

## Files inspected

- `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE_GUARDRAILS.md`, `docs/OPERATIONS_RUNBOOK.md`
- `src/calculate_ev.ts` (ordering: raw → cal → effective → parity edge)
- `src/modeling/probability_calibration.ts` (`getActiveProbabilityCalibration`, `applyProbabilityCalibration`)
- `src/calibrate_leg_ev.ts` (`getOddsBucketCalibrationHaircut`, `USE_ODDS_BUCKET_CALIB`)

## Files changed

- `scripts/diag_pp_effective_trueprob_decomp.ts` — new read-only harness (dual run `USE_ODDS_BUCKET_CALIB=0` vs `1`).
- `docs/DIAGNOSIS_PHASE_N.md` — this document.
- `docs/CURRENT_STATE.md` — Phase N bullet.

## Exact behavior changed

- **None** in production pipeline (`src/` merge/EV logic unchanged).

## Validation commands run

```powershell
npx ts-node scripts/diag_pp_effective_trueprob_decomp.ts
```

## Required answers

### 1) How do rawTrueProb, calibrated, and effective differ on PP rows?

Representative run (`n=350`, calibration **inactive**, **`USE_ODDS_BUCKET_CALIB=0`**):

| Stage | mean ≈ | vs raw |
|--------|--------|--------|
| rawTrueProb | ~0.501 | — |
| calibratedTrueProb | **same as raw** | Δ = 0 all rows (`rowsProbCalibrationApplied=0`) |
| effectiveTrueProb | **same as calibrated** | Δ(effective − calibrated) = 0; **no haircuts** (`nHaircutStrict=0`) |

With **`USE_ODDS_BUCKET_CALIB=1`** on the same merged rows: **identical** decomposition in this run (still **0** haircuts, **0** calibration deltas) — tracker/bucket deltas did not apply a strict haircut to these legs under current data.

### 2) Systematic directional residual from calibration / effective-prob processing?

- **Calibration:** With inactive artifact, **no** shift: `delta_calibrated_minus_raw.mean = 0`, `nPos=nNeg=0`.
- **Effective vs calibrated:** **no** haircut mass in sample: **no** systematic downward (or upward) move from odds-bucket processing in the **`=1`** diagnostic run either.

So **no** directional residual from these stages **in the measured environment**.

### 3) `USE_ODDS_BUCKET_CALIB=1` diagnostic-only — meaningful positive residual?

- **Parity leg edge:** `countGtEcon` (edge > `1e-6`) = **0**, `countGte0015` = **0** for both **`=0`** and **`=1`** in the captured JSON.
- **Conclusion:** Enabling odds-bucket calibration **did not** surface meaningful positive parity residual on this slate (and did not apply observable haircuts on these rows).

### 4) Flat from consensus itself vs later processing removing signal?

- **Later processing** (calibration + odds-bucket haircut path) is **identity** on this run: raw = calibrated = effective.
- Therefore **flat vs parity** is **not** caused by downstream deflation of signal; it reflects **merge-time consensus** centered near 0.5 with **parity fair aligned to that same center** (Phase L), so **`effectiveTrueProb − fairProbChosenSide`** stays at numerical noise.

### 5) Single next phase recommendation

**Phase O — PP merge-time `trueProb` / consensus aggregator counterfactuals (read-only):** on a **frozen** set of merged rows (or replayed odds), simulate **alternate consensus rules** (e.g. unweighted mean of book de-vig, median book, single-pinny only) and report whether **any** alternative creates **economically material** `trueProb − parityFair` **before** touching production merge — since probability post-processing is currently a no-op and cannot restore edge.

## Evidence snapshot

From `diag_pp_effective_trueprob_decomp.ts` output (`2026-03-24`):

- `calibrationGate.activeProbabilityCalibration`: **false**
- `off` / `on`: `delta_calibrated_minus_raw.mean`: **0**; `delta_effective_minus_calibrated.nHaircutStrict`: **0**; `parityLegEdge.countGtEcon`: **0**
