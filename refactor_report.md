# Pipeline Refactor Report: Centralized Paths, Fail-Fast, Env Isolation, Data Validation

## Summary

This refactor turns the pipeline into a high-integrity data generation system by:

1. **Centralized path management** — All pipeline output paths live in `src/constants/paths.ts` and `scripts/_paths.ps1`.
2. **Fail-fast automation** — Scripts validate that expected output files exist before reporting success.
3. **Environment isolation** — `BANKROLL` and `EXPORT_MERGE_REPORT` are cleared after use and logged before/after.
4. **Data validation** — Output files are validated (non-empty, valid JSON/CSV) before the pipeline reports "Complete."

---

## Task 1: Centralized Path Management

### New Files

| File | Purpose |
|------|--------|
| `src/constants/paths.ts` | Single source of truth for output/artifacts/data dirs and filenames. Exports `OUTPUT_DIR`, `getOutputPath()`, `getOutputDir()`, `getArtifactsPath()`, `getDataPath()`, and filename constants. |
| `scripts/_paths.ps1` | PowerShell mirror: `$OutputDir`, `$ArtifactsDir`, `$DataDir`, `$FileNamePpLegsCsv`, etc. Dot-source from other scripts. |

### Modified Files (src/) — use path constants

| File | Changes |
|------|--------|
| `src/run_optimizer.ts` | Imports path helpers; ensures `getOutputDir()` exists; all legs/cards/tiers/artifacts/data paths use `getOutputPath`, `getArtifactsPath`, `getDataPath`, and constants. Sets `OUTPUT_DIR` in env for Python. |
| `src/run_underdog_optimizer.ts` | Imports path helpers; ensures output dir exists; legs/cards/top_legs paths use `getOutputPath` / `getDataPath`. |
| `src/export_imported_csv.ts` | All CSV writes use `getOutputPath(PP_IMPORTED_CSV)`, `getOutputPath(UD_IMPORTED_CSV)`, `getOutputPath(MERGE_REPORT_CSV)`, `getOutputPath(ODDSAPI_IMPORTED_CSV)`. |
| `src/merge_odds.ts` | Merge report writes use `getOutputPath(\`merge_report_${reportSite}.csv\`)` and timestamped variant. |
| `src/backfill_perf_tracker.ts` | Leg and tier CSV reads use `getOutputPath(PP_LEGS_CSV)`, `getOutputPath(UD_LEGS_CSV)`, `getOutputPath(TIER1_CSV)`, `getOutputPath(TIER2_CSV)`. |
| `src/server.ts` | Card/leg JSON reads use `getOutputPath(..., ROOT)` and `getDataPath(TOP_LEGS_JSON, ROOT)`; `TASKS_LOG_PATH` and tracking paths use `ARTIFACTS_DIR` / `DATA_DIR`. |

### Modified Files (scripts/) — use _paths.ps1

| File | Changes |
|------|--------|
| `scripts/run_optimizer.ps1` | Dot-sources `_paths.ps1`; metrics and fail-fast use `$OutputDir` + `$FileNamePpLegsCsv` etc. |
| `scripts/refresh.ps1` | Dot-sources `_paths.ps1`; PP/UD CSV paths and copy step use `Join-Path $Root (Join-Path $OutputDir $f)`. |
| `scripts/2pm_models.ps1` | Dot-sources `_paths.ps1`; fail-fast uses `$ArtifactsDir` for sentinel. |
| `scripts/6pm_cards.ps1` | Dot-sources `_paths.ps1`; fail-fast uses `$OutputDir` and `$ArtifactsDir` for expected outputs. |

### Python

| File | Changes |
|------|--------|
| `sheets_push_cards.py` | Reads CSVs from `os.environ.get("OUTPUT_DIR", ".")` so it uses `data/output_logs` when the pipeline sets `OUTPUT_DIR`. |

### Paths Not Centralized (intentional)

- **Input files** (e.g. `underdog_props_scraped.json`, `underdog_manual_props.json`, `pp_projections_sample.json`) remain at project root or in `data/`; they are not pipeline outputs.
- **Cache / DB / tracking** paths (e.g. `data/oddsapi_today.json`, `data/tracking/`, `results/results.db`) are unchanged; only pipeline output CSVs/JSONs were moved under `OUTPUT_DIR`.

### No Hardcoded Pipeline Output Paths Remaining

- All pipeline **writes** of legs, cards, tiers, merge reports, and imported CSVs go through `getOutputPath()` or `getDataPath()` / `getArtifactsPath()`.
- All **reads** of those outputs in `src/` and in the updated scripts use the same constants or `_paths.ps1` variables. No remaining hardcoded `"prizepicks-legs.csv"` or `"data/output_logs"` for pipeline outputs outside `paths.ts` and `_paths.ps1`.

