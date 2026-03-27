# Phase R — Explore Legs per-leg PP consensus visibility

## Purpose

Let operators see **`ppNConsensusBooks`** and **`ppConsensusDevigSpreadOver`** on individual PP legs in **Explore Legs → Top legs** without opening exported CSVs.

## Assumptions

- Synced `web-dashboard/public/data/prizepicks-legs.csv` includes Phase P columns when the pipeline that produced the snapshot is Phase P+ (older snapshots show **—** in the new cells).
- UI-only: no merge, EV, or selection changes.

## Files inspected

- `docs/CURRENT_STATE.md`, `web-dashboard/src/App.tsx`, `web-dashboard/src/components/TopLegsView.tsx`
- `src/run_optimizer.ts` (CSV header confirmation)

## Files changed

- `web-dashboard/src/App.tsx` — `TopLegRow` + `toTopLeg` parsing; leg CSV export columns
- `web-dashboard/src/components/TopLegsView.tsx` — PP-only table columns + tooltips
- `docs/CURRENT_STATE.md` — Phase R line
- `docs/DIAGNOSIS_PHASE_R.md` — this note

## Behavior

- **PP Top Legs** table gains two columns (**PP books**, **DV sprd O**) after **BE%**. Headers have `title` tooltips tied to the canonical field names.
- **UD Top Legs** table unchanged (no extra columns).
- Missing or non-numeric CSV values render **—**.
- **Export visible table** for top legs includes `PP consensus books` and `PP DV spread (over)` (empty for UD rows / missing data).

## Validation

- `npm run build` in `web-dashboard/`

## Next phase (one recommendation)

**Phase S — Explore triage controls:** optional **sort** and/or **filter** on PP consensus columns (e.g. max DV spread, min book count) so operators can isolate tight-cluster legs without scrolling the full top-N list.
