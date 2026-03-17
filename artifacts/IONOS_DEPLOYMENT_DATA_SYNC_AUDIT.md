# IONOS Deployment and Data Sync Pipeline — Audit Report

**Date (EST):** 2026-03-13  
**Scope:** How the dashboard is built/deployed to IONOS, how data reaches IONOS, why live data is stale, and what is missing from automation. No code changes; audit only.

---

## 1. Deploy mechanism (how built + uploaded to IONOS)

### Build and deploy scripts

| Item | Location | Purpose |
|------|----------|---------|
| **deploy:ftp** | `package.json` | `node scripts/deploy-ftp.js` — builds web-dashboard then uploads to IONOS via SFTP |
| **deploy** | `package.json` | `node scripts/deploy-rsync.js` — alternate deploy (rsync) |
| **deploy:check** | `package.json` | `scripts/ionos_deploy_check.ps1` — pre-deploy guard (Vite build + verify index.html, .htaccess, assets) |
| **menu** | `package.json` | `node scripts/deploy-menu.js` — upload menu/root structure |
| **empire** | `package.json` | Alias for `npm run deploy:ftp` |
| **deploy-ftp.js** | `scripts/` | Builds `web-dashboard` (`npm run build` in web-dashboard), then SFTP uploads `web-dashboard/dist/` to server path `/dfs/`. Uses `.env`: `SFTP_SERVER` or `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. |
| **deploy-sftp-gh.js** | `scripts/` | Used by GitHub Actions (main.yml): uploads `dist/` and `web-dashboard/dist/` to `REMOTE_PATH` (default `/kunden/homepages/14/d4299584407/htdocs/dfs`). Does **not** copy data from `data/output_logs/` before build. |
| **deploy.ps1** | repo root | Build + stage production files; creates `ionos-deploy.zip` for manual upload. |
| **run_fresh_and_package_deploy.ps1** | `scripts/` | Fresh data + build + package to `artifacts/deploy_bundle/` and zip; no automatic upload. |
| **ionos_deploy_check.ps1** | `scripts/` | IONOS deploy guard: runs Vite build, verifies index.html, .htaccess, assets (no 404). |

### CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **.github/workflows/deploy-dashboard.yml** | Push to `main` when `web-dashboard/**`, `scripts/deploy-ftp.js`, or the workflow file changes; or `workflow_dispatch`. | `npm ci` at root → `npm run deploy:ftp`. Uses secrets: `SFTP_SERVER` or `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. |
| **.github/workflows/main.yml** | Push to `main` or manual. | Verify job: `npm run verify:breakeven`, grep table invariant. Deploy job (only on push to main): build backend + web-dashboard, then `node scripts/deploy-sftp-gh.js` with `SFTP_SERVER`, `SFTP_USERNAME`, `SFTP_PASSWORD`. |

### Summary

- **Local deploy:** `npm run deploy:ftp` builds web-dashboard (using data copied into `web-dashboard/public/data/` by the script — see below) and uploads `web-dashboard/dist/` to IONOS `/dfs/` via SFTP.
- **GitHub deploy:** Either deploy-dashboard.yml runs `deploy:ftp` (same as above), or main.yml runs `deploy-sftp-gh.js` which only uploads existing `dist/` and `web-dashboard/dist/` with no data copy step.
- There is **no** script in `scripts/` that references IONOS by name for upload beyond the deploy scripts above; no separate “upload to IONOS” step in PowerShell or Python.

---

## 2. Data sync mechanism (how CSVs get to IONOS)

### Pipeline output location

- The optimizer writes all CSVs to **`data/output_logs/`** (see `src/constants/paths.ts`: `OUTPUT_DIR = "data/output_logs"`).
- Files include: `prizepicks-legs.csv`, `prizepicks-cards.csv`, `underdog-legs.csv`, `underdog-cards.csv`, `tier1.csv`, `tier2.csv`, etc.

### What deploy-ftp.js does with data

- **copyRootDataToPublic()** in `scripts/deploy-ftp.js`:
  - Copies into `web-dashboard/public/data/` from the **project root** (not from `data/output_logs/`):
    - `prizepicks-cards.csv`, `prizepicks-legs.csv`, `underdog-cards.csv`, `underdog-legs.csv`, `last_fresh_run.json`
  - `last_fresh_run.json` fallback: if not at root, uses `artifacts/last_fresh_run.json`.
  - So it only picks up these files if they exist **at repo root**. The pipeline does **not** write to repo root; it writes to `data/output_logs/`. So under current behavior, **deploy-ftp does not copy from `data/output_logs/`** unless a separate step has first copied (or symlinked) those files to root or into `web-dashboard/public/data/`.

### What runs in the daily path

- **daily-run.ps1** → **run-both.ps1** → Node optimizer. No step in either script runs deploy, FTP, or upload. No step copies `data/output_logs/*` to `web-dashboard/public/data/` or to project root.
- **run_optimizer.ps1** (not in the daily-run path): no upload step; no FTP/SFTP.
- **run_final_results.ps1** copies `results_summary.json` into `web-dashboard/public/data/` for the next build/deploy but does not upload; it tells the user to run `npm run deploy:ftp` or push to deploy.

### API server on IONOS

- There is **no** API server running on IONOS in this repo. The dashboard is a **static** Vite build. It loads CSVs and JSON via **same-origin requests** (see `CardsPanel.tsx`: `DATA_BASE = API_BASE + '/' + OUTPUT_DIR`; with `VITE_API_URL` unset in production, that is `/data/output_logs`).
- **web-dashboard/.env.example** documents `VITE_API_URL=http://localhost:4000` for local dev when the backend runs separately. No `.env.production` or IONOS-specific API URL was found in the repo.

### Summary

- Data reaches IONOS **only** as part of a **deploy**: whatever is in `web-dashboard/public/data/` (or copied there by deploy-ftp from root) is baked into `web-dashboard/dist/data/` by Vite and then uploaded to the server.
- There is **no** dedicated “sync data only” step that pushes `data/output_logs/` to IONOS after runs.
- **Path mismatch:** Pipeline writes to `data/output_logs/`; deploy-ftp copies from **project root** (and `artifacts/` for last_fresh_run). So fresh run output is **not** used by deploy unless something else copies it to root or to `web-dashboard/public/data/` first.

---

## 3. Why data is currently stale (root cause)

- The live dashboard at **https://dfs.gamesmoviesmusic.com** shows data from **03/08** (~125 hours old).
- **Root cause:**
  1. **No automated deploy after optimizer runs.** daily-run.ps1 and run-both.ps1 do not call deploy or any upload. So each successful run updates only local `data/output_logs/` and Sheets/Telegram, not the IONOS site.
  2. **Last successful deploy/sync was likely 03/08.** After that date, either no one ran `npm run deploy:ftp` (or pushed with deploy workflow) with fresh data, or the workflow ran but without copying from `data/output_logs/` first.
  3. **Manual step required.** To get fresh data on IONOS today you would need to: (a) copy (or point) `data/output_logs/*` into `web-dashboard/public/data/` (or project root for deploy-ftp’s copy), (b) run `npm run deploy:ftp`, or (c) push and rely on CI, which still does not copy from `data/output_logs/` in main.yml (deploy-sftp-gh.js only uploads existing dist). deploy-dashboard.yml runs deploy:ftp, which copies from root only, so again pipeline output is not used unless copied there first.

---

## 4. web-dashboard/ directory structure and config

### Structure (relevant parts)

- **web-dashboard/**
  - **dist/** — Present (built output): `index.html`, `assets/`, `data/` (e.g. `prizepicks-cards.csv`, `underdog-cards.csv`, `last_fresh_run.json`, `results_summary.json`). This is what gets uploaded to IONOS.
  - **public/data/** — Contains CSVs and JSON (prizepicks-cards.csv, prizepicks-legs.csv, underdog-*, last_fresh_run.json, results_summary.json). Vite copies this into `dist/data/` at build time.
  - **src/** — App and components (App.tsx, Dashboard.tsx, CardsPanel.tsx, etc.).
  - **.env.example** — Documents `VITE_API_URL=http://localhost:4000`. No `.env` or `.env.production` found in the repo (likely gitignored); no IONOS API URL in repo.
  - **vite.config.ts** — `base: './'`; no production API URL.
  - **package.json** — Standard Vite/React build; no deploy script in web-dashboard itself.

### Where the dashboard gets data

- **CardsPanel** loads CSVs from `DATA_BASE` + filename, with `DATA_BASE = API_BASE + '/' + OUTPUT_DIR` and `OUTPUT_DIR = 'data/output_logs'`. With `VITE_API_URL` unset (production), requests go to **`/data/output_logs/prizepicks-cards.csv`** and **`/data/output_logs/underdog-cards.csv`** (absolute path from origin).
- Deploy puts files in **`/dfs/data/`** (from `dist/data/`). So the live site must be serving either from a document root where `/data/` is under `/dfs/` or there is a rewrite/alias so that `/data/output_logs/` resolves to the deployed `data/` folder. (If the subdomain root equals `/dfs/`, then `/data/` would be `/dfs/data/` and the app would need to request a path that matches that; the code’s use of `/data/output_logs/` may require server config to map that to the actual deployed path.)

---

## 5. What needs to be automated in daily-run.ps1 to keep data fresh

To have the live dashboard reflect each day’s run without manual steps:

1. **Copy pipeline output into the dashboard build input**  
   After a successful run (and optionally after archive/backfill/scrape), copy (or symlink) from `data/output_logs/` into `web-dashboard/public/data/` the files the dashboard and deploy expect (e.g. `prizepicks-cards.csv`, `prizepicks-legs.csv`, `underdog-cards.csv`, `underdog-legs.csv`, and `last_fresh_run.json` or equivalent from `artifacts/`). This aligns pipeline output with what Vite bakes into `dist/data/`.

2. **Run deploy after a successful daily run**  
   Add an optional or conditional step in daily-run.ps1 (or a wrapper) that runs `npm run deploy:ftp` (or equivalent) so that the built `web-dashboard/dist/` — now containing the day’s data — is uploaded to IONOS. This requires SFTP credentials to be available to the runner (e.g. env or secret).

3. **Alternatively, fix deploy-ftp.js to use pipeline output**  
   Change `copyRootDataToPublic()` to copy from `data/output_logs/` (and `artifacts/` for last_fresh_run) instead of project root, so that whenever someone runs `npm run deploy:ftp` after a run, the correct files are used without a separate copy step. Automation would still need to run deploy (e.g. from daily-run or CI) after a successful run.

4. **CI option**  
   If deploy is done via GitHub Actions, the workflow would need to either (a) receive the data artifacts from a runner that executed the optimizer (e.g. scheduled workflow that runs optimizer then builds and deploys), or (b) run on a schedule that pulls from a shared store. Currently, push-based workflows do not have access to local `data/output_logs/` from a developer machine.

---

## Summary table

| Question | Finding |
|----------|---------|
| **Build/deploy script** | `scripts/deploy-ftp.js` (npm run deploy:ftp); also deploy-dashboard.yml and main.yml (deploy-sftp-gh.js). |
| **Data pushed to IONOS after runs?** | No. daily-run, run-both, run_optimizer do not upload or run deploy. |
| **API server on IONOS?** | No; static site only. |
| **Dashboard data source** | Same-origin: `/data/output_logs/` (from CardsPanel); deploy puts files in `/dfs/data/`. |
| **Why stale?** | No deploy (and no data copy from output_logs) since ~03/08; no automation to deploy after daily run. |
| **To automate** | Copy `data/output_logs/*` (and artifacts) → `web-dashboard/public/data/` after success; run `npm run deploy:ftp` (or equivalent) from daily-run or CI with SFTP credentials. |
