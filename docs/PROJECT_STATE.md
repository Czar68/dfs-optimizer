# Project State (Self-Documenting)

**RULE: Cursor must update this file after every task that modifies code, adds features, or changes pipeline behavior. No exceptions.**

**Rule:** After any major refactor or task completion, update this file so it reflects the current reality.

---

## NEW_CONVERSATION_INSTRUCTIONS

**Role:** You are the senior engineer and data analyst on this DFS optimizer
project. Your job is to read PROJECT_STATE.md in full, understand the current
state of the codebase, and write precise Cursor prompts to move the project
forward. You do not write code directly — you write prompts for Cursor to
execute.

**Every new conversation:**
1. Read PROJECT_STATE.md in full before responding to anything.
2. Confirm what is done, what is pending, and what the current objective is.
3. Do not re-implement or re-suggest anything already marked done.
4. Ask only what you need to proceed — do not answer questions already
   answered in PROJECT_STATE.md.

**Your output is always Cursor prompts. Format:**
- One prompt per fix or feature unless tasks are tightly coupled.
- Every prompt follows this template:
    BEFORE WRITING ANY CODE: [specific files to read]
    Context: [what exists, what is missing]
    Tasks: [numbered, specific, no ambiguity]
    Cursor flags: [gotchas, things NOT to change]
    Verification: [tsc, jest, build, deploy, site confirmation]
    PROJECT_STATE.md: [what to update, FILES_MODIFIED entry]
- Prompts must be self-contained — assume Cursor has not seen prior prompts.
- Do not summarize or abbreviate — write every prompt in full.

**After each Cursor summary is pasted back:**
- Update the project status mentally.
- Queue the next prompt without being asked.
- Flag any regressions, unexpected results, or schema mismatches immediately.
- Keep a running checklist of what is done and what remains.

**Code discipline:**
- No pipeline changes unless the prompt explicitly requires them.
- No CSV format or column order changes without updating CRITICAL_DEPENDENCIES.
- tsc + jest must pass before any deploy.
- npm run web:deploy (not web:deploy:only) is the standard post-change
  deploy command — it copies data files, builds, and uploads to IONOS.

