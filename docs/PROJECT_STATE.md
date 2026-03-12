# Project State (Self-Documenting)

**RULE: Cursor must update this file after every task that modifies code, adds features, or changes pipeline behavior. No exceptions.**

**Rule:** After any major refactor or task completion, update this file so it reflects the current reality.

---

## CURRENT_OBJECTIVE

- **Pipeline integrity:** Centralized paths, fail-fast automation, env isolation, and data validation are in place (see `refactor_report.md`).
- **Testing & flags:** MSW mocking for `fetchOddsAPIProps`, type-safe feature flags (`ENABLE_INNOVATIVE_PARLAY`), and unit test coverage for API fail-fast (401/500) are implemented.
- **Next focus:** Confirm full pipeline run succeeds (ODDSAPI_KEY set, outputs in `data/output_logs`), run `npm run test:unit` and `npm run verify:breakeven` to validate wiring.

---

## FANTASY_SCORE

- **fantasy_analyzer.ts** runs **after** card building as a **diagnostic only**. Logs top 25 fantasy edges; not used as EV input or filter.
- **confidenceDelta** is an output column on PP legs (col 19) and PP cards (col W). UD legs do **not** have a confidenceDelta column.
- **fantasy_score** props are explicitly excluded from EV legs in `merge_odds.ts` (comment: "re-enabled once independent projections wired in").
- **fantasyAggregator.ts** (`calculateFantasyScore`) is complete but **not wired** into the main EV flow — future opportunity to feed into EV/adjEv.
- All fantasy files are complete (no TODOs); exclusion from EV is intentional.

---

## PIPELINE_STATUS

- **Last run (artifacts/last_run.json):** `status: "success"` (ts: 20260312-150930).
- **LAST_VALIDATED:** 2026-03-12 (mock dry-test and wiring verified).
- **LAST_LIVE_RUN:** 2026-03-12 — Live end-to-end run via `scripts/run_optimizer.ps1 -Force -bankroll 700`; PP+UD outputs in `data/output_logs/`; sheets push via `python sheets_push_cards.py` (Cards A2:W, 23 cols; LastRun=2026-03-12).
- **Telegram:** TELEGRAM_BOT_TOKEN is set in `.env`. For run 20260312-150930, `artifacts/last_run.json` reported `telegram_sent: true`.
- **Diagnosis of "optimizer" error (historical):** The PowerShell script writes `error: "optimizer"` whenever the Node process (run_optimizer.js) exits with non-zero. Common causes: no live odds (ODDSAPI_KEY missing/fail), guardrail (PP merge ratio &lt; 12%), or runtime crash. Response parsing was hardened: `httpGet` uses `res.text()` + `JSON.parse()` and throws a clear error if the body is empty or invalid JSON.
- **SGO/TRD:** SGO/TRD code paths exist throughout the codebase but are **not** the active pipeline. OddsAPI is the sole odds source (commit 58ead86: "normalize odds sources to support only OddsAPI and none"). **live_liquidity.ts** and **run_underdog_optimizer.ts** still reference therundown.io — flagged in KNOWN_GAPS as HIGH PRIORITY.
- **Dry-test without live API:** Set **USE_MOCK_ODDS=1** (or `--mock-legs N`) so the PrizePicks path injects synthetic legs and skips the Odds API. **Valid `--providers` are PP and UD only** (TRD is not supported). Example: `$env:USE_MOCK_ODDS="1"; node dist/src/run_optimizer.js --platform both --innovative --bankroll 700 --providers PP,UD --sports NBA`. On Windows PowerShell use `$env:USE_MOCK_ODDS = "1"` before the command. A startup log line `[OPTIMIZER] Block start: platform=both, mockLegs=50, USE_MOCK_ODDS=1, ODDSAPI_KEY set=...` confirms the mock branch. Note: with `--platform both`, the Underdog half still uses live Underdog API and OddsAPI for merge unless UD is skipped.
- **Tests:** Unit tests (Jest + MSW) for `fetchOddsAPIProps`; run with `npm run test:unit` or `npx jest tests/fetch_oddsapi_props.spec.ts`. Wiring: `npm run test` (verify_wiring.ps1 -DryRun).
- **Breakeven verification:** `npm run verify:breakeven` must pass before ship (per .cursor rules).

---

## AUTOMATION_STATUS

