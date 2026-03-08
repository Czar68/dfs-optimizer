# DFS — Deploy Fresh Build to Server (htdocs root flat)

**Do not touch:** .htaccess, .htpasswd, auth, cron-generate.py, or server routing.

---

## 0. Automated deploy (no manual upload)

### Option A: GitHub Actions (push = deploy)

On every **push to `main`** that touches `web-dashboard/`, the workflow builds and uploads `web-dashboard/dist/` to IONOS via SFTP.

1. **Add repository secrets** (Settings → Secrets and variables → Actions):
   - `FTP_SERVER` or `SFTP_SERVER` — IONOS SFTP host (see **IONOS SFTP host** below)
   - `FTP_USERNAME` — your FTP/SFTP user
   - `FTP_PASSWORD` — your FTP/SFTP password

2. Push to `main` (or run the workflow manually from the Actions tab: “Deploy Dashboard” → “Run workflow”).

3. **Data:** The workflow builds from the **committed** `web-dashboard/public/data/`. For fresh card data, run `scripts/fresh_data_run.ps1` locally, then commit the updated `public/data/` (and optionally `artifacts/last_fresh_run.json`) and push.

### Option B: Local one-command SFTP deploy

After you run **fresh data + build** (or any build), deploy from your machine with one command:

1. **Install once:** `npm install` (adds `ssh2-sftp-client` for the deploy script).

2. **Set credentials** (PowerShell, or add to your profile):
   ```powershell
   $env:SFTP_SERVER  = "sftp.gamesmoviesmusic.com"   # or IONOS host / IP (see below)
   $env:FTP_USERNAME = "your-ftp-user"
   $env:FTP_PASSWORD = "your-ftp-password"
   ```

3. **Deploy:**
   ```powershell
   npm run deploy:ftp
   ```
   This builds `web-dashboard` then uploads `web-dashboard/dist/` to the server root (or `SFTP_REMOTE_PATH` if set).

**Typical flow:** Run `scripts/fresh_data_run.ps1` (fresh data + build), then `npm run deploy:ftp`. No FileZilla needed.

### IONOS SFTP host / IP

- **Port:** 22 (SFTP).
- **Host:** Use the hostname IONOS shows in your control panel (e.g. `access12345678.webspace-data.io` or `home12345678.1and1-data.host`), or your domain (e.g. `sftp.gamesmoviesmusic.com`), or the server IP.
- Set `SFTP_SERVER` (or `FTP_SERVER`) to that value. Optional: `SFTP_PORT` (default 22), `SFTP_REMOTE_PATH` (default `/`; use e.g. `/htdocs` if your login lands elsewhere).

---

## 1. Build (local)

```bash
cd web-dashboard && npm run build
```

---

## 2. FileZilla fallback: upload dist/ contents to htdocs root

If you don’t use `npm run deploy:ftp`, upload so the **site root** (htdocs) contains `index.html`, `assets/`, and `data/` at top level.

| Local path | → Server path (htdocs root) |
|------------|-----------------------------|
| `dist/index.html` | **root** `index.html` |
| `dist/assets/index-*.css` | `assets/` (e.g. `assets/index-CO7vRrFE.css`) |
| `dist/assets/index-*.js` | `assets/` (e.g. `assets/index-D6SUIt6l.js`) |
| `dist/data/*.csv` | `data/*.csv` |
| `dist/data/last_fresh_run.json` | `data/last_fresh_run.json` |
| `dist/data/results_summary.json` | `data/results_summary.json` |

**Quick FileZilla:** `web-dashboard/dist/` → server ROOT `/kunden/homepages/14/d4299584407/htdocs/` (upload so `index.html`, `assets/`, `data/` are there).

**Short:** `dist/assets/` → `assets/`, `dist/index.html` → root, `dist/data/*` → `data/`.

**Current build (this run):**

- `dist/index.html` → `index.html`
- `dist/assets/index-LphPkF4-.js` → `assets/index-LphPkF4-.js`
- `dist/assets/index-04U58JEK.css` → `assets/index-04U58JEK.css`
- `dist/data/underdog-cards.csv` → `data/underdog-cards.csv`
- `dist/data/underdog-legs.csv` → `data/underdog-legs.csv`
- `dist/data/prizepicks-cards.csv` → `data/prizepicks-cards.csv`
- `dist/data/prizepicks-legs.csv` → `data/prizepicks-legs.csv`
- `dist/data/last_fresh_run.json` → `data/last_fresh_run.json`
- `dist/data/results_summary.json` → `data/results_summary.json`

