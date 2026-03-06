# DFS — Full Fresh Data Run + Minimal Deploy Package

## Part 1: Commands that generate production CSVs

| Command | What it does |
|--------|----------------|
| `npm run generate:production` | Runs `node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines`. Fetches PP + UD props, merges odds, builds cards, writes CSVs to **project root**. |
| **Exact one-liner** | `node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines` |

**Outputs (project root):**
- `prizepicks-legs.csv`, `prizepicks-cards.csv`
- `underdog-legs.csv`, `underdog-cards.csv`

Dashboard reads **`/data/underdog-cards.csv`** (and can use others). On deploy that is **dfs/data/**; locally the build uses **web-dashboard/public/data/** → copied to **web-dashboard/dist/data/** by Vite.

---

## Part 2: Stale outputs deleted (no source code)

- **Root:** `prizepicks-cards.csv`, `prizepicks-legs.csv`, `underdog-cards.csv`, `underdog-legs.csv`
- **web-dashboard/dist/data/*.csv**
- **web-dashboard/public/data/*.csv**

Cache: Optimizer can use in-memory/disk cache for odds; for a full fresh run, deleting the four CSVs above is sufficient so the pipeline overwrites them. No source files are removed.

---

## Part 3: Full production pipeline (single script)

**Command:**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fresh_data_run.ps1
```

**Script does:**
1. Delete stale CSVs (root + web-dashboard/dist/data + web-dashboard/public/data).
2. Run `node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines`.
3. Copy root `prizepicks-*.csv`, `underdog-*.csv` → `web-dashboard/public/data/`.
4. Run `npm run build` in web-dashboard.
5. Validate **web-dashboard/dist/data/** for all four CSVs; require each to have ≥1 data row (not header-only).
6. Exit 1 if any missing or header-only.

---

## Part 4: Validation (row count, header, header-only)

After the script (or manual run), validate:

| File | Path | Row count | Header | Header-only? |
|------|------|-----------|--------|---------------|
| underdog-cards.csv | web-dashboard/dist/data/underdog-cards.csv | *(script prints)* | *(script prints)* | Fail if 0 rows |
| underdog-legs.csv  | web-dashboard/dist/data/underdog-legs.csv  | *(script prints)* | *(script prints)* | Fail if 0 rows |
| prizepicks-cards.csv | web-dashboard/dist/data/prizepicks-cards.csv | *(script prints)* | *(script prints)* | Fail if 0 rows |
| prizepicks-legs.csv  | web-dashboard/dist/data/prizepicks-legs.csv  | *(script prints)* | *(script prints)* | Fail if 0 rows |

**Fail the run if:** any of the four is missing or has 0 data rows.

---

## Part 5: If a file is empty — trace backward

- **underdog-cards.csv / underdog-legs.csv**  
  Produced in `run_underdog_optimizer.ts`: `writeUnderdogCardsToFile`, and legs CSV write.  
  Empty → UD API returned no props, or filters (min EV, factor ≥1, etc.) removed all legs/cards. Check logs for `[UD]`, SGO/odds merge, and `run_optimizer` calling the UD path.

- **prizepicks-cards.csv / prizepicks-legs.csv**  
  Produced in `run_optimizer.ts` (PP legs CSV, PP cards CSV).  
  Empty → PP fetch or merge returned no legs, or card builder produced no cards above threshold. Check `[PP]` logs and any “Wrote prizepicks-legs.csv (0 rows)” messages.

- **SGO “0 alt lines”**  
  With `--no-require-alt-lines`, the run can continue; without it, the pipeline can bail and write empty CSVs. Use `--no-require-alt-lines` for production.

---

## Part 6: App.tsx Sport / sport

**Confirmed:** `web-dashboard/src/App.tsx` normalizes CSV rows so either header works:

- Filters on `row.sport != null || row.Sport != null`.
- Maps to a single field: `sport: row.sport ?? row.Sport`.
- So both `Sport` and `sport` from the CSV produce a normalized `sport` for the table.

---

## Part 7: Fresh run result (this run)

- **Exact command run:**  
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fresh_data_run.ps1`
- **Error:** Node wrote to stderr: `[SGO Phase 1] WARNING: [SGO] 0 alt lines returned for NBA.`  
  PowerShell treated stderr as an error; script was updated to capture output and exit code correctly.
- **Root CSVs after run:** None of the four production CSVs were present at root (generator likely exited or didn’t complete; APIs/network may be involved).
- **Recommendation:** **Fix generator first.** Run `node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines` in a normal terminal and confirm the four CSVs appear at root with data rows. Then run `scripts/fresh_data_run.ps1` again (or run steps 3–5 manually: copy to public/data → build dashboard → validate dist/data).

---

## Part 8: Minimal deploy package + dashboard verification

### 8.1 Current build (web-dashboard/dist)

- **index.html** — references `/assets/index-Cg088Hr1.js` and `/assets/index-Bp19Zl4m.css`.
- **assets/index-Cg088Hr1.js** — current hashed JS bundle (Sport/sport fix included).
- **assets/index-Bp19Zl4m.css** — current CSS (unchanged).
- **data/** — must contain the four CSVs from a successful fresh run (otherwise table will be empty).

### 8.2 Files to replace on server (dfs)

| Local file | Upload to (server dfs/) |
|------------|--------------------------|
| web-dashboard/dist/index.html | index.html |
| web-dashboard/dist/assets/index-Cg088Hr1.js | assets/index-Cg088Hr1.js |
| web-dashboard/dist/assets/index-Bp19Zl4m.css | assets/index-Bp19Zl4m.css |
| web-dashboard/dist/data/underdog-cards.csv | data/underdog-cards.csv |
| web-dashboard/dist/data/underdog-legs.csv | data/underdog-legs.csv |
| web-dashboard/dist/data/prizepicks-cards.csv | data/prizepicks-cards.csv |
| web-dashboard/dist/data/prizepicks-legs.csv | data/prizepicks-legs.csv |

Do **not** change .htaccess, .htpasswd, or auth in this step.

### 8.3 Browser verification checklist

1. Open **http://gamesmoviesmusic.com/** (or https if configured).
2. **F12 → Network:**  
   - JS: **index-Cg088Hr1.js** → **200**  
   - CSS: **index-Bp19Zl4m.css** → **200**  
   - **/data/underdog-cards.csv** → **200**
3. **Table:** Renders at least one row (if CSV has data).
4. **Console:** No 404s; no red errors.

### 8.4 Pass/fail

- **Pass:** JS 200, CSS 200, underdog-cards.csv 200, table shows rows (when CSV has rows), no 404s.
- **Fail (CSV 200 but table empty):** Frontend filter/mapping — confirm CSV has header `Sport` or `sport` and data rows; App.tsx already maps both to `sport`. If still empty, check browser Network response body for underdog-cards.csv and confirm rows exist and column names match.

### 8.5 Current hashed JS filename

- **index-Cg088Hr1.js** (CSS unchanged: index-Bp19Zl4m.css).

---

## Summary

- **Exact commands:**  
  - Full pipeline: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fresh_data_run.ps1`  
  - Generator only: `npm run generate:production` or `node scripts/run-generate.js --platform both --bankroll 600 --volume --no-require-alt-lines`
- **Row counts this run:** Generator did not complete; no four CSVs at root → validation not run.
- **Recommendation:** **Fix generator first** (run generator manually, confirm four CSVs with data, then re-run fresh_data_run.ps1 or copy → build → validate). After that, use the minimal deploy list and browser checklist above for **ready to deploy**.