- **Daily-run script:** `scripts/daily-run.ps1` invokes `scripts/run-both.ps1 -Fresh` (compile + `node dist/src/run_optimizer.js --platform both --innovative --telegram`). It does **not** call `run_optimizer.ps1`, so the following are **not** in the daily-run path:
  - **(a) Optimizer:** ✓ Covered (run-both runs the Node optimizer).
  - **(b) Archive legs + tiers:** ✗ Missing — archiving runs only inside `run_optimizer.ps1` after success. Using daily-run → run-both does not archive; use `run_optimizer.ps1` for a run that archives, or add an archive step to daily-run/run-both.
  - **(c) Backfill tracker:** ✗ Missing — no call to `npx ts-node src/backfill_perf_tracker.ts`.
  - **(d) Scrape prior-day results:** ✗ Missing — no call to `npx ts-node src/scrape_nba_leg_results.ts` or `scripts/track-results.ps1`.
  - **(e) Push to sheets:** ✓ Covered (run_optimizer.ts calls `runSheetsPush()` / `sheets_push_cards.py` internally).
  - **(f) Telegram:** ✓ Optimizer receives `--telegram` and sends content; no separate script-level success/failure alert (daily-run exits with optimizer exit code only).
- **Task Scheduler:** As of 2026-03-12, **DFS-DailyRun** and **DFS-TrackResults** are **not registered** (`schtasks /Query` returns "The system cannot find the file specified"). To register:
  - Daily run: `schtasks /Create /TN "DFS-DailyRun" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\...\dfs-optimizer\scripts\daily-run.ps1\" -bankroll 700" /SC DAILY /ST 06:00 /RU ...`
  - Track results (scrape): see CALIBRATION_STATUS for DFS-TrackResults example (e.g. 10:00 AM ET).
- **Next scheduled run times:** N/A until tasks are created.
- **.env security:** `.env` is listed in `.gitignore`; `git check-ignore -v .env` reports it ignored. If `.env` was ever committed, run `git rm --cached .env` and ensure it is not tracked.

---

## FILES_MODIFIED (Last major refactors)

1. **src/constants/paths.ts** — New; centralized OUTPUT_DIR, ARTIFACTS_DIR, DATA_DIR, getOutputPath/getArtifactsPath/getDataPath, filename constants.
2. **src/run_optimizer.ts** — Path constants, output dir creation, feature flag for innovative block, data validator call; **diagnostic** `[OPTIMIZER] Block start` log; **USE_MOCK_ODDS=1** / **effectiveMockLegs** for dry-test without live API; writeCardsCsv doc comment (CSV columns match sheets_push_cards.py → 23-col A–W Sheet).
3. **scripts/run_optimizer.ps1** — _paths.ps1, fail-fast Test-Path for output files, BANKROLL env log/clear, metrics from `data/output_logs`.
4. **src/fetch_oddsapi_props.ts** — Switched from axios to fetch() for MSW compatibility; internal httpGet() with timeout, status on !res.ok, and **res.text() + JSON.parse()** with clear error on non-JSON/empty body.
5. **src/constants/featureFlags.ts** — New; type-safe FeatureFlag, isFeatureEnabled(), ENABLE_INNOVATIVE_PARLAY / ENABLE_EXPERIMENTAL_PARLAY.
6. **src/mocks/handlers.ts** + **src/mocks/server.ts** — New; MSW handlers for Odds API (events list + event odds), 401/500 handlers for fail-fast tests. Handlers use `/events/` endpoint and quota headers for fetch_oddsapi_props tests.
7. **src/fetch_oddsapi_props.ts (2026-03-12):** Final 10-book list (draftkings,fanduel,pinnacle,lowvig,betmgm,espnbet,prizepicks,underdog,pick6,betr_us_dfs), 14 markets (10 standard + 4 alternate), no regions param; `[ODDS-QUOTA]` logging; 4h quota cache in data/odds_cache.json; guard when remaining &lt; 500. **src/fetch_props.ts** and **src/fetch_underdog_props.ts** — deprecation comments added (OddsAPI primary). **scripts/run_odds_quota_report.ts** — one-off live fetch and quota report.

---

## ENVIRONMENT LOADING (FAIL-FAST)

Env is loaded from **absolute project root** (never `process.cwd()`). All entry points that need env should `import "./load_env"` (or `import "../load_env"` from scripts) so the same `.env` is used for CLI, cron, and IDE.

**1. load_env.ts** — Resolves project root from `__dirname` (one level up from `src/`, two from `dist/src/`), logs `[ENV] Attempting to load .env from <path>`, loads via `dotenv.config({ path })`. If `.env` is missing it returns `loaded: false` (no exit). If the file exists but dotenv fails, it exits(1).

**2. run_optimizer.ts** — After `ensureEnvLoaded()`, **before any business logic** it enforces:

