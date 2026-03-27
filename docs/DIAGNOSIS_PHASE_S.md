# Phase S — Explore triage controls for PP consensus columns

## Purpose

Speed up operator triage of **tight vs dispersed** PP consensus on merged legs using the Phase R columns, without spreadsheet exports.

## Assumptions

- Same synced **`prizepicks-legs.csv`** contract as Phase P/R.
- UI-only; no pipeline or selection changes.

## Files inspected

- `docs/CURRENT_STATE.md`, `web-dashboard/src/App.tsx`, `web-dashboard/src/components/TopLegsView.tsx`

## Files changed

- `web-dashboard/src/App.tsx` — `TopLegPpConsensusTriage` state, `filterTopLegRows` PP-only presets, `sortTopLegRows` for `ppBooks` / `ppSpread`
- `web-dashboard/src/components/TopLegsView.tsx` — **PP focus** select + four sort options
- `docs/CURRENT_STATE.md`, `docs/DIAGNOSIS_PHASE_S.md`

## Behavior

- **PP focus** (toolbar): **Any** (default, unchanged behavior) · **Tight DV sprd O (≤ 0.015)** · **Wide DV sprd O (≥ 0.022)** · **Many books (≥ 3)**. Applies only to **PP** rows; **UD** rows are unchanged. Presets require the corresponding field to be present; rows missing data are **excluded** when a preset is active.
- **Sort**: **PP books** asc/desc and **DV sprd O** asc/desc; rows with missing PP consensus values sort **after** rows with values.
- **`Wide_spread`** uses **≥ 0.022**; **`tight_spread`** uses **≤ 0.015** (coarse operator cutoffs; not model thresholds).

## Validation

- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase T — Shareable Explore state:** persist **page, tab, PP focus, sort, and top-N limit** in the URL (query params) so operators can bookmark or drop a link in run notes without re-clicking filters.