---

## 3. Upload order (FileZilla)

1. **assets/** first (so index.html script/link resolve)
   - Drag `dist/assets/` → server `assets/`
2. **data/** second
   - Drag `dist/data/` → server `data/`
3. **index.html** last
   - Drag `dist/index.html` → server root (htdocs)

---

## 4. Dashboard didn’t update after uploading data?

**Check these in order:**

1. **Browser cache (most common)**  
   The app loads `/data/*.csv` and `/data/last_fresh_run.json` in the browser. If those are cached, you’ll see old data.
   - **Hard refresh:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).  
   - Or: F12 → **Network** tab → check **Disable cache** → refresh the page.  
   - Or open the site in a **private/incognito** window.

2. **Server path for data**  
   The dashboard requests **`/data/...`** (relative to the site root). On the server that must be the **`data`** folder **directly under the same directory as `index.html`**.
   - If your site is at `http://gamesmoviesmusic.com/`, the server must have:
     - `htdocs/index.html`
     - `htdocs/data/prizepicks-cards.csv`
     - `htdocs/data/underdog-cards.csv`
     - `htdocs/data/prizepicks-legs.csv`
     - `htdocs/data/underdog-legs.csv`
     - `htdocs/data/last_fresh_run.json`
     - `htdocs/data/results_summary.json`
   - If you use a subfolder (e.g. `htdocs/dfs/`), then either:
     - Put `index.html` and a `data/` folder **inside** `dfs/` so the site is `http://.../dfs/` and `/data/` is `dfs/data/`, or  
     - Keep the app at root and ensure `data/` is next to `index.html` (no `dfs` in the URL).

3. **Confirm the server is serving the new files**  
   Open these in a new tab (or with “Open in new tab” from Network in F12):
   - `http://gamesmoviesmusic.com/data/last_fresh_run.json`  
   You should see JSON with `fresh_run_completed_at` and `csv_stats` (e.g. PP/UD row counts). If you see an old date or 404, the new files aren’t in the right place or are still cached.

4. **Upload the latest build, not just data**  
   After `npm run build`, **index.html** points to new `assets/index-XXXXX.js` and `assets/index-XXXXX.css`. If you only upload the `data/` folder and never update `index.html` and `assets/`, the browser may keep using old JS and the **page will not update** (same layout, broken copy/deeplinks, old score formula). So:
   - Upload **data/** (all CSVs + `last_fresh_run.json` + `results_summary.json`).
   - Upload **assets/** (new JS and CSS).
   - Upload **index.html** last.
   - Then hard refresh (Ctrl+Shift+R).

---

## 5. Deploy output and screenshot after deploy

**URL:** http://gamesmoviesmusic.com/

**Deploy output:** `npm run deploy:ftp` should end with `Uploaded dist/ ✓`. If you see that, the script built and uploaded to the server.

**Screenshot:** After deploy, open the URL, hard refresh (Ctrl+Shift+R), then confirm (e.g. screenshot): 53 cards, table full width (no left crunch), assets and data load (Network tab → 200s).

---

## 5b. Deeplinks (PrizePicks pre-fill — definitive answer)

- **PrizePicks:** Pre-filling the board with our picks via URL is **not possible** with our current pipeline. PrizePicks uses internal **projection IDs** (`projId=...`) in share URLs; we only have our own leg IDs (e.g. `prizepicks-10373559-threes-1.5`). Mapping to their `projId` would require scraping or an undocumented API. The dashboard link opens the **projections board** only; use **Copy Parlay** and paste into PP.
- **Underdog:** The pick-em URL supports a `legs=` query (comma-separated leg IDs). Their app may or may not pre-fill from it; the dashboard uses it when you click "Underdog — Pick'em". If it doesn’t pre-fill, use **Copy Parlay** and paste.

---

## 6. Optional cleanup

Remove any old `assets/index-*.js` or `assets/index-*.css` that are no longer referenced by the new `index.html`.

---

## 6b. Getting results (Day / Week / Month / Past) on the dashboard

The five result boxes (Day, Week, Month, LT, Past) and the “Past” Top 100 legs table are filled from **`/data/results_summary.json`**. That file is produced by your backend, not by the dashboard build.

**Plan:**

1. **Pipeline** already writes cards/legs to `results/results.db` (and dated CSVs in `results/`) on each run.
2. **After games settle**, run:
   - **`python scripts/export_results_summary.py`**  
   This reads `results/results.db`, aggregates parlay/leg outcomes (Day/Week/Month/LT/Past), and writes **`web-dashboard/public/data/results_summary.json`**.
3. **Re-deploy** (or copy `results_summary.json` to the server under `data/`) so the live dashboard loads the new file. Optionally run the export in a **nightly job** after settlement, then deploy or sync `data/`.

Until `results_summary.json` is populated (and outcomes exist in `results.db`), the five boxes will show 0/0. See `docs/RESULTS_TRACKING_FOR_AI.md` and `scripts/export_results_summary.py` for schema and usage.

---

## 6c. Ready to import tonight — checklist

**What works tonight (no settlement needed):**

1. Run your **fresh pipeline** (e.g. `scripts/fresh_data_run.ps1` or full optimizer) so that `prizepicks-cards.csv`, `underdog-cards.csv`, `prizepicks-legs.csv`, `underdog-legs.csv` and `last_fresh_run.json` are in `web-dashboard/public/data/` (or `artifacts/` + copy).
2. Run **`python scripts/export_results.py`** from the repo root. This imports today’s cards and legs from those CSVs into **`results/results.db`** (and writes dated CSVs under `results/`). No outcomes yet — that’s fine.
3. Build and deploy the dashboard (e.g. `npm run deploy:ftp` or commit + push for GitHub Actions). The dashboard will show all cards, Top Legs PP/UD, Data & Tiers, Portfolio, Score & Results. The five result boxes and Top Legs “Last / L10 / L20 / Season” will show 0/0 or “—” until step 4.

**What needs settlement + export for boxes and leg stats:**

4. **Outcomes** go into `results.db` via **automated settlement** (see **§6d** below) or manual entry.
5. After outcomes exist, run **`python scripts/export_results_summary.py`** (or use **`scripts/run_final_results.ps1`** to settle + export in one step). That writes **`web-dashboard/public/data/results_summary.json`** with Day/Week/Month/LT/Past and **legStats**.
6. **Re-deploy** (or upload `data/results_summary.json` to the server). Then the five boxes and Top Legs Last/L10/L20/Season show data.

**Summary:** You can start importing tonight: run the pipeline, run `export_results.py`, then build and deploy. Cards and legs will show; result boxes and leg stats will stay empty until you add outcomes and run the final-results automation (or export) + redeploy.

---

## 6d. Automate final results (settle + export)

To **automate the data process for final results** (ESPN box scores → outcomes → dashboard JSON):

1. **One command (recommended):** From repo root run  
   **`.\scripts\run_final_results.ps1`**  
   This will:
   - **Settle** pending cards: fetch NBA box scores from ESPN for the game dates in your legs, compare actual vs line/side, and write `outcomes` (and update card `status` / `settled_at`) in `results/results.db`.
   - **Export** `results_summary.json` (Day/Week/Month/LT/Past + legStats) to `web-dashboard/public/data/`.
   - The next build/deploy will then serve the updated results.

2. **Options:**
   - `.\scripts\run_final_results.ps1 -AllPending` — settle all pending cards (all dates).
   - `.\scripts\run_final_results.ps1 -Date "2026-03-06"` — settle only cards whose legs are from that date.
   - `.\scripts\run_final_results.ps1 -DryRun` — show what would be settled without writing to the DB.
   - `.\scripts\run_final_results.ps1 -NoCopy` — skip confirming the summary file (export still runs).

3. **Settlement only:**  
   `python scripts/settle_results.py --date 2026-03-06` or `--all-pending` (and optionally `--dry-run`).  
   **Export only:**  
   `python scripts/export_results_summary.py`.

4. **Scheduling:** Run `run_final_results.ps1` nightly (e.g. after games are final) via Task Scheduler or cron so the dashboard stays up to date.

Settlement uses **NBA only** (ESPN); legs must have `game_time` (or cards `created_at`) so the script can derive the game date. Non-NBA or missing dates are skipped.

---

## 7. Expected result

- **Network:** index.html, JS, CSS, `/data/*.csv`, `/data/last_fresh_run.json`, `/data/results_summary.json` → 200.
- **Page:** Dashboard with Score 1–100 (best card = 100), Top Legs PP/UD tabs, Data+Tiers and Score & Results panels, Kelly $50–80 / $1.50 floor, player column ~52%, copy/open and deeplinks.
- **Copy:** Player click → copies "Player STAT oX.X"; Copy Parlay → full parlay string. Open → player profile link.
