# Merge report audit (run every morning)

The **merge audit** reads `merge_report.csv` (from a pipeline run with `EXPORT_MERGE_REPORT=1`) and writes **`merge_audit_report.md`** with:

- **Summary** – total picks, matched count, no_candidate / line_diff / juice counts.
- **Suggested aliases** – when `sgo_imported.csv` and `prizepicks_imported.csv` exist, the script finds no_candidate picks that have exactly one SGO row for the same stat/sport/line (±1) and suggests adding that PP player name → SGO normalized name to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts`.
- **No-candidate sample** – if no aliases are suggested, a table of (player, stat, line, sport) so you can manually compare with the imported CSVs.
- **Line-diff sample** – picks where name matched but odds line was off by more than 1.

## How to run the audit every morning

### Option A: After your normal pipeline (recommended)

1. Run the pipeline **with** the merge report enabled:
   ```powershell
   $env:EXPORT_MERGE_REPORT = "1"
   .\run-nba.ps1
   ```
2. Then run the audit:
   ```powershell
   npm run audit-merge
   ```
3. Open **`merge_audit_report.md`** and apply any suggested aliases in `src/merge_odds.ts` (and re-run later to confirm).

### Option B: One-click “morning run” (pipeline + audit)

Use the script that runs the pipeline with the report then runs the audit:

```powershell
.\scripts\run_morning_with_audit.ps1
```

(Or schedule this script in Task Scheduler for a fixed time each morning.)

### Option C: Audit an existing report only

If you already have `merge_report.csv` from a previous run:

```powershell
npm run audit-merge
```

For best alias suggestions, keep **`sgo_imported.csv`** and **`prizepicks_imported.csv`** in the project root (from the same run that produced `merge_report.csv`).

## Scheduling (Windows Task Scheduler)

1. Open **Task Scheduler** → Create Basic Task.
2. Trigger: **Daily**, at the time you want (e.g. 7:00 AM).
3. Action: **Start a program** → Program: `powershell.exe` → Arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\path\to\nba-props-optimizer\scripts\run_morning_with_audit.ps1"`.
4. Start in: your project folder (so `merge_report.csv` and the audit output go to the right place).

After the task runs, open **`merge_audit_report.md`** and add any suggested aliases to `src/merge_odds.ts` when they look correct.
