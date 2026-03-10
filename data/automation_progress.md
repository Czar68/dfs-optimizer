# Automation Progress — Zero-Touch DFS Production

## Module 1: The Auto-Grader ✅

- **Created `src/tracking/auto_grader.ts`**
  - Fetches **Odds API Scores** (`GET /v4/sports/basketball_nba/scores/?daysFrom=1`) to get completed NBA games.
  - Derives game dates from `commence_time`, then fetches **ESPN box scores** (scoreboard → event IDs → summary per game) to get player stats (points, rebounds, assists, threes, steals, blocks, turnovers, PRA, etc.).
  - Loads `data/tracking/pending_cards.json`, and for each leg still `Pending`, finds the player’s actual stat for that market, compares to line + Over/Under, and sets `result` to `Win`, `Loss`, or `Push`.
  - Saves the updated cards back to `pending_cards.json`.
  - Env: `ODDS_API_KEY` or `ODDSAPI_KEY` (optional; if missing, grading is skipped but script still runs).

- **Created `scripts/daily_grade.ts`**
  - Runs `runAutoGrader({ daysFrom: 1 })`, then moves all **fully-graded** cards from `pending_cards.json` to `data/tracking/history.json` (same logic as `POST /api/tracker/archive`).
  - Usage: `npx ts-node scripts/daily_grade.ts` or `node dist/scripts/daily_grade.js` after `npm run build` (ensure you run from project root so `process.cwd()` is correct).

---

## Module 2: GitHub Actions Deployment ✅

- **Created `.github/workflows/deploy.yml`**
  - Triggers on **push to main** and on **workflow_dispatch** (manual run).
  - Steps: checkout → setup Node 20 → `npm ci` → build backend (`npx tsc -p .`) → `cd web-dashboard && npm ci` → `npm run build` in web-dashboard → run **Deploy to server (SFTP)**.
  - SFTP step runs `node scripts/deploy-sftp-gh.js` with env:
    - `SFTP_SERVER`, `SFTP_USERNAME`, `SFTP_PASSWORD` from GitHub Actions secrets.

- **Created `scripts/deploy-sftp-gh.js`**
  - Uses `ssh2-sftp-client` (existing devDependency) to connect and upload:
    - `dist/` → remote path
    - `web-dashboard/dist/` → same remote path (merged).
  - Remote path: `REMOTE_PATH` env or default `/kunden/homepages/14/d4299584407/htdocs/dfs`.

---

## Module 3: Telegram Alerts ✅

- **Created `src/notifications/telegram_bot.ts`**
  - Uses **node-fetch** to POST to `https://api.telegram.org/bot{token}/sendMessage` with `chat_id` and `text`.
  - Exports `sendTelegramText(message: string): Promise<boolean>`.
  - Reads `process.env.TELEGRAM_BOT_TOKEN` and `process.env.TELEGRAM_CHAT_ID`; returns `false` if either is missing.

- **Integrated into `src/run_optimizer.ts`**
  - After the main card export and (when platform is both) UD run, the optimizer gathers all cards with **EV > 7%** (from `exportCards` and from `udRunResult.udCards`).
  - If there are any and `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, it sends each card’s **generateClipboardString** output to Telegram via `sendTelegramText`.

---

## Module 4: The Janitor (Cleanup) ✅

- **Created `scripts/cleanup_cache.ts`**
  - Scans `data/odds_snapshots` and `cache/` (from project root).
  - Deletes any **file** whose mtime is older than **48 hours**; leaves directories (and removes empty dirs after cleaning).
  - Logs how many files were removed and any errors.

- **Updated `package.json`**
  - Added script: `"cleanup": "npx ts-node scripts/cleanup_cache.ts"`.
  - Run with: `npm run cleanup`.

---

## Final Summary: NPM Packages & Secrets

### New NPM packages

- **None.** All automation uses existing dependencies:
  - **node-fetch** (already in `dependencies`) — used by `src/notifications/telegram_bot.ts`.
  - **ssh2-sftp-client** (already in `devDependencies`) — used by `scripts/deploy-sftp-gh.js`.
  - **ts-node** (already in `devDependencies`) — used by `npm run cleanup` and `scripts/daily_grade.ts`.

### GitHub Actions secrets (SFTP deploy)

Add these in **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret**:

| Secret name       | Description |
|-------------------|-------------|
| `SFTP_SERVER`     | SFTP host (e.g. your IONOS server hostname). |
| `SFTP_USERNAME`   | SFTP login user. |
| `SFTP_PASSWORD`   | SFTP password. |

Used by `.github/workflows/deploy.yml` to sync `dist/` and `web-dashboard/dist/` to `/kunden/homepages/14/d4299584407/htdocs/dfs/` (or set `REMOTE_PATH` in the workflow if you use a different path).

### Telegram (high-EV alerts & existing pusher)

Set in your **environment** (e.g. `.env` or server env) or in GitHub Actions env if you run the optimizer in CI:

| Variable               | Description |
|------------------------|-------------|
| `TELEGRAM_BOT_TOKEN`   | Bot token from [@BotFather](https://t.me/BotFather) (e.g. `123456789:AAF...`). |
| `TELEGRAM_CHAT_ID`     | Chat or channel ID (e.g. `-1001234567890` or `123456789`). Get it by messaging the bot and visiting `https://api.telegram.org/bot<TOKEN>/getUpdates`. |

- **Auto-grader:** Uses **Odds API** only for game completion; optional env: `ODDS_API_KEY` or `ODDSAPI_KEY` for `scripts/daily_grade.ts` / `src/tracking/auto_grader.ts`.