- `.env` file must exist at project root; else `process.exit(1)`.
- `ODDSAPI_KEY` (or `--api-key`) must be set and non-empty and length ≥ 8; else `process.exit(1)`.
- No silent fallback to `USE_MOCK_ODDS=1` when the key is missing; pipeline fails fast.

Exact code block used for run_optimizer env/key check:

```ts
// Fail-fast: require .env at project root and ODDSAPI_KEY before any business logic. No silent mock default.
const _envPath = path.join(_projectRoot, ".env");
if (!fs.existsSync(_envPath)) {
  console.error(`[CONFIG] .env file not found at ${_envPath}. Create .env at project root with ODDSAPI_KEY=...`);
  process.exit(1);
}

// CLI --api-key overrides env so one source is used everywhere.
if (cliArgs.apiKey) {
  process.env.ODDSAPI_KEY = cliArgs.apiKey;
}

const _effectiveKey = getEffectiveOddsApiKey();
if (!_effectiveKey || _effectiveKey.length === 0) {
  console.error("[CONFIG] ODDSAPI_KEY is missing or empty. Set ODDSAPI_KEY in .env at project root or pass --api-key. Pipeline will not run without live odds.");
  process.exit(1);
}
if (_effectiveKey.length < 8) {
  console.error("[CONFIG] ODDSAPI_KEY is too short or invalid. Use a valid key from the-odds-api.com.");
  process.exit(1);
}
```

**Entry points:** `run_optimizer.ts`, `run_underdog_optimizer.ts`, and `fetchOddsApi.ts` all import `./load_env` so env is loaded from project root when they are the process entry.

**Security:** After verifying the pipeline works, run `git rm --cached .env` (if it was ever committed) and ensure `.env` is in `.gitignore` so the key is never committed.

---

## CALIBRATION_STATUS

- **Last calibration check:** 2026-03-12 (via `npx ts-node scripts/run_calibration_report.ts`).
- **Tracker:** `data/perf_tracker.jsonl` — rows appended by `backfill_perf_tracker.ts` (from tier1/tier2 + prizepicks-legs.csv, underdog-legs.csv); results filled by `scrape_nba_leg_results.ts` (ESPN box score).
- **Tracker size:** 30 rows total, 16 rows with `result` set (hits/misses). Date range currently `2026-02-22` → `2026-03-12`.
- **Bucket calibration:** `computeBucketCalibrationsFromRows()` (in `src/calibrate_leg_ev.ts`) returns multipliers in **[0.8, 1.5]** (MULT_CAP_LOW/HIGH); unit test enforces this. Buckets require ≥5 legs per (player, stat, lineBucket, book).
- **Current state:** 0 buckets (no bucket has ≥5 legs yet). No buckets flagged (mult &lt; 0.85 or &gt; 1.35). Calibration is effectively inactive until more tracker data accumulates.
- **Feed into optimizer:** `run_optimizer.ts` calls `computeBucketCalibrations()` at runtime (reads `data/perf_tracker.jsonl` via `readTrackerRowsWithResult()`). Calibration is applied **after** EV scoring: `calculateEvForMergedPicks` → `legsAfterEvFilter` → `computeBucketCalibrations()` → `getCalibration()` sets `leg.adjEv`; adjEv is used for downstream selection and filtering (not legEv replaced).
- **Scrape schedule:** `scrape_nba_leg_results.ts` (and `scripts/track-results.ps1`) is currently **manual**. Recommended Task Scheduler entry (10:00 AM ET daily, after box scores post):
  - `schtasks /Create /TN "DFS-TrackResults" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\Media-Czar Desktop\\Dev\\dfs-optimizer\\scripts\\track-results.ps1\"" /SC DAILY /ST 10:00 /RU "czar-pc\\media-czar desktop"`
  - Use `scripts/auto_mode.ps1` / `scripts/daily-run.ps1` as higher-level orchestration docs; update Task Scheduler description to reference this calibration loop.