**Current stack:**
- Pipeline: Node/TypeScript, runs via scripts/run_optimizer.ps1
- Dashboard: React/Vite, served at dfs.gamesmoviesmusic.com (IONOS static)
- API: Express (local only — not available on IONOS)
- Data files: data/output_logs/*.csv, artifacts/*.json
- Deploy: npm run web:deploy → copy-data-to-public.ts + web:build +
  deploy_dashboard.ts (SFTP to /dfs on IONOS)
- Tests: Jest + MSW, maxWorkers:1, run with npx jest --no-coverage

**IONOS is static hosting only.**
- No Express routes work on IONOS.
- All dashboard data must come from static files in public/data/.
- Any /api/* fetch must have a graceful fallback for static hosting.
- Logs panel shows Last Run Summary from last_run.json, not live logs.

---

## CURRENT_OBJECTIVE

- **Pipeline integrity:** Centralized paths, fail-fast automation, env isolation, and data validation are in place (see `refactor_report.md`).
- **Testing & flags:** MSW mocking for `fetchOddsAPIProps`, type-safe feature flags (`ENABLE_INNOVATIVE_PARLAY`), and unit test coverage for API fail-fast (401/500) are implemented.
- **UD/PP merge audit complete (20260313).** Three fixes shipped: dot/initial normalization, alias map on odds side, LINE_TOLERANCE widened to 1.0. Expected recovery: ~27 PP line_diff legs + majority of UD/PP no_candidate dot-initial misses. Next: run live slate and confirm UD fallback hit rate > 30% and PP match rate > 85% in merge_report.csv.
- **ENABLE_ESPN_ENRICHMENT implemented (2026-03-14).** ESPN recent-form enrichment is implemented behind the flag (default off). After merge, `enrichLegsWithEspn(merged)` fetches last-5 game average per leg via ESPN search + gamelog API; result attached to `leg.espnEnrichment`. After calibration, `applyEspnAdjEv(leg)` nudges `adjEv` by `vsLineGap/line * 0.10`, capped ±15%. No business logic when flag is false.
- **ENABLE_FANTASY_EV wired (2026-03-14).** adjEv chain is now: **legEv → calibration → espnNudge → fantasyNudge → [getSelectionEv gate]**. When ENABLE_FANTASY_EV is on, `applyFantasyAdjEv(leg)` runs after `applyEspnAdjEv`; uses `calculateFantasyScore` (fantasyAggregator), signal = (score - FANTASY_BASELINE) / FANTASY_SCALE capped ±20%, nudge = signal × 8%, sets `leg.fantasyEv` and `leg.adjEv *= (1 + nudge)`. Default off. **ENABLE_CALIBRATION_ADJEV wired (2026-03-14):** When flag is on, card selection/filtering/ranking use `getSelectionEv(leg)` (adjEv when set, else legEv); when off, legEv. Log: `[OPTIMIZER] Selection signal: <adjEv|legEv> (calibrationAdjEv=..., buckets=N)`.
- **Phase 3 complete (2026-03-14):** Enrichment wired, flag-gated; dashboard display done (ESPN badge, fantasy chip, adjEv delta, Metrics enrichment row, TopBar flag pills). Next: live run to validate.
- **Final system expansion complete (2026-03-16):** Monte Carlo parlay validation (50k sims per card, PP + UD), fantasy score utility (`src/utils/fantasyScore.ts`), expanded stat support (3PM/STL/BLK/PRA/PA/RA/FANTASY_SCORE + aliases), correlation matrix canonical stats, dashboard tier cards pass `modelEdge` via `tierRowToCardRow`. See MONTE_CARLO_ENGINE, FANTASY_SCORE_MODEL, EXPANDED_STAT_SUPPORT and FILES_MODIFIED #58.
- **Payout canonical source (Stages 1–5, 2026-03-16):** Unified payout files removed; Monte Carlo and breakeven use a single canonical source. **Stage 1:** Deleted `data/payouts_unified.json` and `src/config/unified_payouts.ts`. **Stage 2:** PP and UD Monte Carlo now use `getPayoutByHits(flexType)` from `src/config/parlay_structures.ts` only (no unified/registry fallback at call sites). **Stage 3:** `fillZeroPayouts(payoutByHits, maxHits)` added in parlay_structures; normalized payouts passed to `runMonteCarloParlay`. **Stage 4:** Ten PP Goblin registry JSONs added (`math_models/registry/prizepicks_*_goblin.json`); `math_models/registry/index.ts` byId map extended for all Goblin structures. **Stage 5:** `npm run verify:breakeven` and `npm test` pass; Monte Carlo sample confirmed for 6F_GOBLIN, UD_7F_FLX, 3P, 2P, UD_3F_FLX; breakeven table covers all 28 structures including Goblins and UD Flex. See MONTE_CARLO_ENGINE and FILES_MODIFIED #60.
- **Automation card matrix export (2026-03-16):** New export path for DFS optimizer spreadsheet: one row per canonical card structure (31 structures from `parlay_structures.ts`), safe for future Kelly/promo wiring. Outputs: `data/output_logs/automation-card-matrix.csv`, `artifacts/automation-card-matrix.json`, `artifacts/automation-card-matrix-audit.json`. Run: `npm run export:automation-card-matrix`. Validation: row count must equal total canonical structures; audit flags missing Monte Carlo/breakeven data. See AUTOMATION_CARD_MATRIX_EXPORT and FILES_MODIFIED #61.
- **Automation card matrix pipeline integration (2026-03-16):** Export is now wired into the daily/manual run flow. After a successful optimizer run (and archive), `run_optimizer.ps1` runs `npm run export:automation-card-matrix` (fail-fast). If the export fails (row-count mismatch, missing source, or exception), the pipeline writes `last_run.json` with error `automation_card_matrix` and exits with a clear log message. The three artifacts are first-class deploy outputs: `copy-data-to-public.ts` copies them into `web-dashboard/public/data/`, so `npm run web:deploy` includes them in the static deploy. Logging: one grep-friendly summary line after export: `AUTOMATION_CARD_MATRIX rows=31 expected=31 missingMonteCarlo=... missingBreakeven=... selected=...`. Regression tests in `tests/automation_card_matrix_integration.spec.ts`. See AUTOMATION_CARD_MATRIX_EXPORT and FILES_MODIFIED #62.

**Run reporting contract:** Every completed production run should update, either via artifacts or via this document:
- **Data row counts**: key CSVs (legs, cards, tiers, merge reports, tracker snapshots) and any notable shifts slate-to-slate.
- **Model status**: math models and calibration state (tests passing, degraded modes, flags toggled).
- **Optimizer status**: run success/failure, guardrails triggered, key diagnostics (match rates, fallback hit rates).
- **Cron schedule**: current Task Scheduler / cron entries (times, scripts, and purposes).
- **Recent changes**: high-level summary of code/config changes that affect optimizer behavior or dashboard outputs.

---

## FANTASY_SCORE

- **fantasy_analyzer.ts** runs **after** card building as a **diagnostic only**. Logs top 25 fantasy edges; not used as EV input or filter.
- **confidenceDelta** is an output column on PP legs (col 19) and PP cards (col W). UD legs do **not** have a confidenceDelta column.
- **fantasy_score** props are explicitly excluded from EV legs in `merge_odds.ts` (comment: "re-enabled once independent projections wired in").
- **fantasyAggregator.ts** (`calculateFantasyScore`) is now wired into adjEv via **ENABLE_FANTASY_EV** flag (default off). When on, `applyFantasyAdjEv(leg)` calls `calculateFantasyScore`, normalizes to a ±20% signal, applies 8% nudge to adjEv, and sets `leg.fantasyEv`. Diagnostic fantasy_analyzer.ts still runs separately.
- **src/utils/fantasyScore.ts (2026-03-16):** Standalone `predictFantasyScore(playerStats)` with formula points + 1.2×reb + 1.5×ast + 3×stl + 3×blk + 0.5×threes − turnovers; used for fantasy projection and FANTASY_SCORE stat support (see FANTASY_SCORE_MODEL).
- All fantasy files are complete (no TODOs); exclusion of fantasy_score *props* from EV legs remains intentional; the **fantasy nudge** applies to any leg when the flag is on.

---

## SCORING_V2 (2026-03-14)

- **Composite score formula** (build_innovative_cards.ts): `evForScore = useAdjEvForScore ? avg(adjEv ?? legEv over legs) : cardEV`; `baseScore = evForScore × diversity × (1 − correlation) × liquidity × avgScoringWeight`; `compositeScore = baseScore × (fragile ? FRAGILE_PENALTY : 1) + confidenceBoost`; `confidenceBoost = sum(leg.confidenceDelta > 0 ? leg.confidenceDelta × CONFIDENCE_DELTA_WEIGHT : 0)`.
- **Constants** (src/constants/scoring.ts): `FRAGILE_PENALTY = 0.92`, `CONFIDENCE_DELTA_WEIGHT = 0.005`, `ADJ_EV_MIN_BUCKET_ROWS = 5`. Use adjEv as the EV factor only when calibration has ≥5 bucket rows; otherwise cardEV (DP) unchanged (0-bucket path identical).
- **Signals now active:** scoringWeight (in legEv and avgScoringWeight in composite), adjEv (when calibration active for evForScore), fragile (penalty multiplier), confidenceDelta (additive boost for PP legs).
- **Signals still inactive:** fantasyScore / fantasyAggregator (not wired); fantasy_score props excluded from EV in merge_odds.
- **Tier:** No change to Tier1/Tier2 row counts or kelly logic. Sort order is by compositeScore desc. If a fragile card ever receives tier 1 (e.g. after future classifyTier changes), a warning is logged: `[TIER] fragile card promoted to T1: <cardId> compositeScore=X fragileEvShifted=Y`.

---

## ESPN_ENRICHMENT (2026-03-14)

- **Purpose:** Fetch ESPN player status (injury report, recent minutes) and wire into pipeline as compositeScore penalties, hard block for Out/Suspended/IR, and dashboard badges.
- **Endpoints:** `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes` (paginated list); `.../athletes/<id>` (individual, recentGames minutes). No auth.
- **Cache:** 30 min TTL in `data/espn_cache.json`; skip live fetch if within TTL.
- **Timeout:** 5 000 ms; on timeout/error treat all players as "unknown" (never block pipeline).
- **Severity ladder:** BLOCKED (Out, Suspended, Injured Reserve) → remove leg, log `[ESPN] BLOCKED: <player> <status>`. RISKY (Doubtful) → compositeScore × ESPN_RISKY_PENALTY (0.88). CAUTION (Day-To-Day, Questionable) → × ESPN_CAUTION_PENALTY (0.96). ACTIVE / unknown → no penalty. Low minutes (avg last-5 < 20) → × ESPN_LOW_MINUTES_PENALTY (0.94). Penalties applied at card level as worst single multiplier (do not stack).
- **Feature flag:** `ESPN_ENRICHMENT_ENABLED` (env, default false). When off, 0-bucket and mock-odds paths unchanged.
- **Sidecar CSV:** `data/output_logs/espn_status.csv` — columns: leg_id, player, espnStatus, espnMinutes. Dashboard CardsPanel reads it and shows colored badge (orange Doubtful, yellow Q/D2D) next to player when status ≠ Active/unknown. 23-col cards CSV unchanged.
- **Name matching:** Same `normalizeForMatch` / `resolvePlayerNameForMatch` as merge_odds. Log `[ESPN] match rate: X/Y legs matched` when roster loaded.
- **KNOWN_GAPS:** Minutes fetch is per-athlete (extra API calls). Consider batch if ESPN adds a bulk endpoint.

---

## PIPELINE_STATUS

- **Team abbreviation and opponent in legs (2026-03-14).** `teamToAbbrev` util in `src/utils/teamAbbrev.ts` maps OddsAPI full names (e.g. "Boston Celtics") to 3-letter abbrevs (e.g. "BOS"); handles LA Clippers/Lakers and all 30 NBA teams; fallback = first 3 chars uppercased. **PP legs:** `fetch_props.ts` applies `teamToAbbrev` to PrizePicks API `team`/`opponent`; `merge_odds.ts` sets `team`/`opponent` on MergedPick from OddsAPI event `home_team`/`away_team` via `resolveTeamOpponent(pick, match)` so prizepicks-legs.csv gets `team` (e.g. "BOS") and `opponent` (e.g. "MIA"). **UD legs:** Same merge path; underdog-legs.csv already had opponent column; it is now populated from event data. Fresh odds path uses `fetchPlayerPropOdds` (PlayerPropOdds with `homeTeam`/`awayTeam`) directly as `oddsMarkets` so merge receives event data; cache is written with those odds so next run can use home/away from cache when available.
- **Last run (artifacts/last_run.json):** Check `artifacts/last_run.json` for current `status` and `ts`.
- **LAST_VALIDATED:** 2026-03-16 (tsc clean, verify:breakeven + npm test pass after payout canonical source Stages 1–5). Run `npx tsc --noEmit`, `npm run verify:breakeven`, `npm test` before deploy.
- **Recent changes (2026-03-16):** Monte Carlo runs on every exported PP/UD card (50k sims each); payout source is **parlay_structures.ts** only (`getPayoutByHits` + `fillZeroPayouts`); optional `monteCarloEV` / `monteCarloWinProb` on cards; warning when no payout mapping or |monteCarloEV − cardEv| > 0.05. Dashboard tier EDGE uses modelEdge when tier CSV has it, else avgEdge. PP Goblin registry JSONs added (10 files); breakeven table includes all 28 structures.
- **LAST_LIVE_RUN:** 2026-03-13 — Live run via `scripts/run_optimizer.ps1 -Force -bankroll 700` (ts: 20260313-214206). PP match rate **84.5%** (545/645); UD match rate **50.8%** (399/785). Dashboard deployed to IONOS via `npm run deploy:ftp` after run; https://dfs.gamesmoviesmusic.com shows today's data.
- **Telegram:** Single consolidated message per run; top 5 plays across all sites (PP, UD), ranked by Tier then compositeScore; sent after all sites complete. See `src/utils/telegram.ts` `buildConsolidatedMessage()`. If `runTimestamp` starts with `MOCK-` (mock run), the message includes a ⚠️ MOCK RUN line. TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in `.env`; if missing, log warning and skip.
- **Diagnosis of "optimizer" error (historical):** The PowerShell script writes `error: "optimizer"` whenever the Node process (run_optimizer.js) exits with non-zero. Common causes: no live odds (ODDSAPI_KEY missing/fail), guardrail (PP merge ratio &lt; 12%), or runtime crash. Response parsing was hardened: `httpGet` uses `res.text()` + `JSON.parse()` and throws a clear error if the body is empty or invalid JSON.
- **SGO/TRD cleanup:** Branch `cleanup/remove-sgo-trd` merged to main 2026-03-12 (merge commit `f8ce07fa437463ffaba781f42af101a9d198470b`). Pipeline is OddsAPI-only; all SGO/TRD dead code removed or deprecated. No SGO/TRD references in active pipeline output.
- **Dry-test without live API:** Set **USE_MOCK_ODDS=1** (or `--mock-legs N`) so the PrizePicks path injects synthetic legs and skips the Odds API. **Valid `--providers` are PP and UD only** (TRD is not supported). Example: `$env:USE_MOCK_ODDS="1"; node dist/src/run_optimizer.js --platform both --innovative --bankroll 700 --providers PP,UD --sports NBA`. On Windows PowerShell use `$env:USE_MOCK_ODDS = "1"` before the command. A startup log line `[OPTIMIZER] Block start: platform=both, mockLegs=50, USE_MOCK_ODDS=1, ODDSAPI_KEY set=...` confirms the mock branch. Note: with `--platform both`, the Underdog half still uses live Underdog API and OddsAPI for merge unless UD is skipped.
- **Tests:** Unit tests (Jest + MSW) for `fetchOddsAPIProps`; run with `npm run test:unit` or `npx jest tests/fetch_oddsapi_props.spec.ts`. Wiring: `npm run test` (verify_wiring.ps1 -DryRun).
- **Breakeven verification:** `npm run verify:breakeven` must pass before ship (per .cursor rules).
- **Merge quality (2026-03-13):** UD match rate improved via juice→alt rescue and name aliases. `merge_odds.ts` now triggers the alt pass on `reason=juice` (not only `line_diff`) and uses apostrophe stripping + alias "nickeil alexander walker" → "nickeil alexander-walker". Live run (319 UD rows): **40.1% match rate** (128 matched; 33 alt rescues). See `artifacts/merge_quality_audit.md`.
- **PP/UD OddsAPI fallback (2026-03-13):** When sharp-book match fails, merge tries same-book (PrizePicks or Underdog) row from OddsAPI: main lines only, line within 0.5, same player/stat. Uses same devig logic for trueProb; matchType `fallback_pp` / `fallback_ud`. Book ranker: PP/UD weight 0.6 (conservative). Log: `[MERGE] fallback matches: PP=X UD=Y (of Z total fallback attempts)`. Run with `EXPORT_MERGE_REPORT=1` to get merge_report_prizepicks.csv and merge_report_underdog.csv for fallback counts.
- **Merge fixes pending live validation (20260313).** Pre-fix baseline: PP 76.0% (421 total, 320 matched), UD 23.1% (216 total, 50 matched, 0/166 fallback hits). Expected post-fix: PP ~82–85%, UD >30% fallback hit rate. Run live slate to confirm.
- **LINE_MOVEMENT_ENABLED flag added (off by default).** When enabled: reads data/legs_archive/prizepicks-legs-YYYYMMDD.csv, detects movement across runs, applies legEv ×1.10 (toward) or ×0.92 (against). Graceful degrade if single run day. New column lineMovDir in prizepicks-legs.csv output.
- **--recalculate (2026-03-14):** Skips fetch: no Odds API refresh, no PP/UD prop fetch. Uses existing `data/output_logs/prizepicks-legs.csv` and `underdog-legs.csv` as leg input. Applies gameTime filter before card building: drops legs where `gameTime < new Date()`. Rebuilds cards, tiers, Kelly stakes from remaining legs; writes new output CSVs and updates last_run.json. Log: `[OPTIMIZER] --recalculate mode: skipping fetch, filtering to future legs only. Legs before filter: X, after: Y`. Same behavior in run_underdog_optimizer.ts when --recalculate. Script: `scripts/run_optimizer.ps1 -Recalculate`.

### MOCK_SAFETY (2026-03-14)

Guards against accidental mock data in live runs and persisted outputs:

1. **run_optimizer.ts (src/utils/mock_guard.ts):** When `effectiveMockLegs > 0` and a valid ODDSAPI_KEY (length ≥ 8) is present, log a loud `[MOCK WARNING]` so the run is unmistakably synthetic. When mock is active, **runTimestamp** is prefixed with `"MOCK-"` (e.g. `MOCK-2026-03-14T06:00:00`). This flows into all CSV `runTimestamp` columns, `artifacts/last_run.json` `ts` field, and any archive/sheets output — mock runs are visually distinct.
2. **scripts/run_optimizer.ps1:** At the top, if `USE_MOCK_ODDS=1` is set, **Write-Error** and **exit 1** (hard block). In the `finally` block, **USE_MOCK_ODDS** is cleared (same pattern as BANKROLL) so it does not leak into the next run in the same session.
3. **scripts/daily-run.ps1:** At the top, before any optimizer invocation, if `USE_MOCK_ODDS=1` is set, **Write-Error** and **exit 1** — scheduled/daily pipeline never runs with mock data.
4. **src/backfill_perf_tracker.ts:** When reading tier (and legs) CSVs from archive or `data/output_logs/`, skip any row where `runTimestamp` starts with `"MOCK-"`. Log: `[BACKFILL] Skipped X mock rows from <filename>`.

**MOCK- prefix:** Output uses `MOCK-<iso-timestamp>` (e.g. `MOCK-2026-03-14T06:00:00`) in CSVs and last_run.json when mock is active; no new columns or schema changes.

### UD_MATCH_RATE_CEILING (established 2026-03-13)

- Structural ceiling ~43%. The 281 line_diff rows are intentional UD DFS lines (goblin tier ~3.5–8.5 PTS, demon tier ~33–43 PTS) with no sharp-book equivalent. Delta is mixed direction (sharp > UD and sharp < UD), 94 unique players, stars and role players.
- Not a merge bug. merge_odds.ts correctly rejects these.
- No further UD match rate recovery work planned.
- Full diagnostic in artifacts/ud_linediff_sample.md.

### LINE_MOVEMENT (2026-03-14, UD gap closed 2026-03-16)

- **Purpose:** Detect line movement between pipeline runs (6 AM / 6 PM) and use it as a scoring signal: boost compositeScore when movement is in our favor, penalize when against us, flag on dashboard, optionally block legs where movement is strongly against us.
- **Snapshot:** `data/line_snapshots/` — filename `YYYYMMDD-HHMM.json` (e.g. 20260314-0600.json). Content: flat array of `{ player, stat, book, line, overOdds, underOdds, runTs }`. Written from normalized `PlayerPropOdds[]` after live OddsAPI fetch in `fetch_oddsapi_props.ts`; **never written when USE_MOCK_ODDS=1** (same pattern as odds_cache.json). Retention: last 7 days; older files pruned on each write.
- **Prior snapshot selection:** Most recent snapshot file that is **≥ 3 hours older** than the current run (avoids same-run double-counting). If none exists, treat as NO_PRIOR; no compositeScore adjustment.
- **Thresholds:** STRONG_AGAINST = line moved ≥ 2.0 against our pick → compositeScore × 0.80, optional block. MODERATE_AGAINST = 1.0–1.9 against → × 0.92. FAVORABLE = ≥ 1.0 in our favor → × 1.06. NEUTRAL &lt; 1.0 either way. Constants in `src/constants/scoring.ts` (LINE_STRONG_AGAINST_PENALTY, LINE_MODERATE_AGAINST_PENALTY, LINE_FAVORABLE_BOOST, LINE_MOVEMENT_BLOCK_THRESHOLD, LINE_MOVEMENT_FAVORABLE_THRESHOLD, LINE_MOVEMENT_MAX_SNAPSHOT_AGE_DAYS).
- **Feature flags (default false):** `LINE_MOVEMENT_ENABLED` (master switch), `LINE_MOVEMENT_BLOCK_ENABLED` (hard block STRONG_AGAINST legs). In `src/constants/featureFlags.ts`.
- **Who consumes prior snapshots:** **PP:** archive-based only — `applyLineMovement()` in `run_optimizer.ts` reads `data/legs_archive/prizepicks-legs-YYYYMMDD.csv` and compares runs; does **not** use `loadPriorSnapshot`/`enrichLegsWithMovement`. **UD (2026-03-16):** snapshot-based — `run_underdog_optimizer.ts` when LINE_MOVEMENT_ENABLED calls `loadPriorSnapshot(currentRunTs)` then `enrichLegsWithMovement(legs, prior.props, prior.priorRunTs, { appendToExisting: true })`; UD legs and cards use the same movement payload and worst-category compositeScore multiplier as PP.
- **Wiring:** **PP:** After ESPN enrichment in `run_optimizer.ts`, LINE_MOVEMENT_ENABLED → `applyLineMovement(sortedLegs)` (archive). **UD:** After EV filter in `run_underdog_optimizer.ts`, LINE_MOVEMENT_ENABLED → load prior snapshot; if prior exists, `enrichLegsWithMovement(filteredEv, prior.props, prior.priorRunTs, { appendToExisting: true })`, else no enrichment (no crash). In `build_innovative_cards.ts` (PP) and `makeCardResultFromUd` (UD), worst single movement category across card legs applied to compositeScore (same constants). Sidecar CSV: `data/output_logs/line_movement.csv` — schema: leg_id, player, stat, delta, category, priorLine, currentLine, priorRunTs. UD writes rows with same schema (leg_id = UD leg id); when UD runs with appendToExisting, existing PP or prior UD rows are preserved. Dashboard CardsPanel reads by leg_id and shows badge for both PP and UD legs. Telegram consolidated message appends 📈/📉/📉📉 when movement present.
- **Artifact path:** `data/output_logs/line_movement.csv` (same file for PP and UD; column order unchanged). Static hosting: copied by `copy-data-to-public.ts` (LINE_MOVEMENT_CSV in COPY_LIST).
- **Logging (UD, grep-friendly):** `LINEMOVEMENT UD start total=N`, `LINEMOVEMENT UD no prior` (when no prior snapshot), `LINEMOVEMENT UD matched=X total=Y priorRunTs=Z`, `LINEMOVEMENT UD sidecar rows=W`.
- **Degraded behavior:** **Flag off:** No movement enrichment for UD; legs and cards unchanged. **No prior snapshot:** UD logs `LINEMOVEMENT UD no prior`, skips enrichment, no crash and no false movement penalties.

---

## AUTOMATION_STATUS

- **Daily-run script:** `scripts/daily-run.ps1` invokes `scripts/run_optimizer.ps1 -Force -bankroll <bankroll>` (canonical full pipeline: compile + optimizer + artifacts + deploy). After a **successful** optimizer run (exit 0), it still runs post-run steps (archive legs/tiers, backfill tracker, scrape prior-day results). All scheduled snapshots below call `daily-run.ps1` so snapshots, artifacts, and deploy stay in lock-step.
  - **(a) Optimizer:** ✓ Covered (run_optimizer.ps1 runs the Node optimizer).
  - **(b) Archive legs + tiers:** ✓ Covered (2026-03-13). After success, daily-run copies `data/output_logs/prizepicks-legs.csv`, `underdog-legs.csv`, `tier1.csv`, `tier2.csv` to `data/legs_archive/` and `data/tier_archive/` with date-stamped filenames (`yyyyMMdd`). Non-fatal on failure.
  - **(e) Deploy dashboard to IONOS:** ✓ Covered (2026-03-15). `run_optimizer.ps1` runs `npm run web:deploy` after a successful pipeline; daily-run.ps1 re-runs `npm run web:deploy` as an extra safety net (idempotent). Site updates automatically after every scheduled run.
  - **(c) Backfill tracker:** ✓ Covered (2026-03-13). After success, `npx ts-node src/backfill_perf_tracker.ts`; non-fatal (logs WARNING on non-zero exit).
  - **(d) Scrape prior-day results:** ✓ Covered (2026-03-13). After success, `npx ts-node src/scrape_nba_leg_results.ts`; non-fatal (logs WARNING on non-zero exit).
  - **Push to sheets:** ✓ Covered (run_optimizer.ts calls `runSheetsPush()` / `sheets_push_cards.py` internally).
  - **Telegram:** ✓ Optimizer receives `--telegram` and sends content; no separate script-level success/failure alert (daily-run exit code reflects optimizer exit code only).
  - **Exit code:** Daily-run exit code reflects **run_optimizer.ps1 result only**; post-run failures do not change it.
  - **Data sync:** `scripts/deploy-ftp.js` + `npm run web:deploy` read pipeline output from `data/output_logs/` (and artifacts from `artifacts/`). Dashboard uses `VITE_DATA_BASE=data` at build time so IONOS serves from `/dfs/data/`. config/.env.example documents SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD for deploy.
- **Task Scheduler (all run as SYSTEM; new schedule 2026-03-16, Eastern Time)**

  | Task              | Time (ET) | Script                                  | Purpose                          |
  |-------------------|-----------|-----------------------------------------|----------------------------------|
  | DFS-WakePC        | 2:25 AM   | cmd /c echo wake                        | Wake PC before first job        |
  | DFS-Results-0230  | 2:30 AM   | scripts/track-results.ps1              | Results ingestion + model refresh |
  | DFS-Opening-0900  | 9:00 AM   | scripts/daily-run.ps1 -bankroll 700    | Opening market snapshot         |
  | DFS-Midday-1300   | 1:00 PM   | scripts/daily-run.ps1 -bankroll 700    | Midday adjustment snapshot      |
  | DFS-PreSlate-1730 | 5:30 PM   | scripts/daily-run.ps1 -bankroll 700    | Pre-slate snapshot              |
  | DFS-Closing-1845  | 6:45 PM   | scripts/daily-run.ps1 -bankroll 700    | Closing line snapshot           |

  - All tasks run as NT AUTHORITY\SYSTEM (no interactive session required, runs whether logged in or not).
  - Wake timer enabled via powercfg at 2:25 AM (DFS-WakePC).
  - `daily-run.ps1` logs to `scripts/daily-run.log` and tees full pipeline output to `logs/daily-run-<timestamp>.log`.
  - Snapshots at 9:00 / 13:00 / 17:30 / 18:45 give four intraday odds snapshots. **DFS-Results-0230** runs `track-results.ps1`: scrape (grade props in perf_tracker), then on success runs **post-results model refresh** (graded results export → CLV dataset → CLV calibration curve → correlation matrix → true-prob model). See POST_RESULTS_MODEL_REFRESH.

  **Manual Task Scheduler commands (recommended due to /Z flag quirks):**

  ```powershell
  # From an elevated PowerShell window
  $proj = "C:\Users\Media-Czar Desktop\Dev\dfs-optimizer"
  $daily = "$proj\scripts\daily-run.ps1"
  $track = "$proj\scripts\track-results.ps1"

  schtasks /Delete /TN "DFS-DailyRun" /F 2>$null
  schtasks /Delete /TN "DFS-EveningRun" /F 2>$null
  schtasks /Delete /TN "DFS-TrackResults" /F 2>$null

  schtasks /Create /TN "DFS-WakePC"        /TR "cmd /c echo wake" `
           /SC DAILY /ST 02:25 /RU "NT AUTHORITY\SYSTEM" /F

  schtasks /Create /TN "DFS-Results-0230"  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$track`"" `
           /SC DAILY /ST 02:30 /RU "NT AUTHORITY\SYSTEM" /F

  schtasks /Create /TN "DFS-Opening-0900"  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$daily`" -bankroll 700" `
           /SC DAILY /ST 09:00 /RU "NT AUTHORITY\SYSTEM" /F

  schtasks /Create /TN "DFS-Midday-1300"   /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$daily`" -bankroll 700" `
           /SC DAILY /ST 13:00 /RU "NT AUTHORITY\SYSTEM" /F

  schtasks /Create /TN "DFS-PreSlate-1730" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$daily`" -bankroll 700" `
           /SC DAILY /ST 17:30 /RU "NT AUTHORITY\SYSTEM" /F

  schtasks /Create /TN "DFS-Closing-1845"  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File `"$daily`" -bankroll 700" `
           /SC DAILY /ST 18:45 /RU "NT AUTHORITY\SYSTEM" /F
  ```

  **Note:** `scripts/register_scheduled_tasks.ps1` has been updated to register the same tasks when run as Administrator, but the manual commands above are the source of truth when Task Scheduler flags `/Z` incompatibilities on this Windows build.
- **.env security:** `.env` is listed in `.gitignore`; `git check-ignore -v .env` reports it ignored. If `.env` was ever committed, run `git rm --cached .env` and ensure it is not tracked.

---

## FILES_MODIFIED (Last major refactors)

1. **src/merge_odds.ts (2026-03-11 — UD merge recovery):** Recover unmatched UD legs: (a) **UD_ALT_LINE_TOLERANCE = 1.5** — when main pass would return line_diff (nearest > MAX_LINE_DIFF), for site=underdog accept nearest candidate within 1.5 as **matchType="alt_ud"** (use devig trueProb). (b) **UD_JUICE_TOLERANCE_EXTRA = 0.05** — UD maxJuice = UD_MAX_JUICE × 1.05 so slightly juiced lines pass. (c) **alt_ud** — new matchType; report as ok_alt; log `[UD-ALT] player stat pickLine→altLine trueProb=X`. **src/types.ts:** MergedPick.matchType extended with `"alt_ud"`. **artifacts/ud_merge_recovery_diagnostic.md** — diagnostic findings (line_diff/juice distribution). **scripts/ud_merge_diagnostic.ts** — one-off CSV parser for merge report. Target: UD match rate > 55%, line_diff reduced; PP unaffected.
2. **src/merge_odds.ts (2026-03-11 — main match line-exact fix):** Main match requires exact line: `LINE_EXACT_TOLERANCE = 0.001`; if `Math.abs(candidate.line - pick.line) > 0.001`, do not accept as main. Nearest-within-MAX_LINE_DIFF matches that are not exact are reclassified as **matchType="alt"** (reason=ok_alt), not main. Fixes 12 UD rows that had matchType=main but lineDelta=1.0 (audit: artifacts/ud_line_match_audit.md). Exact-first filter uses float-safe tolerance; comment: "Main match requires exact line match (within 0.001 float tolerance). Lines within 1.0 but not exact → reclassified as alt, not main."
3. **UD card builder: stat diversity, composite score, trueProb cap (2026-03-11).** **src/run_underdog_optimizer.ts:** (a) **Stat diversity cap:** In `buildUdCardsFromFiltered()`, inside both combo loops, added `satisfiesStatDiversityCap(combo, structure.size)` — no more than `ceil(size/2)` legs of the same stat per card (e.g. 8P max 4 same stat). (b) **UD composite score:** `compositeScore = cardEv × diversityScore × (1 − correlation) × liquidity`; `diversityScore` = distinct stat categories / total legs (range 0–1); `correlation` = 0.10 (default for UD); `liquidity` = 1.0; no avgScoringWeight. Sort `allCards` by `compositeScore` descending (cardEv kept for display). (c) **trueProb cap for card EV only:** When computing UD card EV, legs are passed to the EV function with `trueProb` capped at **0.72** (`Math.min(leg.trueProb, 0.72)`) to prevent lock inflation; original `trueProb` on leg objects unchanged. **src/types.ts:** `CardEvResult` extended with optional `compositeScore`, `diversityScore`, `correlation`, `liquidity`. UD cards JSON/CSV output includes `compositeScore` and `diversityScore` columns.

4. **src/constants/paths.ts** — New; centralized OUTPUT_DIR, ARTIFACTS_DIR, DATA_DIR, getOutputPath/getArtifactsPath/getDataPath, filename constants.
5. **src/run_optimizer.ts** — Path constants, output dir creation, feature flag for innovative block, data validator call; **diagnostic** `[OPTIMIZER] Block start` log; **USE_MOCK_ODDS=1** / **effectiveMockLegs** for dry-test without live API; writeCardsCsv doc comment (CSV columns match sheets_push_cards.py → 23-col A–W Sheet).
6. **scripts/run_optimizer.ps1** — _paths.ps1, fail-fast Test-Path for output files, BANKROLL env log/clear, metrics from `data/output_logs`.
7. **src/fetch_oddsapi_props.ts** — Switched from axios to fetch() for MSW compatibility; internal httpGet() with timeout, status on !res.ok, and **res.text() + JSON.parse()** with clear error on non-JSON/empty body.
8. **src/constants/featureFlags.ts** — New; type-safe FeatureFlag, isFeatureEnabled(), ENABLE_INNOVATIVE_PARLAY / ENABLE_EXPERIMENTAL_PARLAY.
9. **src/mocks/handlers.ts** + **src/mocks/server.ts** — New; MSW handlers for Odds API (events list + event odds), 401/500 handlers for fail-fast tests. Handlers use `/events/` endpoint and quota headers for fetch_oddsapi_props tests.
10. **src/merge_odds.ts (2026-03-13):** Merge quality — (a) **juice alt rescue:** when main pass returns `reason=juice`, call `findBestAltMatch`; if an alt line within 0.5 has acceptable juice, use it with `matchType="alt_juice_rescue"`. (b) **Name normalization:** `normalizeForMatch` strips apostrophes so "Kel'el Ware" matches alias "kelel ware"; alias "nickeil alexander walker" → "nickeil alexander-walker" for OddsAPI hyphen spelling. (c) **PP/UD fallback:** when sharp match fails, try same-book row from oddsMarkets (book=PrizePicks or Underdog, isMainLine=true, line within 0.5); trueProb via same devigTwoWay; matchType `fallback_pp`/`fallback_ud`; log fallback counts. **src/types.ts:** MergedPick.matchType extended to `"alt_juice_rescue"`, `"fallback_pp"`, `"fallback_ud"`. **src/odds/book_ranker.ts:** PrizePicks and Underdog added with weight 0.6 (fallback-only; conservative EV).
11. **src/merge_odds.ts (2026-03-13 — audit fixes):** normalizeForMatch dot removal; alias map (resolvePlayerNameForMatch) applied to odds side in all comparison sites; FALLBACK_DEBUG extended to PP; MAX_LINE_DIFF (LINE_TOLERANCE) widened from 0.5 → 1.0.
12. **src/mock_legs.ts:** Realistic NBA player names replacing MockPlayer placeholders.
13. **artifacts/ud_fallback_merge_audit.md** — UD audit findings (read-only, no logic).
14. **artifacts/pp_merge_audit.md** — PP audit findings (read-only, no logic).
15. **artifacts/pp_line_diff_analysis.md** — line_diff delta analysis (read-only).
16. **scripts/deploy-ftp.js + scripts/daily-run.ps1 + web-dashboard (2026-03-13 — IONOS data sync):** deploy-ftp.js reads pipeline CSVs from `data/output_logs/` (prizepicks/underdog cards and legs, tier1/tier2) and artifacts from `artifacts/` (last_run.json or last_fresh_run.json, match_rate_history.csv); builds web-dashboard with `VITE_DATA_BASE=data` so production loads from `/dfs/data/`. daily-run.ps1 after archive runs `npm run deploy:ftp` when SFTP_SERVER (or FTP_SERVER), FTP_USERNAME, FTP_PASSWORD are set; non-fatal. CardsPanel, RunContext, MetricsPanel use `VITE_DATA_BASE` for production data paths. config/.env.example and web-dashboard/.env.example document SFTP and VITE_DATA_BASE.
17. **scripts/daily-run.ps1 + register_scheduled_tasks.ps1 (2026-03-14 — logging and Task Scheduler):** daily-run.ps1: single `scripts/daily-run.log` with timestamped lines via `Write-Log($msg)` (yyyy-MM-dd HH:mm:ss); all script messages go through Write-Log; full pipeline output still tee'd to `logs/daily-run-<timestamp>.log`. Start/end banners: `[DAILY] ========== Run started ==========` and `Run complete (exit $exitCode)`. register_scheduled_tasks.ps1: all tasks use `/RU "NT AUTHORITY\SYSTEM"`; added **DFS-WakePC** at 5:50 AM (`cmd /c echo wake`); script header documents powercfg for wake timers. Run script as Administrator to register. PROJECT_STATE.md AUTOMATION_STATUS updated (SYSTEM, wake timer, daily-run.log).
18. **web-dashboard + deploy-ftp.js (VITE_DATA_BASE production fix):** Deployed dashboard was requesting `/data/output_logs/*.csv` and `/artifacts/last_run.json` (404). Fix: **web-dashboard/.env.production** added with `VITE_DATA_BASE=data` so production builds request relative `data/*` (resolves to /dfs/data/ on IONOS). **deploy-ftp.js** passes `env: { ...process.env, VITE_DATA_BASE: 'data' }` into `execSync('npm run build', ...)` so the Vite build inlines the variable. **CardsPanel.tsx** uses `DATA_BASE = (import.meta.env.VITE_DATA_BASE ?? 'data/output_logs')`; RunContext and MetricsPanel already used VITE_DATA_BASE when set. After deploy, CSV and last_run requests go to /dfs/data/* with no 404s.
19. **src/fetch_oddsapi_props.ts (2026-03-12):** Final 10-book list (draftkings,fanduel,pinnacle,lowvig,betmgm,espnbet,prizepicks,underdog,pick6,betr_us_dfs), 14 markets (10 standard + 4 alternate), no regions param; `[ODDS-QUOTA]` logging; 4h quota cache in data/odds_cache.json; guard when remaining &lt; 500. **src/fetch_props.ts** and **src/fetch_underdog_props.ts** — deprecation comments added (OddsAPI primary). **scripts/run_odds_quota_report.ts** — one-off live fetch and quota report.
20. **2026-03-14:** **src/line_movement.ts (NEW):** applyLineMovement(); reads today's legs archive, compares line/odds across runTimestamps, flags significant movement (|lineDelta|>=0.5 or |oddsDelta|>=10), applies EV adjustment, sets leg.lineMovement field. **src/types.ts:** lineMovement?: {direction, lineDelta, oddsDelta, runsObserved} added to MergedPick and EvPick. **src/run_optimizer.ts:** applyLineMovement() called after ESPN enrichment block, gated by LINE_MOVEMENT_ENABLED. lineMovDir column added to legs CSV output. **web-dashboard/src/components/CardsPanel.tsx:** Full Phase 2 dashboard — tab restructure (BEST BETS/STRONG/ALL CARDS/TOP LEGS PP/TOP LEGS UD), card detail expand panel (legs table, movement indicators, actions row), game filter bar (matchup pills, filtered stats bar). **web-dashboard/src/utils/starsBadge.ts (NEW):** calcStars() — 3 stars base, -1 per isBackToBack/questionable/lineMovement=against leg. **web-dashboard/src/styles/globals.css:** Added CSS variable aliases for --color-background-*, --color-text-*, --color-border-* mapped to existing --bg-* and --text-* vars. Added --color-border-success.
21. **tests/merge_normalization.spec.ts (2026-03-14):** Regression net for MERGE_NORMALIZATION_FIX — 12 pure unit tests: normalizeForMatch (dot/apostrophe/whitespace), resolvePlayerNameForMatch (alias both sides, passthrough, no crash), MAX_LINE_DIFF ≥ 1.0 and delta 1.0 within / 1.5 outside tolerance.
22. **src/constants/featureFlags.ts + src/types.ts (2026-03-14):** Scaffolding only. Feature flags: ENABLE_ESPN_ENRICHMENT, ENABLE_FANTASY_EV, ENABLE_CALIBRATION_ADJEV (descriptions + default false). FLAGS object with lazy getters (espnEnrichment, fantasyEv, calibrationAdjEv, innovativeParlay, experimentalParlay). Types: EspnEnrichment interface (last5Avg, last5Games, vsLineGap, injuryStatus?, fetchedAt); MergedPick and EvPick espnEnrichment?: EspnEnrichment; EvPick fantasyEv?: number. No business logic.
23. **src/espn_enrichment.ts (2026-03-14):** ENABLE_ESPN_ENRICHMENT end-to-end. fetchEspnRecentForm(playerName, statKey, line): ESPN search API → athleteId, gamelog API → last 5 games, stat mapping (PTS/REB/AST/3PM/BLK/STL + combos); returns EspnEnrichment | null (never throws). enrichLegsWithEspn(legs): gates on FLAGS.espnEnrichment, rate-limited 8 concurrent, Promise.allSettled; sets leg.espnEnrichment. applyEspnAdjEv(leg): nudge adjEv by vsLineGap/line×0.10 capped ±15%. Existing enrichLegs(EvPick[]) for ESPN_ENRICHMENT_ENABLED (injury/status) retained.
24. **src/run_optimizer.ts (2026-03-14 — ESPN wiring):** After merge, merged = await enrichLegsWithEspn(merged); log "[OPTIMIZER] ESPN enrichment: enabled=... legs=...". After calibration block, legsAfterEvFilter = legsAfterEvFilter.map(applyEspnAdjEv). calculate_ev.ts copies pick.espnEnrichment onto EvPick.
25. **src/run_underdog_optimizer.ts (2026-03-14 — ESPN wiring):** Same: merged = await enrichLegsWithEspn(merged); log; evPicks = evPicks.map(applyEspnAdjEv) after calculateEvForMergedPicks.
26. **tests/espn_enrichment.spec.ts (2026-03-14):** applyEspnAdjEv: positive/negative vsLineGap, ±15% cap, unchanged when espnEnrichment undefined or flag false. enrichLegsWithEspn: returns legs unchanged when flag false. node-fetch mocked for enrichLegs (injury) test. 8 tests total.
27. **src/apply_fantasy_ev.ts (2026-03-14):** applyFantasyAdjEv(leg): gates on FLAGS.fantasyEv; converts EvPick to UnifiedProp, calls calculateFantasyScore; signal = (score - FANTASY_BASELINE) / FANTASY_SCALE (baseline=0, scale=100), cap ±20%; nudge = signal × 0.08; sets leg.fantasyEv and leg.adjEv *= (1 + nudge). Exports FANTASY_BASELINE, FANTASY_SCALE for tuning.
28. **src/run_optimizer.ts (2026-03-14 — fantasy wiring):** After applyEspnAdjEv map, legsAfterEvFilter = legsAfterEvFilter.map(applyFantasyAdjEv); log "[OPTIMIZER] Fantasy EV: enabled=...".
29. **src/run_underdog_optimizer.ts (2026-03-14 — fantasy wiring):** Same: evPicks = evPicks.map(applyEspnAdjEv).map(applyFantasyAdjEv); log "[OPTIMIZER] Fantasy EV: enabled=...".
30. **tests/apply_fantasy_ev.spec.ts (2026-03-14):** 7 tests: fantasyEv set when flag on; positive/negative score nudge; ±20% signal cap; unchanged when flag false or score at baseline. calculateFantasyScore mocked via jest.mock.
31. **src/constants/evSelectionUtils.ts (2026-03-14):** getSelectionEv(leg): returns leg.adjEv when FLAGS.calibrationAdjEv && leg.adjEv !== undefined, else leg.legEv. getSelectionEvLabel(): "adjEv" | "legEv" for logs. Pure read-switch; no change to adjEv computation.
32. **src/run_optimizer.ts (2026-03-14 — selection signal):** All selection/filter/sort use getSelectionEv(leg). Post–applyFantasyAdjEv log: "[OPTIMIZER] Selection signal: <label> (calibrationAdjEv=..., buckets=N)". precomputeFlexFeasibilityData / checkFlexCardFeasibility / getBestCaseFlexEvUpperBound callers use getSelectionEv. writeTopLegsJson value_metric = getSelectionEv(leg). CSV columns unchanged (legEv).
33. **src/run_underdog_optimizer.ts (2026-03-14 — selection signal):** filterEvPicks, viableLegs, legsForStructure, canLegsMeetStructureThreshold(legEvs), top-10 sort and value_metric use getSelectionEv. Same selection-signal log after fantasy map (buckets from computeBucketCalibrations().length). CSV columns unchanged.
34. **src/build_innovative_cards.ts, src/pp_engine.ts, src/server.ts, src/correlation_filters.ts, src/ud_engine.ts, src/services/cardBuilder.ts (2026-03-14):** All EV-based filtering, sorting, and ranking use getSelectionEv(leg). CSV/output column names and legEv values for export unchanged.
35. **tests/ev_selection_utils.spec.ts (2026-03-14):** 6 tests: getSelectionEv returns legEv when flag off; legEv when flag on but adjEv undefined; adjEv when flag on and adjEv set; adjEv when adjEv < legEv (flag on); getSelectionEvLabel "legEv"/"adjEv" by flag. Env toggled in beforeEach/afterEach.
36. **web-dashboard (2026-03-14 — Phase 3):** **CardsPanel.tsx:** LegRow + espnEnrichment, fantasyEv, adjEv; normalizeLeg() safe JSON parse for espnEnrichment; InjuryDot, FormArrow, FantasyChip, EvWithDelta helpers; TOP LEGS table + expand panel legs table: PLAYER (injury dot), EV (legEv/adjEv/delta), fantasy chip, FORM column (form arrow with tooltip). **MetricsPanel.tsx:** Fetch PP/UD legs; enrichment row "ESPN {N} legs | FantasyEV {N} legs | AdjEv active: yes/no". **TopBar.tsx:** Three flag pills (ESPN, FantasyEV, CalibAdj) from VITE_ENABLE_* env. **web-dashboard/.env.example:** Phase 3 comment + VITE_ENABLE_ESPN_ENRICHMENT, VITE_ENABLE_FANTASY_EV, VITE_ENABLE_CALIBRATION_ADJEV.
37. **scripts/deploy_dashboard.ts (2026-03-14):** Uploads `web-dashboard/dist/` to IONOS via SFTP (ssh2-sftp-client). Loads .env from project root; fails fast if SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD, SFTP_PATH, FTP_PORT missing. Logs "[DEPLOY] Uploading X → remotePath" and "[DEPLOY] Done. N files uploaded in Ys". **package.json:** web:deploy (build + ts-node deploy_dashboard.ts), web:deploy:only (push only). **config/.env.example:** SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD, SFTP_PATH, FTP_PORT (port 22 = SFTP). **scripts/daily-run.ps1:** Comment that web:deploy is not called — deploy manually with web:deploy:only.
38. **2026-03-14 (recalculate + dashboard):** **src/cli_args.ts:** recalculate flag and --recalculate parsing. **src/run_optimizer.ts:** recalculate branch (load PP legs CSV, parse, gameTime filter, mergedCountForLog), parseLegsCsvToEvPicks(), writeLegsCsv + opponent column. **src/run_underdog_optimizer.ts:** recalculate branch (load UD legs CSV, parse, gameTime filter), parseUdLegsCsvToEvPicks(), UD legs CSV + opponent. **scripts/run_optimizer.ps1:** -Recalculate switch, pass --recalculate to node. **src/server.ts:** POST /api/recalculate (spawn run_optimizer --recalculate --platform both --bankroll from last_run.json), 202/409, in-memory lock + 10min timeout. **web-dashboard/src/components/ControlPanel.tsx:** Recalculate button, tooltip, recalculating/409 state. **web-dashboard/src/components/CardsPanel.tsx:** LegRow opponent; PLAYER cell (TEAM) muted; OPP column; GameOption timeLabel/matchupLabel; two-line bubbles; visibleCards/hiddenCardsCount (auto-hide started cards); filteredLegs future-only; "X cards hidden" status line; 60s tick for now. **docs/PROJECT_STATE.md:** PIPELINE_STATUS --recalculate, WEBPAGE recalculate/game context/bubbles/auto-hide, FILES_MODIFIED.
39. **web-dashboard/src/components/CardsPanel.tsx (2026-03-14):** TYPE column between SITE and LEGS SUMMARY (format legCount+typeCode: 6F, 4P, 3S); getCardLegIds/getTypeCode/getTypeLabel helpers; expandable inline leg detail (one card at a time, sub-table PLAYER|STAT|PICK|LINE|EDGE%|EV%, player-name copy + "Copied!" 1.5s, stopPropagation); Copy slip format one prop per line plain text; stopPropagation on Link and Copy so row expand not triggered. Removed detailCopyFlash state; leg detail uses copiedPlayerLegId for player copy flash.
40. **src/run_optimizer.ts + src/run_underdog_optimizer.ts (2026-03-14 — DeepLink):** PP cards CSV: added **DeepLink** column (last column, value https://app.prizepicks.com). UD cards CSV: added **DeepLink** column (last column, value https://play.underdogfantasy.com/pick-em). Telegram UD top-5 uses headers.indexOf("DeepLink"); Sheets push builds column T from LegID formula and does not read CSV DeepLink. CRITICAL_DEPENDENCIES updated: PP/UD cards 28 cols; D2 note resolved.
41. **web-dashboard/src/components/CardsPanel.tsx (2026-03-14 — TOP LEGS UD):** Diagnostic logging for legs load (PP/UD counts, UD path; warn if UD legs empty). When TOP LEGS UD tab active: log legs shown vs raw count after game + gameTime filter; warn if all UD legs hidden (stale CSV). Confirmed: UD filename `underdog-legs.csv`, same DATA_BASE as PP; PapaParse header:true; no site-column filter (separate udLegs/ppLegs). No CSV or PP logic changed.
42. **web-dashboard/src/components/CardsPanel.tsx (2026-03-14 — parlay links + bubbles):** getCardDeepLink(row): returns row.DeepLink when present, else PP/UD static URL by site. Link button (BEST BETS + STRONG/ALL) uses getCardDeepLink for href; always clickable; stopPropagation on anchor and td. Time bubbles: matchupLabel from leg.team/opponent (gameOptions); line 2 rendered only when matchupLabel truthy (time-only bubble when team or opponent missing).
43. **Team abbreviation + opponent in legs (2026-03-14):** **src/utils/teamAbbrev.ts** (new): `teamToAbbrev(name)` — 30 NBA teams, LA Clippers/Lakers variants, fallback first 3 chars uppercased. **src/types.ts:** PlayerPropOdds optional `homeTeam`, `awayTeam`. **src/fetch_oddsapi_props.ts:** normalizeEvent sets `homeTeam`/`awayTeam` on each row from event. **src/fetch_props.ts:** mapJsonToRawPicks applies teamToAbbrev to PP API team/opponent. **src/merge_odds.ts:** import teamToAbbrev; resolveTeamOpponent(pick, market) from event home/away; main + fallback + synthetic merged.push set team/opponent; fresh path uses fetchPlayerPropOdds() as oddsMarkets (keeps homeTeam/awayTeam); cache mapping passes homeTeam/awayTeam; cache write after fresh fetch. PP and UD legs CSVs get team (e.g. BOS) and opponent (e.g. MIA) for dashboard "BOS @ MIA" bubbles.
44. **Dashboard stale fix, Logs, match rate badges, hit/miss, goblin/demon (2026-03-14):** **web-dashboard/src/context/RunContext.tsx:** parseLastRunTs accepts YYYYMMDD-HHMM or YYYYMMDD-HHMMSS; run_ts compared as string; poll fetches last_run.json + match_rate_history.csv; lastMatchRates from last CSV row (pp_rate, ud_rate). **web-dashboard/src/components/TopBar.tsx:** matchRates prop, "PP X% | UD Y%" badges. **web-dashboard/src/App.tsx:** pass lastMatchRates to TopBar. **web-dashboard/src/components/LogsPanel.tsx:** on 4xx/5xx or HTML response show "Logs unavailable — API not reachable". **web-dashboard/src/components/CardsPanel.tsx:** fetch /api/tracker-results, TrackerDot (hit/miss) in Top Legs; GoblinDemonBadge (G/D) after LINE in expanded leg detail; LegRow leg_key, scoringWeight. **src/server.ts:** GET /api/tracker-results from readTrackerRows(), returns { leg_key, result }. **scripts/deploy-ftp.js:** dist/data log includes last_run.json, match_rate_history.csv. **src/run_optimizer.ts:** legs CSV + scoringWeight column. **src/run_underdog_optimizer.ts:** UD legs CSV + scoringWeight column.
45. **web:deploy copies data before build (2026-03-15):** **scripts/copy-data-to-public.ts** (new): Copies artifacts (last_run.json, match_rate_history.csv) and data/output_logs (prizepicks-legs, underdog-legs, prizepicks-cards, underdog-cards, tier1, tier2) to web-dashboard/public/data/; logs [COPY] copied/skipped per file; never throws on missing file. **package.json:** `web:deploy` = `copy-data-to-public.ts && web:build && web:deploy:only`; `web:deploy:only` unchanged (upload dist only). Standard post-run deploy is `npm run web:deploy` so the site gets fresh data.
46. **web-dashboard/src/components/CardsPanel.tsx (2026-03-15):** Bubble dedup key normalized (teams sorted alphabetically for key only; display label unchanged). Matchup line 2 contrast: `rgba(255,255,255,0.85)`. Load tier1.csv/tier2.csv; BEST BETS = tier1 (cap 20) or fallback (cardEV≥5%, avgEdge≥5%, kellyStake≥5, portfolioRank≤50); STRONG = tier2 or fallback (cardEV≥3%, avgEdge≥3%, kellyStake≥1). Normalize cardEV (percent/decimal) and kellyStake ($ string). Fallback when tier1 empty; diagnostic log when 0 cards in view.
47. **web-dashboard/src/components/CardsPanel.tsx (2026-03-15 — dashboard fixes 3,4,7,8,9):** Fix 3: game filter bubbles only when timeLabel or matchupLabel present (no T2/T3/T4/T5 clutter). Fix 4: STRONG/ALL PLAYER column shows last name of first leg only. Fix 7: tierRowToCardRow includes leg7Id/leg8Id for UD. Fix 8: expanded leg detail EDGE%/EV% from leg.edge and leg.legEv independently. Fix 9: diagnostic when 0 cards in view. Type fix: edge/legEv empty check via String(·).trim() !== '' for tsc. **Duplicate game bubble fix (2026-03-15):** matchupLabel in gameOptions useMemo uses sortedTeams order (same as dedup key) so one bubble per game; removed overwrite of matchupLabel from raw leg order. **gameTime filter fix (2026-03-15):** parseGameTime() / isGameTimeFuture() — time-only or invalid gameTime treated as future; formatGameTime() returns time-only as-is; visibleCards and filteredLegs use same logic so legs/cards are not hidden when gameTime is unparseable. **Game filter fallback (2026-03-15):** filteredCards: if game filter yields 0 cards but filteredCardsByView.length > 0, return filteredCardsByView and warn; visibleCards: if gameTime filter yields 0 but filteredCards.length > 0, return filteredCards and warn — never show 0 when cards exist.
48. **web-dashboard/src/context/RunContext.tsx (2026-03-15):** parseLastRunTs accepts YYYYMMDD-HHMM or YYYYMMDD-HHMMSS; match-rate CSV parse swaps pp_rate ↔ ud_rate so TopBar shows correct PP/UD badges (Fix 6 workaround).
49. **web-dashboard/vite.config.ts (2026-03-15 — IONOS path fix):** **base: `./`** (relative) so JS/CSS resolve under server document root; VITE_DATA_BASE in .env.production (see #50) handles data paths.
50. **web-dashboard/.env.production (2026-03-15):** VITE_DATA_BASE=/data so requests go to /data/*.csv; IONOS doc root is /dfs/, so /data/* resolves to /dfs/data/* on server → 200.
51. **web-dashboard/src/context/RunContext.tsx (2026-03-15 — poll URL fallback):** When VITE_DATA_BASE unset, use `data` for last_run.json and match_rate_history.csv (not API_BASE/artifacts/...) so static host does not 404.
52. **Dashboard fix plan (2026-03-15):** **Pipeline:** src/config/parlay_structures.ts — PP_GOBLIN_* payout tables; src/build_innovative_cards.ts — isGoblin branch, evaluateSyncCard/cardKellyFrac/computeFragileEv use goblin payouts; math_models/ev_dp_prizepicks.ts — *_GOBLIN structure IDs. **Dashboard:** web-dashboard/src/components/CardsPanel.tsx — getCardRowKey(), expand by row key, formatLegsSummary fallback lastName(name), gameOptions key = gameKeySuffix only, legMatchesGame "X @ Y", filteredLegs allSelected when 0 or all games; web-dashboard/src/index.css — tbody tr:first-child td font-weight: normal (Fix 10). **Docs:** PROJECT_STATE.md WEBPAGE — Link prefill limitation; dashboard fix plan + Fix 10 done.
53. **Correlation-aware probability (2026-03-16):** **src/utils/correlationAdjustment.ts** (new): Loads `data/models/prop_correlation_matrix.csv`; `getStatCorrelation(statA, statB)`; `computeCardCorrelation(card)` / `computeAverageCorrelationForLegs(legs)` (avg stat correlation, clamped [-0.4, 0.4]); `applyCorrelationAdjustmentToLegs(legs)` → adjusted probs (adjustment = avgCorrelation × 0.25, clamp [0.02, 0.98]), sets `leg.adjustedProb` and overwrites `leg.trueProb` on clones for DP input. **src/run_optimizer.ts:** Before PP card EV, `applyCorrelationAdjustmentToLegs(chosen)`; export metrics use `computeCardCorrelation(card)`; `card.metrics.correlationScore` added. **src/run_underdog_optimizer.ts:** `makeCardResultFromUd` uses `applyCorrelationAdjustmentToLegs(legs)`; UD card correlation/diversity from adjusted legs; unified cards metrics include `correlationScore`. **src/types.ts:** EvPick `adjustedProb?: number`. DP/Kelly math unchanged; only inputs adjusted.
54. **CLV calibration script (2026-03-16):** **scripts/build_clv_calibration.ts:** Reads `data/models/prop_clv_dataset.csv` (implied_prob, hit); buckets implied probability into 0.02 intervals; per bucket computes actual_hit_rate and samples; writes `data/models/clv_calibration_curve.csv` (implied_prob_bucket, actual_hit_rate, samples).
55. **True probability model training (2026-03-16):** **scripts/train_true_probability_model.ts:** Builds training set from prop_history, results, line_movement, CLV datasets; features: player, stat_type, line, implied_probability, line_movement, hours_before_game; target: hit; trains gradient-boosted decision stump ensemble; saves `data/models/true_prob_model.json` (featureNames, playerEncoding, statTypeEncoding, initialBias, learningRate, stumps).
56. **True probability model in pipeline (2026-03-16):** **src/run_optimizer.ts:** If `data/models/true_prob_model.json` exists, load once; for each leg after player cap, `predictTrueProbForLeg(model, leg)` (features: line, impliedProb from odds, lineMovement, hoursBeforeGame, playerEnc, statTypeEnc); set `leg.trueProb = prediction`. Fallback: sportsbook implied probability from over/under odds, or existing trueProb. `applyTrueProbModelToLegs(filtered)` called before card building so DP EV uses model probabilities when available.
57. **Dashboard card EDGE column + modelEdge CSV (2026-03-16):** **Pipeline:** PP cards CSV and UD cards CSV now include **modelEdge** column (card-level trueProb − impliedProb from export metrics). **web-dashboard/src/components/CardsPanel.tsx:** CardRow has `modelEdge?: number`; PP/UD CSV load maps `modelEdge` via normalizeModelEdge; EDGE column uses `card.metrics.modelEdge` (row.modelEdge from CSV) when present, else avgEdgePct; EV column always shows cardEv. SortKey includes modelEdge. EDGE and EV are separate metrics.
58. **Final system expansion — odds modeling + Monte Carlo + dashboard (2026-03-16):** **EXPANDED_STAT_SUPPORT:** Stat mappings 3PT/3PTM→3PM (threes), STEALS→STL, BLOCKS→BLK, FANTASY→FANTASY_SCORE in merge_odds.ts STAT_MAP; load_underdog_props, fetch_underdog_props, fetch_underdog_manual mapStatType; propAdapter toStatCategory; correlationAdjustment canonical stat for matrix lookup (3pm/threes, stl/steals, blk/blocks, fantasy/fantasy_score). **FANTASY_SCORE_MODEL:** src/utils/fantasyScore.ts — predictFantasyScore(playerStats), formula points + 1.2×reb + 1.5×ast + 3×stl + 3×blk + 0.5×threes − turnovers. **MONTE_CARLO_ENGINE:** math_models/monte_carlo_parlays.ts — runMonteCarloParlay(legs, payoutByHits, stake, 50k sims), returns monteCarloEV, monteCarloWinProb, payoutVariance; CardEvResult extended with monteCarloEV?, monteCarloWinProb?; PP and UD export run Monte Carlo and log if |monteCarloEV − cardEv| > 0.05. **Dashboard:** tierRowToCardRow sets modelEdge: normalizeModelEdge(r.modelEdge ?? r.avgEdge) so EDGE column prefers modelEdge for tier cards.
59. **Unified payouts for PP + UD Monte Carlo (2026-03-16) — SUPERSEDED:** Previously added `data/payouts_unified.json` and `src/config/unified_payouts.ts`; Monte Carlo used unified → registry fallback. **As of 2026-03-16 (Stages 1–2):** Unified approach removed. `data/payouts_unified.json` and `src/config/unified_payouts.ts` were **deleted**. Monte Carlo now uses **parlay_structures.ts** only (`getPayoutByHits(flexType)`). See FILES_MODIFIED #60 and MONTE_CARLO_ENGINE.

60. **Payout canonical source — Stages 1–5 (2026-03-16):** **Stage 1:** Deleted `data/payouts_unified.json`, `src/config/unified_payouts.ts`. **Stage 2:** `src/run_optimizer.ts` and `src/run_underdog_optimizer.ts` — removed imports of `getPayoutByHitsFromUnified` and `getPayoutByHitsFromRegistry` for Monte Carlo; added `import { getPayoutByHits, fillZeroPayouts } from "./config/parlay_structures"`. Monte Carlo block: `payoutByHits = getPayoutByHits(card.flexType)` (or `flexType` for UD); `if (!payoutByHits) console.warn(...)`; pass `normalizedPayouts` into `runMonteCarloParlay`. **Stage 3:** `src/config/parlay_structures.ts` — added `fillZeroPayouts(payoutByHits, maxHits)`; both run_* use `normalizedPayouts = fillZeroPayouts(payoutByHits, card.legs.length)` before `runMonteCarloParlay`. **Stage 4:** Created 10 registry JSONs: `math_models/registry/prizepicks_2p_goblin.json` … `prizepicks_6f_goblin.json`; updated `math_models/registry/index.ts` byId map with all Goblin structureIds. **Stage 5:** Verified `npm run verify:breakeven` and `npm test` pass; added `scripts/sample_monte_carlo.ts` for spot checks (6F_GOBLIN, UD_7F_FLX, 3P, 2P, UD_3F_FLX). Breakeven table (parlay_structures) already included all 28 structures; no code change.
61. **Automation card matrix export (2026-03-16):** **src/automation/automation_card_matrix.ts** (new): Builds one row per canonical structure from `parlay_structures.ts` (ALL_STRUCTURES); reads breakeven from `src/config/binomial_breakeven.ts` (BREAKEVEN_TABLE_ROWS); selected status from tier1.csv, tier2.csv (PP) and underdog-cards.csv (UD); card metrics from prizepicks-cards.json and underdog-cards.json. Writes CSV (exact column order), JSON, and audit JSON. **scripts/export_automation_card_matrix.ts** (new): CLI entry; calls writeAutomationCardMatrix(cwd), exits 1 if rowCount !== totalCanonicalStructures. **package.json:** script `export:automation-card-matrix`. **docs/PROJECT_STATE.md:** CURRENT_OBJECTIVE bullet, AUTOMATION_CARD_MATRIX_EXPORT section, FILES_MODIFIED #61.
62. **Automation card matrix pipeline integration (2026-03-16):** **scripts/run_optimizer.ps1:** Step 5b after archive: run `npm run export:automation-card-matrix` (Invoke-NativeWithLogging); on failure write last_run.json error "automation_card_matrix", log clear message (row-count mismatch / missing source / unhandled), throw. **scripts/copy-data-to-public.ts:** COPY_LIST extended with automation-card-matrix.csv (from data/output_logs), automation-card-matrix.json and automation-card-matrix-audit.json (from artifacts); OPTIONAL_CSV_PLACEHOLDERS and OPTIONAL_JSON_PLACEHOLDERS for when source missing; main() guarded with require.main === module. **src/automation/automation_card_matrix.ts:** Audit extended with selectedForWagerCount; AUTOMATION_CARD_MATRIX_CSV_HEADERS exported for tests. **scripts/export_automation_card_matrix.ts:** main() wrapper, try/catch for unhandled exception with clear stderr; one-line log: AUTOMATION_CARD_MATRIX rows=... expected=... missingMonteCarlo=... missingBreakeven=... selected=.... **tests/automation_card_matrix_integration.spec.ts** (new): CSV column order, 31-row count, fail-path assertion, copy-data-to-public.ts includes the three filenames. **docs/PROJECT_STATE.md:** CURRENT_OBJECTIVE automation integration bullet, AUTOMATION_CARD_MATRIX_EXPORT pipeline integration and logging format, FILES_MODIFIED #62.
63. **Post-results model refresh pipeline (2026-03-16):** **src/results/exportGradedResultsFromTracker.ts** (new): Exports graded perf_tracker rows (result in [0,1], scrape_stat set) to `data/results/nba_results_master.csv` so CLV/correlation/true-prob scripts have a single graded-results source. **scripts/run_post_results_model_refresh.ts** (new): Orchestrator runs in order — (1) graded_results export, (2) build_clv_dataset, (3) build_clv_calibration, (4) build_prop_correlations, (5) train_true_probability_model. Fail-loud: upstream failure stops downstream stages. Writes `artifacts/post-results-model-refresh.json` (runTimestamp, stages, input/output paths and row counts, trueProbModelRetrained, degradedModeWarnings). **scripts/track-results.ps1:** After successful scrape, runs `npx ts-node scripts/run_post_results_model_refresh.ts`; on refresh failure logs WARNING and exits with scrape exit code. **package.json:** script `post-results-refresh`. **scripts/copy-data-to-public.ts:** COPY_LIST + placeholder for `post-results-model-refresh.json`. **tests/post_results_model_refresh.spec.ts** (new): Stage order, audit shape, stage status. **docs/PROJECT_STATE.md:** POST_RESULTS_MODEL_REFRESH section, AUTOMATION_STATUS/CALIBRATION_STATUS updates, FILES_MODIFIED #63.
64. **UD line movement wiring (2026-03-16):** **src/line_movement.ts:** Added `EnrichLegsWithMovementOptions` with `appendToExisting?: boolean`; `enrichLegsWithMovement(..., options)` when appendToExisting reads existing `line_movement.csv`, appends new rows, writes same header/column order. **src/run_underdog_optimizer.ts:** Removed TODO; import `loadPriorSnapshot`, `enrichLegsWithMovement`, `formatRunTsForSnapshot` from line_movement and LINE_* from constants/scoring. After filteredEv: if LINE_MOVEMENT_ENABLED, currentRunTs = formatRunTsForSnapshot(tsBase), prior = loadPriorSnapshot(currentRunTs); if prior, legsForRest = enrichLegsWithMovement(filteredEv, prior.props, prior.priorRunTs, { appendToExisting: true }), else legsForRest = filteredEv; log LINEMOVEMENT UD start/matched/sidecar rows or no prior. All downstream uses of filteredEv (legs JSON/CSV, top_legs, appendPropsToHistory, buildUdCardsFromFiltered) use legsForRest. In makeCardResultFromUd: apply worst single movement category multiplier to compositeScore (same as build_innovative_cards). UD legs CSV: added column lineMovDir (category when lineMovement present). **src/__tests__/line_movement.test.ts** (new): formatRunTsForSnapshot, classifyMovement (strong_against, moderate_against, favorable, no_prior), loadPriorSnapshot returns null when dir missing, enrichLegsWithMovement sidecar schema and appendToExisting. **jest.config.js:** testMatch extended with `**/src/__tests__/**/*.test.ts`. **docs/PROJECT_STATE.md:** LINE_MOVEMENT section — UD gap closed; PP vs UD consumption; artifact path; UD logging; degraded behavior; FILES_MODIFIED #64.
65. **Canonical NBA prop warehouse (2026-03-16):** **src/constants/paths.ts:** Added `NBA_PROPS_MASTER_CSV`, `MLB_PROPS_MASTER_CSV`, `PROP_WAREHOUSE_AUDIT_JSON`. **src/services/propHistory.ts:** Uses `getDataPath(NBA_PROPS_MASTER_CSV)`/`MLB_PROPS_MASTER_CSV`; `appendPropsToHistory(legs, runTimestamp, options?)` with `options.platform` for logging; logs `PROPHISTORY append platform=PP|UD sport=NBA|MLB added=X skipped=Y total=Z`. **scripts/validate_prop_warehouse.ts:** Uses same path constants; writes `artifacts/prop-warehouse-audit.json` (generatedAt, nba/mlb with canonicalPath, fileExists, rowCount, latestDate, latestSnapshot, ppRowCount, udRowCount, duplicateWarningCount, validationStatus); logs `PROPWAREHOUSE status=... rows=... latestDate=... latestSnapshot=...`. **src/run_optimizer.ts:** Passes `{ platform: "PP" }` to appendPropsToHistory. **src/run_underdog_optimizer.ts:** Passes `{ platform: "UD" }` to appendPropsToHistory. **scripts/copy-data-to-public.ts:** COPY_LIST + `prop-warehouse-audit.json`; OPTIONAL_JSON_PLACEHOLDERS for it. **tests/prop_warehouse_canonical.spec.ts** (new): Canonical path resolution, append no-throw, validator path, audit shape. **docs/PROJECT_STATE.md:** CANONICAL_NBA_PROP_WAREHOUSE section, PROP_WAREHOUSE and PROP_WAREHOUSE_VALIDATION updated to canonical path and audit; FILES_MODIFIED #65.
66. **Prop warehouse path lockdown (2026-03-17):** All scripts that read the NBA/MLB prop warehouse now use `getDataPath(NBA_PROPS_MASTER_CSV)` or `getDataPath(MLB_PROPS_MASTER_CSV)` from `src/constants/paths.ts` instead of `getDataPath(path.join("prop_history", "nba_props_master.csv"))`. **Updated:** `scripts/build_line_movement_dataset.ts`, `scripts/build_clv_dataset.ts`, `scripts/build_hit_rate_dataset.ts`, `scripts/build_edge_dataset.ts`, `scripts/train_true_probability_model.ts`, `scripts/prop_history_health_check.ts`, `scripts/run_post_results_model_refresh.ts`. **docs/PROJECT_STATE.md:** CANONICAL_NBA_PROP_WAREHOUSE — schema contract references HEADER_COLUMNS in propHistory.ts; new subsection "Canonical warehouse contract — lockdown" with exact path, consumer list, validator report output path. No new path alias; no schema change; no change to payout/Monte Carlo/breakeven/automation-card-matrix/post-results-refresh/line-movement logic.
67. **matchType → prop warehouse (2026-03-17):** **src/types.ts:** EvPick extended with `matchType?: "main" | "alt" | "alt_ud" | "alt_juice_rescue" | "fallback_pp" | "fallback_ud"`. **src/calculate_ev.ts:** `calculateEvForMergedPick` copies `pick.matchType` to EvPick when non-empty. **src/services/propHistory.ts:** `toHistoryRow` sets `match_type` from `leg.matchType ?? ""`; exported `HEADER_COLUMNS` for tests. **scripts/validate_prop_warehouse.ts:** `WarehouseRow` + `match_type`; `PropWarehouseAudit` + `matchTypeCounts?: Record<string, number>`; `computeMatchTypeCounts(rows)`; audit JSON and log line include matchTypes (main, alt, fallback_pp, fallback_ud, blank); blank/missing not fatal. **tests/prop_warehouse_canonical.spec.ts:** matchType propagation (MergedPick → EvPick), HEADER_COLUMNS order (match_type after dfs_platform), audit matchTypeCounts when rowCount > 0. **docs/PROJECT_STATE.md:** CANONICAL_NBA_PROP_WAREHOUSE — match_type column documented; placeholder note removed; audit matchTypeCounts and logging; match_type consumers and backward compatibility. PROP_WAREHOUSE — match_type semantics. FILES_MODIFIED #67.
68. **lineDelta → legs CSV + dashboard MOVE (2026-03-17):** **src/run_optimizer.ts:** prizepicks-legs.csv writer adds `lineDelta` column after `lineMovDir`; value comes from `leg.lineMovement.lineDelta` (archive-based applyLineMovement) or `lineMovement.delta` (snapshot-based) when present, else empty. **src/run_underdog_optimizer.ts:** underdog-legs.csv writer extended similarly; `lineDelta` is populated from lineMovement union when available. **web-dashboard/src/components/CardsPanel.tsx:** `LegRow` extended with optional `lineDelta`; `lineMovementByLegId` map now stores `lineDelta` alongside category/direction (fed by line_movement.csv `delta` column); MOVE column on TOP LEGS PP/UD prefers leg.lineDelta, then map.lineDelta, then map.delta, and shows arrow color by direction with a `LineΔ` tooltip. line_movement.csv schema and badge colors/categories unchanged; static hosting and COPY_LIST unchanged. **docs/PROJECT_STATE.md:** KNOWN_GAPS entry for lineDelta removed; MOVE rendering source of truth documented via legs CSV `lineDelta` + lineMovementByLegId map. FILES_MODIFIED #68.

---

## POST_RESULTS_MODEL_REFRESH (2026-03-16)

- **Purpose:** After results ingestion (scrape/grading), refresh downstream model artifacts in a deterministic order so CLV calibration, correlation matrix, and true-prob model stay in sync with graded data.
- **Invocation:** Run only after **successful** results ingestion. **Primary:** `scripts/track-results.ps1` runs scrape, then on exit 0 runs `npx ts-node scripts/run_post_results_model_refresh.ts`. **Manual:** `npm run post-results-refresh` from project root.
- **Stage order (fail-loud):** (1) **graded_results** — export perf_tracker (graded rows only) to `data/results/nba_results_master.csv`. (2) **clv_dataset** — `scripts/build_clv_dataset.ts` (writes `data/models/prop_clv_dataset.csv`). (3) **clv_calibration** — `scripts/build_clv_calibration.ts` (writes `data/models/clv_calibration_curve.csv`). (4) **correlation_matrix** — `scripts/build_prop_correlations.ts` (writes `data/models/prop_correlation_matrix.csv`). (5) **true_prob_model** — `scripts/train_true_probability_model.ts` (writes `data/models/true_prob_model.json`). If an upstream stage fails, downstream stages are not run; orchestrator exits 1 and writes audit with finalStatus=failed.
- **Non-fatal:** Only stage 5 (true_prob_model) is allowed to result in finalStatus=partial (training can fail with 0 examples); other stages are fail-fast. build_clv_dataset.ts currently exits 0 on catch (non-fatal in script); orchestrator still records status=ok/fail from exit code.
- **Audit artifact:** `artifacts/post-results-model-refresh.json`. Contains: runTimestamp, finalStatus (ok|partial|failed), stages (stage, status, rows, outputPath), inputFiles (paths, exists, rows/gradedRows), outputFiles (paths), trueProbModelRetrained, degradedModeWarnings.
- **Logging (grep-friendly):** `POST_RESULTS_REFRESH stage=<id> start`, `POST_RESULTS_REFRESH stage=<id> status=ok rows=...`, `POST_RESULTS_REFRESH final status=ok|partial|failed`.
- **Paths:** All use `src/constants/paths.ts` (getDataPath, getArtifactsPath). No new path abstraction.
- **Deploy:** Audit is in COPY_LIST; copied to `web-dashboard/public/data/post-results-model-refresh.json` on `npm run web:deploy` for static inspection.

---

## AUTOMATION_CARD_MATRIX_EXPORT (2026-03-16)

- **Purpose:** One row per canonical card structure for spreadsheet ingestion and future Kelly/promo wiring; payout consistency from `src/config/parlay_structures.ts` only.
- **Output files:** `data/output_logs/automation-card-matrix.csv`, `artifacts/automation-card-matrix.json`, `artifacts/automation-card-matrix-audit.json`.
- **CLI:** `npm run export:automation-card-matrix`.
- **CSV columns (order):** platform, flexType, structureId, legs, stake, EV, EV$, winProb, payoutVar, breakeven%, breakevenOdds, selectedForWager, kellyStake, promoMultiplier, promoNotes. Numeric: 2 decimals; percent: xx.xx%; kellyStake/promoMultiplier default 0.00; promoNotes default empty.
- **Data source:** Structures from `parlay_structures.ts` (ALL_STRUCTURES); breakeven from binomial_breakeven (BREAKEVEN_TABLE_ROWS); EV/winProb/payoutVar from latest prizepicks-cards.json and underdog-cards.json where available; EV$ = stake × EV.
- **selectedForWager rule:** PP: selected if tier1.csv or tier2.csv has a row with site=PP and flexType=structureId. UD: selected if underdog-cards.csv has at least one row with flexType=structureId. Rule is documented in code and in audit JSON.
- **Validation:** Export asserts exported row count equals total canonical structure count (31). Audit records: totalCanonicalStructures, exportedRowCount, selectedForWagerCount, missingMonteCarloStructures, missingBreakevenStructures, duplicateStructureMatches, flexTypeMismatches, selectedForWagerRule. Missing data does not drop rows; structures without card or breakeven data are emitted with default/blank metrics and flagged in audit.
- **Pipeline integration (2026-03-16):** The export runs automatically in `scripts/run_optimizer.ps1` after a successful optimizer run (step 5b, before prop warehouse validation and deploy). Failure (row-count mismatch or unhandled exception) fails the pipeline and writes `artifacts/last_run.json` with `"error":"automation_card_matrix"`. **Canonical runtime paths:** CSV: `data/output_logs/automation-card-matrix.csv`; JSON: `artifacts/automation-card-matrix.json`; Audit: `artifacts/automation-card-matrix-audit.json`. These paths use `src/constants/paths.ts` (OUTPUT_DIR, getOutputPath, getArtifactsPath). **Deploy:** All three files are in `scripts/copy-data-to-public.ts` COPY_LIST and are copied to `web-dashboard/public/data/` when running `npm run web:deploy`, so they are available at the same static data URL as other artifacts. **Logging format (grep-friendly):** `AUTOMATION_CARD_MATRIX rows=<N> expected=<N> missingMonteCarlo=<M> missingBreakeven=<B> selected=<S>`.

---

## UNIFIED_PAYOUTS_ROLLBACK (2026-03-16) — SUPERSEDED

**Status:** Unified payouts were **removed** in Stage 1 (2026-03-16). `data/payouts_unified.json` and `src/config/unified_payouts.ts` no longer exist. Monte Carlo now uses `getPayoutByHits` from `parlay_structures.ts` only. This rollback section is retained for history; no revert steps are needed unless reintroducing a unified file elsewhere.

---

## MONTE_CARLO_ENGINE (2026-03-16)

- **Purpose:** Validate card EV via 50,000 Bernoulli simulations per card using leg true probabilities and platform payout rules.
- **Module:** `math_models/monte_carlo_parlays.ts` — `runMonteCarloParlay(legs, payoutByHits, stake, numSims?)` returns `{ monteCarloEV, monteCarloWinProb, payoutVariance }`.
- **Payout source (canonical):** PP and UD both use **`src/config/parlay_structures.ts`** only: `getPayoutByHits(flexType)` then `fillZeroPayouts(payoutByHits, card.legs.length)`; the resulting `normalizedPayouts` is passed to `runMonteCarloParlay`. No unified JSON or registry fallback at Monte Carlo call sites. Missing payout logs `No payout mapping for <flexType>. Monte Carlo will be skipped.`
- **Integration:** PP export (run_optimizer.ts) and UD export (run_underdog_optimizer.ts) call Monte Carlo after building cards; result attached as `monteCarloEV`, `monteCarloWinProb` on each exported card.
- **Validation:** If `|monteCarloEV − cardEv| > 0.05`, a warning is logged (secondary check only; DP EV remains authoritative).
- **Spot check:** `npx ts-node scripts/sample_monte_carlo.ts` runs Monte Carlo for 6F_GOBLIN, UD_7F_FLX, 3P, 2P, UD_3F_FLX (10k sims, 55% leg prob).

---

## FANTASY_SCORE_MODEL (2026-03-16)

- **Utility:** `src/utils/fantasyScore.ts` — `predictFantasyScore(playerStats)` with formula: points + 1.2×rebounds + 1.5×assists + 3×steals + 3×blocks + 0.5×threes − turnovers.
- **Types:** `PlayerStats` interface (points, rebounds, assists, steals, blocks, threes, turnovers; all optional, missing = 0).
- **Use:** Fantasy score projection for legs; stat_type `FANTASY_SCORE` / `fantasy_score` supported in StatCategory and stat normalization (merge, UD load/fetch, propAdapter, correlation matrix).

---

## EXPANDED_STAT_SUPPORT (2026-03-16)

- **Stats added/aliased:** 3PM (threes), STL (steals), BLK (blocks), PRA, PA, RA, FANTASY_SCORE already in StatCategory; mappings added for 3PT/3PTM→3PM, STEALS→STL, BLOCKS→BLK, FANTASY→FANTASY_SCORE.
- **Files:** merge_odds.ts STAT_MAP; load_underdog_props.ts, fetch_underdog_props.ts, fetch_underdog_manual.ts mapStatType; src/adapters/propAdapter.ts toStatCategory; src/utils/correlationAdjustment.ts canonicalStat for matrix lookup so 3pm/threes, stl/steals, blk/blocks, fantasy/fantasy_score resolve to same key.

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
  - **USE_MOCK_ODDS**: Cleared by run_optimizer.ps1 in its `finally` block after each run. **daily-run.ps1** refuses to run when USE_MOCK_ODDS=1 (Write-Error + exit 1) so scheduled runs never use mock data.
  - **OUTPUT_DIR**: Set by run_optimizer.ts for Python (e.g. `data/output_logs`); Python reads CSVs from this dir.
  - **EXPORT_MERGE_REPORT**: Optional; set to `1` to write merge_report CSV; must be cleared after in scripts that set it.
  - **TELEGRAM_BOT_TOKEN**, **TELEGRAM_CHAT_ID**: Optional; for Telegram alerts. **TELEGRAM_SHEET_URL** optional for sheet link in messages.
  - **ENABLE_ESPN_ENRICHMENT** (default false): Enrich legs with recent player form (last-5 avg vs line) before EV scoring.
  - **ENABLE_FANTASY_EV** (default false): Wire calculateFantasyScore into adjEv instead of diagnostic-only.
  - **ENABLE_CALIBRATION_ADJEV** (default false): Use adjEv (calibrated) instead of legEv for card selection gating.
- **Sheets**
  - Google Sheets: token.json / credentials.json (OAuth). Cards tab: Row 1 = headers, Row 2+ = data.
  - **Cards tab schema (A–W, 23 columns):** RunTime, GameTime, Site, Slip, Player, Stat+Line, Pick, KellyStake$, Tier, AvgEdge%, CardEV, LegID, ParlayGroup, AvgProb%, trueProb%, underOdds, overOdds, EV, 1.5Kelly, DeepLink, LastRun, Notes, CardKelly$.
- **CSV schemas (data/output_logs)**
  - **PP legs (19 cols):** Sport, id, player, team, stat, line, league, book, overOdds, underOdds, trueProb, edge, legEv, runTimestamp, gameTime, IsWithin24h, leg_key, leg_label, confidenceDelta.
  - **UD legs (18 cols):** Same minus confidenceDelta; plus IsNonStandardOdds.
  - **PP cards (29 cols):** Sport, site, flexType, Site-Leg, Player-Prop-Line, cardEv, winProbCash, winProbAny, avgProb, avgEdgePct, **modelEdge** (card-level trueProb − impliedProb; used for dashboard EDGE column), breakevenGap, leg1Id–leg6Id, kellyRawFraction, kellyCappedFraction, kellyFinalFraction, kellyStake, kellyRiskAdjustment, efficiencyScore, portfolioRank, runTimestamp, bestBetScore, bestBetTier, confidenceDelta, oddsType, **DeepLink** (static https://app.prizepicks.com).
  - **UD cards (29 cols):** Same column layout as PP where applicable; includes **modelEdge**; leg1Id–leg8Id; last column **DeepLink** (static https://play.underdogfantasy.com/pick-em). Telegram and Sheets read DeepLink by header name.
  - **Tier1/Tier2 (27 cols):** (unchanged; no DeepLink) portfolioRank, tier, site, flexType, cardEV, compositeScore, correlationScore, diversity, correlation, liquidity, kellyFrac, kellyStake, fragile, fragileEvShifted, winProbCash, avgProb, avgLegEV, avgEdge, breakevenGap, statBalance, edgeCluster, leg1Id–leg6Id, runTimestamp.
  - **Note:** UD cards support 8 leg IDs (leg7Id, leg8Id); PP cards support 6. **Types:** MergedPick and EvPick have optional `espnEnrichment?: EspnEnrichment` (last5Avg, last5Games, vsLineGap, injuryStatus?, fetchedAt); EvPick has optional `fantasyEv?: number`. See `src/types.ts` EspnEnrichment interface.
- **Paths**
  - Pipeline outputs live under **data/output_logs/** (see `src/constants/paths.ts` and `scripts/_paths.ps1`). All reads/writes of legs, cards, tiers, merge reports use these constants.
  - **data/legs_archive/** — date-stamped copies of `prizepicks-legs.csv` and `underdog-legs.csv` from each successful optimizer run; primary historical source for perf_tracker backfills and calibration.
  - **data/tier_archive/** — date-stamped copies of `tier1.csv` and `tier2.csv` from each successful run; used with legs_archive by `backfill_perf_tracker.ts` for full date/tier/kelly/structure history.
  - **data/odds_cache.json** — Quota cache for Odds API: `{ ts, ttl: 14400000, remaining, data }`. Guard can read `remaining` without a live call. 4h TTL; if `remaining < 500` live fetch is skipped and cache is used regardless of TTL. **Validity:** Cache is only used or written if `data.length >= 100` (avoids mock/partial poisoning).

---

## QUOTA_COST_MODEL (Odds API)

- **Final 10-book list (player props only; no regions param):**  
  `draftkings`, `fanduel`, `pinnacle`, `lowvig`, `betmgm`, `espnbet`, `prizepicks`, `underdog`, `pick6`, `betr_us_dfs`.
- **Markets fetched:** 14 total — 10 standard: `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_blocks`, `player_steals`, `player_points_rebounds_assists`, `player_points_rebounds`, `player_points_assists`, `player_rebounds_assists`; 4 alternate: `player_points_alternate`, `player_rebounds_alternate`, `player_assists_alternate`, `player_threes_alternate`. No h2h, spreads, totals, outrights.
- **Actual quota cost per run:** **126** (from live run 2026-03-12: `x-requests-used` went 1532 → 1658 for 1 events + 9 event-odds calls). Run `npx ts-node scripts/run_odds_quota_report.ts` to re-measure; logs show `[ODDS-QUOTA] used=X remaining=Y endpoint=...` per request.
- **Cache:** TTL 4 hours (`data/odds_cache.json`). Guard threshold: if `remaining < 500`, skip live fetch and use cache regardless of TTL; log `[QUOTA WARNING] remaining=N`. On cache hit within TTL: log `[ODDS-CACHE] HIT age=Xm remaining=N`. **Cache validity (2026-03-13):** Minimum row count **100** — if cached or returned data has &lt; 100 rows, cache is treated as invalid on read (log `[ODDS-CACHE] Cache invalid — only X rows cached, fetching fresh`) and no write is performed (log `[ODDS-CACHE] Skipping cache write — only X rows returned (expected 500+)`). Prevents mock/partial fetches from poisoning the 4h TTL. USE_MOCK_ODDS=1 path returns early and never writes to cache.
- **PP/UD scrapers:** `fetch_props.ts` (PrizePicks) and `fetch_underdog_props.ts` (Underdog) are **deprecated (not deleted)** — props now come directly from Odds API with DFS books (`prizepicks`, `underdog`) in the 10-book list. OddsAPI is the primary source. Live run confirmed PrizePicks and Underdog lines appear in the response.
- **Recommended run schedule:** With 18k requests/month, 126 per run → ~142 runs/month max. With 4h cache TTL, run at most every 4h (e.g. 2–4× daily) to stay within budget.
- **Cache shape:** `data/odds_cache.json` stores **normalized** `PlayerPropOdds[]` (flat array with `marketId` per row), **not** the raw API response (events/bookmakers).
- **Alt lines:** All 4 alternate markets are present in cache; consumed in `merge_odds.ts` alt-line second pass (`findBestAltMatch`) when main pass returns `line_diff`. Underdog confirmed has all 4 alternate marketIds in cache. PrizePicks alt lines (demons/goblins) are snapshot-dependent — present when PP has posted them, absent otherwise.

---

## MERGE_NORMALIZATION_FIX (merge_odds.ts — 20260313)

**Root causes (from audit):**
- Dots not stripped from odds side: "t.j. mcconnell" never matched "tj mcconnell"
- PLAYER_NAME_ALIASES applied to pick side only; odds side variants (OddsAPI spellings) unresolved
- LINE_TOLERANCE 0.5 too tight for combo stats: 27 PP legs had delta=1.0 (neighboring alternates)

**Fixes applied:**
- normalizeForMatch: added .replace(/\./g, "").trim().replace(/\s+/g, " ") after apostrophe strip
- resolvePlayerNameForMatch: now called on odds side in all candidate filters, index builds, fallback block, multi-book block, and merge report bestOddsPlayerNorm
- MAX_LINE_DIFF (LINE_TOLERANCE): 0.5 → 1.0
- FALLBACK_DEBUG: extended to site="prizepicks" with dynamic [UD|PP]-FALLBACK prefix

**Expected impact:**
- PP: ~27 line_diff recoveries (delta=1.0 combo stats) + unknown no_candidate dot-initial recoveries
- UD: 0/166 → expected >30% fallback hit rate from dot/alias fix
- Baseline: PP 76.0%, UD 23.1%
- Target: PP >85%, UD >30% fallback hit rate

**Regression tests:** tests/merge_normalization.spec.ts — ✓ Done 2026-03-14 (12 tests: normalizeForMatch dot stripping, resolvePlayerNameForMatch alias, MAX_LINE_DIFF 1.0).

### PP goblin/demon fix (20260313)
- **Problem:** 3,743 of 4,502 PP picks were discarded because `isDemon || isGoblin → skip` in merge. Goblins and demons are valid picks with scoring weights, not genuine promos.
- **Fix 1 — merge skip condition:** Changed to skip only genuine promos (`isPromo && !isDemon && !isGoblin`). Goblins and demons now enter the merge pipeline. New `goblinDemon` diagnostic counter tracks volume.
- **Fix 2 — scoringWeight:** Added `scoringWeight` field to RawPick, MergedPick, EvPick (goblin=0.95, demon=1.05, standard=1.0). Applied multiplicatively to leg EV in `calculate_ev.ts`.
- **Fix 3 — fallback isMainLine guard removed:** `sameBookStatSportLeagueMain` renamed to `sameBookStatSportLeague`; the `o.isMainLine !== true` filter removed so alternate lines are matchable in fallback.
- **Fix 4 — oddsType column:** Cards CSV now includes `oddsType` column (goblin/standard/demon) derived from leg `scoringWeight`. Flows to dashboard CardsPanel automatically.
- **Validation:** tsc 0 errors, 83/83 tests pass, mock dry-run produces 800 cards with `oddsType=standard`.

---

## WEBPAGE

- **Hosting:** Site is hosted on IONOS at **https://dfs.gamesmoviesmusic.com**, served from the path given by `SFTP_PATH` (e.g. `/public_html/` or a subpath). This was pre-existing infrastructure; it is documented here for clarity.
- **Entry:** `web-dashboard/index.html` → `src/main.tsx` (React root).
- **Dev:** `npm run web:dev` (runs at localhost:5173).
- **Build:** `npm run web:build`.
- **Deploy to IONOS (SFTP):** **`npm run web:deploy`** is the **standard post-run command**: (1) `scripts/copy-data-to-public.ts` copies artifacts and pipeline CSVs into `web-dashboard/public/data/`, (2) `npm run web:build` runs Vite (which includes `public/` in `dist/`), (3) `npm run web:deploy:only` uploads `dist/` to IONOS. **`npm run web:deploy:only`** uploads existing `dist/` only — does not copy data or build; use when you already built with fresh data. Requires SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD, SFTP_PATH, FTP_PORT in .env. Deploy is **manual-only** — not invoked from daily-run; run after validating a run.
- **Sections:** Cards | Control | Metrics | Breakeven | Logs (sidebar or top tab bar on mobile).
- **Data sources:** `/data/output_logs/*.csv` (PapaParse), `/artifacts/last_run.json`, `/artifacts/match_rate_history.csv`; `/api/*` (Express at `VITE_API_URL` for tasks, logs, top-legs, tracker-results). **VITE_API_URL:** On IONOS the site is static-only; no Express server. **Path fix (2026-03-15):** **base reverted to `./`** — IONOS serves the site with /dfs/ as document root, so asset URLs must be relative (./assets/...). **VITE_DATA_BASE=/data** in .env.production — correct URL pattern is **/data/*.csv** and **/data/last_run.json** (browser requests /data/…; server resolves to /dfs/data/… on disk). deploy_dashboard.ts uploads dist/ to SFTP_PATH, so dist/data/ → /dfs/data/ on server. RunContext fallback when VITE_DATA_BASE unset uses `data` (not API_BASE/artifacts) so static host never 404s. If `VITE_API_URL` points at localhost or is unset in production, Logs and tracker-results API calls will 404; LogsPanel shows "Logs unavailable — API not reachable" instead of rendering 404 HTML.
- **Auto-refresh:** 60s polling of `last_run.json`; when `run_ts` changes (compared as string), Cards and Metrics panels refetch and TopBar status badge flashes. **STALE fix (2026-03-15):** Run **`npm run web:deploy`** (not only `web:deploy:only`) after a run so that `copy-data-to-public.ts` runs first and fresh `last_run.json`, legs/cards CSVs, and `match_rate_history.csv` are copied to `public/data/` before build; Vite then includes them in `dist/data/`. RunContext normalizes `run_ts` to string and accepts YYYYMMDD-HHMM or YYYYMMDD-HHMMSS so STALE clears after a fresh run + full deploy.
- **Logs (2026-03-14):** If GET /api/logs returns 4xx/5xx or HTML (e.g. 404 on static host), LogsPanel shows "Logs unavailable — API not reachable" instead of rendering the response as content.
- **Match rate badges (2026-03-14):** TopBar shows "PP 82% | UD 31%" from last row of `match_rate_history.csv`, fetched on same 60s poll as last_run.json. If file missing or empty, badges hidden.
- **Hit/miss dots (2026-03-14):** GET /api/tracker-results reads `data/perf_tracker.jsonl` and returns `{ leg_key, result: "hit"|"miss"|null }[]`. CardsPanel Top Legs rows show green dot (hit) or red dot (miss) next to player when result exists; 404/error fails silently.
- **Goblin/Demon badge (2026-03-14):** In expanded leg detail sub-table, after LINE: "G" (muted red) when scoringWeight 0.95, "D" (muted green) when 1.05, nothing for 1.0 or missing. PP and UD legs CSVs now include `scoringWeight` column.
- **Keyboard shortcuts:** 1–5 for section nav, R for manual refresh, ? for help overlay (Esc or ? to close).
- **Phase 3 dashboard (2026-03-14):** ESPN badge: injury dot after player name, form arrow after Kelly stake, tooltip last5Avg/line/gap. Fantasy chip: pill after EV, before tier; renders when |fantasyEv| > 0.001. AdjEv delta: dual EV when delta > 0.0001. Metrics row: ESPN/FantasyEV/AdjEv counts from loaded legs. Flag pills: ESPN, FantasyEV, CalibAdj from VITE_* (build-time). Note: VITE_ = dashboard; ENABLE_* = pipeline. — **Legacy:** EvPick carries optional `espnEnrichment` (last5Avg, last5Games, vsLineGap, fetchedAt) when ENABLE_ESPN_ENRICHMENT is on. “Last 5 avg vs line”).
- **Recalculate + game context (2026-03-14):** **Recalculate button** (Control panel): "Recalculate (skip fetch)" calls POST /api/recalculate; shows "Recalculating…" while running, "Already running" on 409; tooltip: "Rebuilds cards from cached data, filtered to games that haven't started yet". **Game context on leg rows:** Player cell shows name, injury dot, then (TEAM) in muted style. New **OPP** column after PLAYER: "vs MIA" or "—" when no opponent. **Game time bubbles:** Two-line stacked — line 1 time only (e.g. "8:30 PM"), line 2 matchup (e.g. "BOS @ MIA") muted/smaller; no card count in bubble; grouped by game (matchup + time). **Auto-hide started games:** Cards whose earliest leg gameTime is in the past are hidden; Top Legs PP/UD hide individual legs with gameTime in past. Status line below tab bar: "X cards hidden (games started)" when X > 0. **gameTime filter fix (2026-03-15):** Time-only or invalid gameTime strings (e.g. "1:00 PM" without date) are treated as future — not parsed through `new Date()` (which would yield epoch or invalid and hide all legs). `parseGameTime()` returns null for empty, invalid, or date before 2020; `isGameTimeFuture()` and visibleCards/filteredLegs use it so unparseable values do not hide cards/legs. `formatGameTime()` returns time-only string as-is instead of parsing.
- **TYPE column + expandable leg detail (2026-03-14):** **TYPE column** inserted between SITE and LEGS SUMMARY: format `{legCount}{typeCode}` (e.g. "6F", "4P", "3S"); legCount = non-empty leg IDs (PP leg1Id–leg6Id, UD leg1Id–leg8Id); typeCode from flexType/site (PP flex→F, PP power/no-wrong→P, UD standard/no-wrong→S, UD flex→F; unknown→F). Monospace, compact, display-only. **Expandable leg detail:** Clicking a card row expands an inline detail section directly below that row (no modal); only one card expanded at a time. Detail sub-table: PLAYER | STAT | PICK | LINE | EDGE% | EV%; data from legs joined at load time (legByIdAll). PLAYER: click copies name only, then "Copied!" for 1.5s; stopPropagation on that click. Missing leg → "—". **Copy button:** Copied text = one prop per line, plain text, no commas: `{player} {over|under} {line} {stat}`. **stopPropagation:** Link and Copy buttons (and player-name copy in detail) use stopPropagation so they do not trigger row expand.
- **Parlay links + time bubbles (2026-03-14):** **Link button:** Reads DeepLink from parsed card row (CSV column by header name); fallback when missing: PP → https://app.prizepicks.com, UD → https://play.underdogfantasy.com/pick-em. Link opens in new tab; stopPropagation on button/cell so row does not expand. **Link prefill (platform limitation):** PrizePicks and Underdog do not support deeplinks or share URLs that pre-populate a specific parlay; the Link button opens the app/site only. **Time bubbles:** gameOptions built from allLegs (legByIdAll); matchupLabel = `{team} @ {opponent}` when both present (from leg.team, leg.opponent). Line 1 = time only (timeLabel); line 2 = matchupLabel in muted/smaller style. If team or opponent blank, matchupLabel is empty and line 2 is not rendered (time-only bubble).
- **Bubble dedup + contrast + card thresholds (2026-03-15):** **Dedup:** Game filter key is normalized by sorting the two teams alphabetically so "OKC @ MIN" and "MIN @ OKC" produce one bubble per game. **Duplicate game bubble fix (2026-03-15):** matchupLabel now uses the same sorted team order as the dedup key so each game appears exactly once with a consistent label (no "OKC @ MIN" and "MIN @ OKC" as separate bubbles). **Game filter fallback (2026-03-15):** If the game filter matches 0 cards but cards exist (e.g. leg ID mismatch between cards and legs CSV), show all cards unfiltered and console.warn; same for visibleCards when gameTime filter hides all — never show 0 cards when cards exist. **Matchup contrast:** Line 2 (matchup text) in bubbles uses `rgba(255,255,255,0.85)` for readability. **BEST BETS / STRONG:** CardsPanel loads tier1.csv and tier2.csv; BEST BETS uses tier1 (cap 20) when available, else fallback from prizepicks/underdog-cards with cardEV ≥ 5%, avgEdge ≥ 5%, kellyStake ≥ 5, portfolioRank ≤ 50. STRONG uses tier2 when available, else cards with cardEV ≥ 3%, avgEdge ≥ 3%, kellyStake ≥ 1. cardEV and kellyStake normalized on parse (percent string or decimal; $ stripped). If tier1 empty, console.warn and fallback; if still 0 cards, log each card's cardEV/kellyStake for debugging.
- **TOP LEGS UD (2026-03-14):** UD legs load from same path pattern as PP (`underdog-legs.csv` at DATA_BASE; deploy copies to `public/data/`). PapaParse uses `header: true` (no positional indexing). TOP LEGS UD tab uses `udLegs` from that fetch (no site-column filter; PP tab uses `ppLegs`). **Diagnostic logging:** On load, console logs `[CardsPanel] Loaded legs: PP=X UD=Y | UD path: ...`; if UD=0, warns to check path. When TOP LEGS UD tab is active, logs `TOP LEGS UD: showing K of N legs (after game + gameTime>=now filter)`; if N>0 and K=0, warns that all UD legs are hidden (e.g. stale CSV with all gameTimes in past — run optimizer for today's slate). Root cause when tab empty: either underdog-legs.csv unreachable at built path, or all legs filtered by gameTime.
- **Dashboard fixes applied (2026-03-15):** **(1)** RunContext: `run_ts` accepted as YYYYMMDD-HHMM or YYYYMMDD-HHMMSS; comparison as string so STALE clears after fresh deploy. **(2)** (Already in place) `copy-data-to-public.ts` runs before build so `last_run.json`, CSVs, and `match_rate_history.csv` are in `dist/data/`. **(3)** Game filter: only show a game bubble when `timeLabel` or `matchupLabel` is present — no T2/T3/T4/T5 (or mock) clutter in GAMES row (CardsPanel Fix 3). **(4)** STRONG/ALL PLAYER column: show last name of first leg only — first segment of Player-Prop-Line, strip stat/pick tokens, then `lastName()` (CardsPanel Fix 4). **(5)** BEST BETS = tier1 (cap 20) or fallback; STRONG = tier2 or fallback; tier CSV load + cardEV/kellyStake normalization. **(6)** PP/UD badge swap: RunContext `parseMatchRateCsv` swaps pp_rate ↔ ud_rate so TopBar `.pp` = PP rate, `.ud` = UD rate (pipeline column order workaround); **verify on live site after deploy.** **(7)** UD 8 legs: `tierRowToCardRow` includes leg7Id/leg8Id when building from tier CSV (CardsPanel Fix 7). **(8)** Expanded leg detail: EDGE% and EV% read `leg.edge` and `leg.legEv` independently (separate CSV columns; CardsPanel Fix 8). **(9)** Diagnostic: when 0 cards in BEST BETS or STRONG, console.warn with cardEV/kellyStake range. **(10)** Bold first row: index.css — `tbody tr:first-child td { font-weight: normal }` so first data row is not bold.
- **Dashboard fix plan (2026-03-15):** **(1 Pipeline)** Goblin EV/Kelly: parlay_structures.ts added PP_GOBLIN_* payout tables (~0.6×; 6P=22.5×); build_innovative_cards uses goblin table when any leg has scoringWeight &lt; 1; ev_dp_prizepicks supports *_GOBLIN structures. **(2)** Expand state: CardsPanel getCardRowKey(row) = site + sorted leg IDs; isExpanded compares by row key so only one card expands. **(3)** LEGS SUMMARY: formatLegsSummary fallback uses lastName(name segment) after stripping stat/line tokens, not first word. **(4)** Game bubbles: dedup key = gameKeySuffix only (one bubble per matchup); first non-empty timeLabel kept. **(5)** Top Legs: legMatchesGame checks "X @ Y" key; filteredLegs treats selectedGames.size===0 or selectedGames.size===gameOptions.length as all selected. **(7)** Link prefill documented in WEBPAGE (platform does not support). **(8)** Fix 10: index.css first data row font-weight: normal.
- **Last run timestamp on site (2026-03-15):** The dashboard shows the **ts** from `last_run.json` (e.g. "Last update: 11:24 AM"). If the optimizer ran at 6pm but the site still shows morning, the **data on the server is from the last deploy**, not the 6pm run. Run **`npm run web:deploy`** after each optimizer run so `copy-data-to-public.ts` copies fresh `last_run.json` and tier/legs/cards CSVs into `public/data/`, then the build uploads them. No automated deploy from daily-run — deploy manually after a run to refresh the site. **Diagnostic:** When you run `web:deploy`, the copy step logs `(ts=YYYYMMDD-HHMMSS)` for `last_run.json` — that is exactly what gets deployed. If that ts is old, the latest run did not update `artifacts/last_run.json` (e.g. run failed, or was in a different folder); run the optimizer via **`scripts/run_optimizer.ps1`** from this project root, then `npm run web:deploy`. Dashboard fetches use `cache: 'no-store'` so the browser does not serve a cached old file after a new deploy.
- **Goblin math (all-goblin parlay):** The **all-goblin parlay at the top of Best Bets** uses the **goblin payout table** (6P = 22.5×, etc.) for card EV and Kelly. Code path: `build_innovative_cards` sets `isGoblin = combo.some(l => (l.scoringWeight ?? 1) < 1)` and passes it to `evaluateSyncCard`, `cardKellyFrac`, and `computeFragileEv`. So the math is correct **in the pipeline**. The numbers on the site are correct **when the tier CSVs were produced by a run that includes this code** and then deployed. Many PP legs showing as goblins is **data** (PrizePicks offering many reduced-payout lines), not a bug — we only fixed the card-level EV/Kelly for those cards.
- **UD factor badge (2026-03-15):** Underdog legs CSV now includes **udPickFactor** column (per-pick payout factor: &lt;1 = discounted, &gt;1 = boosted). Dashboard TOP LEGS UD and expanded leg detail show **D** (red, discounted) or **B** (green, boosted) next to LINE when factor ≠ 1, analogous to PP G/D.
- **Card EDGE vs EV (2026-03-16):** Dashboard card tables (BEST BETS, STRONG, ALL) use **card.metrics.modelEdge** for the **EDGE** column when present (pipeline exports modelEdge = trueProb − impliedProb per card). **EV** column always shows **cardEv** (expected value). EDGE and EV are separate metrics; modelEdge is written to PP and UD cards CSV as **modelEdge** column; CardsPanel normalizes and displays it with fallback to avgEdgePct when modelEdge is missing (e.g. tier cards from tier1/tier2 CSV).
---

## MERGE_RATE_OVERHAUL (merge_odds.ts — 20260316)

**Problem:** PP match rate ~38%, UD ~53%. Diagnostic showed:
- PP: 45.6% no_candidate, 25.8% line_diff, 7.7% juice (of 1468 rows, 20.9% matched)
- UD: 41.5% line_diff (all points alt lines), 2.8% no_candidate (name mismatches)
- PP fallback: 0 matches (FALLBACK_LINE_DIFF=0.5 too tight, OddsAPI DOES carry PrizePicks book)

**Fixes applied (src/merge_odds.ts):**

| Fix | Before | After | Est. impact |
|-----|--------|-------|-------------|
| **MAX_LINE_DIFF_COMBO** — stat-aware tolerance: combo stats (PRA, P+R, P+A, R+A, stocks) use 2.0; individual stats keep 1.0 | 1.0 flat | 1.0 / 2.0 | ~200-300 PP alt matches recovered |
| **FALLBACK_LINE_DIFF** — same-book fallback tolerance widened | 0.5 | 1.5 | 38 PP fallback matches (was 0) |
| **Name aliases** — "tristan silva"→"tristan da silva", "nic claxton"→"nicolas claxton", "bub carrington"→"carlton carrington", plus herb jones, cam thomas, gg jackson, etc. | 10 aliases | 22 aliases | ~50-100 PP/UD no_candidate recovered |
| **Composite synthesis for R+A and P+R** — synthRA (reb+ast) and synthPR (pts+reb) with COMPOSITE_CORR_WEIGHT=0.6, plus PRA−PTS and PRA−AST fallback paths | PRA, PA, 3PM only | +R+A, +P+R | ~127 PP no_candidate recovered (R+A 106→10, P+R 35→4) |
| **PP_MAX_JUICE** — aligned with UD threshold | 180 | 200 | ~10-30 PP juice recovered |
| **UD_ESCALATOR filter** — expanded stats and threshold | points only, ≤2.5 | points+reb+ast+3pm, ≤4.5 | ~100 UD extreme alt lines pre-filtered (cleaner metric) |
| **UD_ALT_LINE_MAX_DELTA** — alt-line second pass tolerance | 2.5 | 3.0 | ~5-10 UD alt recoveries |

**Results (fresh run 20260316-081313):**

| Metric | Before (20260315) | After (20260316) | Change |
|--------|-------------------|-------------------|--------|
| PP raw match rate | 38.6% | **51.6%** | **+13.0pp** |
| PP no_candidate | 45.6% | 7.0% | −38.6pp |
| PP fallback matches | 0 | 38 | +38 |
| PP juice rejected | 7.7% | 2.8% | −4.9pp |
| UD raw match rate | 52.7% | 50.9% | −1.8pp (different slate) |
| UD no_candidate | 2.8% | 4.5% | +1.7pp (steals/blocks coverage) |
| PP per-player-stat rate | N/A | **79.6%** | — |
| UD per-player-stat rate | N/A | **86.3%** | — |

**Per-player-stat rate** = % of unique player+stat combos with at least one matched line (excludes alt-line inflation from denominator). This is the operationally meaningful metric: 79.6% PP and 86.3% UD mean we have odds data for ~80-86% of the props we care about.

**Remaining structural ceiling:**
- PP steals: OddsAPI carries only ~8-9 unique players for steals (52 rows); PP offers 60+. 62 unmatched steals combos.
- PP line_diff (38.5%): Mostly PP alt lines (3689 total rows, 2807 are alt lines). The alt lines at delta >3 are too far from any OddsAPI line; these are PP's own product, not matchable.
- UD line_diff (41.6%): All 139 are UD points alt lines. UD offers 4+ lines per player+stat; only the main-line neighborhood matches.

**Data accuracy spot-check:** 15 random PP matches + 10 UD matches verified: correct player names, correct stats, lines within stated tolerance. Fallback matches all at delta=0.5 or 1.5 (within FALLBACK_LINE_DIFF). No cross-player or cross-stat contamination found.

**run_optimizer.ps1 change:** Now sets `EXPORT_MERGE_REPORT=1` for every run (was unset; merge reports only generated when env var manually set). Cleared after run. This ensures the merge reasons panel on the dashboard always has data.

---

## CANONICAL_NBA_PROP_WAREHOUSE (2026-03-16)

**Single source of truth** for the NBA (and MLB) prop warehouse path, schema, validation input, and audit.

- **Canonical path (code):** `src/constants/paths.ts` exports `NBA_PROPS_MASTER_CSV = "prop_history/nba_props_master.csv"` and `MLB_PROPS_MASTER_CSV = "prop_history/mlb_props_master.csv"`. Full paths: `getDataPath(NBA_PROPS_MASTER_CSV)` → `data/prop_history/nba_props_master.csv` (under project root). **All readers and writers must use these constants;** no hardcoded `path.join("prop_history", "nba_props_master.csv")` or alternate paths.
- **Schema contract (canonical column order):** Defined by `HEADER_COLUMNS` in `src/services/propHistory.ts`. Order: `date`, `snapshot_time`, `sport`, `player`, `team`, `opponent`, `game_id`, `prop_type`, `line`, `sportsbook_odds`, `implied_probability`, `projection`, `ev`, `tier`, `dfs_platform`, `match_type`, `market_line`, `closing_line`, `line_movement`, `snapshot_source`. Do not change column order or add columns without updating propHistory, validator, and this doc.
- **Validator input:** Same path — `scripts/validate_prop_warehouse.ts` uses `getDataPath(NBA_PROPS_MASTER_CSV)` and `getDataPath(MLB_PROPS_MASTER_CSV)`. No separate env override; no second alias path.
- **Audit artifact:** `artifacts/prop-warehouse-audit.json` (path: `getArtifactsPath(PROP_WAREHOUSE_AUDIT_JSON)`). Contains `generatedAt`, `nba`, `mlb`. Each sport object: `canonicalPath`, `fileExists`, `rowCount`, `latestDate`, `latestSnapshot`, `ppRowCount`, `udRowCount`, `duplicateWarningCount`, `validationStatus` (ok | warning | error), and when `rowCount > 0`: `matchTypeCounts` (main, alt, alt_ud, alt_juice_rescue, fallback_pp, fallback_ud, blank). Lightweight; derived from the canonical warehouse file. Deploy: copied to `public/data/prop-warehouse-audit.json` by `copy-data-to-public.ts` (optional placeholder when missing).
- **Logging (grep-friendly):**  
  After append: `PROPHISTORY append platform=PP|UD sport=NBA|MLB added=X skipped=Y total=Z`.  
  After validation: `PROPWAREHOUSE status=ok|warning rows=... latestDate=... latestSnapshot=... ppRows=... udRows=... duplicateWarnings=... matchTypes main=... alt=... fallback_pp=... fallback_ud=... blank=...`.
- **Backward compatibility:** None required; all consumers use the same path constants. No read fallback or migration path.

### Canonical warehouse contract — lockdown (2026-03-17)

- **Exact canonical path:** `data/prop_history/nba_props_master.csv` (relative to project root). Resolve via `getDataPath(NBA_PROPS_MASTER_CSV)` from `src/constants/paths.ts`.
- **Consumers using canonical path:** `src/services/propHistory.ts`, `scripts/validate_prop_warehouse.ts`, `scripts/build_line_movement_dataset.ts`, `scripts/build_clv_dataset.ts`, `scripts/build_hit_rate_dataset.ts`, `scripts/build_edge_dataset.ts`, `scripts/train_true_probability_model.ts`, `scripts/prop_history_health_check.ts`, `scripts/run_post_results_model_refresh.ts`. PP and UD optimizer flows append via `appendPropsToHistory()` only; no direct CSV path in run_optimizer or run_underdog_optimizer.
- **match_type column:** Populated from EvPick.matchType (propagated from MergedPick in calculate_ev.ts). Validator audit includes `matchTypeCounts`; blank/missing match_type is not fatal. Dataset builders and train_true_probability_model read by header; old warehouse files without the column remain readable (missing column → undefined; counted as blank in audit).
- **Validation report output (separate from warehouse):** `data/validation/nba_prop_history_report.json`, `data/validation/mlb_prop_history_report.json` — validator **input** is the canonical warehouse; **output** reports go to `data/validation/`.

---

## PROP_WAREHOUSE (2026-03-16)

**Goal:** Persist every evaluated prop into a long-lived warehouse for model training and audit.

- **Datasets (canonical):** `data/prop_history/nba_props_master.csv`, `data/prop_history/mlb_props_master.csv` — from `getDataPath(NBA_PROPS_MASTER_CSV)` / `getDataPath(MLB_PROPS_MASTER_CSV)` in `src/constants/paths.ts`.
- **Writer:** `src/services/propHistory.ts` with `appendPropsToHistory(legs, runTimestamp, options?)`; `options.platform` = `"PP"` | `"UD"` for logging.
- **Integration points:**
  - PP optimizer (`run_optimizer.ts`): after legs CSV write, `appendPropsToHistory(legsWithMovement, runTimestamp, { platform: "PP" })` (non-fatal).
  - UD optimizer (`run_underdog_optimizer.ts`): after legs CSV write, `appendPropsToHistory(legsForRest, runTimestamp, { platform: "UD" })` (non-fatal).
- **Schema (per row):**  
  - `date` (YYYY-MM-DD from runTimestamp)  
  - `snapshot_time` (HH:MM from runTimestamp, ET)  
  - `sport` (NBA, MLB, etc.)  
  - `player`, `team`, `opponent`  
  - `prop_type` (stat key)  
  - `line`  
  - `sportsbook_odds` (overOdds if present, else underOdds)  
  - `implied_probability` (`trueProb`)  
  - `projection` (placeholder, currently empty)  
  - `ev` (`legEv`)  
  - `tier` (placeholder, card-level today, currently empty)  
  - `dfs_platform` (site: prizepicks / underdog)  
  - `match_type` — Merge match quality from merge_odds: `main`, `alt`, `alt_ud`, `alt_juice_rescue`, `fallback_pp`, `fallback_ud`; carried from MergedPick → EvPick → warehouse. Empty when no match or legacy rows.  
- **Uniqueness / duplicate prevention:**  
  - Unique key per row: `date + snapshot_time + player + prop_type + line + dfs_platform` (player/prop/platform lowercased).  
  - On append, the writer loads existing keys from the CSV (if present) and **skips duplicates**; new rows only are appended.
- **Safety:** All file I/O is surrounded by try/catch and logs `[PROP_HISTORY]` warnings on failure; errors do **not** affect optimizer exit codes.

---

## PROP_WAREHOUSE_VALIDATION (2026-03-16)

**Goal:** Guard the integrity of the prop warehouse dataset via automated QA.

- **Validator script:** `scripts/validate_prop_warehouse.ts` (Node/ts-node).
- **Hook:** `scripts/run_optimizer.ps1` step 6:
  - After artifacts and archives are written, but before deploy, it runs  
    `npx ts-node scripts/validate_prop_warehouse.ts` via `Invoke-NativeWithLogging`.  
  - Failures are logged as `[VALIDATION] ... failed (non-fatal)` and do not fail the run.
- **Input (canonical):** Same path as append — `getDataPath(NBA_PROPS_MASTER_CSV)` and `getDataPath(MLB_PROPS_MASTER_CSV)`. If file missing, validator logs and exits cleanly.
- **Checks:**
  1. **Duplicate props** — key: `date + snapshot_time + player + prop_type + line`, counts duplicates and logs warning (no auto-deletes).
  2. **Line drift** — within a snapshot, flags same `date + snapshot_time + player + prop_type` with multiple unique `line` values (conflicting lines).
  3. **Impossible stat lines (NBA):** warns when thresholds exceeded:  
     - points > 45, rebounds > 20, assists > 18, steals > 6, blocks > 6.
  4. **Player name consistency:** builds canonical player names (lowercase, accents/dots/apostrophes/suffixes stripped) and reports canonical names with multiple raw variants as potential alias issues.
- **Output:** Per-sport reports: `data/validation/nba_prop_history_report.json`, `data/validation/mlb_prop_history_report.json` (duplicate_count, line_drift_flags, stat_anomalies, name_variants). **Audit:** `artifacts/prop-warehouse-audit.json` (see CANONICAL_NBA_PROP_WAREHOUSE).

---

## KNOWN_GAPS

### SGO_CLEANUP — RESOLVED (final scrub 2026-03-13)

- **Status:** Full sweep completed (branch `cleanup/remove-sgo-trd`). Final scrub: `SgoPlayerPropOdds` renamed to `PlayerPropOdds` in `src/types.ts` and all consumers; `fetchSgoPlayerPropOdds` → `fetchPlayerPropOdds` in `src/fetch_oddsapi_odds.ts`; `merge_odds.ts` has zero SGO references. Comment-only SGO mentions reworded in run_underdog_optimizer.ts, quota-monitor.ps1, daily_data.ps1. **SGO-REVIEW:** None. Deprecated stubs only: `scripts/sgo_nba_historical.py`, `scripts/import_sources.ps1` (deprecation headers; files kept).

### TRD_CLEANUP — RESOLVED (final scrub 2026-03-13)

- **live_liquidity.ts:** TheRundown API call removed; static liquidity only; dead `API_BASE` marked DEPRECATED.
- **run_underdog_optimizer.ts:** Provider logging uses `oddsapi_live` / `underdog_optimizer` only; comment reworded (no "SGO/TRD").
- **Remaining files:** `scripts/check_therundown_alt_lines.ts` and `scripts/sgo_nba_historical.py` have deprecation headers only (files kept). **SGO-REVIEW:** None. No active TRD logic in pipeline.

---

## LIVE_SLATE_VALIDATION (TODO #7 — run 2026-03-13)

**Run:** `EXPORT_MERGE_REPORT=1` then `scripts/run_optimizer.ps1 -Force -bankroll 700`.

**Results:**
- **PP match rate:** 84.5% (545/645). Target >85% — **missed by 0.5%.**
- **UD fallback hit rate:** 3% (25 fallback_ud matches / 823 total UD rows). Target >30% — **missed.**

**PP merge_report_prizepicks.csv breakdown:** ok=540, ok_alt=5, no_candidate=99, line_diff=1. **no_candidate pattern:** predominantly **multi-player combo lines** (e.g. "Jarace Walker + OG Anunoby", "Brandon Ingram + Devin Booker") — OddsAPI does not provide those combo markets; not dot/initial name issues.

**UD merge_report_underdog.csv breakdown:** reason: line_diff=418, ok=326, juice=32, ok_fallback=25, no_candidate=22. matchType: main=326, fallback_ud=25, (blank/unmatched)=472. **Root cause for low fallback:** Most UD misses are line_diff (418) and juice (32); fallback rescues only 25. Next step: run with **FALLBACK_DEBUG=1** to inspect [UD-FALLBACK] log lines (line_diff > FALLBACK_LINE_DIFF? stat mismatch? name unresolved?).

**Script fix:** run_optimizer.ps1 match_rate_history check failed when `$historyRows` was a single line (no .Count). Fixed by using `@(Get-Content ...)` so Count is always valid.

**Definition of done:** Not met. New fix needed — UD fallback audit with FALLBACK_DEBUG=1; consider widening FALLBACK_LINE_DIFF or improving alt-line use for line_diff/juice cases.

---

## TODO

1. ~~**Validate pipeline:** Set ODDSAPI_KEY in .env, run `scripts/run_optimizer.ps1` (or `npm run dry` then full run) and confirm artifacts/last_run.json status is success and `data/output_logs` contains expected CSVs. For a **dry-test without the API**, run with `USE_MOCK_ODDS=1` or `--mock-legs 50` and `--providers PP,UD` (TRD is not valid).~~ ✓ Pipeline validated 2026-03-12 (mock dry-test, last_run.json success, output_logs CSVs present).
2. ~~**Run verifications:** `npm run verify:breakeven`, `npm run test:unit`, and `scripts/verify_wiring.ps1 -Flow all` (or as per project rules).~~ ✓ Done 2026-03-13. Re-validated 2026-03-14 (Phase 3 close): **(a) verify:breakeven** — pass (UD 2P 53.45%, PP 6F 54.21%; invariants OK). **(b) test:unit** — pass (14 suites, 119 tests; jest.config.js maxWorkers: 1). **(c) verify_wiring.ps1 -Flow all** — pass (run_optimizer.ps1 -DryRun → artifacts\last_run.json). No failures; no files modified to fix. Cards CSV: PP/UD now 28 cols (oddsType + DeepLink); sheets_push_cards.py col T = HYPERLINK formula (not from CSV); DeepLink in CSV used by Telegram only.
3. ~~**UD fallback audit**~~ ✓ Done 20260313. Root causes: dot/initial normalization gap + alias map pick-side only. Fixed in merge_odds.ts. LINE_TOLERANCE widened to 1.0 for combo-stat coverage. Regression tests ✓ Done 2026-03-14 (tests/merge_normalization.spec.ts).
4. ~~**Automation — daily-run coverage:** Add to daily-run (or run-both) after optimizer: (b) archive legs+tiers; (c) backfill tracker; (d) scrape prior-day results.~~ ✓ Done 2026-03-13. `scripts/daily-run.ps1` now runs (b)–(d) after every successful run-both (exit 0). All non-fatal; exit code = run-both only. Optionally add explicit Telegram alert on script failure.
4a. ~~**Jest worker force-exit (open handle)**~~ ✓ Done 20260313. **Leaked handle:** MSW server (`src/mocks/server.ts`) used by `tests/fetch_oddsapi_props.spec.ts` — with multiple workers, one worker’s teardown left the server handle open and Jest force-exited the worker. **Fix:** `jest.config.js` set `maxWorkers: 1` so all tests run in a single process and `afterAll(() => server.close())` in that spec runs before process exit. No change to test files (teardown was already correct).
5. ~~**Automation — Task Scheduler:** Register **DFS-DailyRun** and **DFS-TrackResults**~~ ✓ Done 2026-03-13. Use `scripts/register_scheduled_tasks.ps1` to register (paths resolved; no hardcoding). Both tasks Status=Ready; next runs documented in AUTOMATION_STATUS.
6. ~~**Add regression tests for merge normalization fixes**~~ ✓ Done 2026-03-14. **tests/merge_normalization.spec.ts** — 12 tests (normalizeForMatch dot stripping, resolvePlayerNameForMatch alias on odds side, MAX_LINE_DIFF ≥ 1.0 and within/outside tolerance). Pure unit tests on exported normalizeForMatch, resolvePlayerNameForMatch, MAX_LINE_DIFF; no mocking. `npx jest tests/merge_normalization.spec.ts` passes.
7. ~~**Run live slate** — confirm PP match rate > 85% and UD fallback > 30%~~ **Closed.** Target revised after merge overhaul (20260316): PP per-player-stat **79.6%**, UD **86.3%** (raw: PP 51.6%, UD 50.9%). Remaining ceiling is structural: OddsAPI steals coverage (~9 players), PP/UD alt-line inflation. See MERGE_RATE_OVERHAUL.
- **D2.** ~~Telegram format fixes~~ ✅ Done 20260313. ~~UD cards CSV missing DeepLink column~~ ✅ Resolved 2026-03-14: both PP and UD cards CSVs now include DeepLink column (PP: https://app.prizepicks.com, UD: https://play.underdogfantasy.com/pick-em); Telegram deeplink fires for both.
- **A3.** ~~Match rate monitoring script~~ ✅ Done 20260313. Note: metrics block only runs when EXPORT_MERGE_REPORT=1 and merge report CSVs are present in data/output_logs/.
- **Future — Line movement tracking:** Compare player+stat line and odds across multiple daily run timestamps; flag legs where sharp money moved toward the pick as a confirmation signal. Feed into compositeScore or as a display field on the dashboard. (Not scheduled.)
- **Prompt D (Tab restructure)** ✓ Done 2026-03-14.
- **lineDelta column fix** — add to legs CSV output in run_optimizer.ts, map in CardsPanel lineMovementByLegId.
- **Dashboard fixes 1–5, 7–9 (2026-03-15)** ✓ Done. Applied in CardsPanel.tsx and RunContext.tsx; verified tsc 0 errors, jest pass, web:build and web:deploy success.
- **Dashboard Fix 6 (PP/UD badge swap — verify on live):** Confirm badges show correct values at https://dfs.gamesmoviesmusic.com after deploy (RunContext swap applied; pipeline column order may be fixed later).
- **Dashboard Fix 10 (bold first row)** ✓ Done 2026-03-15. index.css: tbody tr:first-child td { font-weight: normal }.
8. **ESPN minutes batching** — batch `fetchEspnMinutes()` calls in `src/espn_enrichment.ts enrichLegs()` using `pLimit(5)` (npm install p-limit) before enabling `ESPN_ENRICHMENT_ENABLED = true` in production. Sequential fetches on a 40-player slate = ~3.5 min worst case. Fix: collect all athleteIds → Promise.all with limiter → map back to legs. Log: [ESPN] fetched minutes for X players in Yms.
- **Auto-deploy after every run (2026-03-15):** **scripts/run_optimizer.ps1** now runs `npm run web:deploy` after a successful pipeline (step 6, non-fatal). **scripts/daily-run.ps1** uses `npm run web:deploy` (was deploy:ftp, now full copy+build+upload). Site updates automatically after every automated or manual run.
- **Dashboard overhaul (2026-03-15):** **(1) Logs page:** Rewritten for static hosting — shows last_run.json summary (flow, status, timestamp, metrics, tier counts) instead of /api/logs. **(2) Control page:** No longer 404s — shows top PP/UD legs by edge from CSV data, quick command reference; API buttons hidden when no Express server. **(3) Metrics page:** Always shows UD fallback detail table (was hidden when 0 attempts); added perf_summary.json-based hit rate tracking with daily/weekly/monthly/yearly/lifetime breakdown and separate columns for Best Bets (T1) vs Strong (T2). **(4) perf_summary.json:** Generated by `scripts/copy-data-to-public.ts` from `data/perf_tracker.jsonl` at deploy time; includes period-filtered hit/miss counts for all legs, T1, and T2. **(5) RunContext:** `cache: 'no-store'` on last_run.json and match_rate_history.csv fetch so browser doesn't cache stale data after deploy.
- **Goblin classification (2026-03-15):** Verified: 25/28 PP legs are goblins (scoringWeight=0.95). This is PrizePicks API data (`odds_type="goblin"`), not a code bug — PP has shifted most props to goblin odds. Code correctly reads `odds_type` from API response. Card EV and Kelly use goblin payout tables (e.g. 6P=22.5x vs standard 37.5x) when any leg is goblin.
- **Math audit (2026-03-15):** All formulas verified correct: EV via DP hit distribution (non-i.i.d.), Kelly staking (fractional, conservative divisor 1.5, capped), breakeven solver (autobracket + bisection), goblin payout tables, fragile EV test. No issues found.

---

## AI_AUTOMATION_PROGRESS

**Current Phase:** Phase 1 – Data Infrastructure

- **Completed:**
  - *(placeholder — fill in as milestones are reached)*  

- **In Progress:**
  - *(placeholder — active automation tasks and experiments)*  

- **Next Target:**
  - *(placeholder — next concrete automation milestone)*  

