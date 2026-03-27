# Validation / provenance — operator runbook

**Scope:** Read-only reporting on **`perf_tracker`**, legs archives (**`data/legs_archive/<legsSnapshotId>/`**), and related artifacts. **Does not** change EV, breakeven, edge math, or optimizer selection (see **`math_models/`** boundary).

**Authoritative commands** are **`package.json`** **`scripts`**; behavior is implemented under **`src/reporting/`** (not duplicated here).

---

## Command matrix

| npm script | What it runs | Primary artifacts under `data/reports/` |
|------------|----------------|----------------------------------------|
| **`export:feature-validation-replay-readiness`** | Phase 106 graded segmentation | `latest_feature_validation_replay_readiness.json` / `.md` |
| **`export:legs-snapshot-adoption`** | Phase 104 tracker adoption vs legacy | `latest_legs_snapshot_adoption.json` / `.md` |
| **`export:feature-validation-overview`** | Phase 108 consolidated overview (calls replay + adoption builders) | `latest_feature_validation_overview.json` / `.md` |
| **`refresh:validation-reporting`** | Phase 110–112: replay → adoption → overview → **`sync:dashboard-reports`**, then writes freshness | Same as above + `latest_validation_reporting_freshness.*`; copies to `web-dashboard/public/data/reports/` (required 4 JSON + optional overview + optional freshness) |
| **`sync:dashboard-reports`** | Copies pipeline JSON into dashboard public tree | See `scripts/sync_dashboard_reports.ts` |
| **`postrun:model-refresh`** | `post_run_model_refresh.ps1`: capture → **`refresh:model-artifacts`** → **`refresh:validation-reporting`** | Model + validation chain; logs `data/logs/post_run_model_refresh.log` |
| **`run:with-post-refresh`** | Main run (default `run_optimizer.ps1 -Force`) then **`postrun:model-refresh`** if main exits 0 | Same post-run artifacts |

**Feature validation picks export** (grounded **`EvPick[]`** for outcome validation):

| npm script | Notes |
|------------|--------|
| **`export:feature-validation-picks`** | `--policy=`, **`FEATURE_VALIDATION_POLICY`** env, **`--enforce-snapshot`**, **`FEATURE_VALIDATION_SNAPSHOT_ENFORCE=1`**, **`--no-snapshot-status`**, **`--no-policy-status`**. Defaults: policy **`snapshot_preferred`**; writes `data/reports/feature_validation_input.json` (default out), `latest_feature_validation_snapshot_status.*` (unless `--no-snapshot-status`), policy status (unless `--no-policy-status`). |

---

## Policy choice (`export:feature-validation-picks`)

| Policy | When to use |
|--------|-------------|
| **`snapshot_preferred`** | Default. Join snapshot archive when **`legsSnapshotId`** is set; otherwise global legs map. |
| **`legacy_best_effort`** | Join everything via global legs CSV/JSON only (ignore snapshot dirs for joins). Legacy-inclusive debugging. |
| **`snapshot_strict`** | Only graded rows **with** **`legsSnapshotId`**; rows without are excluded from export. Strict replay workflow. |

Enforcement: **`--enforce-snapshot`** / env — fail export when any snapshot-bound row does not resolve (script exits non-zero).

---

## Interpreting outputs

### Overview summary line (`feature_validation_overview …`)

Printed by **`export:feature-validation-overview`** / **`refresh:validation-reporting`**. Contains: **`policy=`**, **`graded=`**, **`replay_ready=`**, **`strict_eligible=`**, **`missing_snapshot_dir=`**, **`legacy_wo_sid=`**, snapshot-bound counts, **`blocked_new_wo=`** / **`override_appends=`** (**`na`** when Phase 105 enforcement artifact absent). Full semantics: Phase 108 in **`docs/PROJECT_STATE.md`**.

### Freshness (`latest_validation_reporting_freshness.json`)

Written only after a **successful** **`refresh:validation-reporting`**. Compares mtime of repo **`latest_feature_validation_overview.json`** vs dashboard copy under **`web-dashboard/public/data/reports/`**.

| `classification` | Meaning |
|------------------|---------|
| **fresh** | Dashboard copy exists and is not older than repo overview. |
| **stale** | Dashboard copy missing or older than repo — run **`sync:dashboard-reports`** after regenerating overview, or run full **`refresh:validation-reporting`**. |
| **unknown** | Repo overview missing or mtime unreadable. |

### Replay readiness (Phase 106)

Key counts in **`latest_feature_validation_replay_readiness.json`**: **`replay_ready_snapshot_bound`**, **`snapshot_bound_missing_snapshot_dir`**, **`legacy_without_snapshot_id`**, **`strict_validation_eligible`**, ineligible breakdown. Deduped graded rows, same basis as export.

### New-row enforcement (Phase 105)

Optional input to overview from **`latest_tracker_snapshot_new_row_enforcement.json`** (backfill runs). **`blocked_new_wo`** / **`override_appends`** in overview line show **`na`** when that file is absent.

---

## Common failures and next actions

| Symptom | Next action |
|---------|-------------|
| **`refresh:validation-reporting` exits 1** on a named step | Read stderr; fix underlying export (e.g. missing **`data/reports`** prerequisites). See Phase 110 step ids in console. |
| **`postrun:model-refresh` exits 1** | Check `data/logs/post_run_model_refresh.log` JSON-lines: failed step (**`capture_snapshot`**, **`refresh_model_artifacts`**, **`refresh_validation_reporting`**). |
| Dashboard panel: overview missing | Run **`export:feature-validation-overview`** (or **`refresh:validation-reporting`**) then **`sync:dashboard-reports`**. |
| Dashboard: freshness missing / invalid | Run **`refresh:validation-reporting`** then **`sync:dashboard-reports`**. |
| **`enforce-snapshot`** / enforcement failed on picks export | Resolve snapshot dirs / leg matches for **`legsSnapshotId`** rows; see **`latest_feature_validation_snapshot_status.json`**. |
| Stale freshness but repo updated | Run **`sync:dashboard-reports`** or full **`refresh:validation-reporting`**. |

---

## Related docs

- **`docs/PROJECT_STATE.md`** — phase history and **`verify:canonical`** regression tests.
- Dashboard UI: **`FeatureValidationOverviewPanel`** (Phase 109–112) reads synced JSON under **`web-dashboard/public/data/reports/`**.