- **Backfill + archive sources:** `backfill_perf_tracker.ts` walks **data/legs_archive/** and **data/tier_archive/** by date: for each YYYYMMDD with matching `prizepicks-legs-YYYYMMDD.csv`, `underdog-legs-YYYYMMDD.csv`, `tier1-YYYYMMDD.csv`, and `tier2-YYYYMMDD.csv`, it backfills tracker rows (dedup by date+leg_id). It then processes the current run from `data/output_logs/` (date from tier runTimestamp). After each successful optimizer run, `scripts/run_optimizer.ps1` copies legs and tier CSVs into `data/legs_archive/` and `data/tier_archive/` so full history is available once future dated runs accumulate.

---

## CRITICAL_DEPENDENCIES

- **API keys / env**
  - **ODDSAPI_KEY** (or **ODDS_API_KEY**): Required for live odds; missing or empty → pipeline exits(1) before business logic (no silent mock default).
  - **BANKROLL**: Set by scripts (e.g. run_optimizer.ps1) for the run; cleared after to avoid leakage.
  - **OUTPUT_DIR**: Set by run_optimizer.ts for Python (e.g. `data/output_logs`); Python reads CSVs from this dir.
  - **EXPORT_MERGE_REPORT**: Optional; set to `1` to write merge_report CSV; must be cleared after in scripts that set it.
  - **TELEGRAM_BOT_TOKEN**, **TELEGRAM_CHAT_ID**: Optional; for Telegram alerts. **TELEGRAM_SHEET_URL** optional for sheet link in messages.
- **Sheets**
  - Google Sheets: token.json / credentials.json (OAuth). Cards tab: Row 1 = headers, Row 2+ = data.
  - **Cards tab schema (A–W, 23 columns):** RunTime, GameTime, Site, Slip, Player, Stat+Line, Pick, KellyStake$, Tier, AvgEdge%, CardEV, LegID, ParlayGroup, AvgProb%, trueProb%, underOdds, overOdds, EV, 1.5Kelly, DeepLink, LastRun, Notes, CardKelly$.
- **CSV schemas (data/output_logs)**
  - **PP legs (19 cols):** Sport, id, player, team, stat, line, league, book, overOdds, underOdds, trueProb, edge, legEv, runTimestamp, gameTime, IsWithin24h, leg_key, leg_label, confidenceDelta.
  - **UD legs (18 cols):** Same minus confidenceDelta; plus IsNonStandardOdds.
  - **PP cards (27 cols):** Sport, site, flexType, Site-Leg, Player-Prop-Line, cardEv, winProbCash, winProbAny, avgProb, avgEdgePct, breakevenGap, leg1Id–leg6Id, kellyRawFraction, kellyCappedFraction, kellyFinalFraction, kellyStake, kellyRiskAdjustment, efficiencyScore, portfolioRank, runTimestamp, bestBetScore, bestBetTier, confidenceDelta.
  - **Tier1/Tier2 (27 cols):** portfolioRank, tier, site, flexType, cardEV, compositeScore, correlationScore, diversity, correlation, liquidity, kellyFrac, kellyStake, fragile, fragileEvShifted, winProbCash, avgProb, avgLegEV, avgEdge, breakevenGap, statBalance, edgeCluster, leg1Id–leg6Id, runTimestamp.
  - **Note:** UD cards support 8 leg IDs (leg7Id, leg8Id); PP cards support 6.
- **Paths**
  - Pipeline outputs live under **data/output_logs/** (see `src/constants/paths.ts` and `scripts/_paths.ps1`). All reads/writes of legs, cards, tiers, merge reports use these constants.
  - **data/legs_archive/** — date-stamped copies of `prizepicks-legs.csv` and `underdog-legs.csv` from each successful optimizer run; primary historical source for perf_tracker backfills and calibration.
  - **data/tier_archive/** — date-stamped copies of `tier1.csv` and `tier2.csv` from each successful run; used with legs_archive by `backfill_perf_tracker.ts` for full date/tier/kelly/structure history.
  - **data/odds_cache.json** — Quota cache for Odds API: `{ ts, ttl: 14400000, remaining, data }`. Guard can read `remaining` without a live call. 4h TTL; if `remaining < 500` live fetch is skipped and cache is used regardless of TTL.

---

## QUOTA_COST_MODEL (Odds API)

- **Final 10-book list (player props only; no regions param):**  
  `draftkings`, `fanduel`, `pinnacle`, `lowvig`, `betmgm`, `espnbet`, `prizepicks`, `underdog`, `pick6`, `betr_us_dfs`.
- **Markets fetched:** 14 total — 10 standard: `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_blocks`, `player_steals`, `player_points_rebounds_assists`, `player_points_rebounds`, `player_points_assists`, `player_rebounds_assists`; 4 alternate: `player_points_alternate`, `player_rebounds_alternate`, `player_assists_alternate`, `player_threes_alternate`. No h2h, spreads, totals, outrights.
- **Actual quota cost per run:** **126** (from live run 2026-03-12: `x-requests-used` went 1532 → 1658 for 1 events + 9 event-odds calls). Run `npx ts-node scripts/run_odds_quota_report.ts` to re-measure; logs show `[ODDS-QUOTA] used=X remaining=Y endpoint=...` per request.
- **Cache:** TTL 4 hours (`data/odds_cache.json`). Guard threshold: if `remaining < 500`, skip live fetch and use cache regardless of TTL; log `[QUOTA WARNING] remaining=N`. On cache hit within TTL: log `[ODDS-CACHE] HIT age=Xm remaining=N`.
- **PP/UD scrapers:** `fetch_props.ts` (PrizePicks) and `fetch_underdog_props.ts` (Underdog) are **deprecated (not deleted)** — props now come directly from Odds API with DFS books (`prizepicks`, `underdog`) in the 10-book list. OddsAPI is the primary source. Live run confirmed PrizePicks and Underdog lines appear in the response.
- **Recommended run schedule:** With 18k requests/month, 126 per run → ~142 runs/month max. With 4h cache TTL, run at most every 4h (e.g. 2–4× daily) to stay within budget.
- **Cache shape:** `data/odds_cache.json` stores **normalized** `SgoPlayerPropOdds[]` (flat array with `marketId` per row), **not** the raw API response (events/bookmakers).
- **Alt lines:** All 4 alternate markets are present in cache; consumed in `merge_odds.ts` alt-line second pass (`findBestAltMatch`) when main pass returns `line_diff`. Underdog confirmed has all 4 alternate marketIds in cache. PrizePicks alt lines (demons/goblins) are snapshot-dependent — present when PP has posted them, absent otherwise.

---

## KNOWN_GAPS

### SGO_CLEANUP (high volume — do not touch without a dedicated prompt)

- **src/:** merge_odds.ts, cli_args.ts, ev_parlay.ts, calculate_overs_delta_ev.ts, build_single_bet_inputs.ts, adapters/propAdapter.ts, run_underdog_optimizer.ts, config/sport_config.ts, config/nba_props.ts, normalize_stats.ts, odds/normalize_odds.ts, run_optimizer.ts, fetch_odds_api.ts, types.ts.
- **scripts/:** refresh.ps1, daily_data.ps1, import_sources.ps1, quota-monitor.ps1, audit_merge_report.ts, sgo_nba_historical.py, debug_today.py, run_odds_api_preview.ps1, analyze_thresholds.ts, export_results.py, train_models.ps1, fresh_data_run.ps1.
- **package.json:** script `sgo-nba-backfill` exists — remove when ready.
- **Status:** Dead code only (no SGO_KEY in .env.example, OddsAPI is primary).
- **Priority:** MEDIUM — pipeline works without cleanup but dead code is confusing.

### TRD_CLEANUP (smaller scope, one live reference)

- **src/:** live_liquidity.ts has active `API_BASE = "https://therundown.io/api/v2"` — **HIGH PRIORITY**. run_underdog_optimizer.ts line 900 sets `provider = 'therundown_live'` — **HIGH PRIORITY**. cli_args.ts (--force-rundown, --rundown-only, --odds-source trd). ev_parlay.ts, config/sport_config.ts, odds/normalize_odds.ts.
- **scripts/:** check_therundown_alt_lines.ts, quota-monitor.ps1, run_optimizer.ps1, import_sources.ps1.
- **Priority:** HIGH for live_liquidity.ts and run_underdog_optimizer.ts (active API calls to dead endpoint); MEDIUM for rest.

---

## TODO

1. ~~**Validate pipeline:** Set ODDSAPI_KEY in .env, run `scripts/run_optimizer.ps1` (or `npm run dry` then full run) and confirm artifacts/last_run.json status is success and `data/output_logs` contains expected CSVs. For a **dry-test without the API**, run with `USE_MOCK_ODDS=1` or `--mock-legs 50` and `--providers PP,UD` (TRD is not valid).~~ ✓ Pipeline validated 2026-03-12 (mock dry-test, last_run.json success, output_logs CSVs present).
2. **Run verifications:** `npm run verify:breakeven`, `npm run test:unit`, and `scripts/verify_wiring.ps1 -Flow all` (or as per project rules).
3. **Optional:** Add more MSW handlers or unit tests for other API callers; extend feature flags as needed via `src/constants/featureFlags.ts`.
4. **Automation — daily-run coverage:** Add to daily-run (or run-both) after optimizer: (b) archive legs+tiers (or switch daily-run to invoke `run_optimizer.ps1` so archive runs); (c) backfill tracker (`npx ts-node src/backfill_perf_tracker.ts`); (d) scrape prior-day results (`npx ts-node src/scrape_nba_leg_results.ts` or `scripts/track-results.ps1`). Optionally add explicit Telegram alert on script failure.
5. **Automation — Task Scheduler:** Register **DFS-DailyRun** and **DFS-TrackResults** if autonomous daily runs are desired; document next run times in AUTOMATION_STATUS after registration.
