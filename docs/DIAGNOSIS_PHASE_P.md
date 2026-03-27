# Phase P — PP consensus dispersion in operator diagnostics

**Purpose:** make **tight vs dispersed** multi-book PP consensus visible in existing merge / leg artifacts **without** changing consensus math, EV, or gates.

## Assumptions

- **Per-row** metrics match merge Phase 7.3 pool (exact-first line set, Phase K PP non-PP preference) and **de-vig over** probability spread across that pool.
- **`ppConsensusDevigSpreadOver`:** `max(de-vig over) − min(de-vig over)` among consensus books; **`0`** when a single book remains.
- **Aggregate** block is a simple mean / p95 over **PP merged** rows only.

## Files inspected

- `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE_GUARDRAILS.md`, `docs/OPERATIONS_RUNBOOK.md`
- `src/merge_odds.ts`, `src/reporting/merge_quality.ts`, `src/reporting/merge_audit.ts`, `src/reporting/live_input_quality_dashboard.ts`
- `src/calculate_ev.ts`, `src/run_optimizer.ts`, `src/types.ts`

## Files changed

- `src/types.ts` — `MergedPick` / `EvPick`: optional `ppNConsensusBooks`, `ppConsensusDevigSpreadOver`.
- `src/merge_odds.ts` — compute fields on PP merged rows; `MergeStageAccounting.ppConsensusDispersion` aggregate; `PpConsensusDispersionSummary` type export.
- `src/calculate_ev.ts` — carry fields through on PP legs.
- `src/run_optimizer.ts` — CSV + JSON leg exports include new columns / keys.
- `src/reporting/merge_quality.ts` — `formatPpConsensusOperatorLine`, `ppConsensusDispersion` on full report, `ppConsensusOperatorLine` on summary + status JSON; schema **v4**; markdown section.
- `src/reporting/merge_audit.ts` — markdown section for PP consensus.
- `src/reporting/live_input_quality_dashboard.ts` — parse optional `ppConsensusOperatorLine` from status / full JSON.
- `tests/phase116_live_input_quality_dashboard.spec.ts` — fixture schemaVersion **4**.
- `docs/DIAGNOSIS_PHASE_P.md`, `docs/CURRENT_STATE.md`

## Exact behavior changed (product)

- **Consensus `trueProb` / matching / EV / gating:** **unchanged** (refactored loop uses precomputed `devigPairs` only for consistency with prior weighted math).
- **New:** reporting-only fields on PP merged legs and merge-quality / audit artifacts.

## Operator surfaces

| Artifact / output | What was added |
|-------------------|----------------|
| `data/reports/latest_merge_quality.json` | `ppConsensusDispersion` object; summary / status: `ppConsensusOperatorLine`. |
| `data/reports/latest_merge_quality.md` | Section **PP consensus (Phase P)**. |
| `data/reports/merge_quality_status.json` | `ppConsensusOperatorLine` (compact). |
| `data/reports/latest_merge_audit.md` | Section **PP consensus dispersion**. |
| `artifacts/merge_stage_accounting.json` | `stageAccounting.ppConsensusDispersion`. |
| `prizepicks-legs.csv` / `.json` | `ppNConsensusBooks`, `ppConsensusDevigSpreadOver` per leg |

## Validation commands run

```powershell
npx jest tests/phase40_merge_quality.spec.ts tests/phase41_merge_quality_enforcement.spec.ts tests/phase42_merge_quality_operator.spec.ts tests/phase116_live_input_quality_dashboard.spec.ts tests/phase7_model_input_guardrail.spec.ts tests/phase73_gating_metric_correction.spec.ts
```

## Single next phase recommendation

**Phase Q — Dashboard UI:** surface **`ppConsensusOperatorLine`** (and/or numeric block from `latest_merge_quality.json`) on **Diagnostics** or **Overview** so operators see tight-consensus slates without opening JSON— **read-only UI**, same synced reports.
