# Phase Q — Dashboard UI for PP consensus dispersion

## Purpose

Surface the Phase P PP consensus breadth / de-vig dispersion signal in the operator dashboard so tight multi-book clustering (flat slate) is visible without opening raw merge-quality JSON.

## Assumptions

- Synced artifacts under `web-dashboard/public/data/reports/` include `merge_quality_status.json` and/or `latest_merge_quality.json` from a Phase P+ pipeline (optional `ppConsensusOperatorLine`, full report optional `ppConsensusDispersion`).
- UI is read-only; no changes to merge math, EV, thresholds, or selection.

## Files inspected

- `docs/CURRENT_STATE.md`, `src/reporting/live_input_quality_dashboard.ts`, `web-dashboard/src/components/LiveInputQualityPanel.tsx`
- `tests/phase116_live_input_quality_dashboard.spec.ts`

## Files changed

- `src/reporting/live_input_quality_dashboard.ts` — `PpConsensusDispersionDashboard`, parse `ppConsensusDispersion` from full merge-quality JSON
- `web-dashboard/src/components/LiveInputQualityPanel.tsx` — “PP consensus dispersion” block (operator line + numeric grid)
- `tests/phase116_live_input_quality_dashboard.spec.ts` — parser coverage for Phase P fields
- `docs/CURRENT_STATE.md` — Phase Q line
- `docs/DIAGNOSIS_PHASE_Q.md` — this note

## Behavior

- **Live input quality** panel (Overview / Diagnostics via existing IA): shows a highlighted subsection when `ppConsensusOperatorLine` and/or numeric `ppConsensusDispersion` is present.
- Operator line source: `merge_quality_status.json` first, else `latest_merge_quality.json`.
- Numeric grid is filled only when the full report exposes `ppConsensusDispersion` (typically `latest_merge_quality.json` after sync).

## Validation

- `npx jest tests/phase116_live_input_quality_dashboard.spec.ts`
- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase R — Explore Legs columns:** add optional sortable columns for per-leg `ppNConsensusBooks` / `ppConsensusDevigSpreadOver` from synced legs data so operators can drill from slate-level dispersion to individual legs without CSV hunting.
