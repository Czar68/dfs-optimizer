# Infrastructure & Architecture Audit (Post-Cleanup)

Date: 2026-03-11

Scope: static audit only (no runtime execution). Reviewed `scripts/`, `src/`, `data/`, and dependency wiring in `package.json`.

## Infrastructure Audit Task List

1. Script topology and orchestration review (`scripts/`), including path handling and execution context assumptions.
2. Application runtime review (`src/`), with focus on CWD anchoring and file output conventions.
3. Dependency risk review (`package.json`) for unused, conflicting, or deployment-sensitive packages.
4. Environment-Variable Leakage review (variables set in scripts and not reset, and env-gated behavior in `src/`).
5. Path Resolution Check: Identify any remaining hardcoded paths in the scripts/ or src/ files that point to project-root-level CSVs. Ensure all data-writing operations now default to data/output_logs/.

## What works well

- `src/run_optimizer.ts` now has CommonJS-safe path-neutral initialization (`__dirname` + `process.chdir`) at startup, and compiled output confirms it runs before most local module loads.
- `scripts/run_optimizer.ps1` is significantly hardened for Windows paths with spaces:
  - uses `Start-Process -FilePath "$Command"`
  - uses explicit `-WorkingDirectory "$root"`
  - captures stdout/stderr separately and appends to run logs.
- Python legacy logic is now archived under `legacy/python_archive/` and no longer actively invoked in the sanitized scripts.
- `tsconfig.json` structure is coherent for CommonJS output (`rootDir: "."`, include `src/**/*` and `math_models/**/*`, exclude `dist`).

## Infrastructure Flaws

- **Root-level CSV assumptions still dominate pipeline I/O (not migrated to `data/output_logs/`)**
  - Writes in `src/run_optimizer.ts`: `prizepicks-legs.csv`, `prizepicks-cards.csv`, `underdog-cards.csv`, `tier1.csv`, `tier2.csv`, `edge-clusters.json`, `stat-balance-radar.svg` (e.g., lines 1198, 1217, 1280, 1456, 1511, 1516).
  - Writes in `src/run_underdog_optimizer.ts`: `underdog-legs.csv`, `underdog-cards.csv` (lines 634, 794).
  - Writes in `src/export_imported_csv.ts`: `prizepicks_imported.csv`, `underdog_imported.csv`, `merge_report.csv` default (lines 88, 118, 132).
  - Writes in `src/merge_odds.ts`: timestamped `merge_report_*.csv` directly under project root (lines 1068-1069).
  - Reads in `src/backfill_perf_tracker.ts`: expects root-level `prizepicks-legs.csv`, `underdog-legs.csv`, `tier1.csv`, `tier2.csv` (lines 75, 140).

- **Script layer still reads root-level CSVs, creating drift from new `data/output_logs/` location**
  - `scripts/run_optimizer.ps1` reads `prizepicks-legs.csv` and `underdog-cards.csv` for run metrics (lines 93-94).
  - `scripts/refresh.ps1`, `scripts/perf-report.ps1`, `scripts/quick_view.ps1`, `scripts/fresh_data_run.ps1`, `scripts/health_check.ps1` all reference root-level CSV names.
  - `scripts/audit_merge_report.ts` still points to root-level `merge_report*.csv` and `*_imported.csv`.

- **Environment-Variable Leakage risk**
  - `scripts/run_morning_with_audit.ps1` sets `$env:EXPORT_MERGE_REPORT = "1"` and does not restore prior value (line 13).
  - `scripts/refresh.ps1` sets `$env:EXPORT_MERGE_REPORT = "1"` (line 86), also not restored.
  - `scripts/run_optimizer.ps1`, `scripts/run-both.ps1`, and `scripts/daily-run.ps1` set `$env:BANKROLL`; no restore behavior.
  - In long-lived shells/schedulers this can bleed into subsequent runs and produce non-obvious behavior changes.

- **Hardcoded machine-specific paths (leaky abstraction)**
  - `scripts/auto_mode.ps1`: hardcoded `C:\Users\Media-Czar Desktop\Dev\master_auto\scripts\master_auto.ps1` (line 9).
  - `scripts/run_selective.ps1`: hardcoded `C:\Users\Media-Czar Desktop\Dev\master_auto` (line 11).
  - These break portability and can fail silently on other hosts/users.

- **Pipeline bottleneck / silent-success risk**
  - `scripts/train_models.ps1` currently has the model commands fully commented; script exits successfully but performs no training.
  - `scripts/2pm_models.ps1` still emits `"Models retrained"` after calling `train_models.ps1`, which is now effectively a no-op.
  - `src/run_optimizer.ts` captures `const sheetsExit = runSheetsPush(runTimestamp);` but does not enforce/branch on it in unified flow (line 1617), allowing downstream steps to proceed even if Sheets push failed.

- **Dependency risks**
  - `csv-parser` appears unused in project TS/JS code.
  - Root `papaparse` appears unused by root pipeline while `web-dashboard/` has its own `papaparse` dependency; duplication increases drift risk.
  - `ssh2-sftp-client` is in `devDependencies` but used by runtime deploy scripts (`scripts/deploy-ftp.js`, `scripts/deploy-sftp-gh.js`, etc.); production installs with `--omit=dev` will fail with `MODULE_NOT_FOUND`.
  - Mixed HTTP clients (`axios`, `node-fetch`, and global `fetch`) create inconsistent timeout/retry/error behavior across modules.

## Actionable Improvements

1. **Centralize all runtime paths in one resilient module**
   - Add `src/runtime/paths.ts` with canonical helpers (example: `getOutputDir()`, `outputFile(name)`, `legacyFallback(name)`).
   - Default all CSV/JSON exports to `data/output_logs/`.
   - Add self-healing fallback for readers: check `data/output_logs/<file>` first, then root-level `<file>`, and emit one migration warning.
   - This is the single highest-impact resiliency improvement for execution-context drift.

2. **Harden script orchestration and observability**
   - Update `scripts/run_optimizer.ps1` and related scripts to consume `data/output_logs/` paths via a shared variable block.
   - In `scripts/train_models.ps1`, replace commented region with explicit no-op telemetry (e.g., `Write-Host "[DEPRECATED] legacy Python training skipped"`) and set a measurable status output consumed by `2pm_models.ps1`.
   - In `src/run_optimizer.ts`, fail or warn loudly when `runSheetsPush(...)` returns non-zero in unified flow.

3. **Dependency hygiene pass**
   - Remove confirmed-unused packages (starting with `csv-parser`; evaluate root `papaparse`).
   - Move `ssh2-sftp-client` from `devDependencies` to `dependencies` if deploy scripts are expected in production-like environments.
   - Standardize HTTP client strategy (prefer one wrapper for retry/timeout/user-agent semantics) to reduce runtime inconsistency.

---

## Quick conclusion

The architecture is substantially improved post-cleanup (TypeScript/CommonJS core, path-safe optimizer launch), but path conventions are still split: writers/readers heavily assume root-level CSVs while archival moved historic outputs into `data/output_logs/`. The next hardening step is a centralized path layer plus script migration to that layer, which will remove the current leaky abstraction and make runs resilient across shells, schedulers, and host environments.
