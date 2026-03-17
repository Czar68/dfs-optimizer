# Deep Dive Audit Report (Report Only — No Changes)

**Date:** 2026-03-12 (generated from codebase and run checks)

---

## 1. SGO and TheRundown remnants

### 1.1 SGO / sportsgameodds / sports_game_odds

**src/**

| File | Line | Content (summary) |
|------|------|--------------------|
| fetch_oddsapi_props.ts | 1 | Comment: "no SGO" |
| run_underdog_optimizer.ts | 173 | Comment: "SGO overOdds proxy" |
| run_underdog_optimizer.ts | 897–898 | `if (oddsProvider === 'SGO') { provider = 'sgo_live'; }` |
| odds/normalize_odds.ts | 2, 18 | Comments: "SGO and TRD flows" |
| cli_args.ts | 46, 641, 883, 947–948, 954 | --sgo-include-alt-lines, --force-sgo |
| types.ts | 186 | Comment: "main line (or any SGO line pre-Phase1)" |
| run_optimizer.ts | 488, 1186, 1793 | Comments: "SGO sample", "legacy SGO/TheRundown", "no second SGO call" |
| fetch_odds_api.ts | 8 | Comment: "SgoPlayerPropOdds[] (same shape used by SGO and TheRundown)" |
| build_single_bet_inputs.ts | 42–79 | sgoMarkets param and usage |
| ev_parlay.ts | 29–42 | mergeSgoRundown, sgo/rundown params |
| normalize_stats.ts | 10, 14, 91–92 | Comments: "SGO statID", "SGO uses patterns..." |
| config/sport_config.ts | 7–8, 16, 27, 30–41, 47, 50–57, 63–70, 76, 85–91, 97 | sgoLeagueId, sgo/rundown stat keys |
| __tests__/cli_strict_effective_config.test.ts | 53–54 | --sgo-include-alt-lines test |
| config/nba_props.ts | 2–3, 8–10, 26 | Comments: "SGO and TheRundown", "SGO allowlist" |
| calculate_overs_delta_ev.ts | 8, 14, 22, 140–142, 173–194, 231–233, 258, 265, 287, 301–303, 312, 315 | SGO alt line logic, sgoMarkets, sgo_alt_* columns |
| adapters/propAdapter.ts | 91–111, 121 | sgo param, sgoArrayToUnifiedProps |
| merge_odds.ts | 25, 132, 156–157, 178–179, 183–195, 216, 228, 239, 257, 264–271, 315–327, 336–340, 375, 378, 384, 403–450, 647–658, 700–830, 783–797, 912–918, 992–993, 1079 | Extensive: SGO in comments, sgoMarkets, findBestMatch/AltMatch, buildUdStatsNotInOdds (SGO feed), etc. |
| scripts/report_single_bet_ev.ts | 116, 120–122, 125 | "Live SGO Data", fetchSgoPlayerPropOdds |

**scripts/**

| File | Line | Content (summary) |
|------|------|--------------------|
| refresh.ps1 | 7, 57–62, 223 | SGO cache delete, *_sgo_props_cache, sgo_full_cache |
| analyze_thresholds.ts | 5 | "SGO-derived legs" |
| train_models.ps1 | 16 | Comment: sgo_historical_30d.json |
| debug_today.py | 26–73 | sgo_nba_*.json, nba_sgo_props_cache.json |
| import_sources.ps1 | 1–2, 9, 12, 16–19 | SGO_KEY, sportsgameodds.com URL, sgo_nba.json |
| export_results.py | 130 | "SGO" in list |
| daily_data.ps1 | 1–23 | SGO 6PM data, SGO_KEY/SGO_API_KEY, sportsgameodds.com v2/events |
| run_odds_api_preview.ps1 | 33 | "Compare with SGO odds" |
| quota-monitor.ps1 | 2, 9, 18, 33, 40, 44–47, 52 | SGO quota, SGO_MONTHLY_QUOTA, sgoCallCount, SGO HARVEST |
| audit_5f_ev.ts | 6 | "SGO-derived legs" |
| run_optimizer.ps1 | 1 | Comment: "SGO/PP/UD/TRD" |
| audit_merge_report.ts | 6, 20–21, 25, 84–85, 149–150, 191–211, 288, 311–312, 321–360, 372–383, 425, 457–477, 507–509, 580–582 | SGO-only report, SGO_IMPORTED, nba_sgo_props_cache, sgoToMatchForm, Triple A/B matrix SGO column |
| fresh_data_run.ps1 | 2, 9 | "Replaces SGO", "optional SGO_API_KEY" |
| sgo_nba_historical.py | 3–8, 23–28, 56, 116–120 | SGO NBA historical backfill, sportsgameodds.com v2, SGO_API_KEY |

### 1.2 TheRundown / TRD / therundown / rundown_api

**src/**

| File | Line | Content (summary) |
|------|------|--------------------|
| config/sport_config.ts | 11, 17, 28, 30–41, 48, 50–57, 64–70, 77, 86, 88–91, 98 | rundownSportId, rundown stat keys |
| odds/normalize_odds.ts | 2, 18 | "SGO and TRD flows" |
| run_underdog_optimizer.ts | 900 | `provider = 'therundown_live';` |
| cli_args.ts | 951, 954, 957, 959–960 | --force-rundown, --rundown-only, --odds-source trd |
| live_liquidity.ts | 28 | API_BASE = "https://therundown.io/api/v2" |
| ev_parlay.ts | 32, 35, 47–48, 57 | rundown param, mergeSgoRundown |
| config/nba_props.ts | 31 | Comment: "TheRundown docs" |

**scripts/**

| File | Line | Content (summary) |
|------|------|--------------------|
| check_therundown_alt_lines.ts | 5, 10 | Script for TheRundown alt lines, API_BASE therundown.io |
| quota-monitor.ps1 | 19, 34, 44, 48–49 | TRD today/month, TRD HARVEST |
| run_optimizer.ps1 | 1, 72 | Comment: "SGO/PP/UD/TRD", "providers PP,UD,TRD" |
| import_sources.ps1 | 13, 22–24 | RUNDOWN_KEY, api.therundown.io, rundown.json |

**package.json:** No SGO or TRD dependency. Script `sgo-nba-backfill` exists (line 23).

**.env.example (config/.env.example):** No SGO_KEY or RUNDOWN_KEY. Has ODDSAPI_KEY with comment "replaces SGO". No therundown/TRD keys.

**web-dashboard/.env.example:** Only VITE_API_URL; no SGO/TRD.

**PROJECT_STATE.md:** References **TRD** only in context of "TRD is not supported" (dry-test, valid providers PP and UD only) — no SGO or TheRundown as active dependencies. No SGO_KEY/RUNDOWN_KEY documented.

---

## 2. Fantasy score component

**Files found (with relevant function/block and role):**

| File | What it does | Complete / partial / stubbed | Pipeline position | TODO/FIXME |
|------|----------------|------------------------------|--------------------|-------------|
| **src/services/mergeService.ts** | `confidenceDelta(prop)` = FantasyMatchupScore − line; `mergeProps` adds fantasyMatchupScore and confidenceDelta to MergedProp; `isAltLine` checks marketId for "alternate"/"_alt". | Complete | Post-merge: adds columns to merged output for CSV (36-col inventory, 23-col cards V/W). | None |
| **src/services/fantasyAggregator.ts** | `calculateFantasyScore(props, scoringMap)` builds synthetic fantasy_score UnifiedProps from component stats (points, rebounds, etc.) with derivedFrom/isDerived. | Complete | Not wired in main EV flow; could feed merge/EV if enabled. | None |
| **src/fantasy_analyzer.ts** | `buildPlayerData` groups picks by player, collects fantasy_score props and component stat lines; `computeImpliedFantasyNBA/NFL`; `runFantasyAnalyzer()` fetches PP raw props, computes implied fantasy vs fantasy_score line, returns FantasyComparisonRow[]. | Complete | Run at end of run_optimizer (after cards): diagnostic only — logs "Fantasy analyzer total rows" and top 25 edges; not used as filter or EV input. | None |
| **src/fantasy.ts** | `computeFantasyScoreNBA` / `computeFantasyScoreNFL` (PrizePicks scoring rules). | Complete | Used by fantasy_analyzer for implied fantasy. | None |
| **src/fetch_props.ts** | Maps "fantasy_score"/"fantasy" to stat; projection_type/projection id (API shape). | Complete | Input: PP projections → RawPick with stat fantasy_score. | None |
| **src/merge_odds.ts** | PP_STATS_NOT_IN_ODDS_FALLBACK includes fantasy_score; pick.stat === "fantasy_score" skips merge (no odds match); comment: fantasy modules "re‑enabled once independent projections wired in". | Partial (excluded from EV legs) | Fantasy props explicitly excluded from EV legs/cards flow. | None |
| **src/run_optimizer.ts** | Calls `runFantasyAnalyzer()`, logs top 25 fantasy edges. | Complete | Output/diagnostic only; not input to EV or filter. | None |
| **src/types/unified-prop.ts** | FantasyMatchupScore, fantasyMatchupScore, confidenceDelta; derivedFrom/isDerived for synthetic fantasy. | Complete | Type layer for merge/cards. | None |
| **src/types.ts** | StatCategory includes "fantasy_score", "fantasy"; projectionId on pick types. | Complete | Types only. | None |
| **src/normalize_stats.ts** | Maps fantasy/fantasy_score/fantasy_points etc. to "fantasy" or nfl_fantasy. | Complete | Normalization for merge. | None |
| **src/load_underdog_props.ts** | Maps "fantasy"/"fantasy_score" to stat. | Complete | UD input. | None |
| **src/fetch_underdog_props.ts** | Same fantasy stat mapping. | Complete | UD input. | None |
| **src/fetch_underdog_manual.ts** | Same. | Complete | Manual UD. | None |
| **src/scripts/scrape_underdog_champions.ts** | Normalizes "fantasy"/"fd" to "fantasy_score". | Complete | Scraper. | None |
| **src/export_imported_csv.ts** | projectionId in CSV headers. | Complete | Export columns. | None |
| **src/calculate_ev.ts** | projectionId on pick. | Complete | EV input shape. | None |
| **src/build_innovative_cards.ts** | fantasy_score → "FPTS" label. | Complete | Output column label. | None |
| **src/exporter/clipboard_generator.ts** | fantasy_points "FP". | Complete | Clipboard export. | None |
| **src/services/cardBuilder.ts** | projectionId; fantasy_points "FP". | Complete | Card build. | None |
| **src/run_underdog_optimizer.ts** | fantasy_points "FP"; projectionId. | Complete | UD cards. | None |
| **src/adapters/propAdapter.ts** | fantasy_points → "fantasy_score". | Complete | Adapter. | None |
| **src/test_fantasy.ts** | CLI test for runFantasyAnalyzer. | Complete | Test entry. | None |
| **src/odds/book_ranker.ts** | Comment: "projections" for props. | Comment only. | N/A | None |
| **src/debug_fetch_nfl.ts** | PP projections URL / sample. | Complete | Debug script. | None |
| **src/__tests__/exact_line_merge.test.ts** | projectionId in test picks. | Test only. | N/A | None |
| **src/mock_legs.ts** | projectionId in mock. | Mock. | N/A | None |

**Summary:** Fantasy is **implemented** (fantasy.ts, fantasy_analyzer, mergeService confidenceDelta, fantasyAggregator). **Pipeline position:** Fantasy_score props are **excluded from EV legs/cards** (merge_odds); fantasy analyzer runs **after** cards as a **diagnostic** (implied vs line). ConfidenceDelta is an **output column** (V in 23-col cards) when FantasyMatchupScore is present; no independent projection feed is documented, so that column is often empty.

---

## 3. Full file tree

**src/*.ts (sorted):**

```
src/__tests__/breakeven.test.ts
src/__tests__/cli_bankroll.test.ts
src/__tests__/cli_strict_effective_config.test.ts
src/__tests__/exact_line_merge.test.ts
src/__tests__/engine_parity.test.ts
src/__tests__/odds_snapshot.test.ts
src/__tests__/step3_odds_calibration.test.ts
src/adapters/propAdapter.ts
src/backfill_perf_tracker.ts
src/build_innovative_cards.ts
src/build_single_bet_inputs.ts
src/calculate_ev.ts
src/calculate_overs_delta_ev.ts
src/calibrate_leg_ev.ts
src/card_ev.ts
src/cli_args.ts
src/config/binomial_breakeven.ts
src/config/leagues.ts
src/config/nba_props.ts
src/config/parlay_structures.ts
src/config/pp_payouts.ts
src/config/prizepicks_payouts.ts
src/config/sport_config.ts
src/config/ud_payouts.ts
src/config/underdog_structures.ts
src/constants/featureFlags.ts
src/constants/paths.ts
src/correlation_filters.ts
src/debug_fetch_nfl.ts
src/debug_underdog_fetch.ts
src/engine_interface.ts
src/espn_boxscore.ts
src/espn_probe.ts
src/ev/leg_ev_pipeline.ts
src/ev/juice_adjust.ts
src/ev_parlay.ts
src/export_imported_csv.ts
src/exporter/clipboard_generator.ts
src/fantasy.ts
src/fantasy_analyzer.ts
src/fetch_odds_api.ts
src/fetch_oddsapi.ts
src/fetch_oddsapi_props.ts
src/fetch_oddsapi_odds.ts
src/fetch_props.ts
src/fetch_underdog_manual.ts
src/fetch_underdog_props.ts
src/historical_weight.ts
src/historical/calibration_store.ts
src/historical/decay_weights.ts
src/historical/trend_analyzer.ts
src/kelly_mean_variance.ts
src/kelly_stake_sizing.ts
src/kelly_staking.ts
src/load_env.ts
src/load_underdog_props.ts
src/logger.ts
src/live_liquidity.ts
src/matchups/opp_adjust.ts
src/mock_legs.ts
src/mocks/handlers.ts
src/mocks/server.ts
src/merge_odds.ts
src/normalize_stats.ts
src/notifications/telegram_bot.ts
src/odds/book_ranker.ts
src/odds/normalize_odds.ts
src/odds/odds_snapshot.ts
src/odds/OddsProvider.ts
src/odds/odds_snapshot_manager.ts
src/odds_buckets.ts
src/odds_calibration_report.ts
src/oddsapi.ts
src/payout_math.ts
src/payouts.ts
src/perf_report.ts
src/perf_tracker_db.ts
src/perf_tracker_types.ts
src/portfolio_selector.ts
src/pp_engine.ts
src/run_calibration_pipeline.ts
src/run_nfl_raw_export.ts
src/run_optimizer.ts
src/run_underdog_optimizer.ts
src/scrape_nba_leg_results.ts
src/scripts/report_single_bet_ev.ts
src/scripts/scrape_underdog_champions.ts
src/SelectionEngine.ts
src/server.ts
src/services/cardBuilder.ts
src/services/fantasyAggregator.ts
src/services/mergeService.ts
src/services/notificationService.ts
src/services/parlay_service.ts
src/sportsbook_single_ev.ts
src/stat_balance_chart.ts
src/stats/correlation_matrix.ts
src/telegram_pusher.ts
src/test_fantasy.ts
src/tracking/analytics_engine.ts
src/tracking/auto_grader.ts
src/tracking/tracker_schema.ts
src/ud_engine.ts
src/underdog_card_ev.ts
src/validation/backtest_engine.ts
src/validation/phase8_verify.ts
src/validation/tweak_backtest.ts
src/utils/data_validator.ts
src/best_bets_score.ts
src/best_ev_engine.ts
src/fetchOddsApi.ts
src/odds_cache.ts
```

**scripts/ (*.ts, *.ps1, *.py, sorted):**

```
scripts/2pm_models.ps1
scripts/6pm_cards.ps1
scripts/_assert_compiled.ps1
scripts/_auto_window.ps1
scripts/analyze_min_leg_ev.ts
scripts/analyze_thresholds.ts
scripts/audit_5f_ev.ts
scripts/audit_all_structures_ev.ts
scripts/audit_merge_report.ts
scripts/backtest_ud_factor.ts
scripts/check_therundown_alt_lines.ts
scripts/cleanup_cache.ts
scripts/daily_betting_run.ps1
scripts/daily_grade.ts
scripts/daily-run.ps1
scripts/daily_data.ps1
scripts/debug_today.py
scripts/export_results.ps1
scripts/export_results_summary.py
scripts/fresh_data_run.ps1
scripts/health_check.ps1
scripts/import_sources.ps1
scripts/init_perf_tracker.ps1
scripts/ionos_deploy_check.ps1
scripts/nightly_maint.ps1
scripts/odds-calibration-report.ps1
scripts/perf-report.ps1
scripts/print_breakeven_table.ts
scripts/quota-monitor.ps1
scripts/quick_view.ps1
scripts/refresh.ps1
scripts/run_ai_pipeline.ps1
scripts/run_odds_quota_report.ts
scripts/run_final_results.ps1
scripts/run_fresh_and_build.ps1
scripts/run_fresh_and_package_deploy.ps1
scripts/run_morning_with_audit.ps1
scripts/run_optimizer.ps1
scripts/run_calibration_report.ts
scripts/run_research.ps1
scripts/run_selective.ps1
scripts/sgo_nba_historical.py
scripts/settle_results.py
scripts/test-telegram.ps1
scripts/track-results.ps1
scripts/train_models.ps1
scripts/verify_breakeven.ts
scripts/verify_wiring.ps1
scripts/_paths.ps1
scripts/auto_mode.ps1
scripts/espn_boxscore.py
scripts/export_results.py
```

---

## 4. CSV column headers (current outputs)

| File | Header (first line) |
|------|----------------------|
| data/output_logs/prizepicks-legs.csv | Sport,id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,leg_key,leg_label,confidenceDelta |
| data/output_logs/prizepicks-cards.csv | Sport,site,flexType,Site-Leg,Player-Prop-Line,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,breakevenGap,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,kellyRawFraction,kellyCappedFraction,kellyFinalFraction,kellyStake,kellyRiskAdjustment,efficiencyScore,portfolioRank,runTimestamp,bestBetScore,bestBetTier,confidenceDelta |
| data/output_logs/prizepicks-innovative-cards.csv | portfolioRank,tier,site,flexType,cardEV,compositeScore,correlationScore,diversity,correlation,liquidity,kellyFrac,kellyStake,fragile,fragileEvShifted,winProbCash,avgProb,avgLegEV,avgEdge,breakevenGap,statBalance,edgeCluster,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp |
| data/output_logs/underdog-legs.csv | Sport,id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,IsNonStandardOdds,leg_key,leg_label |
| data/output_logs/underdog-cards.csv | Sport,site,flexType,Site-Leg,Player-Prop-Line,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,leg7Id,leg8Id,runTimestamp,kellyStake,kellyFrac,bestBetScore,bestBetTier |
| data/output_logs/tier1.csv | portfolioRank,tier,site,flexType,cardEV,compositeScore,correlationScore,diversity,correlation,liquidity,kellyFrac,kellyStake,fragile,fragileEvShifted,winProbCash,avgProb,avgLegEV,avgEdge,breakevenGap,statBalance,edgeCluster,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp |
| data/output_logs/tier2.csv | (same as tier1) |

Note: PP legs/cards include confidenceDelta; UD legs do not have confidenceDelta column; UD cards have 8 leg IDs (leg7Id, leg8Id) vs PP’s 6.

---

## 5. Alt lines in OddsAPI response (normalized cache)

**Note:** `data/odds_cache.json` stores **normalized** `SgoPlayerPropOdds[]` (flat array with `marketId` per row), not the raw API response (events with bookmakers). So the requested node script that iterates `c.data[].bookmakers` does not apply. Equivalent check on normalized cache:

**Unique marketIds in cache:**  
player_assists, player_assists_alternate, player_blocks, player_points, player_points_alternate, player_points_assists, player_points_rebounds, player_points_rebounds_assists, player_rebounds, player_rebounds_alternate, player_rebounds_assists, player_steals, player_threes, player_threes_alternate.

**Alternate markets present:**  
player_points_alternate, player_rebounds_alternate, player_assists_alternate, player_threes_alternate — **all four are present** in the normalized cache.

---

## 6. Alt lines for DFS books (normalized cache)

Same cache shape (normalized rows with `book`, `marketId`). Check: which DFS books have rows with `marketId` containing "alternate"?

**Result:**  
- **Underdog:** has all four alternate marketIds (player_assists_alternate, player_points_alternate, player_rebounds_alternate, player_threes_alternate).  
- **PrizePicks:** In this cache snapshot, no rows with `book === "PrizePicks"` and `marketId` containing "alternate" were found (alternates may still be requested from API; snapshot may have none or different book label).  
- Pick6 / Betr: not enumerated in this run’s DFS alternate summary (book names in cache may differ, e.g. "DraftKings Pick6").

So **alternates are present for at least one DFS book (Underdog)** in the response; demons/goblins (PP) and non-default multipliers (UD/Pick6/Betr) are **requested** in fetch_oddsapi_props; actual presence per book is snapshot-dependent.

---

## 7. Alternate markets: consumed or dropped?

**Grep `alternate|_alternate` in src/** (summary):

- **fetch_oddsapi_props.ts:** Defines DEFAULT_MARKETS_ALTERNATE (4), REQUEST_MARKET_KEYS includes them, `isAlternateMarketKey(key)`, `normalizeEvent` sets `isMainLine: !isAlt` from market key. **Alternates are fetched and normalized** into SgoPlayerPropOdds with `isMainLine: false` and `marketId` e.g. player_points_alternate.
- **merge_odds.ts:** `findBestAltMatch` uses `sgoMarkets.filter((o) => o.isMainLine !== false)` — i.e. **only alt lines** (isMainLine === false). So alternate markets are **not dropped** at fetch; they are **consumed** in merge when the main pass returns `line_diff` and an alt-line candidate is chosen (Phase 2).
- **run_optimizer.ts:** Logs "Markets requested: ... + alternates" when includeAltLines.
- **OddsProvider.ts:** includeAlternativeLines option.
- **mergeService.ts:** `isAltLine(prop)` checks marketId "alternate" or "_alt" for merge grouping.

**Conclusion:** Alternates are **requested**, **normalized** (with isMainLine false and marketId retained), and **used** in merge_odds for the alt-line second pass. They are **not** silently dropped; they are part of the odds feed and can become the matched line when the main line does not match.

---

## 8. Last 20 git commits

```
def623b chore: confirm and harden main.yml pipeline architecture
28a16f3 fix: update tsconfig for Vite ESM and import.meta support
52fdfbc fix: update tsconfig for Vite ESM compatibility
d947c6b fix: initialize udRunResult to satisfy TS2454
57de1df refactor: consolidate workflows into main.yml
cc2fe06 fix: add verify:breakeven script to package.json
e1a094e debug: add SFTP secret length and ASCII diagnostic step
58ead86 refactor: normalize odds sources to support only OddsAPI and none
3129a25 feat: initial automation deployment with secrets
5eddf7c feat: initial automation deployment with secrets
2b65efd CLI Agent: dfs-optimizer (fixed,FIXED)
...
350760b Initial DFS optimizer v1
c324d07 CLI Agent: dfs-optimizer (fixed,FIXED)
```

**Observation:** Recent commits are CI/config/refactor (main.yml, tsconfig, OddsAPI-only). The 10-book OddsAPI config, quota cache, and PROJECT_STATE QUOTA_COST_MODEL updates are **not** in the last 20 commits (they were done in-session and may be uncommitted or in a later commit). So PROJECT_STATE’s claims about 10-book list, 126 units/run, and PP/UD deprecation reflect **current doc/code state**, not necessarily a commit in this log.

---

## 9. PROJECT_STATE.md gaps

| Check | Result |
|-------|--------|
| **Fantasy score** | PROJECT_STATE does **not** mention fantasy score, fantasy_analyzer, confidenceDelta, or FantasyMatchupScore. **Gap.** |
| **10-book OddsAPI config** | **Documented** in QUOTA_COST_MODEL (draftkings, fanduel, pinnacle, lowvig, betmgm, espnbet, prizepicks, underdog, pick6, betr_us_dfs). |
| **SGO / TRD references** | PROJECT_STATE only says "TRD is not supported" for dry-test; does not mention SGO or TheRundown as legacy or removed. **Gap:** no explicit "SGO/TRD deprecated or legacy" section. |
| **PP/UD scrapers deprecated** | **Reflected:** QUOTA_COST_MODEL says fetch_props and fetch_underdog_props are deprecated (not deleted), OddsAPI primary. |
| **QUOTA_COST_MODEL with 126 units/run** | **Present:** 126 cost per run, 4h TTL, &lt;500 guard, recommended schedule. |
| **Run schedule** | **Present:** ~142 runs/month max, 2–4× daily with 4h cache. |

**Additional gaps:**

- **Fantasy:** No mention of fantasy_analyzer run (diagnostic), fantasy_score exclusion from EV legs, or confidenceDelta column (cards V).
- **Alternate lines:** No explicit sentence that alternate markets are requested and used in merge (alt-line second pass).
- **SGO/TRD:** Many scripts and src files still reference SGO/TRD; PROJECT_STATE does not list them as legacy or document that run_optimizer uses only OddsAPI (and that SGO/TRD code paths exist but are not the primary pipeline).
- **CSV schema:** Cards schema (A–W) is listed; legs CSV columns (e.g. confidenceDelta on PP only) and tier CSV columns are not fully documented.
- **data/odds_cache.json:** Documented under Paths and QUOTA_COST_MODEL; no note that cache stores **normalized** props, not raw API response.

---

*End of audit report. No changes were made to the codebase.*