---

## Task 2: Fail-Fast Automation

### scripts/train_models.ps1

- **Fail-fast:** Writes sentinel `artifacts\train_models_done.txt` at end (no-op pipeline still creates it).
- **Legacy Python:** All Python execution remains commented out with a "Do not re-enable" note.

### scripts/2pm_models.ps1

- **Fail-fast:** Before printing "Models retrained", checks `Test-Path $sentinel` for `artifacts\train_models_done.txt`; throws if missing.
- **Legacy Python:** Block remains commented with "Do not re-enable."

### scripts/6pm_cards.ps1

- **Fail-fast:** Before "Final cards ready", requires at least one of `data\output_logs\underdog-cards.csv` or `artifacts\last_run.json`; throws with "CRITICAL: Pipeline output missing" if neither exists.
- **Legacy Python:** Parlay builder block remains commented with "Do not re-enable."

### scripts/run_optimizer.ps1

- **Fail-fast:** After the node run, before writing artifacts contract, requires at least one of `data\output_logs\prizepicks-legs.csv` or `data\output_logs\underdog-cards.csv`; throws "CRITICAL: Pipeline output missing" if neither exists.

---

## Task 3: Environment Isolation

### scripts/run_optimizer.ps1

- **Before run:** Appends `ENV before run: BANKROLL=<value>` to the run log.
- **After run:** In a `finally` block after `Invoke-NativeWithLogging` for the node process: `Remove-Item Env:BANKROLL -ErrorAction SilentlyContinue` and appends `ENV after run: BANKROLL cleared` to the log.
- No changes inside `Invoke-NativeWithLogging`; env is set by the script and cleared by the script.

### Other scripts

- **scripts/run-both.ps1:** Clears `Env:BANKROLL` after the optimizer run (on both success and failure paths).
- **scripts/run_morning_with_audit.ps1:** Clears `Env:EXPORT_MERGE_REPORT` after the audit step.
- **scripts/refresh.ps1:** Clears `Env:EXPORT_MERGE_REPORT` at end of script.

---

## Task 4: Data Validation for Tomorrow's Parlays

### New File

| File | Purpose |
|------|--------|
| `src/utils/data_validator.ts` | `validateOutputData(root?)` checks that files under `data/output_logs` (or given root) exist, are non-empty, and that JSON files parse and CSV files have at least a header. If no legs/cards CSV exists, adds a CRITICAL error. Returns `{ ok, errors }`. |

### Integration

- **src/run_optimizer.ts:** At the end of the `platform === "both"` flow, after `writeTopLegsJson`, calls `validateOutputData()`. If `!validation.ok`, throws so the process exits with an error and the pipeline does not report "Complete" with invalid or missing output.

---

## Reporting: Modified Files Checklist

| Area | File | Status |
|------|------|--------|
| **New** | `src/constants/paths.ts` | Created |
| **New** | `scripts/_paths.ps1` | Created |
| **New** | `src/utils/data_validator.ts` | Created |
| **Paths** | `src/run_optimizer.ts` | Updated |
| **Paths** | `src/run_underdog_optimizer.ts` | Updated |
| **Paths** | `src/export_imported_csv.ts` | Updated |
| **Paths** | `src/merge_odds.ts` | Updated |
| **Paths** | `src/backfill_perf_tracker.ts` | Updated |
| **Paths** | `src/server.ts` | Updated |
| **Paths** | `scripts/run_optimizer.ps1` | Updated |
| **Paths** | `scripts/refresh.ps1` | Updated |
| **Paths** | `scripts/2pm_models.ps1` | Updated |
| **Paths** | `scripts/6pm_cards.ps1` | Updated |
| **Paths** | `sheets_push_cards.py` | Updated |
| **Fail-fast** | `scripts/train_models.ps1` | Updated |
| **Fail-fast** | `scripts/2pm_models.ps1` | Updated |
| **Fail-fast** | `scripts/6pm_cards.ps1` | Updated |
| **Fail-fast** | `scripts/run_optimizer.ps1` | Updated |
| **Env** | `scripts/run_optimizer.ps1` | Updated |
| **Env** | `scripts/run-both.ps1` | Updated |
| **Env** | `scripts/run_morning_with_audit.ps1` | Updated |
| **Env** | `scripts/refresh.ps1` | Updated |
| **Validation** | `src/run_optimizer.ts` | Validator integrated |

---

## Verification

- **TypeScript:** `npx tsc --noEmit` passes.
- **Pipeline outputs** now live under `data/output_logs/` (OUTPUT_DIR). Any script or reader that expects legs/cards/tiers at project root must use the new paths (via constants or `_paths.ps1`).
- **No hardcoded pipeline output paths** remain for the centralized paths; only `paths.ts` and `_paths.ps1` define them.
