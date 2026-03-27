# Phase history (append-only archive)

> Migrated from monolithic docs/PROJECT_STATE.md on 2026-03-23. For day-to-day context read docs/CURRENT_STATE.md first. Append new phase log entries here; do not use this file as default operational context.

---

## CURRENT_OBJECTIVE

- **Pipeline integrity:** Centralized paths, fail-fast automation, env isolation, and data validation are in place (see sections below and Phase 17T runtime contract).
- **Testing & flags:** MSW mocking for `fetchOddsAPIProps`, type-safe feature flags (`ENABLE_INNOVATIVE_PARLAY`), and unit test coverage for API fail-fast (401/500) are implemented.
- **Next focus:** Confirm full pipeline run succeeds (ODDSAPI_KEY set, outputs in `data/output_logs`), then run `npm run verify:canonical` (authoritative bundle includes `verify:breakeven`, **`npm run verify:canonical-samples`**, `tests/e2e.spec.ts`, `tests/phase19a_env_example_contract.spec.ts`, `tests/phase19c_engine_parity.spec.ts`, `tests/phase19d_breakeven_invariants.spec.ts`, `tests/phase19d_exact_line_merge.spec.ts`, `tests/phase19d_cli_contract.spec.ts`, `tests/phase19d_odds_snapshot.spec.ts`, `tests/phase19d_odds_calibration_step3.spec.ts`, `tests/parity_test.spec.ts`, `tests/phase17l_bucketed_evaluation_architecture.spec.ts`, `tests/phase17m_full_bucket_parity.spec.ts`, `tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`, `tests/phase17o_site_invariant_card_construction_gates.spec.ts`, `tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts`, `tests/phase17q_site_invariant_final_selection_policy.spec.ts`, `tests/phase17r_final_selection_observability.spec.ts`, `tests/phase17s_final_selection_reason_attribution.spec.ts`, `tests/phase17t_site_invariant_runtime_contract.spec.ts`, `tests/phase17x_cli_args_side_effect_free.spec.ts`, `tests/phase17y_explicit_cli_args_threading.spec.ts`, `tests/phase17z_explicit_cli_runtime_helpers.spec.ts`, `tests/phase18a_run_optimizer_explicit_args.spec.ts`, `tests/phase18b_run_underdog_explicit_args.spec.ts`, `tests/phase18c_ud_engine_explicit_cli.spec.ts`, `tests/phase18d_pp_engine_explicit_cli.spec.ts`, `tests/phase18e_merge_odds_explicit_cli.spec.ts`, `tests/phase18f_global_cli_inventory.spec.ts`, `tests/phase17w_legacy_naming_cleanup.spec.ts`, `tests/phase17v_safe_archive_execution.spec.ts`, `tests/phase17u_repo_hygiene_audit.spec.ts`, `tests/phase16_tier1_scarcity_attribution.spec.ts`, `tests/phase20_canonical_sample_artifacts.spec.ts`, `tests/phase21_canonical_sample_artifacts_drift.spec.ts`, `tests/phase22_canonical_sample_dashboard_consumer.spec.ts`, `tests/phase23_canonical_samples_ui.spec.ts`).
- **Dashboard IA (Phase 134):** Vite operator app uses **Overview** (default) / **Explore Legs** / **Diagnostics** via `DashboardPageNav` and URL `?page=explore|diagnostics` (default Overview omits `page`). `OptimizerStatePanels` takes `variant: 'overview' | 'diagnostics'`; same synced JSON/CSV fetch paths; Explore hides state panels with `hidden` to avoid refetch churn. See Phase 134 section at end of this file.
- **Site-invariant contract (Phase 17T):** `data/reports/latest_site_invariant_runtime_contract.json` / `.md` document end-to-end parity vs irreducible PP/UD differences; baseline verdict **`compliant_with_explicit_irreducible_differences`** with **no** tracked non-math variance bugs.
- **Repo hygiene (Phase 17U / 17V / 17W):** `data/reports/latest_repo_hygiene_audit.json` / `.md` — curated **safe_remove / safe_archive / keep_active / keep_needs_review** classifications; **Phase 17V** adds **`archivedThisPhase` / `removedThisPhase` / `skippedNeedsReview`** execution summaries (schema v2). Baseline hygiene: removed stale external “refactor report” doc link from **CURRENT_OBJECTIVE**; added **`phase16_tier1_scarcity_attribution.spec.ts`** to **`verify:canonical`**; **Phase 17V** archived offline-only **`tweak_backtest`** to **`tools/archive/validation/`** (no runtime imports). **Phase 17W** canonicalized OddsAPI legacy alias as **`src/fetch_oddsapi_legacy_alias.ts`** with **`src/fetch_oddsapi_odds.ts`** as compatibility re-export only.
- **CLI bootstrap (Phase 17X):** **`src/optimizer_cli_bootstrap.ts`** parses argv once and **`setCliArgsForProcess`** before other modules read **`cliArgs`** / **`getCliArgs()`** — no import-time **`process.argv`** parsing in **`cli_args.ts`**.
- **Explicit CLI threading (Phase 17Y):** **`run()`** resolves **`const args = getCliArgs()`** once and passes **`CliArgs`** into **`mergeWithSnapshot`**, **`runUnderdogOptimizer(..., args)`**, and **`createPrizepicksEngine(args)`**; **`merge_odds.ts`** requires caller **`CliArgs`** on **`mergeWithSnapshot`** / **`mergeOddsWithProps*`** (no **`getCliArgs()`** / **`cliArgs.`** reads); **`fetchFreshOdds(..., cli)`** remains explicit; PP/UD engines store **`CliArgs`** on the instance.
- **Runtime helpers (Phase 17Z):** **`card_ev.ts`** / **`build_innovative_cards.ts`** / **`telegram_pusher.ts`** do **not** read **`cliArgs`**; **`run_optimizer`** passes **`args`** into **`buildCardsForSize`** / **`evaluateFlexCard`** (`minCardEvFallback`), **`buildInnovativeCards`** (`cli: args`), **`pushTop5ToTelegram`** / **`pushUdTop5FromCsv`** (`telegramDryRun`).
- **run_optimizer orchestration (Phase 18A):** **`src/run_optimizer.ts`** does **not** import the **`cliArgs`** Proxy; **`run()`** uses only **`const args = getCliArgs()`** for orchestration; **`runSheetsPush(runTimestamp, cli)`** receives explicit **`CliArgs`** (callers pass **`args`**). **`cliArgs`** Proxy remains available for **`cli_args.ts`** consumers outside this entrypoint.
- **Underdog entry (Phase 18B):** **`src/run_underdog_optimizer.ts`** uses **`const args = cli ?? getCliArgs()`** as the single resolved snapshot inside **`main()`** (replaces **`cliResolved`** naming); **`mergeWithSnapshot`** / **`mergeOddsWithPropsWithMetadata`** pass **`args`**. **`filterEvPicksForEngine(evPicks, cli: CliArgs)`** requires explicit **`CliArgs`** ( **`ud_engine`** already passes **`this.cli`**); no **`getCliArgs()`** fallback in that helper.
- **UD engine (Phase 18C):** **`createUnderdogEngine(cli: CliArgs)`** requires explicit **`CliArgs`**; removed **`getCliArgs()`** fallback and module-level **`udEngine`** singleton; canonical engine parity uses **`createUnderdogEngine(getDefaultCliArgs())`** in **`tests/phase19c_engine_parity.spec.ts`**. **`run_underdog_optimizer`** does not construct **`UnderdogEngine`** on the hot path (inline UD pipeline); no wiring change there.
- **PP engine (Phase 18D):** **`createPrizepicksEngine(cli: CliArgs)`** requires explicit **`CliArgs`**; removed **`getCliArgs()`** fallback and **`ppEngine`** singleton; **`run_optimizer`** already uses **`createPrizepicksEngine(args)`**; **`tests/phase19c_engine_parity.spec.ts`** uses **`createPrizepicksEngine(getDefaultCliArgs())`** for default-threshold parity.
- **merge_odds (Phase 18E):** **`mergeWithSnapshot`**, **`mergeOddsWithProps`**, **`mergeOddsWithPropsWithMetadata`** require **`cli: CliArgs`**; removed **`resolveMergeCli`** / **`getCliArgs()`** fallback. **`run_optimizer`** / **`run_underdog_optimizer`** already pass **`args`**; tests use **`getDefaultCliArgs()`** or **`parseArgs([])`** where a default snapshot is intended.
- **Global CLI inventory (Phase 18F):** Repo-wide audit: production **`src`** (excluding **`src/__tests__`**) has **no** **`getCliArgs()`** outside **`run_optimizer.ts`** / **`run_underdog_optimizer.ts`** / **`cli_args.ts`**. No runtime module imports the **`cliArgs`** Proxy. Remaining **`getCliArgs`** uses are classified in the Phase **18F** table below.
- **Env example contract (Phase 19A):** Repository root **`.env.example`** exists ( **`tests/e2e.spec.ts`** contract); **`TELEGRAM_BOT_TOKEN`** / **`TELEGRAM_CHAT_ID`** documented; **`config/.env.example`** mirrors the same keys. **`load_env.ts`** unchanged (still loads only root **`.env`**).
- **Env mirror parity (Phase 19B):** **`tests/phase19a_env_example_contract.spec.ts`** (Phase **19B** block) asserts **`config/.env.example`** matches root **`.env.example`** on every non-comment **`KEY=value`** line **in order**; headers may differ.
- **Engine parity canonical (Phase 19C):** **`tests/phase19c_engine_parity.spec.ts`** is the **`verify:canonical`** home for PP/UD engine contract checks (payouts SSOT, **`PlatformEngine`** shape, default thresholds, **`breakEvenProbLabel`**, **`summarize`**); migrated from removed **`src/__tests__/engine_parity.test.ts`** (was outside Jest **`testMatch`**).
- **Non-canonical test sweep (Phase 19D):** Remaining **`src/__tests__/*.test.ts`** coverage (breakeven invariants, exact-line merge, CLI bankroll + strict/effective-config, odds snapshot, odds calibration step-3) lives under **`tests/phase19d_*.spec.ts`** and **`verify:canonical`**; **`src/__tests__/`** is empty. **`parseArgs([]).bankroll`** is asserted as **600** (matches **`parseCliArgsImpl`** initial object), not **1000**.
- **Canonical sample artifacts (Phase 20):** Deterministic PP/UD card bundles + summary under **`artifacts/samples/`** (git-tracked; **`artifacts/`** exception in **`.gitignore`**). Generated from committed pipeline-style fixtures via **`src/reporting/canonical_sample_artifacts.ts`** / **`npm run generate:canonical-samples`** — no optimizer re-execution. Regression: **`tests/phase20_canonical_sample_artifacts.spec.ts`**.
- **Canonical sample drift guard (Phase 21):** **`npm run verify:canonical-samples`** (read-only) fails if committed **`artifacts/samples/*.json`** ≠ **`buildCanonicalSampleBundle`** output; wired into **`npm run verify:canonical`** after **`verify:breakeven`**. Regression: **`tests/phase21_canonical_sample_artifacts_drift.spec.ts`**.
- **Dashboard sample consumer (Phase 22):** Read-only **`loadCanonicalSampleArtifactsReadOnly`** + shared **`parseCanonicalSampleArtifactsFromJson`**; **`npm run sync:canonical-samples-dashboard`** copies bytes to **`web-dashboard/public/data/canonical_samples/`**; browser helper **`fetchCanonicalSampleArtifactsForDashboard`** in **`web-dashboard/src/lib/canonicalSamples.ts`**. Docs: **`docs/CANONICAL_SAMPLES_DASHBOARD.md`**. Regression: **`tests/phase22_canonical_sample_dashboard_consumer.spec.ts`**.
- **Canonical samples UI surface (Phase 23):** **`?view=canonical-samples`** in the Vite app renders **`CanonicalSamplesPanel`** (uses Phase **22** fetch + **`formatCanonicalSamplesPanelLines`** from **`src/reporting/canonical_sample_artifacts_ui.ts`**). Regression: **`tests/phase23_canonical_samples_ui.spec.ts`**.
- **Dashboard optimizer state (Phase 81):** **`OptimizerStatePanels`** in **`web-dashboard/src/App.tsx`** loads synced copies of **`data/reports/latest_run_status.json`**, **`latest_pre_diversification_card_diagnosis.json`**, **`latest_card_ev_viability.json`**, **`latest_historical_feature_registry.json`** from **`web-dashboard/public/data/reports/`** ( **`npm run sync:dashboard-reports`** ). No pipeline or math changes — read-only UI.
- **Validation overview dashboard (Phase 109):** **`latest_feature_validation_overview.json`** is an **optional** fifth sync target (warning if missing); **`FeatureValidationOverviewPanel`** shows effective policy, graded/replay/strict/legacy/missing-dir/snapshot-bound counts, Phase **105** blocked/override (**`na`** when no enforcement artifact), and **`summaryLine`**; missing/invalid JSON shows an explicit error — no mock data. Parse: **`src/reporting/feature_validation_overview_dashboard.ts`**. Regression: **`tests/phase109_feature_validation_dashboard.spec.ts`** (**`verify:canonical`**).
- **Validation reporting refresh (Phase 110):** **`npm run refresh:validation-reporting`** runs **`export:feature-validation-replay-readiness`** → **`export:legs-snapshot-adoption`** → **`export:feature-validation-overview`** → **`sync:dashboard-reports`** (SSOT: **`VALIDATION_REPORTING_REFRESH_STEPS`**); prints per-step **OK/FAIL**, exits **1** on first failure, ends with **`overview:`** summary line when overview JSON exists. Regression: **`tests/phase110_validation_reporting_refresh.spec.ts`** (**`verify:canonical`**).
- **Validation reporting post-run integration (Phase 111):** **`scripts/post_run_model_refresh.ps1`** (and **`npm run postrun:model-refresh`**) after successful **`refresh:model-artifacts`** runs **`npm run refresh:validation-reporting`** — same **fail-fast** exit **1** as prior post-run steps; **`src/tracking/post_run_wrapper.ts`** **`defaultPostRunSteps`** matches for tests. **Not** wired to **`npm run agent`** / bare **`run_optimizer.ps1`** — use **`npm run run:with-post-refresh`** or **`postrun:model-refresh`**. Regression: **`tests/phase111_validation_reporting_refresh_integration.spec.ts`**, **`tests/phase16x_post_run_wrapper.spec.ts`** (**`verify:canonical`**).
- **Validation reporting freshness (Phase 112):** After a successful **`npm run refresh:validation-reporting`**, **`writeValidationReportingFreshnessArtifacts`** writes **`data/reports/latest_validation_reporting_freshness.*`** (repo vs **`web-dashboard/public/.../latest_feature_validation_overview.json`** mtime — **fresh** / **stale** / **unknown**); optional sync target; dashboard strip on **`FeatureValidationOverviewPanel`**. Regression: **`tests/phase112_validation_reporting_freshness.spec.ts`** (**`verify:canonical`**).
- **Validation/provenance runbook (Phase 113):** Operator SSOT: **`docs/VALIDATION_PROVENANCE_RUNBOOK.md`** (commands **`refresh:validation-reporting`**, **`export:feature-validation-*`**, policies, freshness, failure actions). Doc split (2026-03-23): read-first **`docs/CURRENT_STATE.md`**; phase log **`docs/PHASE_HISTORY.md`**; index stub **`docs/PROJECT_STATE.md`**. Regression: **`tests/phase113_validation_provenance_runbook.spec.ts`** (**`verify:canonical`**).
- **Validation/provenance audit bundle (Phase 114):** Read-only **`npm run export:validation-provenance-audit-bundle`** → **`data/reports/latest_validation_provenance_audit_bundle.json`** / **`.md`** — artifact presence (replay readiness, adoption, overview, freshness, optional policy/enforcement), effective env policy, overview/freshness fields when files exist, dashboard public-copy proof (**`proven` / `partial` / `missing`**), runbook flag, stable **`summaryLine`**. SSOT: **`src/reporting/dashboard_sync_contract.ts`** for sync file lists (**`scripts/sync_dashboard_reports.ts`** imports it). Regression: **`tests/phase114_validation_provenance_audit_bundle.spec.ts`** (**`verify:canonical`**).
- **Live merge / data quality hardening (Phase 115):** Grounded **`liveMergeQuality`** metrics + freshness block on **`latest_merge_quality.json`**; **`merge_status`** gains **`liveInputDegraded`**, **`liveMergeQualityLine`**; **`merge_platform_quality_by_pass.json`** retains PP/UD snapshots when **`latest_merge_audit`** is last-pass-only (**`both`**). **`latest_run_status.json`** optional **`liveMergeInput`**. Dashboard optional sync: **`merge_quality_status.json`**, **`merge_platform_quality_by_pass.json`**. Regression: **`tests/phase115_merge_live_data_quality.spec.ts`** (**`verify:canonical`**).
- **Dashboard live input quality panel (Phase 116):** **`LiveInputQualityPanel`** in **`OptimizerStatePanels`** (`web-dashboard`) — reads synced **`merge_quality_status.json`**, **`merge_platform_quality_by_pass.json`**, optional **`latest_merge_quality.json`**, **`latest_run_status.liveMergeInput`**; parse SSOT **`src/reporting/live_input_quality_dashboard.ts`** (alias **`@repo/live-input-quality-dashboard`**). Optional sync adds **`latest_merge_quality.json`**. Regression: **`tests/phase116_live_input_quality_dashboard.spec.ts`**; **`web-dashboard` build** includes panel bundle.
- **Optimizer edge quality audit (Phase 117):** Read-only **`src/reporting/optimizer_edge_quality_audit.ts`** writes **`data/reports/latest_optimizer_edge_quality.json`** / **`.md`** from **`CardEvResult`** exports + pool sizes + optional diversification JSON; **`latest_run_status.json`** optional **`optimizerEdgeQuality`** (status / degraded / summary line / artifact path). **`run_optimizer`** (PP+UD, UD-only, early exit, fatal) calls **`tryWriteOptimizerEdgeQualityAuditFromRunParts`**. Dashboard optional sync + strip in **`OptimizerStatePanels`**; parse **`web-dashboard/src/lib/optimizerEdgeQualityAudit.ts`**. Regression: **`tests/phase117_optimizer_edge_quality_audit.spec.ts`** (**`verify:canonical`**).
- **Historical feature coverage audit (Phase 118):** Read-only **`npm run export:historical-feature-coverage-audit`** → **`data/reports/latest_historical_feature_coverage_audit.json`** / **`.md`** — inventory of **`src/feature_input/`** vs Phase **80** registry, **ready / partial / missing / unclear_legacy** rows, cross-cutting notes, **`nextImplementationSlice`** now points at market-context alignment post–Phase **120**. Optional dashboard sync via **`dashboard_sync_contract.ts`**. Regression: **`tests/phase118_historical_feature_coverage_audit.spec.ts`** (**`verify:canonical`**).
- **Schedule / home-away context records (Phase 119):** **`buildScheduleHomeAwayContextRecords`** (`schedule_home_away_context_features.ts`) emits **`home_away_split`** / **`schedule_rest`** **`ContextFeatureRecord`**s from grounded fields only; **`feature_validation_export.ts`** merges with defense records via **`extractHistoricalFeaturesFromRows`** on the export row set + tracker **`homeAway`** fallback. Optimizer selection unchanged. Regression: **`tests/phase119_schedule_home_away_context_features.spec.ts`** (**`verify:canonical`**).
- **Rolling form context alignment (Phase 120):** **`buildRollingFormContextRecordsFromHistoricalRow`** (`rolling_form_context_features.ts`) maps grounded **`HistoricalFeatureRow`** rolling fields (L5/L10/L20 hit rates, prior sample size, L10 trend slope) into **`ContextFeatureRecord`**s under **`rolling_form`**; **`feature_validation_export.ts`** attaches these records when historical rows exist. Optimizer selection unchanged. Regression: **`tests/phase120_rolling_form_context_alignment.spec.ts`** (**`verify:canonical`**).
- **Dashboard decision clarity (Phase 82):** **`web-dashboard/src/lib/dashboardDecisionClarity.ts`** derives a single **PLAYABLE / NOT PLAYABLE** verdict, one primary reason sentence, explicit **slate status** (ACTIVE / OUTSIDE WINDOW / NEAR LOCK / NO FUTURE LEGS / UNKNOWN), and a **Best EV / Required / Gap** row from **`latest_card_ev_viability.json`** when present; **`OptimizerStatePanels`** renders a full-width operator decision card plus the Phase **81** three-column strip (supporting detail + historical coverage). Legs CSV supplies **`msUntilEarliestNotStarted`** for NEAR LOCK (**45** min). No optimizer or math changes.
- **Opportunity surface (Phase 83):** **`OpportunitySurfacePanel`** sits below the Phase **82** decision card: when **PLAYABLE**, shows top **5** cards by **`cardEv`** from synced CSV (structure, EV%, site, compact leg line); when **NOT PLAYABLE**, shows top **5** PP structure rows closest to threshold from **`structures[]`** in **`latest_card_ev_viability.json`** ( **`bestCaseRawEvIid`** vs **`sportCardEvThreshold`**, gap — read-only, no recomputation). No pipeline changes.
- **Edge concentration (Phase 84):** **`EdgeConcentrationPanel`** below **`OpportunitySurfacePanel`** aggregates **site / structure / leg-stat** counts over the same top-**5** **EV** card slice as Phase **83** (plus a deterministic interpretation line); when that slice is empty and verdict is **NOT PLAYABLE**, falls back to **near-miss** **`flexType`** counts from synced **`latest_card_ev_viability.json`**. Client-side aggregation only — no new exports or math.
- **Operator action (Phase 85):** **`OperatorActionPanel`** below **`EdgeConcentrationPanel`**; **`deriveOperatorAction`** in **`web-dashboard/src/lib/operatorAction.ts`** maps existing verdict, slate code, CSV slice length, near-miss presence, viability gap, registry presence, and load errors to **one primary action**, **one why line**, and up to **two** secondary chips — documented precedence **1–7** in source. No pipeline or math changes.
- **Dashboard snapshot (Phase 86):** **`Copy snapshot`** on **`OperatorActionPanel`** builds plain text via **`buildDashboardSnapshotText`** (**`dashboardSnapshotText.ts`**) from **`latest_run_status.runTimestamp`** (when present), verdict, primary reason, slate line, viability **Gap** when the gap row exists, first top-EV CSV row **or** first near-miss structure line (same sources as Phase **83**), and Phase **85** primary action — **`dashboardSnapshotClipboard.ts`** (**clipboard** + **`.txt` download** fallback). No new data or backend.
- **Feature input foundation (Phase 87):** Non-math context / AI-oriented inputs live under **`src/feature_input/`** (**`ContextFeatureRecord`**, **`normalizeContextFeatureValue`**). Boundary vs **`math_models/`** and selection is documented in **`docs/FEATURE_INPUT_LAYER.md`**. No EV/edge/gating changes.
- **Rolling form feature family (Phase 88):** **`buildRollingFormBinaryFeatures`** in **`src/feature_input/rolling_form_features.ts`** emits **`rolling_form_l5_hit_rate`** / **`rolling_form_l10_hit_rate`** from chronological **0/1** priors (aligned with registry rolling semantics; not wired to selection). **`docs/FEATURE_INPUT_LAYER.md`** lists the family.
- **Minutes + availability (Phase 89):** **`buildMinutesAvailabilityFeatures`** in **`src/feature_input/minutes_availability_features.ts`** — **`ContextFeatureRecord`** rows from chronological **`minutes`** game logs (no internal fetch; not wired to selection). **`docs/FEATURE_INPUT_LAYER.md`** updated.
- **Game environment (Phase 90):** **`buildGameEnvironmentFeatures`** in **`src/feature_input/game_environment_features.ts`** — pre-parsed **`gameTotal`** / **`spread`** only (no new source plumbing; implied totals derived when both present). Not wired to selection.
- **Team weak-defense (Phase 91):** **`buildTeamDefenseFeatures`** in **`src/feature_input/team_defense_features.ts`** — opponent allowed stats + optional ranks from caller (**nba_api**-style inputs mapped upstream); **`composite_defense_score`** only when both ranks set. Not wired to selection.
- **Feature join (Phase 92):** **`joinContextFeaturesForSubject`** in **`src/feature_input/feature_join.ts`** — groups **`ContextFeatureRecord`** rows by **`ContextFeatureFamily`** for one **`subjectId`** + **`asOfUtc`** (no scoring, no optimizer wiring).
- **Feature snapshot (Phase 93):** **`buildFeatureSnapshot`** in **`src/feature_input/feature_snapshot.ts`** — **`joinContextFeaturesForSubject`** + serializable **`featureFamilies`** object for debug/validation (no scoring, no optimizer wiring).
- **Feature scoring — non-EV (Phase 94):** **`scoreFeatureSnapshot`** in **`src/feature_input/feature_scoring.ts`** — deterministic **0–1**-style **`signals`** (**minutes** / **usage** / **environment** / **defense**) from **`FeatureSnapshot`**; not EV, not optimizer input.
- **Feature scoring corrections (Phase 94B):** **`feature_scoring.ts`** — **`minutes_signal`** from L5 + std penalty + trend bonus; **`usage_signal`** from **`usg_*`** only; **`environment_signal`** mean of bucket + total + **spread_abs**; no usage leakage from **`rolling_form`**. See **`docs/FEATURE_INPUT_LAYER.md`**.
- **Feature attachment (Phase 95):** **`EvPick`** / **`CardEvResult`** optional **`featureSnapshot`** + **`featureSignals`**; **`attachFeatureContextToCard`** / **`attachFeatureContextToPick`** in **`src/feature_input/attach_context_features.ts`**. Default runs unset; UD JSON passes through. No gating change.
- **Feature diagnostics (Phase 96):** **`summarizeFeatureSignals`** in **`src/feature_input/feature_diagnostics.ts`** — mean/min/max per signal over picks with **`featureSignals`**; validation-only.
- **Merge verify UX (Phase 96B):** **`scripts/verify_merge_quality_canonical.ts`** — when **`merge_quality_status.json`** reports **FAIL** and **`MERGE_QUALITY_ENFORCE`** is unset, prints an explicit **non-fatal** line (**`verify:merge-quality`** still exits **0**; enforcement is opt-in).
- **Signal vs outcome (Phase 97):** **`evaluateSignalPerformance`** in **`src/feature_input/feature_outcome_validation.ts`** — hit rates by signal bucket vs optional **`gradedLegOutcome`** on **`EvPick`**; read-only, no optimizer wiring.
- **Signal outcome report (Phase 98):** **`src/reporting/feature_outcome_validation_report.ts`** — stable **`data/reports/latest_feature_outcome_validation.json`** / **`.md`** from **`buildFeatureOutcomeValidationArtifact`**; reporting only.
- **Feature outcome runner (Phase 99):** **`scripts/run_feature_outcome_validation.ts`** via **`npm run validate:feature-outcome -- --input=<path>`** — explicit offline JSON pick array → Phase **98** artifacts; no optimizer hook.
- **Real feature outcome validation (Phase 100):** Execution/analysis attempt — **no** grounded **`EvPick[]`** JSON in repo with both **`featureSignals`** and **`gradedLegOutcome`**; operator export required before **`validate:feature-outcome`** yields real artifacts (see Phase **100** section).
- **Feature validation export (Phase 101):** **`scripts/export_feature_validation_picks.ts`** via **`npm run export:feature-validation-picks`** — grounded **`perf_tracker.jsonl`** (**`result` 0/1**) + **`existingLegCsvPaths`** + **`existingGroundedLegJsonPaths`** (Phase **101C**); Phase **101D** archive CSV discovery; Phase **101E** deterministic field join; Phase **101F** mismatch audit (**`data/reports/latest_feature_validation_reconstruction_mismatch.*`**).
- **Legs snapshot integrity + tracker binding (Phase 102):** Grounded runs persist an immutable **`data/legs_archive/<legsSnapshotId>/`** copy of PP/UD legs CSV+JSON (deterministic id from **`runTimestampEt`**; collision suffixes **`_2`**, …); **`perf_tracker`** rows may include optional **`legsSnapshotId`**; **`exportFeatureValidationPicks`** loads legs from that snapshot when set (fail-closed); legacy rows unchanged; **`npm run export:legs-snapshot-integrity`** → **`data/reports/latest_legs_snapshot_integrity.*`**. **`readTrackerRows(cwd?)`** reports against the requested project root for integrity/export tests.
- **Snapshot export observability + enforcement (Phase 103):** **`exportFeatureValidationPicks`** exposes additive snapshot vs legacy join/skip counts, fail-closed reason buckets (**`missing_snapshot_directory`**, **`snapshot_present_no_leg_match`**, **`snapshot_present_ambiguous_reconstruction`**, **`legacy_no_leg_match`**), and **`skipReasonSamples`**; **`npm run export:feature-validation-picks`** writes **`data/reports/latest_feature_validation_snapshot_status.*`** by default (**`--no-snapshot-status`** to skip); optional **`--enforce-snapshot`** or **`FEATURE_VALIDATION_SNAPSHOT_ENFORCE=1`** sets **`enforcementFailed`** when any snapshot-bound row does not export (script exits **1** when enforcement fails).
- **Snapshot adoption + legacy debt (Phase 104):** **`loadRunTimestampToLegsSnapshotId`** also merges **`artifacts/legs_snapshot_ref.json`** (archive meta wins on key collision). New tracker rows come only from **`backfillPerfTracker`** → **`buildPerfTrackerRowFromTierLeg`** (stamps **`legsSnapshotId`** when resolvable — no fabricated ids). **`npm run export:legs-snapshot-adoption`** → **`data/reports/latest_legs_snapshot_adoption.*`** with stable **`summaryLine`** (**`legs_snapshot_adoption snapshot=X/Y graded_snap=A/B legacy_unsnapshotted=N`**).
- **New-row snapshot enforcement (Phase 105):** **`backfillPerfTracker`** fails closed on new appends without resolved **`legsSnapshotId`** (clear **`console.warn`**). Escape hatch: **`PERF_TRACKER_ALLOW_APPEND_WITHOUT_SNAPSHOT=1`** or **`npx ts-node src/backfill_perf_tracker.ts --allow-append-without-snapshot`** — logs override + **`creationProvenance.legsSnapshotAppend`**. Artifacts: **`data/reports/latest_tracker_snapshot_new_row_enforcement.*`**; stable summary **`tracker_snapshot_new_row_enforcement …`**. Parsing / **`writeTrackerRows`** mutation paths unchanged.
- **Replay readiness + validation segmentation (Phase 106):** **`buildFeatureValidationReplayReadinessReport`** classifies graded rows (deduped like export): **`replay_ready_snapshot_bound`**, **`snapshot_bound_missing_snapshot_dir`**, **`legacy_without_snapshot_id`**, **`legacy_resolved_best_effort`**, **`strict_validation_eligible`** / **`strict_validation_ineligible`** (+ ineligible breakdown). **`npm run export:feature-validation-replay-readiness`** → **`data/reports/latest_feature_validation_replay_readiness.*`**; summary **`feature_validation_replay_readiness graded=… replay_ready=… strict_eligible=… legacy=… missing_snapshot_dir=… legacy_best_effort=…`**. **`readTrackerRowsFromFile`** exported from **`feature_validation_export`** for reuse.
- **Validation policy surfacing (Phase 107):** **`FeatureValidationPolicy`**: **`legacy_best_effort`** (global legs map only), **`snapshot_preferred`** (default — snapshot archive when **`legsSnapshotId`** present), **`snapshot_strict`** (graded rows without **`legsSnapshotId`** excluded). **`exportFeatureValidationPicks`** accepts **`policy`** / **`FEATURE_VALIDATION_POLICY`** and optional **`writePolicyStatusArtifacts`** → **`data/reports/latest_feature_validation_policy_status.*`** (policy, graded totals, policy exclusions, **`exportedViaLegacyMapJoin`** / **`exportedViaSnapshotMapJoin`**, stable skip buckets, embedded Phase **106** replay readiness counts + deterministic **`summaryLine`**). **`npm run export:feature-validation-picks`** adds **`--policy=`** and **`--no-policy-status`**; logs **`policy_source`** and **`effective_policy`**. Regression: **`tests/phase107_feature_validation_policy.spec.ts`** (**`verify:canonical`**).
- **Validation overview consolidation (Phase 108):** **`buildFeatureValidationOverviewReport`** composes **`buildFeatureValidationReplayReadinessReport`** + **`buildLegsSnapshotAdoptionReport`** + effective policy (**`FEATURE_VALIDATION_POLICY`** / default) + optional **`latest_feature_validation_policy_status.json`** (**`lastExportPolicy`**) + optional **`latest_tracker_snapshot_new_row_enforcement.json`**; writes **`data/reports/latest_feature_validation_overview.*`** with one deterministic **`summaryLine`** (**`feature_validation_overview policy=… graded=… replay_ready=… strict_eligible=… missing_snapshot_dir=… legacy_wo_sid=… snap_rows_all=… snap_graded=… blocked_new_wo=… override_appends=…`**). **`npm run export:feature-validation-overview`** — read-only besides overview files. Regression: **`tests/phase108_feature_validation_overview.spec.ts`** (**`verify:canonical`**).
- **Calibration surface baseline (Phase 66):** Read-only **`npm run export:calibration-surface`** → **`data/reports/latest_calibration_surface.json`** / **`.md`** (resolved **`perf_tracker`** legs vs predicted edge/EV; no optimizer math changes). Regression: **`tests/phase66_calibration_surface.spec.ts`**.
- **Tracker integrity & implied completion (Phase 67):** **`npm run export:tracker-integrity`** (dry-run report) and **`npm run backfill:tracker-implied`** (**`--apply`**) — grounded **`impliedProb`** / odds context from row fields, **`existingLegCsvPaths` + `loadLegsMap`**, and earliest pre-start OddsAPI snapshots (fail-closed on ambiguity); **`data/reports/latest_tracker_integrity.json`** / **`.md`**. Regression: **`tests/phase67_tracker_integrity.spec.ts`**. Calibration surface **`definitions.trackerIntegrity`** points at this report.
- **Game-time backfill & temporal integrity (Phase 68):** **`npm run export:tracker-temporal-integrity`** (dry-run, in-memory enrichment + report only) and **`npm run backfill:tracker-start-times`** (**`--apply`**) — grounded **`gameStartTime`** from **`src/tracking/tracker_temporal_integrity.ts`** (legs CSV → legs JSON / **`oddsapi_today`**, deterministic; no fuzzy inference; **`fromSnapshotEvent: 0`**); **`data/reports/latest_tracker_temporal_integrity.json`** / **`.md`**. Regression: **`tests/phase68_tracker_temporal_integrity.spec.ts`**. Re-run Phase **67** after persisting times to measure implied/snapshot lift.
- **Tracker creation-time completeness (Phase 69):** **`npm run export:tracker-creation-integrity`** → **`data/reports/latest_tracker_creation_integrity.json`** / **`.md`** — creation contract + tagged-row metrics (**`creationTimestampUtc`**); backfill appends use **`buildPerfTrackerRowFromTierLeg`** (**`src/tracking/tracker_creation_backfill.ts`**) with **`creationProvenance`** and deterministic **`resolvePlatformForBackfill`**. Regression: **`tests/phase69_tracker_creation_integrity.spec.ts`**. Legacy rows remain without creation tags until re-appended.
- **Post-hardening validation (Phase 70):** **`npm run validate:phase70`** runs **`backfillPerfTracker`**, regenerates Phase **67–69** + calibration exports, writes **`data/reports/latest_phase70_post_hardening_comparison.json`** / **`.md`**. If tier/legs pairs are already in **`perf_tracker`**, **`appended=0`** is expected; blocker is documented in the comparison artifact.
- **Pipeline trace diagnosis (Phase 71):** **`npm run export:pipeline-trace-diagnosis`** → **`data/reports/latest_pipeline_trace_diagnosis.json`** / **`.md`** — cross-links existing observability (survival, run status, merge audit, final selection, tracker/calibration) + UD extreme-odds math trace (**`juiceAwareLegEv`** vs CSV). Regression: **`tests/phase71_pipeline_trace_diagnosis.spec.ts`**.
- **Market-edge alignment diagnosis (Phase 72):** **`npm run export:market-edge-alignment-diagnosis`** → **`data/reports/latest_market_edge_alignment_diagnosis.json`** / **`.md`** — compares naive **`juiceAwareLegEv`** (trueProb−0.5) vs **`marketEdgeFair`** (trueProb − two-way de-vig fair) on **`prizepicks-legs.csv`** / **`underdog-legs.csv`** with analogous threshold simulation; regression: **`tests/phase72_market_edge_alignment.spec.ts`**.
- **Gating metric correction (Phase 73):** **`npm run export:gating-metric-correction`** → **`data/reports/latest_gating_metric_correction.json`** / **`.md`** — documents Phase 73 switch of **`juiceAwareLegEv`** to market-relative **`trueProb − fairProbChosenSide`** (fallback naive), **`EvPick.legacyNaiveLegMetric`** diagnostics, legs CSV columns; regression: **`tests/phase73_gating_metric_correction.spec.ts`**.
- **Threshold rebalancing (Phase 74):** **`npm run export:threshold-rebalancing-analysis`** → **`data/reports/latest_threshold_rebalancing_analysis.json`** / **`.md`** — market-relative **`marketEdgeFair`** sensitivity, binding stages, minimal **`T*`** search, recommended floors; default runner relaxations: **PP `adjustedEvThreshold` 0.03→0.0225**, **UD `udMinEdge` 0.008→0.006** (non-volume); regression: **`tests/phase74_threshold_rebalancing.spec.ts`**.
- **PP merge breadth (Phase 75):** **`npm run export:pp-merge-breadth-analysis`** → **`data/reports/latest_pp_merge_breadth_analysis.json`** / **`.md`** — PrizePicks **`stat_type`** resolution (**`stat_display_name`**, **`included` stat_type**), combo spacing collapse + **`P+A`/`R+A`** tokens, **`merge_odds`** **`STAT_MAP`** **`p+a`/`r+a`**; regression: **`tests/phase75_pp_merge_breadth.spec.ts`**.
- **Pre-diversification card diagnosis (Phase 76):** Counted pipeline **before** Phase 77 diversification — PP: structure builder stats + **`attributeFilterAndOptimizeBatch`** (same **`kept`** as **`filterAndOptimize`**); UD: k-combo enumeration + dedupe + **`attributeFinalSelectionUdFormatEntries`** (same **`keptEntries`** as **`applyFinalSelectionToFormatEntries`**). Artifacts **`data/reports/latest_pre_diversification_card_diagnosis.json`** / **`.md`**; regression: **`tests/phase76_pre_diversification_card_diagnosis.spec.ts`**.
- **PP builder pool vs eligibility (Phase 78):** **`buildCardsForSize`** no longer pre-filters legs with **`trueProb >= structureBE + minEdge`** (misaligned with market-relative **`edge`** / **`legEv`** gates). Pool = **`buildPpCardBuilderPool`** — rank by **`edge`**, cap **30** — same eligible set the runner already produced; regression: **`tests/phase78_pp_builder_pool_alignment.spec.ts`**.
- **Card EV viability diagnosis (Phase 79):** Read-only **`npm run export:card-ev-viability`** → **`data/reports/latest_card_ev_viability.json`** / **`.md`** — raw EV distribution (same **`getStructureEV`** / i.i.d. path as **`evaluateFlexCard`**), registry **`p*`**, greedy best-case vs breakeven, DP contrast via **`computeLocalEvDP`**, example traces; regression: **`tests/phase79_card_ev_viability.spec.ts`**.
- **Historical feature registry (Phase 80):** Backtest-ready leg-level features from **`data/perf_tracker.jsonl`** only (rolling form L5/L10/L20 without leakage, schedule/rest, static opponent rank via **`opp_adjust`**, market fields on row, explicit role placeholder). **Not** wired into **`trueProb`**, edge, gating, or selection. Artifacts: **`data/reports/latest_historical_feature_registry.json`** / **`.md`**, **`artifacts/historical_feature_rows.jsonl`**; **`npm run export:historical-feature-registry`**; regression: **`tests/phase80_historical_feature_registry.spec.ts`**.
- **Portfolio diversification (Phase 77):** Greedy post-rank export layer (**`src/policy/portfolio_diversification.ts`**) — soft penalties + hard caps on leg/player/overlap/game concentration; **`rawCardEv`** / **`diversificationAdjustedScore`** / penalty breakdown on exported cards; artifacts **`data/reports/latest_portfolio_diversification.json`** / **`.md`** (PP/UD sections); **`--no-portfolio-diversification`**; regression: **`tests/phase77_portfolio_diversification.spec.ts`**.

### Phase 21 — Canonical sample artifact CI drift guard

- **Assumptions:** **No** changes to Phase **20** normalization semantics or fixture shapes except as needed for the guard API; **no** optimizer math/pipeline behavior changes; verification is **read-only** (does not write **`artifacts/samples/`**).
- **Purpose:** Deterministic CI/local check that **`npm run generate:canonical-samples`** would not change committed **`artifacts/samples/*`** — catches silent drift after generator or fixture edits.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/canonical_sample_artifacts.ts`; `scripts/generate_canonical_sample_artifacts.ts`; `artifacts/samples/`; `package.json`; `tests/phase20_canonical_sample_artifacts.spec.ts`.
- **Files changed:** **`src/reporting/canonical_sample_artifacts.ts`** — **`verifyCanonicalSampleArtifactsDrift`**; **`scripts/verify_canonical_sample_artifacts.ts`**; **`package.json`** (`verify:canonical-samples`, **`verify:canonical`** prerequisite); **`tests/phase21_canonical_sample_artifacts_drift.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`verifyCanonicalSampleArtifactsDrift({ cwd, ppCardsRelativePath?, udCardsRelativePath? })`** compares on-disk **`sample_cards_pp.json`**, **`sample_cards_ud.json`**, **`sample_summary.json`** to **`stringifyCanonicalSampleJson`** of **`buildCanonicalSampleBundle`** output; returns **`{ ok: true }`** or **`{ ok: false, message, mismatches }`**. CLI prints remediation (**`npm run generate:canonical-samples`** + commit) on failure; exits **0** / **1**.
- **Tests added/updated:** **`tests/phase21_canonical_sample_artifacts_drift.spec.ts`** — pass on clean repo, deterministic repeat, failure + message on perturbed temp tree, mtime unchanged on verify-only path.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples` (**pass**); `npx jest --config jest.config.js tests/phase21_canonical_sample_artifacts_drift.spec.ts` (**pass**); `npm run verify:canonical` (**pass**).
- **Current state:** Drift guard is the same source of truth as **`generate:canonical-samples`** (shared **`buildCanonicalSampleBundle`**).
- **Risks / follow-ups:** **Phase 22** adds dashboard static copy + browser fetch; **`verify:canonical-samples`** remains the CI gate for **`artifacts/samples/`** drift.

### Phase 22 — Dashboard sample artifact consumer wiring

- **Assumptions:** **No** optimizer / EV / ranking changes; **no** redefinition of Phase **20** JSON meaning; **`artifacts/samples/`** remains SSOT; dashboard static copies are **byte-identical** via sync script.
- **Purpose:** Narrow, read-only paths so product-facing surfaces can load canonical samples without importing optimizer code.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/canonical_sample_artifacts.ts`; `web-dashboard/vite.config.ts`; `web-dashboard/tsconfig.json`; `web-dashboard/public/data/`; `package.json`.
- **Files changed:** **`src/reporting/canonical_sample_contract.ts`** (constants only, browser-safe); **`src/reporting/canonical_sample_artifacts.ts`** (re-exports contract constants); **`src/reporting/canonical_sample_artifacts_validate.ts`**; **`src/reporting/canonical_sample_artifacts_consumer.ts`**; **`scripts/sync_canonical_samples_to_web_dashboard.ts`**; **`web-dashboard/src/lib/canonicalSamples.ts`**; **`web-dashboard/vite.config.ts`** (fs allow + **`@repo/canonical-sample-validate`** alias); **`web-dashboard/tsconfig.json`** (paths); **`web-dashboard/public/data/canonical_samples/*.json`** (synced); **`docs/CANONICAL_SAMPLES_DASHBOARD.md`**; **`tests/phase22_canonical_sample_dashboard_consumer.spec.ts`**; **`package.json`** (`sync:canonical-samples-dashboard`, **`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`parseCanonicalSampleArtifactsFromJson`** validates PP/UD/summary **`unknown`** JSON; **`loadCanonicalSampleArtifactsReadOnly(cwd)`** reads **`artifacts/samples/`** only; **`fetchCanonicalSampleArtifactsForDashboard`** fetches static JSON under **`./data/canonical_samples/`** (no mock fallback). Sync script **`copyFileSync`** from **`artifacts/samples/`** to dashboard public.
- **Tests added/updated:** **`tests/phase22_canonical_sample_dashboard_consumer.spec.ts`** — load shape, validation error, missing file, mtime read-only, byte parity vs public copy, idempotent sync.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples` (**pass**); `npx jest --config jest.config.js tests/phase22_canonical_sample_dashboard_consumer.spec.ts` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical` (**pass**).
- **Current state:** Contract constants live in **`canonical_sample_contract.ts`** so validation can bundle without **`fs`**.
- **Risks / follow-ups:** After changing **`artifacts/samples/`**, run **`npm run sync:canonical-samples-dashboard`** and commit **`web-dashboard/public/data/canonical_samples/`**; minimal UI: **Phase 23**.

### Phase 23 — Minimal canonical samples UI surface

- **Assumptions:** **No** optimizer or artifact contract changes; display uses **only** fields already in committed JSON; **no** mock data on fetch/validation failure.
- **Purpose:** Smallest read-only proof that **`fetchCanonicalSampleArtifactsForDashboard`** + validation work end-to-end in the dashboard shell.
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/src/lib/canonicalSamples.ts`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`.
- **Files changed:** **`src/reporting/canonical_sample_artifacts_ui.ts`** (`formatCanonicalSamplesPanelLines`); **`web-dashboard/src/components/CanonicalSamplesPanel.tsx`**; **`web-dashboard/src/App.tsx`** (`?view=canonical-samples` early layout); **`docs/CANONICAL_SAMPLES_DASHBOARD.md`**; **`tests/phase23_canonical_samples_ui.spec.ts`**; **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** URL flag **`view=canonical-samples`** shows header + panel; panel **`useEffect`** calls **`fetchCanonicalSampleArtifactsForDashboard`**; success renders monospace list of **`formatCanonicalSamplesPanelLines`** output; failure shows error + sync reminder (no silent fallback).
- **Tests added/updated:** **`tests/phase23_canonical_samples_ui.spec.ts`** — formatter lines match committed sample counts/ids; validation error text has no “mock” fallback wording; **`artifacts/samples/`** mtime stable on **`loadCanonicalSampleArtifactsReadOnly`**.
- **Validation commands run (agent):** `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples` (**pass**); `npx jest --config jest.config.js tests/phase23_canonical_samples_ui.spec.ts` (**pass**); `npm run verify:canonical` (**pass**).
- **Current state:** E2E entry: **`/?view=canonical-samples`** (see **`docs/CANONICAL_SAMPLES_DASHBOARD.md`**).
- **Risks / follow-ups:** Optional polish (styling only) or merge into admin view — out of scope unless a new phase requests it.

### Phase 25 — Canonical Samples CI Verification Gate

- **Assumptions:** **No** optimizer / EV / artifact generator changes; **no** writes during verification; **`web-dashboard/node_modules`** must exist for build/preview (CI installs via **`cd web-dashboard && npm ci`**); Playwright Chromium is installed for CI via **`npx playwright install --with-deps chromium`**.
- **Purpose:** Smallest CI-ready gate so **`/?view=canonical-samples`** smoke (built app + vite preview) is part of the standard verification workflow alongside drift **`verify:canonical-samples`**.
- **Files inspected:** `docs/PROJECT_STATE.md`; `package.json`; `jest.config.js`; `web-dashboard/package.json`; `.github/workflows/main.yml`; `web-dashboard/src/components/CanonicalSamplesPanel.tsx`.
- **Files changed:** **`playwright.config.ts`** (root — **`tests/playwright/`** only, **`webServer`** builds + previews **`web-dashboard`** on **127.0.0.1:4173**); **`tests/playwright/canonical_samples_ui_smoke.spec.ts`**; **`jest.config.js`** — **`testPathIgnorePatterns`** excludes **`tests/playwright/`**; **`package.json`** — **`verify:canonical-samples:ui-smoke`** (`npx playwright test`), **`verify:canonical`** appends **`&& npm run verify:canonical-samples:ui-smoke`** after Jest; **`.github/workflows/main.yml`** — **`web-dashboard` npm ci**, Playwright browser install, **`verify:canonical-samples`**, **`verify:canonical-samples:ui-smoke`**; **`tsconfig.json`** — include **`playwright.config.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`npm run verify:canonical-samples:ui-smoke`** runs Playwright against **`/?view=canonical-samples`**; expects visible **“Canonical sample bundle (read-only)”** and **no** error panel; **`verify:canonical`** ends with the same smoke after all Jest specs; CI **`verify`** job runs drift guard + UI smoke (does **not** run full **`verify:canonical`** Jest sweep).
- **Tests added/updated:** **`tests/playwright/canonical_samples_ui_smoke.spec.ts`** (Playwright, not Jest).
- **Validation commands run (agent):** `npm run verify:canonical-samples` (**pass**); `web-dashboard` **`npm run build`** (**pass** after **`npm install`** in **`web-dashboard/`** — local **`npm ci`** hit EPERM on locked toolchain binaries, environment-specific); `npm run verify:canonical-samples:ui-smoke` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical` (**pass**, ~125s including Jest + Playwright smoke).
- **Current state:** Canonical samples browser smoke is a named npm script, chained on **`verify:canonical`**, and exercised in **`.github/workflows/main.yml`**.
- **Risks / follow-ups:** Full **`verify:canonical`** in CI remains optional (long runtime); next phase may widen CI or add caching for Playwright browsers.

### Phase 26 — Canonical Verification CI Scope Hardening

- **Assumptions:** **`npm run verify:canonical`** runtime on **`ubuntu-latest`** (~3–8 minutes including Jest + Playwright) is acceptable for **`main`** pushes; **no** optimizer / artifact / math changes; **no** new npm scripts required — **`verify:canonical`** is the single authoritative chain (Phase **25** already appends **`verify:canonical-samples:ui-smoke`**).
- **Purpose:** One intentional CI answer: **GitHub Actions `verify` job** runs the **full** canonical verification script instead of a partial subset (breakeven + drift + smoke only), so the **entire** Jest list in **`package.json`** is enforced on every **`main`** run.
- **Files inspected:** `docs/PROJECT_STATE.md`; `.github/workflows/main.yml`; `package.json` (**`verify:canonical`** definition).
- **Files changed:** **`.github/workflows/main.yml`** — **`verify`** job replaces separate **`verify:breakeven`** / **`verify:canonical-samples`** / **`verify:canonical-samples:ui-smoke`** steps with one step **`npm run verify:canonical`**; adds **`timeout-minutes: 30`** and header comments documenting enforcement + expected runtime; **`grep`** table invariant remains **after** full verify; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`main.yml`** **`verify`** now runs **`npm run verify:canonical`** (then **`grep`** on **`artifacts/parlay_breakeven_table.md`**). **Fast-path vs long-path:** this workflow is the **long/full** path only; operators who need a quicker check use **`npm run verify:canonical-samples`**, **`npm run verify:canonical-samples:ui-smoke`**, or **`npm run verify:breakeven`** locally — not split into two CI jobs (avoids duplicate breakeven/samples/smoke runs and script sprawl).
- **Tests added/updated:** none (CI wiring only).
- **Validation commands run (agent):** `npm run verify:canonical-samples` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**); `npm run verify:canonical` (**pass**, ~135s); **`.github/workflows/main.yml`** edited only (no `actionlint` / `yamllint` in repo — not run).
- **Current state:** **`main`** CI **`verify`** ≡ **`npm run verify:canonical`** + invariant **grep**; **deploy** still **`needs: verify`**.
- **Risks / follow-ups:** If **`main`** CI becomes too slow, consider **Option B** (scheduled or manual **`workflow_dispatch`** full run) without removing this single-script clarity.

### Phase 27 — Canonical Samples Failure Surfacing

- **Assumptions:** **No** optimizer, artifact contract, fetch URL, or validation rules changes; **no** mock data or retries; failure copy is **derived only** from existing **`Error.message`** strings on the dashboard path.
- **Purpose:** Clear, stable operator-facing failure state for **`CanonicalSamplesPanel`**: one headline + optional single-line detail; **no** raw **`<pre>`** stack-style dumps.
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/CanonicalSamplesPanel.tsx`; `web-dashboard/src/lib/canonicalSamples.ts`; `src/reporting/canonical_sample_artifacts_validate.ts`; `tests/phase23_canonical_samples_ui.spec.ts`; `tests/playwright/canonical_samples_ui_smoke.spec.ts`; `package.json`.
- **Files changed:** **`src/reporting/canonical_sample_artifacts_error_ui.ts`** — **`normalizeCanonicalSamplesPanelError`** (HTTP / JSON parse / consumer validation / capped fallback); **`web-dashboard/src/components/CanonicalSamplesPanel.tsx`** — error branch uses normalized headline + optional detail, **`data-testid`** on error nodes; **`tests/phase27_canonical_samples_failure_ui.spec.ts`**; **`tests/playwright/canonical_samples_ui_smoke.spec.ts`** — assert **no** **`canonical-samples-error-headline`** on happy path; **`package.json`** — **`verify:canonical`** includes Phase **27** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Errors show a **short headline** (e.g. **Canonical samples unavailable**, **Failed to load canonical samples**, **Invalid canonical samples response**, **Canonical samples validation failed**) and **one** **detail** line when applicable (e.g. **Missing canonical bundle**, **Request failed (HTTP n)**, **Schema version mismatch**). Unclassified messages get a **single** capped line (no multi-line **pre**). Sync reminder unchanged. Success panel unchanged.
- **Tests added/updated:** **`tests/phase27_canonical_samples_failure_ui.spec.ts`** (normalizer cases); Playwright smoke uses **`data-testid`** for regression on happy path.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase27_canonical_samples_failure_ui.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**); `npm run verify:canonical` (**pass**, ~140s).
- **Current state:** Failure UI is deterministic and actionable without exposing noisy raw errors.
- **Risks / follow-ups:** If upstream error strings change materially, extend **`normalizeCanonicalSamplesPanelError`** mappings only.

### Phase 28 — Canonical Samples Troubleshooting Link

- **Assumptions:** **No** fetch, validation, or artifact semantics changes; deployed dashboard may not open repo files as hyperlinks — **repo-relative path as text** is acceptable; **one** secondary line only.
- **Purpose:** Immediate operator pointer from the canonical samples **error** panel to **`docs/CANONICAL_SAMPLES_DASHBOARD.md#troubleshooting`** (stable anchor).
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/CanonicalSamplesPanel.tsx`; `src/reporting/canonical_sample_artifacts_error_ui.ts`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`; `tests/phase27_canonical_samples_failure_ui.spec.ts`; `tests/playwright/canonical_samples_ui_smoke.spec.ts`; `package.json`.
- **Files changed:** **`src/reporting/canonical_sample_artifacts_error_ui.ts`** — **`CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER`**; **`web-dashboard/src/components/CanonicalSamplesPanel.tsx`** — error-only line **“See canonical samples dashboard runbook:”** + **`data-testid="canonical-samples-error-runbook"`**; **`docs/CANONICAL_SAMPLES_DASHBOARD.md`** — **`## Troubleshooting`** section; **`tests/phase28_canonical_samples_troubleshooting_pointer.spec.ts`**; **`tests/playwright/canonical_samples_ui_smoke.spec.ts`** — assert **no** runbook node on happy path; **`package.json`** — **`verify:canonical`** includes Phase **28** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Error state shows a **tertiary** line (below headline/detail, above sync reminder) with the runbook **`code`** path **`docs/CANONICAL_SAMPLES_DASHBOARD.md#troubleshooting`**. Success/loading unchanged.
- **Tests added/updated:** **`tests/phase28_canonical_samples_troubleshooting_pointer.spec.ts`** (constant + doc **`## Troubleshooting`** presence).
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase28_canonical_samples_troubleshooting_pointer.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**); `npm run verify:canonical` (**pass**, ~108s).
- **Current state:** Operators have a single deterministic next step reference when the panel errors.
- **Risks / follow-ups:** None beyond keeping the constant aligned with the doc filename and **`## Troubleshooting`** heading.

### Phase 29 — Canonical Samples Error-State Browser Fixture

- **Assumptions:** **No** optimizer or artifact contract changes; **`canonicalSamplesFixture=missing`** is explicit and test-only in intent; **no** files under **`artifacts/samples/`** or **`web-dashboard/public/data/canonical_samples/`** are created or modified by tests.
- **Purpose:** End-to-end Playwright proof of the canonical samples **error** UI (headline, detail, runbook) by forcing **404** via a **non-existent** fetch base path.
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/src/components/CanonicalSamplesPanel.tsx`; `web-dashboard/src/lib/canonicalSamples.ts`; `tests/playwright/canonical_samples_ui_smoke.spec.ts`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`; `package.json`.
- **Files changed:** **`src/reporting/canonical_samples_browser_fixture.ts`** — **`CANONICAL_SAMPLES_PUBLIC_BASE`**, **`CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE`**, **`resolveCanonicalSamplesFetchBase`**; **`web-dashboard/src/lib/canonicalSamples.ts`** — re-exports + fetch uses resolved base from caller; **`web-dashboard/src/components/CanonicalSamplesPanel.tsx`** — required **`fetchBaseUrl`** prop; **`web-dashboard/src/App.tsx`** — passes **`resolveCanonicalSamplesFetchBase(window.location.search)`**; **`tests/phase29_canonical_samples_fixture_resolution.spec.ts`**; **`tests/playwright/canonical_samples_ui_smoke.spec.ts`** — error-path test; **`docs/CANONICAL_SAMPLES_DASHBOARD.md`** — fixture subsection; **`package.json`** — **`verify:canonical`** includes Phase **29** Jest spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`?canonicalSamplesFixture=missing`** (with **`view=canonical-samples`**) resolves fetch base to **`CANONICAL_SAMPLES_BROWSER_TEST_MISSING_BASE`**; **`fetchCanonicalSampleArtifactsForDashboard`** then **throws the same error string** as a missing **`sample_cards_pp.json` HTTP 404** (avoids relying on real **404** from the static server, which may return **200** + SPA shell for unknown paths). Normalized UI: **“Canonical samples unavailable”** / **“Missing canonical bundle”**. Any other or missing **`canonicalSamplesFixture`** uses the normal base. Production behavior unchanged when the param is absent.
- **Tests added/updated:** **`tests/phase29_canonical_samples_fixture_resolution.spec.ts`**; Playwright second test for fixture URL.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase29_canonical_samples_fixture_resolution.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests; **`Env:CI`** cleared if **`127.0.0.1:4173` already used** with **`reuseExistingServer: false`**); `npm run verify:canonical` (**pass**, ~108s).
- **Current state:** Error UI is verifiable in a real browser without mutating committed JSON.
- **Risks / follow-ups:** If **`CANONICAL_SAMPLES_PUBLIC_BASE`** is edited, update **`canonical_samples_browser_fixture.ts`** only (single SSOT for path strings used in resolver).

### Phase 30 — Canonical Samples Playwright Verification Ergonomics

- **Assumptions:** **No** dashboard product code, fetch logic, or Playwright test assertions change beyond config/docs; **no** artifact mutation; operators need a **single** documented port policy and escape hatches for busy-port / **`CI`** confusion (Phase **29** follow-up).
- **Purpose:** Predictable **`npm run verify:canonical-samples:ui-smoke`** runs: explicit **default port**, optional **`PLAYWRIGHT_PREVIEW_PORT`**, clearer **`reuseExistingServer`** rules, runbook text.
- **Files inspected:** `docs/PROJECT_STATE.md`; `playwright.config.ts`; `package.json`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`.
- **Files changed:** **`playwright.preview.port.ts`** — **`DEFAULT_PLAYWRIGHT_PREVIEW_PORT`**, **`resolvePlaywrightPreviewPort`**; **`playwright.config.ts`** — uses resolver; **`reuseExistingServer`** = **`!CI && PW_DISABLE_PREVIEW_REUSE !== '1'`**; **`tests/phase30_playwright_preview_port.spec.ts`**; **`tsconfig.json`** — include **`playwright.preview.port.ts`**; **`docs/CANONICAL_SAMPLES_DASHBOARD.md`** — **Playwright UI smoke** subsection; **`package.json`** — **`verify:canonical`** includes Phase **30** Jest spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** One **env-driven** port (**`PLAYWRIGHT_PREVIEW_PORT`**, fallback **4173**, invalid → default) for **preview** + **baseURL**. **Local:** reuse allowed unless **`PW_DISABLE_PREVIEW_REUSE=1`**. **CI:** always spin up preview (**reuse** off). Documentation lists bash/PowerShell overrides and **`CI`** / busy-port remediation.
- **Tests added/updated:** **`tests/phase30_playwright_preview_port.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase30_playwright_preview_port.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests; **`Env:CI`** cleared for local reuse); `npm run verify:canonical` (**pass**, ~133s).
- **Current state:** Smoke command behavior unchanged; ergonomics and determinism documented.
- **Risks / follow-ups:** None beyond keeping **`playwright.preview.port.ts`** aligned with **`playwright.config.ts`**.

### Phase 31 — Canonical Samples CI Preview Port Clarification

- **Assumptions:** **No** product, Playwright logic, or default port value changes; **`4173`** remains the canonical default in **`playwright.preview.port.ts`**; explicit **`env`** in CI matches that default for readability only.
- **Purpose:** **`main.yml`** **`verify`** job is self-explanatory for Playwright **`vite preview`** port and **CI vs local reuse** (documented in workflow comments + explicit **`PLAYWRIGHT_PREVIEW_PORT`**).
- **Files inspected:** `docs/PROJECT_STATE.md`; `.github/workflows/main.yml`.
- **Files changed:** **`.github/workflows/main.yml`** — header comment (Phase **31**); **`Full canonical verification`** step **`env: PLAYWRIGHT_PREVIEW_PORT: "4173"`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`npm run verify:canonical`** in CI runs with **`PLAYWRIGHT_PREVIEW_PORT=4173`** (same as default resolver). Comments state: **`CI=true`** → no preview reuse; local runs without **`CI`** may reuse per **`playwright.config.ts`**.
- **Tests added/updated:** none.
- **Validation commands run (agent):** `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests, **`PLAYWRIGHT_PREVIEW_PORT=4173`**); `npm run verify:canonical` (**pass**, ~125s).
- **Current state:** Operators reading the workflow see port and reuse expectations without opening **`playwright.config.ts`**.
- **Risks / follow-ups:** If **`DEFAULT_PLAYWRIGHT_PREVIEW_PORT`** ever changes, update **`main.yml`** **`env`** to match or drop explicit **`env`** and rely on comments only.

### Phase 32 — Canonical Samples CI Preview Port Drift Guard

- **Assumptions:** **`DEFAULT_PLAYWRIGHT_PREVIEW_PORT`** remains the single numeric SSOT; **`main.yml`** keeps explicit **`PLAYWRIGHT_PREVIEW_PORT: "NNNN"`** on the verify step (Phase **31**); **no** workflow structure change beyond what the test asserts.
- **Purpose:** Jest fails if **`.github/workflows/main.yml`** drifts from **`playwright.preview.port.ts`** so CI cannot silently diverge from local Playwright defaults.
- **Files inspected:** `docs/PROJECT_STATE.md`; `playwright.preview.port.ts`; `.github/workflows/main.yml`; `package.json`.
- **Files changed:** **`tests/phase32_ci_playwright_preview_port_drift.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **32** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Test reads **`main.yml`** and asserts it **contains** **`PLAYWRIGHT_PREVIEW_PORT: "<DEFAULT_PLAYWRIGHT_PREVIEW_PORT>"`** (string from the exported constant). **No** edits to **`main.yml`** or **`playwright.preview.port.ts`** in this phase.
- **Tests added/updated:** **`tests/phase32_ci_playwright_preview_port_drift.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase32_ci_playwright_preview_port_drift.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, ~134s).
- **Current state:** Port drift between CI and Playwright default is caught in **`verify:canonical`**.
- **Risks / follow-ups:** If **`main.yml`** switches to a different env shape (e.g. matrix), update this spec to keep a single clear assertion.

### Phase 33 — Canonical Samples Smoke Command Contract Guard

- **Assumptions:** **`package.json`** remains the SSOT for npm scripts; **`verify:canonical-samples:ui-smoke`** stays Playwright-based; **`verify:canonical`** remains the umbrella that ends with the UI smoke; **no** product code changes.
- **Purpose:** Jest fails if **`verify:canonical-samples:ui-smoke`** is renamed/removed, stops invoking **`playwright test`**, or **`verify:canonical`** drops **`npm run verify:canonical-samples:ui-smoke`**.
- **Files inspected:** `docs/PROJECT_STATE.md`; `package.json`.
- **Files changed:** **`tests/phase33_canonical_samples_smoke_command_contract.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **33** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Parsed **`package.json`** asserts **`scripts['verify:canonical-samples:ui-smoke']`** matches **`/playwright\\s+test/`** and **`scripts['verify:canonical']`** contains **`npm run verify:canonical-samples:ui-smoke`**.
- **Tests added/updated:** **`tests/phase33_canonical_samples_smoke_command_contract.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase33_canonical_samples_smoke_command_contract.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, ~110s).
- **Current state:** Smoke entrypoint and its place in **`verify:canonical`** are regression-protected.
- **Risks / follow-ups:** If **`verify:canonical`** is refactored to a meta-script, update assertions to preserve the same contract.

### Phase 34 — Canonical Verification Workflow Contract Guard

- **Assumptions:** **`.github/workflows/main.yml`** **`verify`** job remains the CI entry for full canonical verification; the step keeps **`run: npm run verify:canonical`**; **`package.json`** keeps **`scripts.verify:canonical`**; **no** workflow behavior change in this phase.
- **Purpose:** Jest fails if CI stops invoking **`npm run verify:canonical`** or **`verify:canonical`** disappears from **`package.json`**.
- **Files inspected:** `docs/PROJECT_STATE.md`; `.github/workflows/main.yml`; `package.json`.
- **Files changed:** **`tests/phase34_canonical_verification_workflow_contract.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **34** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Test asserts **`package.json`** **`scripts['verify:canonical']`** exists and **`main.yml`** contains **`run: npm run verify:canonical`** (script id **`verify:canonical`** centralized in the spec).
- **Tests added/updated:** **`tests/phase34_canonical_verification_workflow_contract.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase34_canonical_verification_workflow_contract.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, ~116s).
- **Current state:** CI workflow ↔ **`verify:canonical`** npm script alignment is regression-protected.
- **Risks / follow-ups:** If the verify job is split or **`run:`** uses a wrapper, update the assertion to match the new **documented** contract.

### Phase 35 — Canonical Samples Browser Fixture Contract Guard

- **Assumptions:** Phase **29** fixture URL and sentinel base remain the error-path contract; **no** dashboard or fetch semantics change beyond **exported constants** used by the existing resolver.
- **Purpose:** Jest fails if **`canonicalSamplesFixture`**, **`missing`**, or **`resolveCanonicalSamplesFetchBase`** mapping drifts away from Playwright error-state expectations.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/canonical_samples_browser_fixture.ts`; `tests/phase29_canonical_samples_fixture_resolution.spec.ts`; `package.json`.
- **Files changed:** **`src/reporting/canonical_samples_browser_fixture.ts`** — **`CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM`**, **`CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_VALUE_MISSING`**, resolver uses them; **`tests/phase35_canonical_samples_browser_fixture_contract.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **35** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Exported **query param** and **fixture value** strings; **`resolveCanonicalSamplesFetchBase`** compares against those exports (single SSOT). Phase **35** tests assert literal **`canonicalSamplesFixture`** / **`missing`**, **`?view=canonical-samples&…`** shape, and public-base fallback.
- **Tests added/updated:** **`tests/phase35_canonical_samples_browser_fixture_contract.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase29_canonical_samples_fixture_resolution.spec.ts tests/phase35_canonical_samples_browser_fixture_contract.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, ~129s).
- **Current state:** Browser-fixture contract for Playwright error path is regression-protected.
- **Risks / follow-ups:** If a second fixture value is added, extend exports + Phase **35** assertions deliberately.

### Phase 36 — Canonical Samples Fixture Constant Access Boundary

- **Assumptions:** **No** consumer in **`web-dashboard/src`** needs **`CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM`** / **`VALUE_MISSING`** at runtime; **`App.tsx`** only needs **`resolveCanonicalSamplesFetchBase`**; **no** behavior change.
- **Purpose:** Lock **Option A** intentionally: fixture query/value constants remain **SSOT** in **`src/reporting/canonical_samples_browser_fixture.ts`**; **`web-dashboard/src/lib/canonicalSamples.ts`** does **not** re-export them (avoids duplicate literals and clarifies boundary).
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/lib/canonicalSamples.ts`; `web-dashboard/src/App.tsx`; `src/reporting/canonical_samples_browser_fixture.ts`; `tests/phase35_canonical_samples_browser_fixture_contract.spec.ts`; `package.json`.
- **Files changed:** **`web-dashboard/src/lib/canonicalSamples.ts`** — Phase **36** comment on intentional boundary; **`tests/phase36_canonical_samples_fixture_boundary.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **36** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **No** re-exports added. Comment documents SSOT vs dashboard barrel. Jest asserts **`canonicalSamples.ts`** lacks fixture **QUERY_PARAM** / **VALUE_MISSING** identifiers and still **re-exports** **`resolveCanonicalSamplesFetchBase`** from **`canonical_samples_browser_fixture.ts`**.
- **Tests added/updated:** **`tests/phase36_canonical_samples_fixture_boundary.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase36_canonical_samples_fixture_boundary.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, ~130s).
- **Current state:** Boundary is explicit; SSOT remains singular.
- **Risks / follow-ups:** If **`App`** or a dashboard test needs named constants, **re-export** from **`canonicalSamples.ts`** and relax Phase **36** tests (documented flip to Option B).

### Phase 37 — Canonical Samples Fixture Re-export Readiness Guard

- **Assumptions:** **No** dashboard runtime consumer needs **`CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_QUERY_PARAM`** / **`_VALUE_MISSING`** today; **no** behavior or re-export changes in this phase.
- **Purpose:** Document and guard the **future** safe re-export path: **one** module specifier from **`web-dashboard/src/lib/canonicalSamples.ts`** to **`canonical_samples_browser_fixture.ts`**; add fixture symbols only to the existing **`export { } from`** block; then add **identity** checks and relax Phase **36** negatives.
- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/lib/canonicalSamples.ts`; `web-dashboard/src/App.tsx`; `tests/phase36_canonical_samples_fixture_boundary.spec.ts`; `package.json`.
- **Files changed:** **`web-dashboard/src/lib/canonicalSamples.ts`** — Phase **37** comment pointer; **`tests/phase37_canonical_samples_fixture_reexport_readiness.spec.ts`**; **`package.json`** — **`verify:canonical`** includes Phase **37** spec; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Jest asserts **all** `from "..."` references to **`canonical_samples_browser_fixture`** in **`canonicalSamples.ts`** use the **same** relative path (**`../../../src/reporting/canonical_samples_browser_fixture`**). File header comments describe upgrade steps; **no** new exports.
- **Tests added/updated:** **`tests/phase37_canonical_samples_fixture_reexport_readiness.spec.ts`**.
- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase37_canonical_samples_fixture_reexport_readiness.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**); `web-dashboard` **`npm run build`** (**pass**); `npm run verify:canonical-samples:ui-smoke` (**pass**, 2 tests); `npm run verify:canonical` (**pass**, Jest ~92s + Playwright ~6s, **438** tests).
- **Current state:** Phase **36** boundary unchanged; future re-export path is explicit.
- **Risks / follow-ups:** If **`vite`** / **`tsconfig`** paths change, update the expected relative string in Phase **37** + **`canonicalSamples.ts`** imports together.
- **Next recommended phase:** **No** new phase until a **concrete** dashboard/test consumer needs **`CANONICAL_SAMPLES_BROWSER_TEST_FIXTURE_*`** from the barrel — then follow the Phase **37** upgrade path (single **`export { … } from`** block, **`Object.is`** identity vs SSOT, relax Phase **36** negatives).

### Phase 38 — Merge system audit (analysis-only)

- **Purpose:** Fully map and evaluate the merge system (inputs, normalization, matching, conflict resolution, drop behavior, invariants, and hidden variance) without changing optimizer behavior.
- **Scope:** `src/merge_odds.ts`, upstream fetchers, and downstream pipeline consumers; contract analysis only (no code changes).
- **Key findings:**
  - Merge is centralized and site-invariant (`match_merge` bucket), but **contract is implicit** (no formal key/tie-break/drop rules).
  - Matching uses primary exact-line pass + secondary alt-line fallback; **best-match selection**, not multi-book aggregation.
  - **Silent drops** exist (no diagnostics for why props fail to merge).
  - No enforced invariants for:
    - merge key structure
    - tie-break determinism
    - merge coverage
  - Potential hidden variance in:
    - line tolerance decisions
    - alt-line selection
    - book selection
- **Diagnostics coverage:**
  - Strong downstream observability (17R/17S) and canonical verification coverage.
  - **No direct merge observability** (no coverage %, drop reasons, or determinism checks).
- **Conclusion:** Merge system is functionally correct but **not contract-hardened**; it is currently the largest remaining source of unobservable variance in the pipeline.
- **Follow-up:** Phase **39** (below) delivered explicit contract + merge audit artifacts + determinism tests.

### Phase 39 — Merge system hardening (contract + observability, no optimizer logic changes)

- **Assumptions:** Merge matching / EV / de-vig / book aggregation behavior in `src/merge_odds.ts` remains authoritative; this phase only names the contract, attributes drops, and writes additive artifacts.
- **Purpose:** Explicit merge contract SSOT, per-run merge audit JSON/MD under `data/reports/`, stable drop-reason codes, and regression tests for determinism — without changing selection or math.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/merge_odds.ts`; `src/reporting/final_selection_observability.ts`; `src/reporting/repo_hygiene_audit.ts`; `package.json`; `tests/phase19d_exact_line_merge.spec.ts`.
- **Files changed:** **`src/merge_contract.ts`** (primary/nearest/alt strategies, tie-break documentation, `UD_ALT_LINE_MAX_DELTA` / `UD_ALT_MATCH_STATS` SSOT, canonical drop-reason mapping, `MergeDropRecord` + deterministic sort); **`src/reporting/merge_audit.ts`** (`latest_merge_audit.json` / `.md`, `buildMergeAuditReport`, `finalizeMergeAuditArtifacts`, `MergeAuditSnapshot`); **`src/merge_odds.ts`** (per-prop `pushMergeDrop` on all skip/fail paths, `finalizeMergeAuditArtifacts` after `mergeCore` and on empty-odds early exits; re-exports contract constants); **`package.json`** (`verify:canonical` includes **`tests/phase39_merge_contract_and_audit.spec.ts`**); **`tests/phase39_merge_contract_and_audit.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **`merge_contract`**: documents exact-first primary match, nearest-within-`maxLineDiff` fallback, alt second-pass window and tie-break; maps internal reasons (`no_candidate` → `no_match`, `line_diff` → `line_mismatch`, `juice` → `invalid_odds`, plus real pre-filter keys). **`merge_audit`**: totals, matched-by-site, dropped-by-reason, alt fallback count, exact vs nearest counts, `mergedLineDeltaHistogram`, full `stageAccounting`, sorted `drops` array; deterministic JSON via `stableStringifyForObservability`. **`merge_odds`**: unchanged match scoring; returns **`mergeAuditSnapshot`** from **`mergeWithSnapshot`** / **`mergeOddsWithPropsWithMetadata`**; writes audit every merge path.
- **Tests added/updated:** **`tests/phase39_merge_contract_and_audit.spec.ts`** — SSOT parity vs `merge_odds` re-exports, canonical mapping, repeated merge snapshot equality, stable stringify, temp-dir artifact keys, promo drop attribution.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase39_merge_contract_and_audit.spec.ts` (**pass**).
- **Current state:** Merge contract is centralized; drops and fallbacks are observable and machine-diffable; determinism is test-locked for representative paths.
- **Risks / follow-ups:** None required for core pipeline; optional future work is finer `line_diff` buckets if the merge loop exposes more detail without changing decisions.
- **Follow-up:** Phase **40** (below) adds merge quality metrics, soft WARN guardrails, and drift vs the previous on-disk merge audit.

### Phase 40 — Merge quality validation (thresholds + drift guards, no merge logic changes)

- **Assumptions:** Phase **39** merge audit remains the quantitative input; thresholds are **soft** (WARN strings only, no pipeline failures); `invalid_odds` guard uses share of **total drops** (`totals.dropped`).
- **Purpose:** Make merge quality measurable (`mergeCoverage`, `dropRate`, `fallbackRate`, `exactMatchRate`), emit compact **`merge_quality_summary.json`** plus full **`latest_merge_quality.json`** / **`.md`**, and compare the current run to the **previous** `latest_merge_audit.json` (read before overwrite) for drift.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_audit.ts`; `src/reporting/final_selection_observability.ts`; `package.json`.
- **Files changed:** **`src/reporting/merge_quality.ts`** (metrics, soft guards, drift, writers); **`src/reporting/merge_audit.ts`** (`finalizeMergeAuditArtifacts` reads prior audit, then writes merge quality artifacts); **`package.json`** (`verify:canonical` includes **`tests/phase40_merge_quality.spec.ts`**); **`tests/phase40_merge_quality.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Additive only** — after each merge audit write: **`mergeCoverage`** = matched/rawProps, **`dropRate`** = dropped/rawProps, **`fallbackRate`** = altLineFallbackCount/matched, **`exactMatchRate`** = exactLineMatchCount/matched (null denominators → null rates). **WARN** (no fail) when coverage &lt; **0.35**, fallback rate &gt; **0.45**, or invalid_odds drop share &gt; **12%**. **Drift:** coverage delta, fallback-rate delta, **`fallbackSpike`** if rate jumps ≥ **0.15** vs previous, canonical drop-reason count deltas. JSON uses **`stableStringifyForObservability`**.
- **Tests added/updated:** **`tests/phase40_merge_quality.spec.ts`** — metric math, soft guards (coverage / fallback / invalid_odds), drift spike detection, deterministic artifact keys, threshold exports.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase40_merge_quality.spec.ts tests/phase39_merge_contract_and_audit.spec.ts` (**pass**).
- **Current state:** Operators get **`data/reports/merge_quality_summary.json`**, **`latest_merge_quality.json`**, **`latest_merge_quality.md`** on every merge finalize path.
- **Risks / follow-ups:** Thresholds are initial defaults; tighten or externalize when enough historical merge audits exist.
- **Follow-up:** Phase **41** (below) adds **INFO/WARN/FAIL** severity, conservative **FAIL** gates, **`merge_quality_baseline.json`**, and **`merge_quality_status.json`**.

### Phase 41 — Merge quality enforcement (fail guards + baselines, no merge logic changes)

- **Assumptions:** Phase **39–40** artifacts unchanged in producer (`merge_odds` / `merge_audit`); enforcement is **reporting-only** (no `process.exit`); operators may wire CI on **`merge_quality_status.json`** later.
- **Purpose:** Escalate merge quality to **FAIL** for conservative cases (very low coverage, extreme fallback spike vs previous run, invalid audit JSON shape), keep most anomalies at **WARN**, track **long-term drift** vs a persisted baseline, and emit a compact **status** file.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_quality.ts`; `src/reporting/merge_audit.ts`; `package.json`.
- **Files changed:** **`src/reporting/merge_quality.ts`** — **`MERGE_QUALITY_SCHEMA_VERSION` 2**; severity **`collectTriggeredRulesWithAudit`**; **`validateMergeAuditReport`**; split drift into **`fallbackSpikeWarn`** / **`fallbackSpikeFail`**; baseline **read/seed/write** (`merge_quality_baseline.json` seeded once when missing); **`merge_quality_status.json`**; extended **`latest_merge_quality.*`**; **`package.json`** (`verify:canonical` includes **`tests/phase41_merge_quality_enforcement.spec.ts`**); **`tests/phase41_merge_quality_enforcement.spec.ts`**; **`tests/phase40_merge_quality.spec.ts`** (API updates); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **FAIL** if `mergeCoverage` &lt; **0.22**, or fallback-rate delta vs previous ≥ **0.35**, or audit fails **`validateMergeAuditReport`**. **WARN** retains Phase **40** coverage/fallback/invalid_odds rules; adds **WARN** for fallback delta ≥ **0.15** and &lt; **0.35**, and baseline coverage drift (current − baseline) &lt; **−0.1**. **`merge_quality_baseline.json`** stores coverage, fallbackRate, drop distribution (seeded on first run when file absent). **`merge_quality_status.json`**: overall severity, key metrics, triggered rule ids, short explanation, baseline metadata.
- **Tests added/updated:** **`tests/phase41_merge_quality_enforcement.spec.ts`**; **`tests/phase40_merge_quality.spec.ts`** adjusted for schema **2** and new drift fields.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase40_merge_quality.spec.ts tests/phase41_merge_quality_enforcement.spec.ts` (**pass**).
- **Current state:** Merge quality can surface **FAIL** in machine-readable output without changing merge matching.
- **Risks / follow-ups:** Deleting **`merge_quality_baseline.json`** re-seeds from the next run; tune FAIL/WARN constants with production data.

### Phase 42 — Merge quality operator integration (hooks + optional fail, no merge logic changes)

- **Assumptions:** Phase **39–41** merge and quality producers unchanged; **no** merge matching, EV, breakeven, ranking, or selection edits — only console + exit wiring and CI readout.
- **Purpose:** Surface merge quality on every merge path (repo-relative artifact paths + **`MERGE QUALITY:`** summary), allow **`--fail-on-merge-quality`** / **`MERGE_QUALITY_ENFORCE=true`** to **`process.exit(1)`** when severity is **FAIL**, and add **`npm run verify:merge-quality`** to **`verify:canonical`** without failing default CI unless enforcement is on.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/cli_args.ts`; `src/merge_odds.ts`; `src/reporting/merge_audit.ts`; `src/reporting/merge_quality.ts`; `package.json`; `tests/phase39_merge_contract_and_audit.spec.ts`; `tests/phase41_merge_quality_enforcement.spec.ts`.
- **Files changed:** **`src/cli_args.ts`** — **`failOnMergeQuality`**, **`--fail-on-merge-quality`**, **`MERGE_QUALITY_ENFORCE=true`**; **`src/reporting/merge_quality.ts`** — **`MERGE_QUALITY_STATUS_SCHEMA_VERSION` 2**, **`driftNote`** on status file, **`formatMergeQualityDriftNote`**; **`src/reporting/merge_audit.ts`** — **`mergeQualityStatus`** on **`MergeAuditSnapshot`**; **`src/reporting/merge_quality_operator.ts`** — **`applyMergeQualityOperatorHooks`**; **`src/merge_odds.ts`** — call hooks after each **`finalizeMergeAuditArtifacts`**; **`scripts/verify_merge_quality_canonical.ts`**; **`package.json`** — **`verify:merge-quality`**, **`verify:canonical`** prerequisite + **`tests/phase42_merge_quality_operator.spec.ts`**; **`tests/phase39_merge_contract_and_audit.spec.ts`** (determinism compares merge fields only); **`tests/phase42_merge_quality_operator.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Console prints **`MERGE QUALITY REPORTS:`** with **`data/reports/latest_merge_quality.json`** and **`data/reports/merge_quality_status.json`**, then **`MERGE QUALITY: <INFO|WARN|FAIL>`**, **coverage** / **fallbackRate** (fixed decimals or **`null`**), optional **drift** line from **`driftNote`**. Optional non-zero exit only when enforcement is enabled and severity **FAIL**. **`verify_merge_quality_canonical.ts`** prints **`MERGE QUALITY VERIFY:`** line; exits **1** on **FAIL** only if **`MERGE_QUALITY_ENFORCE=true`**.
- **Tests added/updated:** **`tests/phase42_merge_quality_operator.spec.ts`** — summary lines, **`process.exit(1)`** when enforced, verify script exit codes; **`tests/phase39_merge_contract_and_audit.spec.ts`** — merge-field determinism across two runs.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase39_merge_contract_and_audit.spec.ts tests/phase42_merge_quality_operator.spec.ts`; `npm run verify:merge-quality`.
- **Current state:** Merge quality is visible in logs; failures can stop runs or verify when explicitly enforced.
- **Risks / follow-ups:** None beyond keeping **`verify:merge-quality`** read-only except documented exit behavior.

### Phase 43 — Merge quality analysis + targeted improvement plan (analysis only)

- **Assumptions:** Phase **42** is complete (operator hooks + **`verify:merge-quality`**). This phase is **read-only** analysis — **no** EV/breakeven/payout/combinatorics/ranking/selection/merge-matching changes. On-disk **`data/reports/*`** reflects **at most one recent** merge finalize; there is **no** in-repo **time series** of audits for rigorous “dominant across weeks” statistics unless operators retain historical files separately.
- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **39–42**); `data/reports/merge_quality_status.json`, `merge_quality_summary.json`, `merge_quality_baseline.json`, `latest_merge_audit.json`, `latest_merge_quality.md`; `artifacts/merge_stage_accounting.json`, `merge_match_gap_attribution.json`; `src/merge_contract.ts` (**`MERGE_DROP_REASON`**, **`MergeDropRecord`**); `src/merge_odds.ts` (**`skippedByReason`**, **`unmatchedAttribution`**, match-fail paths); `src/reporting/merge_audit.ts` (audit totals + **`drops`**).
- **Current merge quality snapshot (workspace sample):** **`overallSeverity`:** **INFO**; **`mergeCoverage`:** **1**; **`fallbackRate`:** **0**; **`dropRate`:** **0**; **`latest_merge_audit`:** **1** raw prop, **1** match (**prizepicks**), **0** **`drops`**, **`mergedLineDeltaHistogram`** **`{"0":1}`** (exact). **Conclusion:** This snapshot is a **smoke-scale** run — **not** representative of a full NBA card-generation merge. Empirical “what dominates in production” must come from a **full run** or **archived** audits, not this file set alone.
- **Dominant failure/drop patterns (architecture, when N ≫ 1):** Match-phase failures recorded as **`MergeDropRecord`** roll into **`droppedByCanonicalReason`**: typically **`no_match`** (no odds candidate for player/stat/slate), **`line_mismatch`** (nearest + alt second pass still fail), **`invalid_odds`** (juice / side-aware reject). **Pre-merge** volume is explained by **`stageAccounting.skippedByReason`** (e.g. **`noOddsStat`**, **`promoOrSpecial`**, **`fantasyExcluded`**, **`escalatorFiltered`**) — **not** the same bucket as merge “drops” but **competes** with raw prop counts in coverage narratives. **Cannot rank empirically** which canonical code is largest **from the current n=1 snapshot** — the pipeline is **instrumented** to answer this once **`drops`** is non-empty.
- **Stability vs noise:** **Relatively stable** for ops when sample size is large: **mergeCoverage**, **fallbackRate**, **exactLineMatchCount** vs **nearestWithinToleranceCount**, **altLineFallbackCount**, **`mergedLineDeltaHistogram`**, **`droppedByCanonicalReason`**. **Noisy / context-heavy:** drift fields vs **previous** audit (slate and book mix change), **fallback spike** signals when **matched** is small, **baseline** comparison when the baseline was seeded on a different regime.
- **Where merge quality degrades (dimensions — how to read artifacts):** **By platform:** **`matchedBySite`** (merged exact/nearest) and **`unmatchedAttribution.propsBySite`** / **`propsByReason`** in **`stageAccounting`** (see **`latest_merge_audit.json`**). **By exact vs fallback:** **`exactLineMatchCount`**, **`nearestWithinToleranceCount`**, **`altLineFallbackCount`**, **`mergedLineDeltaHistogram`**. **By stat / sport:** **Per-row** in **`drops[]`** (**`stat`**, **`sport`**) — **not** yet summarized in **`merge_quality_status.json`**; aggregating these dimensions is the **main visibility gap** for answering “where it hurts” without scanning the full drop list.
- **Highest-value, lowest-risk coverage lift (conceptual):** **Feed and mapping** improvements (stat/market alignment, player aliases, ensuring OddsAPI markets exist for the same stat families PP/UD expose) increase **`no_match`** resolution **without** loosening line tolerance — **lower false-match risk** than changing **nearest** or **alt** geometry. **Second:** targeted diagnostics showing **top stats / sports** by **`no_match`** count to steer that work.
- **Safe next improvements (implementation-ready class):** **Additive reporting only:** deterministic rollups from existing **`drops`** (counts by **`canonicalReason` × `site`**, by **`stat`**, by **`sport`**) and a short **MD/JSON** section in or beside **`latest_merge_audit`** / merge quality — **no** merge algorithm change, **no** hidden variance (sort keys, stable stringify). Optional **ops** process: copy **`latest_merge_audit.json`** to a dated archive after full runs for before/after compares.
- **Risky improvements (defer until evidence):** Increasing **max line diff**, relaxing **juice** caps, expanding **alt** pools or **tie-break** order, or any change that **prefers** a worse line match — all raise **false-match** risk and violate “prove it with dimensional data first.”
- **Recommended next implementation phase:** **Phase 44 — Merge dimensional diagnostics (additive artifacts)** — implement rollup aggregates + tests from **`MergeDropRecord`** (+ optional cross-links to **`mergedLineDeltaHistogram`**), keep merge and site-invariant policy **unchanged**; use output to decide whether a later phase should touch **normalization/mapping** vs **tolerance** knobs.
- **Validation commands run (agent):** Read-only inspection of **`data/reports/*.json`** and **`artifacts/merge_*.json`**; **`npm run verify:merge-quality`** not required for this analysis-only phase.

### Phase 20 — Canonical sample artifacts & stable output snapshots

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/ranking/filter/export math changes; **no** new optimizer execution path — samples are **derived JSON** from existing optimizer output shapes (`prizepicks-cards.json` array; `underdog-cards.json` envelope).
- **Purpose:** Stable, diff-friendly, representative **PP + UD** snapshots (multiple PP flex sizes from processed fixture; UD **`UD_8F_FLX`** from a real pipeline slice) for regression anchors, UI/debug inputs, and documentation-by-example.
- **Files inspected:** `docs/PROJECT_STATE.md`; `.gitignore`; `data/processed/prizepicks-cards.json`; `underdog-cards.json` (source for one-card fixture); `package.json`; `src/reporting/final_selection_observability.ts` (pattern: `sortKeysDeep`); `src/run_optimizer.ts` (output filenames).
- **Files changed:** **`src/reporting/canonical_sample_artifacts.ts`** (contract + normalize + write); **`scripts/generate_canonical_sample_artifacts.ts`**; **`data/samples/fixtures/underdog_cards_source.json`** (first UD card from pipeline JSON); **`artifacts/samples/sample_cards_pp.json`**, **`sample_cards_ud.json`**, **`sample_summary.json`** (golden outputs); **`.gitignore`** — **`artifacts/*`** + **`!artifacts/samples/**`** (replacing blanket **`artifacts/`** so tracked samples are not parent-ignored); **`tests/phase20_canonical_sample_artifacts.spec.ts`**; **`package.json`** (`generate:canonical-samples`, **`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Additive reporting/utility only** — **`stripVolatileSampleFieldsDeep`** removes **`runTimestamp`** keys (including nested); **lexicographic** recursive key sort; optional redaction of obvious absolute path strings in leaves; **`writeCanonicalSampleArtifacts`** writes three JSON files. **`npm run generate:canonical-samples`** defaults: PP → **`data/processed/prizepicks-cards.json`**, UD → **`data/samples/fixtures/underdog_cards_source.json`**; overrides **`--pp=`** / **`--ud=`** relative paths.
- **Tests added/updated:** **`tests/phase20_canonical_sample_artifacts.spec.ts`** — determinism, golden file parity, volatile-key strip, idempotent write.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase20_canonical_sample_artifacts.spec.ts` (**pass**); `npm run generate:canonical-samples` run twice (**identical** `artifacts/samples/` output); `npm run verify:canonical` (**pass**, ~97s).
- **Current state:** PP/UD represented; PP fixture exposes **multiple flex sizes** (5 and 6); UD fixture exposes **`UD_8F_FLX`** / **`8F`**.
- **Risks / follow-ups:** Refresh **`data/samples/fixtures/underdog_cards_source.json`** (and re-run **`npm run generate:canonical-samples`**, **`npm run sync:canonical-samples-dashboard`**) when UD card JSON shape changes materially.

### Phase 19D — Remaining `src/__tests__` → canonical `tests/**/*.spec.ts`

- **Assumptions:** **No** production/runtime behavior changes; **`jest.config.js`** **`testMatch`** remains **`tests/**/*.spec.ts`** only; no broad test-framework reorg.
- **Purpose:** Audit **`src/__tests__/**/*.test.ts`** (outside default Jest **`testMatch`**) and migrate high-signal parity/regression/contract tests into **`verify:canonical`**.
- **Files inspected:** `src/__tests__/**/*.test.ts` (cleared); `jest.config.js`; `package.json`; existing **`tests/**/*.spec.ts`**; `docs/PROJECT_STATE.md`.
- **Inventory / classification:**
  - **Migrated → canonical (this phase):** `breakeven.test.ts` → **`tests/phase19d_breakeven_invariants.spec.ts`**; `exact_line_merge.test.ts` → **`tests/phase19d_exact_line_merge.spec.ts`**; `cli_bankroll.test.ts` + `cli_strict_effective_config.test.ts` → **`tests/phase19d_cli_contract.spec.ts`**; `odds_snapshot.test.ts` → **`tests/phase19d_odds_snapshot.spec.ts`**; `step3_odds_calibration.test.ts` → **`tests/phase19d_odds_calibration_step3.spec.ts`**. Source files under **`src/__tests__/`** removed after migration.
  - **Already Phase 19C:** `engine_parity.test.ts` (removed earlier).
  - **Remaining non-canonical:** none under **`src/__tests__/`**; ad-hoc **`npx jest`** on **`*.test.ts`** paths is no longer required for these suites.
- **Files changed:** **`tests/phase19d_*.spec.ts`** (five files); **`package.json`** (`verify:canonical` list); **`docs/PROJECT_STATE.md`** (this section); deleted migrated **`src/__tests__/*.test.ts`** sources.
- **Exact behavior added/changed:** **Tests + documentation only** — **`phase19d_cli_contract`** asserts default bankroll **600** for **`parseArgs([])`** / **`getEffectiveConfig`** (aligned with **`cli_args.ts`** initial parse result, not a stale **1000** expectation).
- **Tests added/updated:** Five **`tests/phase19d_*.spec.ts`** files; **`verify:canonical`** includes all five after **`phase19c_engine_parity.spec.ts`**.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js` on all five **`phase19d_*.spec.ts`** (**pass**); `npm run verify:canonical` (**pass**, ~105s).
- **Current state:** Former **`src/__tests__`** high-signal suites run on every **`verify:canonical`** unless intentionally dropped from **`package.json`**.
- **Risks / follow-ups:** Any **new** **`src/**/*.test.ts`** outside **`testMatch`** will again be invisible to default Jest — prefer **`tests/**/*.spec.ts`** or extend **`testMatch`** deliberately.

### Phase 19C — Engine parity in `verify:canonical` (canonical Jest path)

- **Assumptions:** **No** engine math, merge, or env-loading changes; **`jest.config.js`** **`testMatch`** remains **`tests/**/*.spec.ts`** only.
- **Purpose:** Enforce former **`src/__tests__/engine_parity.test.ts`** invariants under **`npm run verify:canonical`** — that file was never picked up by Jest.
- **Files inspected:** `src/__tests__/engine_parity.test.ts` (removed); `jest.config.js`; `tests/parity_test.spec.ts` (math parity — unchanged); `package.json`; `docs/PROJECT_STATE.md`.
- **Files changed:** **`tests/phase19c_engine_parity.spec.ts`** (new; same assertions + **`../src/`** imports); deleted **`src/__tests__/engine_parity.test.ts`**; **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Test location + canonical list only** — no production code edits.
- **Tests added/updated:** **`tests/phase19c_engine_parity.spec.ts`**; removed duplicate **`src/__tests__/engine_parity.test.ts`**.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase19c_engine_parity.spec.ts tests/phase17y_explicit_cli_args_threading.spec.ts tests/phase18c_ud_engine_explicit_cli.spec.ts tests/phase18d_pp_engine_explicit_cli.spec.ts` (**pass**); `npm run verify:canonical` (**pass**, ~97s).
- **Current state:** PP/UD engine parity expectations run in every canonical verification.
- **Risks / follow-ups:** Superseded by **Phase 19D** for remaining **`src/__tests__`** files.

### Phase 19B — Lock `.env.example` / `config/.env.example` mirror parity

- **Assumptions:** **No** **`load_env.ts`** or runtime env resolution changes; **`KEY=value`** lines remain the only machine-readable content in templates.
- **Purpose:** Prevent silent drift between authoritative root **`.env.example`** and **`config/.env.example`** via deterministic Jest comparison.
- **Files inspected:** **`.env.example`**; **`config/.env.example`**; **`tests/phase19a_env_example_contract.spec.ts`**; **`tests/e2e.spec.ts`**; **`README.md`**; **`package.json`**.
- **Files changed:** **`tests/phase19a_env_example_contract.spec.ts`** — **`extractEnvAssignmentLines`**, Phase **19B** `describe` (ordered parity); **`.env.example`** / **`config/.env.example`** (header clarifications); **`README.md`** (authoritative vs mirror + test pointer); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Test + comments only** — same runtime loading as Phase **19A**.
- **Tests added/updated:** Phase **19B** block in **`tests/phase19a_env_example_contract.spec.ts`** (`extractEnvAssignmentLines` helper + ordered parity assertion).
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/e2e.spec.ts tests/phase19a_env_example_contract.spec.ts` (**pass**); `npm run verify:canonical` (**pass**, ~91s).
- **Current state:** Drift between templates fails CI **`verify:canonical`** ( **`phase19a`** spec included).
- **Risks / follow-ups:** New env vars must be added in **both** files in the **same order**; inline comments on assignment lines are not supported (only full-line **#** comments and **`KEY=value`** lines).

### Phase 19A — Root `.env.example` contract + e2e smoke

- **Assumptions:** **No** EV/breakeven/merge/pipeline math changes; **`src/load_env.ts`** behavior unchanged; no refactor of dotenv usage.
- **Purpose:** Restore **`tests/e2e.spec.ts`** expectation that **`.env.example`** exists at repo root and documents Telegram keys; align **`config/.env.example`** without duplicate conflicting semantics.
- **Files inspected:** `tests/e2e.spec.ts`; `config/.env.example` (prior); `src/load_env.ts`; `README.md`; `package.json`.
- **Files changed:** **`.env.example`** (new at repo root); **`config/.env.example`** (synced keys + mirror comment); **`README.md`** (copy-from path); **`tests/phase19a_env_example_contract.spec.ts`** (new); **`package.json`** (`verify:canonical` adds **`tests/e2e.spec.ts`** + **`tests/phase19a_env_example_contract.spec.ts`**); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Documentation / template files only** — runtime env loading still reads **`projectRoot/.env`** only.
- **Tests added/updated:** **`tests/phase19a_env_example_contract.spec.ts`**; **`verify:canonical`** now includes **`tests/e2e.spec.ts`**.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/e2e.spec.ts tests/phase19a_env_example_contract.spec.ts` (**pass**); `npm run verify:canonical` (**pass**, ~113s).
- **Current state:** E2E “Env and daily driver” case passes; root + **`config/`** templates stay explicitly mirrored.
- **Risks / follow-ups:** Mirror parity **Phase 19B** enforces assignment-line sync; update **both** files in lockstep.

### Phase 18F — Repo-wide `getCliArgs` / `cliArgs` inventory (runtime vs deferred)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/filter/ranking/export changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, **`cliArgs`** Proxy implementation unchanged.
- **Purpose:** Audit remaining **`getCliArgs()`** / **`cliArgs`** usage; confirm canonical runtime paths already use a **single** resolved snapshot at entrypoints; document intentional infrastructure / deferred usage.
- **Files inspected:** `rg` / `grep` over `**/*.ts` for **`getCliArgs(`**, **`cliArgs`**, **`cliArgs.`**; all of **`src/**/*.ts`**; `tests/phase17x_cli_args_side_effect_free.spec.ts`, `tests/phase17y_explicit_cli_args_threading.spec.ts`, `tests/phase18a`–`phase18e` specs; `package.json`.
- **Files changed:** `tests/phase18f_global_cli_inventory.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section + inventory table).
- **Exact behavior added/changed:** **None** in optimizer math or pipelines — **documentation + regression test** only.
- **Tests added/updated:** `tests/phase18f_global_cli_inventory.spec.ts`.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js` Phase 18F + 17Y + 18A + 18B + 18E specs (**pass**); `npm run verify:canonical` (**pass**, ~84s).
- **Current state:** No additional runtime modules required code changes; entrypoint pattern matches Phase **18A** / **18B** (single snapshot).
- **Risks / follow-ups:** Future **`getCliArgs()`** additions under **`src/`** will fail **`phase18f`** unless allowlisted intentionally.

#### Phase 18F — Remaining `getCliArgs` / `cliArgs` classification (post-audit)

| Location | Symbol / pattern | Bucket | Notes |
|----------|-------------------|--------|--------|
| `src/cli_args.ts` | `export function getCliArgs` | **Bootstrap / infrastructure** | Single process snapshot; **`setCliArgsForProcess`** from **`optimizer_cli_bootstrap`**. |
| `src/cli_args.ts` | `export const cliArgs` (Proxy) | **Bootstrap / infrastructure** | Lazy reads delegate to **`getCliArgs()`**; no separate runtime import in **`src/`** (verified). |
| `src/cli_args.ts` | `printEffectiveConfig(cli?: …)` → `getEffectiveConfig(cli ?? getCliArgs())` | **CLI diagnostic / early-exit** | Used when **`cli`** omitted (e.g. operator **`--print-effective-config`** path). |
| `src/optimizer_cli_bootstrap.ts` | (comment only) | **Bootstrap** | Documents ordering; parses argv and **`setCliArgsForProcess`**. |
| `src/run_optimizer.ts` | `const args = getCliArgs()` in **`run()`** | **Active runtime — allowed orchestration** | **One** call: resolved **`args`** threads through merge, engines, helpers (Phases **17Y**–**18E**). |
| `src/run_underdog_optimizer.ts` | `const args = cli ?? getCliArgs()` in **`main()`** | **Active runtime — allowed orchestration** | **One** call: standalone UD entry or unified run receives explicit **`cli`** from **`run_optimizer`**. |
| `src/policy/eligibility_policy.ts`, `src/policy/shared_leg_eligibility.ts` | `cliArgs` in **comments / doc strings only** | **Documentation only** | Not live code; **`CliArgs`** typed APIs at runtime. |
| `tests/**/*.spec.ts` | `getCliArgs`, `parseArgs`, `require(cliArgs)` | **Test-only** | Contract tests (e.g. **17X** / **17Y** Proxy round-trip). Former **`src/__tests__`** suites promoted in **Phase 19D** (`tests/phase19d_*.spec.ts`). |

### Phase 18E — merge_odds: explicit CliArgs (no getCliArgs / resolveMergeCli fallback)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/filter/ranking/export/site-semantics changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, **`cliArgs`** Proxy unchanged.
- **Purpose:** Remove hidden global CLI resolution from **`src/merge_odds.ts`**; active merge/fetch paths require caller-resolved **`CliArgs`** (same snapshot semantics as prior implicit **`getCliArgs()`** when tests passed no arg).
- **Files inspected:** `src/merge_odds.ts`; `src/run_optimizer.ts`; `src/run_underdog_optimizer.ts`; `tests/phase9_reporting_truthfulness.spec.ts`; `tests/phase11_matching_coverage_baseline.spec.ts`; `tests/phase12_matching_quality_improvement.spec.ts`; `tests/phase13_source_aware_match_gap_attribution.spec.ts`; `tests/phase14_highest_volume_match_gap_closure.spec.ts`; `src/__tests__/exact_line_merge.test.ts`; `tests/phase17y_explicit_cli_args_threading.spec.ts`; `package.json`.
- **Files changed:** `src/merge_odds.ts` — required **`cli: CliArgs`**; removed **`resolveMergeCli`** and **`getCliArgs`** import. Test/spec call sites: **`mergeWithSnapshot(..., undefined, getDefaultCliArgs())`** (or **`parseArgs([])`** where equivalent). `tests/phase18e_merge_odds_explicit_cli.spec.ts` (new); `tests/phase17y_explicit_cli_args_threading.spec.ts` (static assertions); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Exact behavior added/changed:** Signature-only / wiring-only; merge math and fetch gating read the same **`CliArgs`** fields as before, without falling back to **`getCliArgs()`** when **`cli`** was omitted.
- **Tests added/updated:** `tests/phase18e_merge_odds_explicit_cli.spec.ts`; `tests/phase17y_explicit_cli_args_threading.spec.ts`; phase 9 / 11–14 merge specs; `src/__tests__/exact_line_merge.test.ts`.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js` on Phase 18E + 17Y + phase 9 / 11–14 merge specs (**pass**); `npm run verify:canonical` (**pass**, ~79s).
- **Current state:** **`merge_odds.ts`** has **no** **`getCliArgs`** / **`resolveMergeCli`** / **`cliArgs.`** references.
- **Risks / follow-ups:** Broader **`getCliArgs()`** classification — **Phase 18F** (repo-wide inventory).

### Phase 18D — pp_engine: explicit CliArgs at construction (no getCliArgs fallback)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/filter/ranking/export changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, **`cliArgs`** Proxy unchanged. *( **`merge_odds.ts`** global fallback removed in Phase **18E**.)*
- **Purpose:** Match Phase **18C** for PrizePicks: **`createPrizepicksEngine`** must receive caller-resolved **`CliArgs`**; no hidden global resolution in **`pp_engine.ts`**.
- **Files inspected:** `src/pp_engine.ts`; `src/run_optimizer.ts`; `src/__tests__/engine_parity.test.ts` *(later **`tests/phase19c_engine_parity.spec.ts`**, Phase **19C**)*; `tests/phase17k_runtime_decision_pipeline.spec.ts`; grep **`createPrizepicksEngine`** / **`ppEngine`**; `package.json`.
- **Files changed:** `src/pp_engine.ts` — **`createPrizepicksEngine(cli: CliArgs)`**; removed **`ppEngine`** export and **`getCliArgs`** import. `src/__tests__/engine_parity.test.ts` — **`createPrizepicksEngine(getDefaultCliArgs())`** *(superseded by **`tests/phase19c_engine_parity.spec.ts`**)*. `tests/phase17k_runtime_decision_pipeline.spec.ts` — explicit engine via **`getDefaultCliArgs()`**. `tests/phase18d_pp_engine_explicit_cli.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Exact behavior added/changed:** Construction API only; **`PrizepicksEngine`** methods unchanged. **`run_optimizer`** already passed **`args`** — no orchestration edit.
- **Tests added/updated:** `tests/phase18d_pp_engine_explicit_cli.spec.ts`; `src/__tests__/engine_parity.test.ts` *(→ **`tests/phase19c_engine_parity.spec.ts`**)*; `tests/phase17k_runtime_decision_pipeline.spec.ts`.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17k_runtime_decision_pipeline.spec.ts tests/phase17y_explicit_cli_args_threading.spec.ts tests/phase18d_pp_engine_explicit_cli.spec.ts`; `npm run verify:canonical`.
- **Current state:** **`pp_engine.ts`** has **no** **`getCliArgs`** reference.
- **Risks / follow-ups:** *( **`merge_odds.ts`** global fallback addressed in Phase **18E**.)*

### Phase 18C — ud_engine: explicit CliArgs at construction (no getCliArgs fallback)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/filter/ranking/export changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, **`cliArgs`** Proxy unchanged. *( **`merge_odds.ts`** global fallback removed in Phase **18E**.)*
- **Purpose:** Remove hidden global CLI resolution from **`src/ud_engine.ts`**; **`createUnderdogEngine`** must receive caller-resolved **`CliArgs`** (same pattern as explicit **`this.cli`** on **`UnderdogEngine`** instance).
- **Files inspected:** `src/ud_engine.ts`; `src/__tests__/engine_parity.test.ts` *(later **`tests/phase19c_engine_parity.spec.ts`**)*; grep for **`createUnderdogEngine`** / **`udEngine`**; `tests/phase17y_explicit_cli_args_threading.spec.ts`; `package.json`.
- **Files changed:** `src/ud_engine.ts` — **`createUnderdogEngine(cli: CliArgs)`**; removed **`udEngine`** export and **`getCliArgs`** import. `src/__tests__/engine_parity.test.ts` — **`createUnderdogEngine(getDefaultCliArgs())`** *(superseded by **`tests/phase19c_engine_parity.spec.ts`**)*. `tests/phase18c_ud_engine_explicit_cli.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Exact behavior added/changed:** Construction API only; threshold math still **`computeUdRunnerLegEligibility(cli)`** with explicit **`cli`**. Default-threshold parity tests use **`getDefaultCliArgs()`** (same object shape as pre-change implicit bootstrap-off defaults).
- **Tests added/updated:** `tests/phase18c_ud_engine_explicit_cli.spec.ts`; `src/__tests__/engine_parity.test.ts` *(→ **`tests/phase19c_engine_parity.spec.ts`**)*.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17y_explicit_cli_args_threading.spec.ts tests/phase18b_run_underdog_explicit_args.spec.ts tests/phase18c_ud_engine_explicit_cli.spec.ts`; `npm run verify:canonical`.
- **Current state:** **`ud_engine.ts`** has **no** **`getCliArgs`** reference.
- **Risks / follow-ups:** *(Superseded for PP engine construction by Phase **18D**.)*

### Phase 18B — run_underdog_optimizer: explicit args snapshot + engine filter

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/filter/ranking/export changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, **`cliArgs`** Proxy unchanged. **`main(undefined)`** / **`runUnderdogOptimizer(undefined)`** still resolve via one **`getCliArgs()`** at **`main`** entry (standalone / unified runs).
- **Purpose:** Align UD orchestration with Phase **18A**: one **`args`** variable for the active **`main()`** path; remove second **`getCliArgs()`** from **`filterEvPicksForEngine`** by requiring explicit **`CliArgs`** (engine contract).
- **Files inspected:** `src/run_underdog_optimizer.ts`; `src/ud_engine.ts` (`filterEvPicksForEngine` call); `tests/phase17y_explicit_cli_args_threading.spec.ts`; `package.json`.
- **Files changed:** `src/run_underdog_optimizer.ts` — **`cliResolved` → `args`**; **`filterEvPicksForEngine`** signature required **`cli`**; **`tests/phase17y_explicit_cli_args_threading.spec.ts`** (merge line strings); **`tests/phase18b_run_underdog_explicit_args.spec.ts`** (new); **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Naming + explicit engine API only; merge/filter inputs unchanged vs prior **`cliResolved`** / **`cli ?? getCliArgs()`** in **`filterEvPicksForEngine`** when **`ud_engine`** passed **`this.cli`**.
- **Tests added/updated:** `tests/phase18b_run_underdog_explicit_args.spec.ts`; `tests/phase17y_explicit_cli_args_threading.spec.ts` ( **`args`** in merge assertions).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17y_explicit_cli_args_threading.spec.ts tests/phase18b_run_underdog_explicit_args.spec.ts`; `npm run verify:canonical`.
- **Current state:** **`run_underdog_optimizer.ts`** has exactly **one** **`getCliArgs()`** call site (**`main`** snapshot); **`filterEvPicksForEngine`** does not call **`getCliArgs`**.
- **Risks / follow-ups:** *(Superseded for UD engine construction by Phase **18C**.)*

### Phase 18A — run_optimizer orchestration: no cliArgs Proxy reads

- **Assumptions:** **No** EV/breakeven/registry/combinatorics/ranking/filter/export changes; **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, and lazy **`cliArgs`** Proxy implementation unchanged. **`getCliArgs()`** remains the single resolution point at **`run()`** start (same snapshot as before).
- **Purpose:** Replace all **`cliArgs.`** / **`cliArgs`** identifier uses inside **`run_optimizer.ts`** with the already-resolved **`args`** object; thread **`CliArgs`** into **`runSheetsPush`** so Sheets push does not read the global Proxy.
- **Files inspected:** `src/run_optimizer.ts`; `tests/e2e.spec.ts` (telegram wiring string); `tests/phase17y_explicit_cli_args_threading.spec.ts`; `tests/phase17z_explicit_cli_runtime_helpers.spec.ts`; `package.json` (`verify:canonical`).
- **Files changed:** `src/run_optimizer.ts` — remove **`cliArgs`** import; **`run()`** and all prior **`cliArgs.*`** sites use **`args.*`**; **`runSheetsPush(runTimestamp, cli: CliArgs)`** with **`cli`** for bankroll / **`noSheets`** / **`telegram`**. `tests/phase18a_run_optimizer_explicit_args.spec.ts` (new); `tests/e2e.spec.ts` (static string **`args.telegram`**); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Exact behavior added/changed:** None numerically — same fields read from the same resolved snapshot; **`runSheetsPush`** now receives that snapshot explicitly.
- **Tests added/updated:** `tests/phase18a_run_optimizer_explicit_args.spec.ts`; `tests/e2e.spec.ts` (assertion text).
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase17y_explicit_cli_args_threading.spec.ts tests/phase17z_explicit_cli_runtime_helpers.spec.ts tests/phase18a_run_optimizer_explicit_args.spec.ts` (**pass**); `npm run verify:canonical` (**pass**). Optional `tests/e2e.spec.ts`: one case expects `.env.example` on disk — **failed locally** when file absent (**not** part of `verify:canonical`).
- **Current state:** **`run_optimizer.ts`** has **zero** **`cliArgs`** identifier references; orchestration is **`args`**-driven + explicit **`runSheetsPush`** parameter.
- **Risks / follow-ups:** Other entrypoints (`scripts`, tests) may still import **`cliArgs`** Proxy — **deferred** unless a future phase narrows scope.

### Phase 17Z — Explicit CliArgs in runtime-adjacent helpers (no global reads)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics changes; **no** edits to **`parseArgs`**, **`getDefaultCliArgs`**, **`optimizer_cli_bootstrap`**, or lazy **`cliArgs`** Proxy semantics. Default behavior when **`buildInnovativeCards`** omits **`cli`** matches **`getDefaultCliArgs()`**-equivalent filtering (**minEdge** 0.015, **volume** false).
- **Purpose:** Remove remaining **`cliArgs`** / **`getCliArgs()`** reads from **`src/card_ev.ts`**, **`src/build_innovative_cards.ts`**, **`src/telegram_pusher.ts`**; thread **`CliArgs`** from **`run()`**’s **`args`** for PP card eval, innovative builder, and Telegram dry-run.
- **Files inspected:** `src/card_ev.ts`; `src/build_innovative_cards.ts`; `src/telegram_pusher.ts`; `src/run_optimizer.ts`; `tests/parity_test.spec.ts` (innovative parity); `tests/phase17y_explicit_cli_args_threading.spec.ts`.
- **Files changed:** `src/card_ev.ts` — **`evaluateFlexCard`** takes **`EvaluateFlexCardOptions`** (`minCardEvFallback`); no module-level Proxy read. `src/build_innovative_cards.ts` — optional **`cli?: CliArgs`** on builder options; leg-pool **`minEdge` / `volume`** from **`opts.cli`** with defaults **`0.015` / `false`** when omitted. `src/telegram_pusher.ts` — **`telegramDryRun`** on **`TelegramPushOptions`** and 4th arg on **`pushUdTop5FromCsv`**. `src/run_optimizer.ts` — **`getMinEvForFlexType`**, **`buildCardsForSize`**, **`logCardVolumeDiagnostics`** take **`CliArgs`**; **`evaluateFlexCard`** / **`buildInnovativeCards`** / Telegram calls wired **`args`**. `tests/phase17z_explicit_cli_runtime_helpers.spec.ts`; `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Exact behavior added/changed:** Same numeric thresholds as before, resolved from **`args`** (or builder defaults) instead of hidden global **`cliArgs`** in these modules; **`pushUdTop5FromCsv(..., telegramDryRun)`** replaces implicit global dry-run.
- **Tests added/updated:** `tests/phase17z_explicit_cli_runtime_helpers.spec.ts` (static imports + innovative parity + volume-vs-default inequality).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17z_explicit_cli_runtime_helpers.spec.ts`; `npm run verify:canonical`.
- **Current state:** Targeted helpers are **global-free**; entrypoint **`run()`** orchestrates with **`args`** for these paths.
- **Risks / follow-ups:** **`run_optimizer`** still uses **`cliArgs`** Proxy elsewhere (logging, orchestration); further phases can thread **`args`** where low-cost.

### Phase 17F — Canonical run status (operator post-run)

- **Purpose:** Single **operator-facing** post-run snapshot after a successful optimizer run (additive; no EV/breakeven/ranking/digest contract changes).
- **Artifacts (project root):** `data/reports/latest_run_status.json` (machine-readable) and `data/reports/latest_run_status.md` (compact markdown). These are the canonical **run status** outputs; other artifacts (e.g. CSVs, `artifacts/last_run.json`) remain unchanged.
- **Implementation:** `src/reporting/run_status.ts` (`buildRunStatus`, `formatRunStatusMarkdown`, `writeRunStatusArtifacts`, `tryWriteRunStatusArtifacts`, path helpers). Wired from `src/run_optimizer.ts` at normal completion: full PP/UD path (after Tier1 scarcity) and `--platform ud` completion. Failures to write status are logged only (non-fatal).
- **Tests:** `tests/phase17f_run_status.spec.ts` (included in `npm run verify:canonical`).

### Phase 17G — Early-exit run status coverage

- **Purpose:** Same canonical files as 17F, also written on **controlled early exits** (non-throw returns) so operators see `outcome` / `earlyExitReason` instead of a stale prior run.
- **Schema (additive):** `outcome`: `full_success` | `early_exit`; `earlyExitReason`: `null` or stable strings `insufficient_eligible_legs` | `no_viable_structures` (only branches that exist in `run_optimizer.ts`).
- **Rules:** `success: true` for these controlled exits; markdown adds **Outcome** near the top and **Early exit reason** when set.
- **Wired paths:** PP legs &lt; 6 after filtering (early exit); no viable slip structures after prefilter (early exit). Not written for `--help` or `--sheets-only`. Fatal guardrail exits are covered in Phase 17H.
- **Tests:** `tests/phase17g_early_exit_run_status.spec.ts` (included in `npm run verify:canonical`).

### Phase 17H — Fatal-exit run status coverage

- **Purpose:** Same `data/reports/latest_run_status.json` / `.md` files updated **before** fatal termination on real PP run paths (`process.exit(1)` and top-level `run().catch`).
- **Schema (additive):** `outcome` includes `fatal_exit`; `fatalReason`: `null` or stable strings `validation_failure` | `no_positive_ev_legs` | `json_output_failure` | `uncaught_run_error` (mapped to existing branches in `run_optimizer.ts`).
- **Rules:** `success: false` for fatal exits; markdown adds **Fatal reason** when `fatal_exit` and reason present (after **Outcome**; **Early exit reason** unchanged for `early_exit`).
- **Wired paths:** empty odds snapshot; odds-age / PP merge guardrails; no +EV legs guardrail; `prizepicks-legs.json` write/serialize failure; `run().catch` → `uncaught_run_error`. Status write failures remain warn-only and do not change exit codes.
- **Tests:** `tests/phase17h_fatal_exit_run_status.spec.ts` (included in `npm run verify:canonical`).

### Phase 17I — Platform survival & structure distribution audit (diagnostic)

- **Purpose:** Operator-facing **funnel counts** (PP + UD) and **UD structure ID / flexType** distributions (generated vs exported), without changing EV math, thresholds, ranking, or promo rules.
- **Artifacts:** `data/reports/latest_platform_survival_summary.json` and `data/reports/latest_platform_survival_summary.md` (additive alongside 17F run status).
- **Implementation:** `src/reporting/platform_survival_summary.ts` (`buildPlatformSurvivalSummary`, `writePhase17iOperatorArtifacts`, markdown formatter). `src/run_underdog_optimizer.ts` attaches `survival` to `UdRunResult`. `src/run_optimizer.ts` wires writes on full success, PP early exits, no-viable-structures exit, and `--platform ud`.
- **Tests:** `tests/phase17i_platform_survival.spec.ts` (includes static check that `src/ev/juice_adjust.ts` re-exports canonical `math_models/juice_adjust`).

### Phase 17J — Cross-platform eligibility policy contract

- **Purpose:** Make PP vs UD **leg-survival policy** explicit, normalized, and operator-auditable (addresses product consistency / trust; **does not** change EV, breakeven, ranking, or payout math).
- **Artifacts:** `data/reports/latest_eligibility_policy_contract.json` and `data/reports/latest_eligibility_policy_contract.md` (written on the same successful paths as Phase 17I alongside `run_optimizer` / `--platform ud`).
- **Implementation:** `src/policy/eligibility_policy.ts` — data-first `computePpRunnerLegEligibility` / `computeUdRunnerLegEligibility`, `buildEligibilityPolicyContract`, `compareEligibilityPolicies`, markdown with fixed section order. Classifies differences as shared, **platform_specific_approved** (only where explicitly justified, e.g. UD factor), or **platform_specific_needs_review** (default for unapproved drift).
- **Tests:** `tests/phase17j_eligibility_policy_contract.spec.ts` (determinism, diff classification, artifact write, mirror-formula parity vs `run_optimizer` / `run_underdog_optimizer` thresholds, registry wiring).

### Phase 17K — Canonical runtime decision pipeline

- **Purpose:** **Runtime-enforced** leg eligibility consistency: one canonical path for PP threshold stages and one for UD `filterEvPicks`, eliminating undeclared runner/wrapper drift (EV/breakeven/payout/ranking math unchanged).
- **Implementation:** `src/policy/runtime_decision_pipeline.ts` — PP stage helpers (`filterPpLegsByMinEdge`, `applyPpHistoricalCalibrationPass`, effective-EV floor, global player cap), `executePrizePicksLegEligibilityPipeline`, compact fail-reason codes; `filterUdEvPicksCanonical` for UD factor/std/boost tiers + per-player/stat cap. `src/policy/ud_pick_factor.ts` is the single source for `resolveUdFactor` / `udAdjustedLegEv`.
- **Wiring:** `run_optimizer.ts` uses canonical PP helpers + `PP_LEG_POLICY = computePpRunnerLegEligibility(args)` inside `run()` (Phase 17Y); `pp_engine.ts` uses the same policy + helpers via `createPrizepicksEngine(cli)`; `run_underdog_optimizer.ts` delegates `filterEvPicks` to `filterUdEvPicksCanonical` with explicit `CliArgs`; `ud_engine.ts` uses `computeUdRunnerLegEligibility` for `getThresholds` (fixes prior 0.010 vs 0.004 volume drift).
- **Phase 17J artifact:** `computePpEngineWrapperThresholds` now aliases runner numerics; `runnerVsEngineDivergence` is always false; shared invariants note Phase 17K centralization.
- **Removed drift:** PP `pp_engine` vs `run_optimizer` threshold mismatch (especially `--volume`); UD `ud_engine` vs `run_underdog_optimizer` `udMinLegEv` under `udVolume`.
- **Approved differences retained (explicit, tested):** UD payout **factor** decline and std vs boosted floors; UD per-**player/stat** cap vs PP global per-player cap; PP **effective EV** gate vs UD tiered filter (still reflected in Phase 17J comparison rows marked approved where applicable).
- **Tests:** `tests/phase17k_runtime_decision_pipeline.spec.ts` (PP engine ≡ canonical pipeline on identical inputs, stable reason codes, static import proofs, UD factor path).

### Phase 17L — Canonical bucketed evaluation architecture

- **Purpose:** One **ordered** evaluation pipeline for PP and UD so runtime work is staged under the same **bucket names** and **canonical types** (`src/pipeline/evaluation_buckets.ts`). Reduces hidden PP/UD/source forks outside approved layers. **EV, breakeven, payout registries, and core card-EV formulas are unchanged.**
- **Canonical order (all platforms):** `ingest` → `normalize` → `match_merge` → `shared_eligibility` → `platform_math` → `structure_evaluation` → `selection_export` → `render_input`.
- **OddsAPI-linked merge:** Both platforms consume the same **`mergeWithSnapshot`** path in **`match_merge`** (see `MATCH_MERGE_SHARED_ENTRYPOINT` in `evaluation_buckets.ts`).
- **Approved variance:** Only **mathematical / product** differences that are **explicitly named** should diverge—primarily in **`platform_math`** (see `APPROVED_PLATFORM_MATH_VARIANCE`). Other drift should be treated as a bug unless contract-tested and documented.
- **Wiring (superseded for PP tail by 17M):** `run_optimizer.ts` runs **PP** buckets `ingest`→`shared_eligibility`, then **`platform_math`**. Buckets 6–8 are explicit in Phase 17M. `run_underdog_optimizer.ts` runs **UD** via **`runBucketSlice`**: ingest→shared, platform_math, then **`structure_evaluation` → `selection_export` → `render_input`** (leg + card artifacts from **`selection_export`** after card evaluation).
- **Runner:** `runBucketSlice` / `runSingleBucket` enforce contiguous slice ordering vs `EVALUATION_BUCKET_ORDER`.
- **Tests:** `tests/phase17l_bucketed_evaluation_architecture.spec.ts` (order determinism, slice contiguity, static proofs for runners + `mergeWithSnapshot`, 17K helper lock-in).

### Phase 17M — Full 8/8 site-invariant bucket parity

- **Assumptions:** PP orchestration may still use **three** `runBucketSlice` calls (slices 0–4, 5, 6–7) vs UD’s pattern; parity means **same eight bucket names in order** and **no ad hoc PP tail** outside those stages. Guardrail / early-exit paths remain entrypoint orchestration but use the **same tail bucket ids** where exports occur.
- **Purpose:** Complete Phase 17L for PP by moving **`structure_evaluation`**, **`selection_export`**, and **`render_input`** into explicit `runBucketSlice("pp", PP_SLICE_STRUCT_RENDER, …)` (mirrors UD tail semantics). **No EV/breakeven/registry/combinatorics changes.**
- **Files changed:** `src/run_optimizer.ts` (PP tail refactor); `tests/phase17m_full_bucket_parity.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Behavior changes:**
  - **PP legs JSON/CSV** are written in **`selection_export`**, **after** `structure_evaluation` (viable-structure prefilter + card pipeline + SelectionEngine sort). For **no viable PP structures**, legs are still written in **`selection_export`** after structure logs — **log/artifact order vs pre-17M** may differ slightly (structure messages before legs files); card files are still skipped when there are no viable structures (unchanged intent).
  - **Clipboard, tracker (PP-only), innovative** outputs stay in **`render_input`** after card export.
- **Tests added/updated:** `tests/phase17m_full_bucket_parity.spec.ts`; 17K/17L specs re-run unchanged.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17m_full_bucket_parity.spec.ts tests/phase17l_bucketed_evaluation_architecture.spec.ts tests/phase17k_runtime_decision_pipeline.spec.ts`; `npm run verify:canonical` (breakeven + full canonical Jest bundle — **passed**).
- **Current state:** PP and UD both reference all eight canonical bucket ids; PP tail is bucket-wrapped; thresholds remain on 17K helpers inside **`platform_math`** only (no duplicate `MIN_LEG_EV_REQUIREMENTS` table).
- **Risks / follow-ups:** Single **`runBucketSlice` call** per platform for all eight stages (vs PP/UD multi-slice orchestration) is optional; `finalizePendingEVRequests` / fantasy / unified UD block remain **after** the PP tail slice by design (engine teardown + cross-platform orchestration). Jest reported a benign worker teardown warning (`--detectOpenHandles` if investigating).

### Phase 17N — Site-invariant eligibility enforcement

- **Assumptions:** “Site-invariant” applies to **shared** eligibility primitives and export slice **policy** after each platform’s **platform_math** has produced comparable leg fields (`edge`, `legEv`, UD factor / `udAdjustedLegEv`, PP `adjEv` / effective EV). EV/breakeven/payout registries/combinatorics remain unchanged unless a proven wiring bug (none in this phase).
- **Purpose:** Remove **non-math** PP vs UD drift in leg caps, min-edge enforcement, and export capping; one canonical FCFS implementation and one pair of export resolvers; entrypoints orchestrate only.
- **Files changed:** `src/policy/shared_leg_eligibility.ts` (new); `src/policy/runtime_decision_pipeline.ts` (PP/UD FCFS via `applySharedFirstComeFirstServedCap`; UD `filterUdEvPicksCanonical` applies **`udMinEdge`** after factor decline, before std/boost tiers; `UD_FAIL_MIN_EDGE`); `src/run_optimizer.ts` (`resolvePrizePicksRunnerExportCardLimit`); `src/run_underdog_optimizer.ts` (`computeUdRunnerLegEligibility` for module thresholds, `resolveUnderdogRunnerExportCardCap`, structure `edgeFloor` uses `udMinEdge`); `src/policy/eligibility_policy.ts` (UD stageOrder strings, export resolver fields, PP `exportResolver`); `src/pipeline/evaluation_buckets.ts` (UD bucket note); `tests/phase17n_site_invariant_eligibility_enforcement.spec.ts` (new); `tests/phase17k_runtime_decision_pipeline.spec.ts` (UD min-edge + std-floor ordering); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Non-math variance removed:** Duplicate **FCFS cap loops** (PP vs UD) → single **`applySharedFirstComeFirstServedCap`** with explicit grouping mode; inline PP **export** `exportUncap ? … : platform === "both" ? maxCards : maxExport` → **`resolvePrizePicksRunnerExportCardLimit`**; UD **`maxCards ?? 800`** duplication → **`resolveUnderdogRunnerExportCardCap`** (also honors **`--export-uncap`** like PP); duplicate **`udMinEdge`** formula at top of `run_underdog_optimizer.ts` → **`computeUdRunnerLegEligibility(cliArgs)`**; UD leg filter **did not apply `udMinEdge`** despite policy documenting it — now enforced in **`filterUdEvPicksCanonical`** / **`udLegFirstFailureCode`** (aligned with PP min-edge **comparator** after UD factor gate).
- **Approved irreducible differences retained:** **Platform math:** UD pick factor decline + std vs boosted **`udAdjustedLegEv`** floors vs PP calibration + effective EV floor (see `PHASE17N_IRREDUCIBLE_PLATFORM_MATH` in `shared_leg_eligibility.ts`). **Platform input semantics:** FCFS grouping key **`player`** (PP) vs **`${site}:${player}:${stat}`** (UD) (see `PHASE17N_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS`). Card-level structural gates / dedupe centralized in Phase **17O** (`shared_card_construction_gates.ts`).
- **Tests added/updated:** `tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `tests/phase17k_runtime_decision_pipeline.spec.ts` (min-edge failure code + std-floor case).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `npx jest --config jest.config.js tests/phase17m_full_bucket_parity.spec.ts`; `npx jest --config jest.config.js tests/phase17k_runtime_decision_pipeline.spec.ts`; `npx jest --config jest.config.js tests/phase17j_eligibility_policy_contract.spec.ts`; `npm run verify:canonical`.
- **Current state:** Shared eligibility **stage order** for cross-site audits is documented in **`PHASE17N_SHARED_ELIGIBILITY_STAGE_ORDER`**; FCFS and export limits are **test-locked**; UD **survival** can drop legs that previously passed with **edge &lt; udMinEdge** (intentional alignment).
- **Risks / follow-ups:** Operators comparing historical UD leg counts should expect a **stricter** pre-card pool when many legs had **sub-threshold edge**; optional follow-up is to thread **`udMinEdge` override** through `FilterUdEvPicksOptions` only if a product-approved exception path is needed.

### Phase 17O — Site-invariant card construction gates

- **Assumptions:** Structural gates (who can share a card) are **not** EV/breakeven math; they must match across sites unless an irreducible product input rule says otherwise. Card **evaluation** (`evaluateFlexCard` vs `evaluateUdStandardCard` / `evaluateUdFlexCard`) remains platform-native **math** and stays in existing evaluators.
- **Purpose:** One canonical module for **unique players**, **same-underlying opposite-side** detection, **team/game density limits**, **dedupe by unordered leg-id set (best `cardEv`)**, and **stable gate reason codes**. PP and UD **candidate sampling** both call the same **`firstCardConstructionGateFailure`**; UD additionally **dedupes** wrapped cards the same way as PP (best EV wins).
- **Files changed:** `src/policy/shared_card_construction_gates.ts` (new); `src/run_optimizer.ts` (remove inline correlation-limit + dedupe; wire shared gates + `dedupeCardCandidatesByLegIdSetBestCardEv`); `src/run_underdog_optimizer.ts` (replace `players.size` check with shared gates; `dedupeFormatCardEntriesByLegSetBestCardEv` before sort); `src/policy/eligibility_policy.ts` (contract strings for dedupe/opposite-side timing → shared module); `src/reporting/platform_survival_summary.ts` (operator copy); `tests/phase17o_site_invariant_card_construction_gates.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Non-math variance removed:** UD k-combos **did not** apply PP’s **team/game density** caps; now **shared**. UD **did not** dedupe identical leg-sets across structures; now **dedupes** like PP (best `cardEv`, keeps winning structure `format`). PP **open-coded** correlation-limit + dedupe in `buildCardsForSize` → **shared helpers**.
- **Irreducible differences retained:** **Platform math:** UD vs PP **card EV** evaluation (`underdog_card_ev` vs `card_ev` / `evaluateFlexCard`) and **structure IDs** (registry) unchanged. **Input semantics:** PP sampling still uses **`side: "over"`** for `evaluateFlexCard` where the legacy path did (not changed in 17O); UD legs carry actual **`outcome`** into `makeCardResultFromUd` (platform-native).
- **Tests added/updated:** `tests/phase17o_site_invariant_card_construction_gates.spec.ts`; Phase 17J/17N/17M/17K suites re-run as part of validation.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17o_site_invariant_card_construction_gates.spec.ts`; `npx jest --config jest.config.js tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `npx jest --config jest.config.js tests/phase17m_full_bucket_parity.spec.ts`; `npx jest --config jest.config.js tests/phase17k_runtime_decision_pipeline.spec.ts`; `npm run verify:canonical`.
- **Current state:** **`SHARED_CARD_CONSTRUCTION_GATE_ORDER`** is explicit and test-locked; entrypoints import **`shared_card_construction_gates`** for covered behavior.
- **Risks / follow-ups:** UD card counts may **drop** vs pre-17O when many combos violated **team/game caps** (previously allowed); **dedupe** may collapse duplicate entries that differed only by `format`. Post-evaluator duplicate-player leg penalty moved to Phase **17P** (`shared_post_eligibility_optimization.ts`).

### Phase 17P — Site-invariant post-eligibility optimization policy

- **Assumptions:** After shared leg eligibility (17N) and structural card gates (17O), **ranking and non-evaluator adjustments** should be shared unless they are **registry/evaluator math** or **platform-only product rules**. **`SelectionEngine`** uses PP slip structures + `math_models` — **PP-only** by design.
- **Purpose:** Centralize duplicate-player post-evaluator penalty, **unified leg ranking metric** (`adjEv ?? legEv`), and **primary card export ranking** (cardEv → winProbCash → leg ids) for both PP and UD.
- **Files changed:** `src/policy/shared_post_eligibility_optimization.ts` (new); `src/run_optimizer.ts` (wire shared penalty, `sortLegsByPostEligibilityValue`, `sortCardsForExportPrimaryRanking`); `src/run_underdog_optimizer.ts` (`applyPostEvaluatorDuplicatePlayerLegPenalty` after UD evaluators, `sortFormatCardEntriesForExportPrimaryRanking`, bench `top_legs` via `sortLegsByPostEligibilityValue`); `tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts` (new); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Non-math variance removed:** PP-only **`applyCorrelationPenalty`** / literals in `run_optimizer` → **`applyPostEvaluatorDuplicatePlayerLegPenalty`** in shared module. UD **card ordering** used **`cardEv` only** → **same comparator as PP** (`compareCardsForExportPrimaryRanking`). UD **bench top legs** used inline `adjEv ?? legEv` sort → **`sortLegsByPostEligibilityValue`**.
- **Irreducible differences retained:** **`filterAndOptimize`** uses **`getOptimalCardSize(..., platform)`** with **`PP` vs `UD`** registry structure sets. UD **combo pool** ordering still uses **`udAdjustedLegEv`** before k-combos (platform math / factor-aware). **Evaluator outputs** (`evaluateFlexCard` vs `evaluateUd*`) unchanged. (Phase **17Q** centralizes orchestration; see Phase 17Q section.)
- **Tests added/updated:** `tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts`; 17N/17O specs re-run under `verify:canonical`.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts`; `npx jest --config jest.config.js tests/phase17o_site_invariant_card_construction_gates.spec.ts`; `npx jest --config jest.config.js tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `npx jest --config jest.config.js tests/phase17m_full_bucket_parity.spec.ts`; `npm run verify:canonical`.
- **Current state:** Entrypoints import **`shared_post_eligibility_optimization`**; static tests block reintroducing local **`applyCorrelationPenalty`** / naive **`deduped.sort(...cardEv)`**.
- **Risks / follow-ups:** UD cards with **equal** `cardEv` now **reorder** vs pre-17P when **`winProbCash`** differs (intentional parity). Phase **17Q** wires **SelectionEngine** for UD via **`shared_final_selection_policy`**.

### Phase 17Q — Site-invariant final selection policy

- **Assumptions:** Final export should use one **breakeven + anti-dilution** policy per **platform registry** (`PP` vs `UD` structure IDs in `math_models`), then shared **primary ranking** and **export-cap slice**. Entrypoints only wire; **`SelectionEngine`** remains the implementation of registry-backed selection math.
- **Purpose:** **`shared_final_selection_policy.ts`** — `applyFinalCardSelectionPipeline` (PP), `applyFinalSelectionToFormatEntries` (UD), `applyExportCapSlice*`; **`resolveSelectionRegistryStructureId`** in **`SelectionEngine.ts`** so UD cards use **`structureId`** (`UD_*`) for **`getBreakevenThreshold`**, not abbreviated **`flexType`** alone.
- **Files changed:** `src/policy/shared_final_selection_policy.ts` (new); `src/SelectionEngine.ts` (`resolveSelectionRegistryStructureId`, `passesBreakevenFilter` fix); `src/run_optimizer.ts` (final selection + export slice via shared module); `src/run_underdog_optimizer.ts` (UD final selection + export slice); `src/reporting/platform_survival_summary.ts` (`CODE_LOCATIONS`); `tests/phase17q_site_invariant_final_selection_policy.spec.ts` (new); `tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts` (static import path); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Non-math variance removed:** PP-only **`import("./SelectionEngine")`** in `run_optimizer` → static **`shared_final_selection_policy`**. UD **`allCards.slice(0, maxCardsCap)`** → **`applyExportCapSliceFormatEntries`**. UD had **no** SelectionEngine pass → **same** `filterAndOptimize(..., "UD")` as PP’s orchestration pattern.
- **Irreducible differences retained:** **`getOptimalCardSize`** searches **different** structure-id lists for `PP` vs `UD` (registry JSON). **Per-type min EV** filter before selection remains in **`run_optimizer`** (PP). **UD** leg pool sort for k-combos remains **`udAdjustedLegEv`** (factor-aware). **`resolvePrizePicksRunnerExportCardLimit`** vs **`resolveUnderdogRunnerExportCardCap`** (different CLI flags) — both feed **`applyExportCapSlice*`**.
- **Tests added/updated:** `tests/phase17q_site_invariant_final_selection_policy.spec.ts`; `tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts` (static import path for SelectionEngine orchestration).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17q_site_invariant_final_selection_policy.spec.ts`; `npx jest --config jest.config.js tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts`; `npx jest --config jest.config.js tests/phase17o_site_invariant_card_construction_gates.spec.ts`; `npx jest --config jest.config.js tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `npx jest --config jest.config.js tests/phase17m_full_bucket_parity.spec.ts`; `npm run verify:canonical`.
- **Current state:** **`FINAL_SELECTION_POLICY_STAGE_ORDER`** documents stages; entrypoints do not import **`SelectionEngine`** directly.
- **Risks / follow-ups:** UD card counts may **drop** when **`passesBreakevenFilter`** uses correct **UD** registry id (fix vs old PP **`5P`** lookup). Anti-dilution may **trim** UD cards to smaller structures — monitor operator reports.

### Phase 17R — Site-invariant selection observability + distribution guardrails (report-only)

- **Assumptions:** Observability reads **only** from arrays produced by the shared final-selection pipeline (PP: `cardsBeforeEvFilterTail` → per-type min EV → `applyFinalCardSelectionPipeline` → sort → export slice; UD: `buildUdCardsFromFiltered` → `applyFinalSelectionToFormatEntries` → `applyExportCapSliceFormatEntries`). No selection math, thresholds, or export outcomes are changed in this phase.
- **Purpose:** Operator-facing proof that **post–structure_evaluation**, **post–final-selection** (SelectionEngine / anti-dilution path), and **post–export-cap** pools have expected **counts and structure mix** for PP and UD; **deterministic** JSON + markdown under `data/reports/`. **Guardrails are notes only** (no `process.exit`, no auto-correction).
- **Artifacts:** `data/reports/latest_final_selection_observability.json`, `data/reports/latest_final_selection_observability.md`.
- **Implementation:** `src/reporting/final_selection_observability.ts` — `buildPpFinalSelectionObservability`, `buildUdFinalSelectionObservability`, `buildFinalSelectionObservabilityReport`, `formatFinalSelectionObservabilityMarkdown`, `writeFinalSelectionObservabilityArtifacts`, `mergeFinalSelectionObservabilityArtifact` (optional merge), `stableStringifyForObservability` (recursive sorted keys). **Named thresholds:** `GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD` (0.55), `GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT` (15 percentage points), `GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN` (0.35), `GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN` (0.25).
- **Wiring:** `src/run_underdog_optimizer.ts` sets `udBuiltPreFinal` before `applyFinalSelectionToFormatEntries`, returns `finalSelectionObservability` on `UdRunResult`. `src/run_optimizer.ts` writes artifacts on **full success** (PP from tail arrays + UD from `udRunResult` when `platform === "both"`), **`--platform ud`**, and **early exits** when UD ran (insufficient PP legs / no viable PP structures) so UD sections are not silently dropped.
- **Guardrail notes (report-only):** (1) exported pool **single-structure dominance**; (2) **large removal** from pre-selection to post-selection (per platform; PP ratio uses post–per-type-min-EV pool vs post-selection); (3) **export cap** materially shifting **% mix** between post-final-selection and exported pools; (4) **cross-site** PP vs UD selection-removal ratio delta when both sections exist.
- **Files changed:** `src/reporting/final_selection_observability.ts` (fixes: `distributionFromPpCards` aggregation, deterministic `stableStringifyForObservability`); `src/run_underdog_optimizer.ts`; `src/run_optimizer.ts`; `tests/phase17r_final_selection_observability.spec.ts`; `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Tests added/updated:** `tests/phase17r_final_selection_observability.spec.ts` (counts, JSON/markdown determinism, guardrail threshold behavior, merge helper, static wiring proofs).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17r_final_selection_observability.spec.ts tests/phase17q_site_invariant_final_selection_policy.spec.ts tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts tests/phase17o_site_invariant_card_construction_gates.spec.ts`; `npm run verify:canonical` (**passed**).
- **Current state:** Final selection observability is **canonical** and **wired from shared pipeline outputs**; combined report on unified runs includes **PP + UD** when both execute.
- **Risks / follow-ups:** PP **`--platform`** default (PP-only) writes **UD: null** in the combined artifact — expected; operators comparing **historical** `latest_final_selection_observability.json` should scope by `runTimestampEt`. Optional: thread explicit **passesBreakevenFilter** counts if SelectionEngine exposes per-card reasons in a later phase (not required for 17R). Phase **17S** adds explicit **reason attribution** alongside 17R.

### Phase 17S — Selection reason attribution (report-only)

- **Assumptions:** Reason codes reflect **the same control flow** as `filterAndOptimize` / `applyFinalSelectionToFormatEntries` / export slicers — implemented via **`attributeFilterAndOptimizeBatch`** and **`attributeFinalSelectionUdFormatEntries`** in **`shared_final_selection_policy.ts`** (mirrors SelectionEngine without changing outputs). PP **per-type min EV** removals are attributed by **set difference** on the same in-memory arrays as `run_optimizer`. **Cross-card dedupe / “already covered”** is **not** implemented in SelectionEngine; documented via `FINAL_SELECTION_REASON_NOT_APPLICABLE_CROSS_CARD_SUPPRESSION` on each platform block.
- **Purpose:** Operator-facing **why** cards disappear or change between stages: **`per_type_min_ev_removal`** (PP only, pre-SelectionEngine), **`breakeven_filter_removal`**, **`anti_dilution_structure_adjustment`** (kept card, structure/leg count changed — not a pool removal), **`export_cap_truncation`**. **Dominant removal reason** = max of per-type / breakeven / export-cap (anti-dilution excluded from “dominant removal”).
- **Artifacts:** `data/reports/latest_final_selection_reasons.json`, `data/reports/latest_final_selection_reasons.md` (deterministic JSON via `stableStringifyForObservability` from 17R module).
- **Implementation:** `src/reporting/final_selection_reason_attribution.ts` — `buildPpFinalSelectionReasons`, `buildUdFinalSelectionReasons`, `buildFinalSelectionReasonsReport`, `formatFinalSelectionReasonsMarkdown`, `writeFinalSelectionReasonsArtifacts`, `mergeFinalSelectionReasonsArtifact`, `listPpExportCapRemovals` / `listUdExportCapRemovals`. **`src/policy/shared_final_selection_policy.ts`** — reason **constants**, `attributeFilterAndOptimizeBatch`, `attributeFinalSelectionUdFormatEntries` (additive exports).
- **Wiring:** `src/run_underdog_optimizer.ts` returns **`finalSelectionReasons`** on **`UdRunResult`**. `src/run_optimizer.ts` writes reasons on **full success** (PP + UD when `platform === "both"`), **`--platform ud`**, and **early exits** when UD ran (same pattern as 17R). PP-only runs: **UD `null`**.
- **Files changed:** `src/policy/shared_final_selection_policy.ts`; `src/reporting/final_selection_reason_attribution.ts` (new); `src/run_underdog_optimizer.ts`; `src/run_optimizer.ts`; `tests/phase17s_final_selection_reason_attribution.spec.ts`; `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Tests added/updated:** `tests/phase17s_final_selection_reason_attribution.spec.ts` (parity vs `filterAndOptimize` / `applyFinalSelectionToFormatEntries`, PP/UD attribution, export-cap separation, static wiring).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17s_final_selection_reason_attribution.spec.ts tests/phase17r_final_selection_observability.spec.ts tests/phase17q_site_invariant_final_selection_policy.spec.ts tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts`; `npm run verify:canonical` (**passed**).
- **Current state:** Removal/adjustment reasons are **typed**, **countable**, and **tied to shared pipeline helpers** — not reconstructed from CSV.
- **Risks / follow-ups:** Anti-dilution is reported as **adjustments** (before→after structure keys in stage breakdowns), not as volume removals; if SelectionEngine later adds cross-card suppression, extend codes + attribution in policy first.

### Phase 17T — End-to-end site-invariant runtime contract audit

- **Assumptions:** The contract table is **repo-backed** and **deterministic** — it documents where PP and UD share canonical modules vs approved **irreducible** divergence. It does **not** execute the pipeline. **Non-math variance bugs** are fail-closed: any row classified `non_math_variance_bug` or any entry in `explicitNonMathVarianceBugs` forces verdict **`non_compliant`**. Baseline table keeps **zero** such rows.
- **Purpose:** One operator-facing audit covering **`EVALUATION_BUCKET_ORDER`** plus **Phase 17R/17S** reporting stages; proves site-invariant policy is satisfied end-to-end subject to explicit irreducible math/input semantics.
- **Artifacts:** `data/reports/latest_site_invariant_runtime_contract.json`, `data/reports/latest_site_invariant_runtime_contract.md`.
- **Implementation:** `src/reporting/site_invariant_runtime_contract.ts` — `getSiteInvariantRuntimeContractStages`, `buildSiteInvariantRuntimeContractReport`, `formatSiteInvariantRuntimeContractMarkdown`, `writeSiteInvariantRuntimeContractArtifacts`, `writeSiteInvariantRuntimeContractFromRun`. **Wired** from `src/run_optimizer.ts` on the same paths as Phase 17R/17S (`--platform ud`, PP early exits with UD, no-viable-PP-structures + UD, full success).
- **Verdict constants:** `SITE_INVARIANT_VERDICT_COMPLIANT` | `SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE` | `SITE_INVARIANT_VERDICT_NON_COMPLIANT`; divergence: `shared_same_canonical_implementation` | `irreducible_platform_math` | `irreducible_platform_input_semantics` | `non_math_variance_bug`.
- **Retained irreducible differences (baseline):** Ingest/normalize (different prop sources & CSV writers); shared_eligibility + platform_math (UD factor, `udMinEdge`, std/boost tiers per `APPROVED_PLATFORM_MATH_VARIANCE`); structure_evaluation (PP vs UD evaluators + registries); render_input (PP optional innovative/tracker vs UD noop bucket per 17L). **Merge** (`match_merge`), **final selection + export policy**, **17R/17S reporting** = shared canonical modules.
- **Non-math variance bugs (baseline):** **none** recorded — if discovered, fix in code + update table or list under `explicitNonMathVarianceBugs`.
- **Files changed:** `src/reporting/site_invariant_runtime_contract.ts` (new); `src/run_optimizer.ts`; `tests/phase17t_site_invariant_runtime_contract.spec.ts`; `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section + CURRENT_OBJECTIVE).
- **Tests added/updated:** `tests/phase17t_site_invariant_runtime_contract.spec.ts` (bucket order alignment, verdict rules, determinism, static wiring).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17t_site_invariant_runtime_contract.spec.ts tests/phase17s_final_selection_reason_attribution.spec.ts tests/phase17r_final_selection_observability.spec.ts tests/phase17q_site_invariant_final_selection_policy.spec.ts tests/phase17p_site_invariant_post_eligibility_optimization.spec.ts tests/phase17o_site_invariant_card_construction_gates.spec.ts tests/phase17n_site_invariant_eligibility_enforcement.spec.ts`; `npm run verify:canonical` (**passed**).
- **Current state:** Runtime contract artifact is **versioned** (`SITE_INVARIANT_RUNTIME_CONTRACT_SCHEMA_VERSION`); **fail-closed** on explicit bugs; irreducible differences **listed** for audits.
- **Risks / follow-ups:** Contract rows are **maintained manually** when architecture changes — update `getSiteInvariantRuntimeContractStages()` and tests when adding buckets or moving decision logic.

### Phase 17U — Repo hygiene and dead-code audit

- **Assumptions:** Audit rows are **curated** (not a full static analyzer). **No** EV/breakeven/registry/combinatorics changes. **Safe removals** only with strong evidence; first pass avoids deleting large or ambiguous sources. **`dist/**`** remains build output (gitignored) — listed as **keep_needs_review** (do not treat as source).
- **Purpose:** Deterministic maintenance snapshot: dead-code **candidates**, superseded-module **notes**, stale-doc **fixes**, scripts/tests **coverage**, and **`safeRemovalsPerformed`** for actions taken in the phase.
- **Artifacts:** `data/reports/latest_repo_hygiene_audit.json`, `data/reports/latest_repo_hygiene_audit.md`.
- **Implementation:** `src/reporting/repo_hygiene_audit.ts` — `getRepoHygieneAuditCandidates`, `buildRepoHygieneAuditReport`, `formatRepoHygieneAuditMarkdown`, `writeRepoHygieneAuditArtifacts`, `writeRepoHygieneAuditFromRun`, `PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED`, **`PHASE17V_*`** execution constants (Phase **17V**). **Wired** from `src/run_optimizer.ts` immediately after Phase **17T** writes (same four paths as 17R–17T).
- **Classifications:** `safe_remove` | `safe_archive` | `keep_active` | `keep_needs_review` — exactly one per candidate.
- **Safe removals performed (Phase 17U baseline):** (1) **Documentation:** removed broken external refactor-report link in **CURRENT_OBJECTIVE** (replaced with pointer to this file + Phase 17T). (2) **Tests:** added **`tests/phase16_tier1_scarcity_attribution.spec.ts`** to **`npm run verify:canonical`** so Tier1 scarcity tests run in the canonical Jest bundle.
- **Keep / archive / review (examples from table):** **keep_active** — shared policy modules, `math_models`, `fetch_props`, `server.ts`, **`src/fetch_oddsapi_legacy_alias.ts`** (canonical OddsAPI legacy alias), **`src/fetch_oddsapi_odds.ts`** (Phase 17W compatibility shim), **`tools/archive/validation/tweak_backtest.ts`** (archived offline CLI; Phase 17V). **keep_needs_review** — `src/scripts/scrape_underdog_champions.ts` (manual CLI), `dist/**`. **safe_archive** — *(queue empty after Phase 17V archive execution for tweak backtest)*. **safe_remove** — stale doc reference class (resolved via doc edit, not file delete).
- **Non-math variance bugs found:** **none** in this pass (no runner logic changed).
- **Files changed:** `src/reporting/repo_hygiene_audit.ts` (new); `src/run_optimizer.ts`; `docs/PROJECT_STATE.md`; `package.json` (`verify:canonical`); `tests/phase17u_repo_hygiene_audit.spec.ts`.
- **Tests added/updated:** `tests/phase17u_repo_hygiene_audit.spec.ts`; `verify:canonical` now includes `phase16_tier1_scarcity_attribution.spec.ts`.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17u_repo_hygiene_audit.spec.ts tests/phase17t_site_invariant_runtime_contract.spec.ts tests/phase16_tier1_scarcity_attribution.spec.ts`; `npm run verify:canonical` (**passed**).
- **Current state:** Hygiene audit is **versioned** (`REPO_HYGIENE_AUDIT_SCHEMA_VERSION` **2** since Phase **17V** — adds execution-summary arrays); operators can diff JSON across runs for classification changes.
- **Risks / follow-ups:** Expand automated **reference scans** later (optional `grep`-based CI step).

### Phase 17V — Safe archive / removal execution (hygiene follow-through)

- **Assumptions:** Execute **only** Phase **17U** items with **strong evidence** — **no** ambiguous file deletes, **no** changes to optimizer EV/breakeven/registry/combinatorics, **no** edits under **`math_models/**`**, shared policy modules, bucket pipeline, or reporting modules beyond **`repo_hygiene_audit.ts`**. **`dist/**`** treatment unchanged. **`fetch_oddsapi_odds.ts`** not renamed in this phase.
- **Purpose:** Evidence-backed, reversible **archive-first** cleanup; extend hygiene JSON/MD with **`archivedThisPhase`**, **`removedThisPhase`**, **`skippedNeedsReview`** (`REPO_HYGIENE_AUDIT_SCHEMA_VERSION` **2**).
- **Files inspected:** `src/reporting/repo_hygiene_audit.ts`; `src/run_optimizer.ts` (unchanged wiring); `src/run_underdog_optimizer.ts`; `src/calculate_ev.ts`; `package.json`; `tests/phase17u_repo_hygiene_audit.spec.ts`; `tests/phase17t_site_invariant_runtime_contract.spec.ts`; `src/validation/tweak_backtest.ts` (pre-move); Phase 17U candidate table.
- **Files changed:** `src/reporting/repo_hygiene_audit.ts` (schema **v2**, execution fields, candidate row for archived tweak script, `PHASE17V_*` constants); **deleted** `src/validation/tweak_backtest.ts`; **added** `tools/archive/README.md`, `tools/archive/validation/tweak_backtest.ts` (imports via `../../../src/...` for optional `ts-node` use); `tests/phase17v_safe_archive_execution.spec.ts`; `tests/phase17u_repo_hygiene_audit.spec.ts` (markdown order + schema v2 defaults); `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md` (this section).
- **Archive / remove actions executed:**
  - **Archived:** `src/validation/tweak_backtest.ts` → `tools/archive/validation/tweak_backtest.ts` (offline-only CLI; not referenced by entrypoints, `verify:canonical`, or canonical tests).
  - **Removed:** *(none — no `safe_remove` file targets met the zero-reference bar without ambiguity.)*
- **Skipped (needs review):** Recorded in `PHASE17V_SKIPPED_NEEDS_REVIEW` — at 17V snapshot included **`fetch_oddsapi_odds.ts`** rename deferral *(resolved in Phase **17W**)*; **`scrape_underdog_champions.ts`**, **`dist/**`**, and **no ambiguous mass deletes**.
- **Tests added/updated:** `tests/phase17v_safe_archive_execution.spec.ts`; `tests/phase17u_repo_hygiene_audit.spec.ts` (section order + schema v2 empty-array defaults).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17v_safe_archive_execution.spec.ts`; `npx jest --config jest.config.js tests/phase17u_repo_hygiene_audit.spec.ts`; `npx jest --config jest.config.js tests/phase17t_site_invariant_runtime_contract.spec.ts`; `npm run verify:canonical`.
- **Current state:** Hygiene audit artifacts written from runs include Phase **17V** execution arrays; **`safe_archive` candidate queue** for tweak backtest is **resolved** (file lives under **`tools/archive/`** as **keep_active** archive).
- **Risks / follow-ups:** Optional **`tsconfig`** include for **`tools/archive`** if typed CI checks on archived scripts are desired. *(OddsAPI legacy filename cleanup: Phase **17W**.)*

### Phase 17W — Behavior-neutral legacy naming cleanup (OddsAPI alias)

- **Assumptions:** **No** EV/breakeven/registry/combinatorics changes; **no** edits to **`math_models/**`**, shared policy modules, bucket pipeline, or selection/reporting modules except **`repo_hygiene_audit.ts`** hygiene metadata. **`dist/**`** unchanged. **`scrape_underdog_champions.ts`** untouched. Rename must be **behavior-neutral** (same exports and call graph semantics).
- **Purpose:** Replace misleading **`fetch_oddsapi_odds.ts`** filename with a canonical module name reflecting the actual role: thin OddsAPI legacy alias over **`fetch_oddsapi_props.ts`** (`fetchSgoPlayerPropOdds` + **`DEFAULT_MARKETS`**). Preserve backward compatibility via a **tiny re-export shim** at the old path.
- **Files inspected:** `src/fetch_oddsapi_odds.ts` (pre-change); `src/scripts/report_single_bet_ev.ts`; `src/run_optimizer.ts`; `src/fetch_oddsapi_props.ts`; `src/fetch_oddsapi.ts` (comment); `src/reporting/repo_hygiene_audit.ts`; repo-wide grep for `fetch_oddsapi_odds` / `fetchSgoPlayerPropOdds`.
- **Files changed:** **Added** `src/fetch_oddsapi_legacy_alias.ts` (canonical implementation moved verbatim from former `fetch_oddsapi_odds.ts`). **Replaced** `src/fetch_oddsapi_odds.ts` with **compatibility shim** (`export { DEFAULT_MARKETS, fetchSgoPlayerPropOdds } from "./fetch_oddsapi_legacy_alias"`). **Updated** `src/scripts/report_single_bet_ev.ts` to import from **`fetch_oddsapi_legacy_alias`**. **Updated** `src/fetch_oddsapi.ts` JSDoc pointer. **Updated** `src/reporting/repo_hygiene_audit.ts` — candidate rows for **`fetch_oddsapi_legacy_alias.ts`** + **`fetch_oddsapi_odds.ts`** (**keep_active**); removed **`fetch_oddsapi_odds`** rename deferral from **`PHASE17V_SKIPPED_NEEDS_REVIEW`**; added **`PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY`**; **`auditRevisionNote`** mentions Phase 17W. **`tests/phase17w_legacy_naming_cleanup.spec.ts`**; **`tests/phase17u_repo_hygiene_audit.spec.ts`** (`verify:canonical` list); **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`** (this section).
- **Behavior-neutral cleanup executed:** Canonical **`src/fetch_oddsapi_legacy_alias.ts`**; legacy path **`src/fetch_oddsapi_odds.ts`** = **re-export only** (temporary compatibility glue; prefer canonical imports in new code).
- **Hygiene-audit status change:** **`fetch_oddsapi_odds.ts`** no longer **`keep_needs_review`** for misleading name — split into **`keep_active`** canonical + **`keep_active`** shim; **`PHASE17V_SKIPPED_NEEDS_REVIEW`** no longer lists rename deferral for this file; deterministic summary in **`PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY`**.
- **Tests added/updated:** `tests/phase17w_legacy_naming_cleanup.spec.ts`; `tests/phase17u_repo_hygiene_audit.spec.ts` (canonical bundle includes `phase17w`).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17w_legacy_naming_cleanup.spec.ts`; `npx jest --config jest.config.js tests/phase17v_safe_archive_execution.spec.ts`; `npx jest --config jest.config.js tests/phase17u_repo_hygiene_audit.spec.ts`; `npx jest --config jest.config.js tests/phase17t_site_invariant_runtime_contract.spec.ts`; `npm run verify:canonical`.
- **Current state:** Active script import uses **`fetch_oddsapi_legacy_alias`**; old filename remains a **stable shim** for any external/legacy `import` paths.
- **Risks / follow-ups:** Remove **`fetch_oddsapi_odds.ts`** shim after confirming no out-of-repo consumers; optional follow-up rename of **`fetchSgoPlayerPropOdds`** identifier (separate phase — would touch more call sites).

### Phase 17X — Eliminate `cli_args` import-time side effects

- **Assumptions:** **No** EV/breakeven/registry/combinatorics changes; **no** new CLI flags; **same** defaults and **`parseCliArgsImpl`** behavior as pre-17X. Entrypoints remain **`run_optimizer.ts`** and **`run_underdog_optimizer.ts`** (plus **`scripts/run-generate.js`** → `require(run_optimizer)`). **`parseArgs(override)`** for tests/scripts stays behavior-neutral.
- **Purpose:** Stop **`import "./cli_args"`** from parsing **`process.argv`** or **`process.exit`** for **`--help`** / **`--print-effective-config`** at module load (Jest noise + untrustworthy tests). Make parsing **explicit** via **`optimizer_cli_bootstrap`** + **`setCliArgsForProcess`** / **`getCliArgs()`**.
- **Files inspected:** `src/cli_args.ts`; `src/run_optimizer.ts`; `src/run_underdog_optimizer.ts`; `scripts/run-generate.js`; grep for **`cli_args`** / **`cliArgs`** / **`parseArgs`**.
- **Files changed:** **`src/cli_args.ts`** — removed top-level **`export const cliArgs = parseArgs()`** and import-time **`help`/`printEffective-config`** exits; inner parser renamed **`parseCliArgsImpl`**; exported **`parseArgs`**, **`getDefaultCliArgs`**, **`resolveCliArgsFromProcessArgv`**, **`setCliArgsForProcess`**, **`getCliArgs`**, **`handleCliArgsEarlyExit`**, **`resetCliArgsResolutionForTests`** (Jest), **`cliArgs` Proxy** (lazy reads); **`printEffectiveConfig(cli?)`**. **Added** **`src/optimizer_cli_bootstrap.ts`**. **`run_optimizer.ts` / `run_underdog_optimizer.ts`** — first import **`./optimizer_cli_bootstrap`** (replaces **`./load_env`**; bootstrap imports **`load_env`**). **`run()`** uses **`getCliArgs()`** instead of **`parseArgs()`**. **`tests/phase17x_cli_args_side_effect_free.spec.ts`**; **`tests/phase17u_repo_hygiene_audit.spec.ts`**; **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`** (this section).
- **Side-effect removal:** Importing **`cli_args`** alone does **not** parse argv or exit; **`run_optimizer`** / **`run_underdog`** load **`optimizer_cli_bootstrap`** first, which **`resolveCliArgsFromProcessArgv()`** → **`handleCliArgsEarlyExit`** → **`setCliArgsForProcess`**.
- **Tests added/updated:** `tests/phase17x_cli_args_side_effect_free.spec.ts`; `tests/phase17u_repo_hygiene_audit.spec.ts` (canonical bundle lists `phase17x`).
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase17x_cli_args_side_effect_free.spec.ts`; `npx jest --config jest.config.js tests/phase17w_legacy_naming_cleanup.spec.ts`; `npx jest --config jest.config.js tests/phase17u_repo_hygiene_audit.spec.ts`; `npx jest --config jest.config.js tests/phase17t_site_invariant_runtime_contract.spec.ts`; `npm run verify:canonical`.
- **Current state:** Optimizer **`dist`** entry continues to work: **`run_optimizer.js`** evaluates bootstrap before downstream imports; **`cliArgs`** remains a **lazy Proxy** for legacy **`cliArgs.foo`** call sites.
- **Risks / follow-ups:** Non-entry **`parseArgs()`** without prior **`setCliArgsForProcess`** still parses **`process.argv`** (intended for unit tests). Long-term: thread **`CliArgs`** explicitly into engines and drop the Proxy. Former **`src/__tests__/cli_*.test.ts`** → **`tests/phase19d_cli_contract.spec.ts`** (**Phase 19D**); **`src/__tests__/`** is empty.

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
- **Telegram high-EV digest contract:** Operator-visible digest shape (golden strings, metadata token style `<n>L` / `edge x.x%` / `BE ±x.xpp`) is locked in `tests/phase16l_telegram_digest.spec.ts` — intentional format changes must update those tests and include operator-facing rationale (see governance comments in that file).
- **Diagnosis of "optimizer" error (historical):** The PowerShell script writes `error: "optimizer"` whenever the Node process (run_optimizer.js) exits with non-zero. Common causes: no live odds (ODDSAPI_KEY missing/fail), guardrail (PP merge ratio &lt; 12%), or runtime crash. Response parsing was hardened: `httpGet` uses `res.text()` + `JSON.parse()` and throws a clear error if the body is empty or invalid JSON.
- **SGO/TRD cleanup:** Branch `cleanup/remove-sgo-trd` merged to main 2026-03-12 (merge commit `f8ce07fa437463ffaba781f42af101a9d198470b`). Pipeline is OddsAPI-only; all SGO/TRD dead code removed or deprecated. No SGO/TRD references in active pipeline output.
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

0. **2026-03-21 (Phase 23):** `src/reporting/canonical_sample_artifacts_ui.ts`; `web-dashboard/src/components/CanonicalSamplesPanel.tsx`; `web-dashboard/src/App.tsx`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`; `tests/phase23_canonical_samples_ui.spec.ts`; `package.json` (`verify:canonical`); `docs/PROJECT_STATE.md`.
0. **2026-03-21 (Phase 22):** `src/reporting/canonical_sample_contract.ts`; `src/reporting/canonical_sample_artifacts_validate.ts`; `src/reporting/canonical_sample_artifacts_consumer.ts`; `src/reporting/canonical_sample_artifacts.ts` (contract import); `scripts/sync_canonical_samples_to_web_dashboard.ts`; `web-dashboard/src/lib/canonicalSamples.ts`; `web-dashboard/vite.config.ts`; `web-dashboard/tsconfig.json`; `web-dashboard/public/data/canonical_samples/*.json`; `docs/CANONICAL_SAMPLES_DASHBOARD.md`; `tests/phase22_canonical_sample_dashboard_consumer.spec.ts`; `package.json` (`sync:canonical-samples-dashboard`, `verify:canonical`); `docs/PROJECT_STATE.md`.
0. **2026-03-21 (Phase 21):** `src/reporting/canonical_sample_artifacts.ts` (`verifyCanonicalSampleArtifactsDrift`); `scripts/verify_canonical_sample_artifacts.ts`; `tests/phase21_canonical_sample_artifacts_drift.spec.ts`; `package.json` (`verify:canonical-samples`, `verify:canonical`); `docs/PROJECT_STATE.md`.
0. **2026-03-21 (Phase 20):** `src/reporting/canonical_sample_artifacts.ts`; `scripts/generate_canonical_sample_artifacts.ts`; `data/samples/fixtures/underdog_cards_source.json`; `artifacts/samples/*.json`; `.gitignore` (track `artifacts/samples/`); `tests/phase20_canonical_sample_artifacts.spec.ts`; `package.json` (`generate:canonical-samples`, `verify:canonical`); `docs/PROJECT_STATE.md`.
0. **2026-03-20 (Phase 19D):** `tests/phase19d_breakeven_invariants.spec.ts`, `tests/phase19d_exact_line_merge.spec.ts`, `tests/phase19d_cli_contract.spec.ts`, `tests/phase19d_odds_snapshot.spec.ts`, `tests/phase19d_odds_calibration_step3.spec.ts`; removed migrated `src/__tests__/*.test.ts`; `verify:canonical` adds five `phase19d_*`; `docs/PROJECT_STATE.md`.
0. **2026-03-20 (Phase 19C):** `tests/phase19c_engine_parity.spec.ts` (canonical); removed `src/__tests__/engine_parity.test.ts`; `verify:canonical` adds `phase19c`; `docs/PROJECT_STATE.md`.
0. **2026-03-20 (Phase 19B):** `tests/phase19a_env_example_contract.spec.ts` (Phase 19B ordered `KEY=value` parity); `.env.example` + `config/.env.example` headers; `README.md`; `docs/PROJECT_STATE.md`.
0. **2026-03-20 (Phase 19A):** `.env.example` (repo root); `config/.env.example` (mirror); `tests/phase19a_env_example_contract.spec.ts`; `verify:canonical` adds `tests/e2e.spec.ts` + `phase19a`; `README.md`; `docs/PROJECT_STATE.md`.
0. **2026-03-20 (Phase 18F):** `tests/phase18f_global_cli_inventory.spec.ts` (runtime `src` `getCliArgs` / `cliArgs` import boundaries); `verify:canonical` adds `phase18f`; `docs/PROJECT_STATE.md` (inventory table).
0. **2026-03-20 (Phase 18E):** `merge_odds.ts` (required `cli: CliArgs` on `mergeWithSnapshot` / `mergeOddsWithProps*`; no `resolveMergeCli` / `getCliArgs`); phase 9 / 11–14 merge specs + `src/__tests__/exact_line_merge.test.ts`; `tests/phase18e_merge_odds_explicit_cli.spec.ts`; `tests/phase17y_explicit_cli_args_threading.spec.ts`; `verify:canonical` adds `phase18e`.
0. **2026-03-20 (Phase 18D):** `pp_engine.ts` (`createPrizepicksEngine(cli: CliArgs)`; no `ppEngine` singleton); engine parity then `src/__tests__/engine_parity.test.ts` *(→ **`tests/phase19c_engine_parity.spec.ts`**, Phase **19C**)*; `tests/phase17k_runtime_decision_pipeline.spec.ts`; `tests/phase18d_pp_engine_explicit_cli.spec.ts`; `verify:canonical` adds `phase18d`.
0. **2026-03-20 (Phase 18C):** `ud_engine.ts` (`createUnderdogEngine(cli: CliArgs)`; no `udEngine` singleton); engine parity then `src/__tests__/engine_parity.test.ts` *(→ **`tests/phase19c_engine_parity.spec.ts`**, Phase **19C**)*; `tests/phase18c_ud_engine_explicit_cli.spec.ts`; `verify:canonical` adds `phase18c`.
0. **2026-03-20 (Phase 18B):** `run_underdog_optimizer.ts` (`args` snapshot; `filterEvPicksForEngine` requires `CliArgs`); `tests/phase18b_run_underdog_explicit_args.spec.ts`; `tests/phase17y_explicit_cli_args_threading.spec.ts`; `verify:canonical` adds `phase18b`.
0. **2026-03-20 (Phase 18A):** `run_optimizer.ts` (no `cliArgs` import; `args` for orchestration; `runSheetsPush(runTimestamp, cli)`); `tests/phase18a_run_optimizer_explicit_args.spec.ts`; `tests/e2e.spec.ts`; `verify:canonical` adds `phase18a`.
0. **2026-03-20 (Phase 17Z):** `src/card_ev.ts` (`evaluateFlexCard` + `minCardEvFallback`); `src/build_innovative_cards.ts` (`cli?` on options); `src/telegram_pusher.ts` (`telegramDryRun` explicit); `run_optimizer.ts` (`buildCardsForSize` / `evaluateFlexCard` / innovative / UD Telegram); `tests/phase17z_explicit_cli_runtime_helpers.spec.ts`; `verify:canonical` adds `phase17z`.
0. **2026-03-20 (Phase 17Y):** `src/merge_odds.ts` (explicit `fetchFreshOdds` cli); `src/pp_engine.ts` / `src/ud_engine.ts` (constructor `CliArgs`); `run_optimizer.ts` (`args` → merge + `createPrizepicksEngine`); `run_underdog_optimizer.ts` (`runUnderdogOptimizer(..., cli)`, merge + `writeUnderdogCardsToFile`); `tests/phase17y_explicit_cli_args_threading.spec.ts`; `verify:canonical` adds `phase17y`.
0. **2026-03-20 (Phase 17X):** `src/cli_args.ts` (no import-time parse/exit); `src/optimizer_cli_bootstrap.ts`; `run_optimizer.ts` / `run_underdog_optimizer.ts` bootstrap-first; `tests/phase17x_cli_args_side_effect_free.spec.ts`; `verify:canonical` adds `phase17x`.
0. **2026-03-20 (Phase 17W):** `src/fetch_oddsapi_legacy_alias.ts` (canonical); `src/fetch_oddsapi_odds.ts` (shim); `report_single_bet_ev` → canonical import; `repo_hygiene_audit.ts` + `PHASE17W_LEGACY_NAMING_CLEANUP_SUMMARY`; `tests/phase17w_legacy_naming_cleanup.spec.ts`; `verify:canonical` adds `phase17w`.
0. **2026-03-20 (Phase 17V):** `src/reporting/repo_hygiene_audit.ts` schema v2 + `PHASE17V_*` execution summaries; `tools/archive/validation/tweak_backtest.ts` (moved from `src/validation/`); `tests/phase17v_safe_archive_execution.spec.ts`; `verify:canonical` adds `phase17v`.
0. **2026-03-20 (Phase 17U):** `src/reporting/repo_hygiene_audit.ts`; `run_optimizer.ts` writes hygiene audit; `docs/PROJECT_STATE.md` stale link fix; `verify:canonical` adds `phase16_tier1_scarcity_attribution` + `phase17u` tests.
0. **2026-03-20 (Phase 17T):** `src/reporting/site_invariant_runtime_contract.ts`; `run_optimizer.ts` writes contract artifacts; tests `tests/phase17t_site_invariant_runtime_contract.spec.ts`; `verify:canonical` updated.
0. **2026-03-20 (Phase 17S):** `src/reporting/final_selection_reason_attribution.ts` + `attributeFilterAndOptimizeBatch` / `attributeFinalSelectionUdFormatEntries` in `shared_final_selection_policy.ts`; wiring in `run_optimizer.ts` / `run_underdog_optimizer.ts`; tests `tests/phase17s_final_selection_reason_attribution.spec.ts`; `verify:canonical` updated.
0. **2026-03-20 (Phase 17R):** `src/reporting/final_selection_observability.ts` + wiring in `run_optimizer.ts` / `run_underdog_optimizer.ts`; tests `tests/phase17r_final_selection_observability.spec.ts`; `verify:canonical` updated.
0. **2026-03-20 (Phase 17M):** PP **8/8 bucket parity**: `src/run_optimizer.ts` wraps `structure_evaluation` → `selection_export` → `render_input` in `runBucketSlice("pp", PP_SLICE_STRUCT_RENDER, …)`; PP legs/card CSV+JSON exports live in **`selection_export`**; insufficient-legs path uses same three tail bucket names. Tests: `tests/phase17m_full_bucket_parity.spec.ts`; `verify:canonical` updated.
0. **2026-03-20 (Phase 17L):** Canonical evaluation buckets: `src/pipeline/evaluation_buckets.ts` (`runBucketSlice`, `runSingleBucket`, shared types + `APPROVED_PLATFORM_MATH_VARIANCE`). `src/run_underdog_optimizer.ts` routes live/mock/shared paths through bucket slices; `src/run_optimizer.ts` routes ingest→shared_eligibility and platform_math through buckets. Tests: `tests/phase17l_bucketed_evaluation_architecture.spec.ts`; `verify:canonical` updated.
0. **2026-03-20 (Phase 17H):** Fatal run status: `outcome: fatal_exit`, `fatalReason`, `emitFatalRunStatus` / `buildFatalExitRunStatus` before `process.exit(1)` on guardrail and JSON failure paths; `uncaught_run_error` in `run().catch`. Tests: `tests/phase17h_fatal_exit_run_status.spec.ts`.
0. **2026-03-20 (Phase 17G):** Extended run status with `outcome` / `earlyExitReason`; same artifacts written on early-exit branches (`insufficient_eligible_legs`, `no_viable_structures`) via `buildEarlyExitRunStatus` + `tryWriteRunStatusArtifacts`. Tests: `tests/phase17g_early_exit_run_status.spec.ts`.
0. **2026-03-20 (Phase 17F):** Canonical run status artifacts `data/reports/latest_run_status.json` + `latest_run_status.md` from `src/reporting/run_status.ts`, wired at successful completion in `src/run_optimizer.ts`. Tests: `tests/phase17f_run_status.spec.ts`.
0. **2026-03-20 (Phase 17E):** Documented cross-link in this file to `tests/phase16l_telegram_digest.spec.ts` as the canonical Telegram high-EV digest UX/golden contract location (docs-only).
0. **2026-03-20 (Phase 16T):** Added coverage accumulation tooling: backfill now consumes archived tier/legs CSVs and carries richer metadata (`gameStartTime`, ids, open odds context) into `perf_tracker.jsonl` when available. Added `export:coverage-diagnostics` with CLV matchability reason counts and integrated it into `refresh:model-artifacts`.
0. **2026-03-20 (Phase 16U):** Added conservative start-time recovery for existing perf rows using `data/output_logs/*-legs.json` sources (exact `leg_id`, fallback normalized key with conflict-skip, no overwrite). Added `export:snapshot-gaps` (`src/tracking/export_snapshot_coverage_gaps.ts`) to surface rows missing start time, rows with post-start-only snapshots, and rows with start but no pre-start snapshot; integrated into `refresh:model-artifacts`.
0. **2026-03-20 (Phase 16V):** Added `export:ops-playbook` (`src/tracking/export_ops_coverage_playbook.ts`) to generate a compact operational coverage artifact with readiness status, coverage counts, row-level action categories, and priority action plan. Added final minimal historical metadata harvest fallback from `data/oddsapi_today.json` (player/stat/line/commenceTime) with conflict-skip and no-overwrite guarantees. `refresh:model-artifacts` now includes ops playbook export.
0. **2026-03-20 (Phase 16X):** Added Windows-friendly post-run automation wrappers for local scheduling: `scripts/post_run_model_refresh.ps1` (`capture:snapshot` then `refresh:model-artifacts`) and `scripts/run_with_post_refresh.ps1` (main command then conditional post-refresh). Both append structured JSON-line logs to `data/logs/post_run_model_refresh.log`. Added npm commands `postrun:model-refresh` and `run:with-post-refresh`.
1. **2026-03-20 (Phase 16S):** Added calibration readiness + coverage automation: `export:calibration-readiness` (`src/tracking/export_calibration_readiness.ts`) and `refresh:model-artifacts` (`src/tracking/refresh_model_artifacts.ts`). Calibration is now double-gated (artifact `activeInOptimizer` + readiness `ready`) so sparse data cannot silently activate calibration.
2. **2026-03-20 (Phase 16R):** Added explicit probability calibration layer + auditability: `src/modeling/probability_calibration.ts`, `export:calibration`, and `audit:calibration-impact`. Raw vs calibrated probabilities are preserved on EV legs and tracker exports; optimizer activation is controlled by `artifacts/probability_calibration.json` (`activeInOptimizer`).
3. **2026-03-20 (Phase 16Q):** Added model evaluation export layer: `export:model-eval` (`src/tracking/export_model_evaluation.ts`) writes `artifacts/model_evaluation.json` + `.md` with calibration buckets, Brier/log-loss scoring, CLV positive-vs-negative summaries, and compact segment splits (platform/stat/side/structure) using resolved `perf_tracker.jsonl` rows only.
1. **2026-03-20 (Phase 16P):** Added `capture:snapshot` (`src/tracking/capture_odds_snapshot.ts`) for lightweight periodic `OddsAPI_*.json` accumulation from normalized cache, plus tracker game-time fallback from `prizepicks-legs.csv`/`underdog-legs.csv` when `pick.startTime` is missing. Improves CLV readiness without changing optimizer logic.
1. **2026-03-20 (Phase 16O):** Added `reconcile:clv` (`src/tracking/reconcile_closing_lines.ts`) to populate close odds/CLV from pre-start snapshots only, with conservative ambiguity skips and rerun-safe behavior. Counts logged: scanned/updated/skipped/ambiguous/post-start-only.
1. **2026-03-19 (Phase 16N):** CLV-ready fields on `perf_tracker` + dashboard tracker legs (`playerId`, `marketId`, open/close implied, `selectionSnapshot`); `deriveClvMetrics` in `src/tracking/clv_math.ts`; `export:model-data` → `artifacts/model_dataset.jsonl`; backfill uses `inferSide(leg_id)` for chosen-side implied prob. See `docs/MODEL_INPUT_AUDIT.md`.
1. **2026-03-19 (Phase 16M):** Tracker reporting: `GET /api/tracker/stats` returns period rollups (day/week/month/year/lifetime), top-leg aggregates, Kelly P/L fields; `analytics_engine` uses structure-aware realized payouts from `parlay_structures`; `run_optimizer` writes PP-only, UD-only, or merged PP+UD `pending_cards.json` with `structureId` + `kellyStakeUsd`. See `docs/MODEL_INPUT_AUDIT.md`.
2. **2026-03-19 (16L.1):** Removed dead `sgo-nba-backfill` npm script from `package.json`; README env sample updated for OddsAPI-first; `scripts/run_optimizer.ps1` header comment aligned with current pipeline.
3. **src/constants/paths.ts** — New; centralized OUTPUT_DIR, ARTIFACTS_DIR, DATA_DIR, getOutputPath/getArtifactsPath/getDataPath, filename constants.
4. **src/run_optimizer.ts** — Path constants, output dir creation, feature flag for innovative block, data validator call; **diagnostic** `[OPTIMIZER] Block start` log; **USE_MOCK_ODDS=1** / **effectiveMockLegs** for dry-test without live API; writeCardsCsv doc comment (CSV columns match sheets_push_cards.py → 23-col A–W Sheet).
5. **scripts/run_optimizer.ps1** — _paths.ps1, fail-fast Test-Path for output files, BANKROLL env log/clear, metrics from `data/output_logs`.
6. **src/fetch_oddsapi_props.ts** — Switched from axios to fetch() for MSW compatibility; internal httpGet() with timeout, status on !res.ok, and **res.text() + JSON.parse()** with clear error on non-JSON/empty body.
7. **src/constants/featureFlags.ts** — New; type-safe FeatureFlag, isFeatureEnabled(), ENABLE_INNOVATIVE_PARLAY / ENABLE_EXPERIMENTAL_PARLAY.
8. **src/mocks/handlers.ts** + **src/mocks/server.ts** — New; MSW handlers for Odds API (events list + event odds), 401/500 handlers for fail-fast tests. Handlers use `/events/` endpoint and quota headers for fetch_oddsapi_props tests.
9. **src/fetch_oddsapi_props.ts (2026-03-12):** Final 10-book list (draftkings,fanduel,pinnacle,lowvig,betmgm,espnbet,prizepicks,underdog,pick6,betr_us_dfs), 14 markets (10 standard + 4 alternate), no regions param; `[ODDS-QUOTA]` logging; 4h quota cache in data/odds_cache.json; guard when remaining &lt; 500. **src/fetch_props.ts** and **src/fetch_underdog_props.ts** — deprecation comments added (OddsAPI primary). **scripts/run_odds_quota_report.ts** — one-off live fetch and quota report.

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
- **Cache shape:** `data/odds_cache.json` stores **normalized** `InternalPlayerPropOdds[]` (flat array with `marketId` per row), **not** the raw API response (events/bookmakers).
- **Alt lines:** All 4 alternate markets are present in cache; consumed in `merge_odds.ts` alt-line second pass (`findBestAltMatch`) when main pass returns `line_diff`. Underdog confirmed has all 4 alternate marketIds in cache. PrizePicks alt lines (demons/goblins) are snapshot-dependent — present when PP has posted them, absent otherwise.

---

## KNOWN_GAPS

### SGO_CLEANUP — RESOLVED (merged to main 2026-03-12)

- **Status:** Main merge path is OddsAPI-only. Remaining `sgo`-prefixed names are legacy identifiers (type aliases, cache filenames, optional offline scripts) and do not change production PP/UD output. **2026-03-19:** Removed dead npm script `sgo-nba-backfill` — it invoked a non-existent `scripts/sgo_nba_backfill.ps1`.

### TRD_CLEANUP — RESOLVED (merged to main 2026-03-12)

- **live_liquidity.ts:** TheRundown API call removed; static liquidity only; dead API_BASE marked DEPRECATED.
- **run_underdog_optimizer.ts:** Provider logging uses `oddsapi_live` / `underdog_optimizer` only.
- **Remaining files:** check_therundown_alt_lines.ts and sgo_nba_historical.py have deprecation headers only (files kept). cli_args.ts had no --force-rundown/--rundown-only on this branch. ev_parlay.ts, sport_config.ts, normalize_odds.ts, run_optimizer.ps1, import_sources.ps1, quota-monitor.ps1 cleaned or already OddsAPI-only.

---

## TODO

1. ~~**Validate pipeline:** Set ODDSAPI_KEY in .env, run `scripts/run_optimizer.ps1` (or `npm run dry` then full run) and confirm artifacts/last_run.json status is success and `data/output_logs` contains expected CSVs. For a **dry-test without the API**, run with `USE_MOCK_ODDS=1` or `--mock-legs 50` and `--providers PP,UD` (TRD is not valid).~~ ✓ Pipeline validated 2026-03-12 (mock dry-test, last_run.json success, output_logs CSVs present).
2. **Run verifications:** `npm run verify:canonical` and `scripts/verify_wiring.ps1 -Flow all` (or as per project rules).
3. **Optional:** Add more MSW handlers or unit tests for other API callers; extend feature flags as needed via `src/constants/featureFlags.ts`.
4. **Automation — daily-run coverage:** Add to daily-run (or run-both) after optimizer: (b) archive legs+tiers (or switch daily-run to invoke `run_optimizer.ps1` so archive runs); (c) backfill tracker (`npx ts-node src/backfill_perf_tracker.ts`); (d) scrape prior-day results (`npx ts-node src/scrape_nba_leg_results.ts` or `scripts/track-results.ps1`). Optionally add explicit Telegram alert on script failure.
5. **Automation — Task Scheduler:** Register **DFS-DailyRun** and **DFS-TrackResults** if autonomous daily runs are desired; document next run times in AUTOMATION_STATUS after registration.

### Phase 44 — Merge dimensional diagnostics (additive artifacts only)

- **Assumptions:** Phase **43** analysis recommended additive rollups; **no** merge matching, tolerance, EV, breakeven, payout, combinatorics, ranking, or selection changes.
- **Purpose:** Deterministic **`data/reports/latest_merge_diagnostics.json`** + **`.md`** so operators can rank merge pain by **site / stat / sport / canonical reason** and by **match type** (main vs alt pool) without scanning raw **`drops[]`**.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_audit.ts`; `src/reporting/merge_quality.ts`; `src/merge_contract.ts`; `src/types.ts` (**`MergedPick`**); `src/reporting/final_selection_observability.ts` (**`stableStringifyForObservability`**).
- **Files changed:** **`src/reporting/merge_diagnostics.ts`** (**new**) — **`buildMergeDiagnosticsReport`**, **`writeMergeDiagnosticsArtifacts`**, **`formatMergeDiagnosticsMarkdown`**, **`getMergeDiagnosticsPaths`**; **`src/reporting/merge_audit.ts`** — call diagnostics write after **`writeMergeAuditArtifacts`** (before merge quality); **`tests/phase44_merge_diagnostics.spec.ts`** (**new**); **`package.json`** (**`verify:canonical`** includes **`tests/phase44_merge_diagnostics.spec.ts`**); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** Rollups from **`MergeAuditReport.drops`**: nested counts **`bySiteCanonical`**, **`byStatCanonical`**, **`bySportCanonical`**. From **`matchedBySite`**: **`lineKindBySite`** (exact / nearest / total). From **`merged`**: **`matchTypeBySite`** (**`main`** vs **`alt`**; omitted **`matchType` → main**), **`altPoolMatchesBySite`**, **`altPoolMatchCountByStat`**, **`lineDeltaHistogramByStat`** (same delta bucketing as audit: **`0`** or **`toFixed(2)`**). Echo **`mergedLineDeltaHistogram`**. JSON via **`stableStringifyForObservability`**; MD compact with caps on long stat/histogram lists.
- **Tests added/updated:** **`tests/phase44_merge_diagnostics.spec.ts`** — drop rollups, merged match-type / alt-by-stat / line-delta-by-stat, omitted **`matchType`**, artifact write + stable stringify.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase44_merge_diagnostics.spec.ts` (**pass**).
- **Current state:** Each **`finalizeMergeAuditArtifacts`** run writes merge diagnostics alongside the audit.
- **Risks / follow-ups:** Use these rollups to steer **mapping/feed** work before any tolerance changes.

### Phase 45 — Targeted merge improvement: stat normalization (single change)

- **Assumptions:** Phase **44** diagnostics on disk were **smoke-scale** (no drop counts); dominant real-world failure mode for **feed alignment** is **stat label mismatch** (same market, different string) between **PP/UD imports** and **OddsAPI** rows — **not** line tolerance. **One** behavioral change only.
- **Purpose:** Reduce **false `no_odds_stat` pre-filters** and **no_candidate** outcomes when **PTS** / **Points** / **`player_points`** / **`THREESMADE`** strings refer to the same **`stat`** as the odds feed after **`STAT_MAP`** resolution.
- **Root cause:** **`normalizeStatForMerge`** only looked up **`STAT_MAP[stat]`** with **no** case fold; **`buildPpStatsNotInOdds`** / **`buildUdStatsNotInOdds`** compared **raw** `pick.stat` and **`o.stat`** strings to the **dynamic odds stat set**, so **`PTS`** vs **`points`** were treated as **different markets** — picks were **skipped** before **`findBestMatch`** even when **`STAT_MAP`** would normalize both to **`points`**.
- **Chosen improvement (single):** (1) **`normalizeStatForMerge`**: trim, **`STAT_MAP`** direct key, then **`STAT_MAP[`**lower**`]`**; unmapped → trimmed string; add **`threesmade`** alias for **`threesMade`** lowercased. (2) **`buildPpStatsNotInOdds`** / **`buildUdStatsNotInOdds`**: build **`oddsStatSet`** from **`normalizeStatForMerge(String(o.stat))`** and compare **`normalizeStatForMerge(String(pickStat))`** so **dynamic stat filter** matches **merge candidate filtering**.
- **Files changed:** **`src/merge_odds.ts`** — **`STAT_MAP`**, **`normalizeStatForMerge`**, **`buildPpStatsNotInOdds`**, **`buildUdStatsNotInOdds`**; **`tests/phase45_merge_stat_normalization.spec.ts`** (**new**); **`package.json`** (**`verify:canonical`** includes **`tests/phase45_merge_stat_normalization.spec.ts`**); **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior change:** **No** EV/breakeven/payout/combinatorics/selection/tie-break changes. **Only** how **stat strings** are **normalized** for **(a)** merge matching (unchanged call sites, stricter alignment) and **(b)** **PP/UD “stat absent from feed”** sets — **fewer** incorrect **no_odds_stat** skips when **aliases** differ only by **case** or **known** **`STAT_MAP`** key.
- **Risk assessment:** **Low** — does **not** widen **line** tolerance or **juice**; **does not** invent new **StatCategory** values; unknown stats still **fail** closed (no `STAT_MAP` hit → raw string, likely absent from odds). **Determinism** preserved (**trim** + **lower** + fixed map).
- **Tests added/updated:** **`tests/phase45_merge_stat_normalization.spec.ts`** — PP pick **`PTS`** vs odds **`points`**; odds **`PTS`** vs pick **`points`**; **`THREESMADE`** vs **`threes`**; unknown stat still **no** merge.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase45_merge_stat_normalization.spec.ts tests/phase19d_exact_line_merge.spec.ts tests/phase39_merge_contract_and_audit.spec.ts` (**pass**).
- **Expected impact:** **Higher** merge **coverage** for the same odds and slate when **CSV/API** stat labels differ only by **casing** or **listed alias**; **no** new **false** line matches (same **player+stat+league** candidate logic).

### Phase 46 — Post-fix merge impact audit (analysis only)

- **Assumptions:** Phase **45** is **complete** (case-insensitive **`STAT_MAP`** + aligned **PP/UD dynamic stat filter**). This phase is **read-only** analysis — **no** merge logic edits, **no** EV/breakeven/payout/combinatorics/selection changes. The repo does **not** contain a **git-tracked** “pre–Phase 45” **full-slate** merge audit for numeric **before/after** coverage comparison.
- **Files inspected:** `docs/PROJECT_STATE.md` (Phases **43–45**); `data/reports/merge_quality_status.json`; `data/reports/latest_merge_quality.json` (not re-pasted — severity mirrors status); `data/reports/latest_merge_diagnostics.json`; `data/reports/latest_merge_audit.json`; `data/reports/merge_quality_summary.json` / **`merge_quality_baseline.json`** (referenced from prior phases; on-disk **baseline** may match seeded Phase **41** behavior).
- **Post-fix merge quality snapshot (workspace, latest on disk):** **`overallSeverity`:** **INFO**; **`mergeCoverage`:** **1**; **`fallbackRate`:** **0**; **`dropRate`:** **0**; **`latest_merge_audit`:** **2** raw props, **2** matched (**prizepicks**), **0** **`drops`**, **exactLineMatchCount=2**, **altLineFallbackCount=0**; **`latest_merge_diagnostics`:** empty **drop** rollups; **line kind** PP **exact=2, nearest=0**; **main=2, alt=0**. **Conclusion:** Current files are still **low-N** (not a full NBA slate); they **cannot** prove production **%** lift from Phase **45** — only that the pipeline **runs clean** at **INFO** with **no** merge drops in this sample.
- **Did Phase 45 measurably improve merge quality?** **Yes** in **contract**: **`tests/phase45_merge_stat_normalization.spec.ts`** proves **PTS/points** and **THREESMADE/threes** pairs **merge** where they previously hit **`no_odds_stat`** pre-filter. **Empirical production lift** requires **archived** audits (before/after) or a **full** run diff — **not** available in this analysis.
- **What improved from Phase 45 (mechanism):** **Alignment** between **dynamic “stat absent from odds”** logic and **`normalizeStatForMerge`** — fewer **incorrect** **`no_odds_stat`** skips for **case/alias**-only differences; merge **candidate** filter unchanged in **math**, **stricter** in **label** consistency.
- **Remaining dominant issues (cannot rank from current artifacts):** **`drops[]`** is **empty** — **no** **`no_match` / `line_mismatch` / `invalid_odds`** dominance today. From **architecture** and **Phase 43**, the next **likely** leaders on **full** slates remain: **`no_match`** (player/stat/slate vs OddsAPI), **`line_mismatch`** (line + alt pass), **`invalid_odds`** (juice), plus **pre-merge** **`skippedByReason`** (here all **0**). **Dimensions:** PP-only in snapshot — **no** UD cross-site comparison; **sport** single (**NBA** implied); **exact vs alt** — all **exact**, **no** alt pool usage in sample.
- **Safe next improvement candidates:** (1) **Operational:** timestamped **archive** of **`latest_merge_audit.json`** + **`latest_merge_diagnostics.json`** after **full** runs for **before/after** diffs. (2) **Additive diagnostics:** optional **name-key** rollup in diagnostics (**no** merge change) if **`drops`** show **`no_match`** concentration. (3) **Mapping:** expand **`PLAYER_NAME_ALIASES`** / **`STAT_MAP`** only when **dimensional** data shows **repeatable** patterns (avoid guesswork).
- **Risky candidates to defer:** **Wider line tolerance**, **juice** relaxation, **tie-break** or **alt-pool** geometry changes — **high false-match** risk without **dimensional** evidence.
- **Recommended next implementation phase:** **Phase 47 — Merge audit archival + diff workflow (additive tooling only)** — script or documented **`cp`** pattern to **`data/reports/archive/merge_<timestamp>/`** (or similar) plus optional **read-only** JSON diff of **coverage / drop rollups / severity** — **no** merge algorithm change; **unblocks** measuring Phase **45** on **real** slates and prioritizing **name** vs **feed** vs **mapping** work.
- **Normalization vs other work:** Another **broad** normalization pass is **not** justified **without** **post–Phase 45** **dimensional** **`no_match`** / **`byStatCanonical`** evidence; **first** add **archival + diff**, **then** target **one** mapping fix **data-driven**.
- **Validation commands run (agent):** Read-only inspection of **`data/reports/*.json`** listed above; **no** `npm test` required for analysis-only phase.

### Phase 47 — Merge audit archival + diff workflow (additive tooling only)

- **Assumptions:** Phase **46** complete; **no** merge matching, tolerance, EV, breakeven, payout, combinatorics, or selection changes — **file copy + read-only compare** only.
- **Purpose:** Preserve **full-run** merge JSON under **`data/reports/merge_archive/<snapshotId>/`** and **diff** two snapshots (coverage / drop / fallback / severity / canonical drop reasons / dimensional stat×reason lines) so Phase **45+** impact can be measured on **real** history.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_audit.ts` / `merge_quality.ts` / `merge_diagnostics.ts` (artifact names only); `.gitignore`; `package.json`.
- **Files changed:** **`src/reporting/merge_archive_diff.ts`** (**new**) — **`archiveMergeArtifacts`**, **`buildMergeArchiveDiffReport`**, **`formatMergeArchiveDiffMarkdown`**, **`resolveSnapshotIdFromReports`**, **`sanitizeSnapshotIdForPath`**; **`scripts/archive_merge_artifacts.ts`**, **`scripts/diff_merge_archives.ts`** (**new**); **`tests/phase47_merge_archive_diff.spec.ts`** (**new**); **`package.json`** — **`archive:merge`**, **`diff:merge-archives`**, **`verify:canonical`** includes **`tests/phase47_merge_archive_diff.spec.ts`**; **`.gitignore`** — **`data/reports/merge_archive/`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior added/changed:** **Archive:** copies **`latest_merge_audit.json`** → **`merge_audit.json`**, **`latest_merge_quality.json`** → **`merge_quality.json`**, **`latest_merge_diagnostics.json`** → **`merge_diagnostics.json`**, **`merge_quality_status.json`** → **`merge_quality_status.json`** into **`data/reports/merge_archive/<snapshotId>/`**. **`snapshotId`** defaults to **`merge_quality_status.generatedAtUtc`** with **`:` → `-`**, optional **`--label`** appends **`__<label>`**. Writes **`manifest.json`** (stable stringify). **Diff:** **`--left`** / **`--right`** snapshot dirs → stdout **Markdown**; optional **`--json-out`**. **No** writes to **`latest_*`** paths; archive path is the only new tree.
- **Tests added/updated:** **`tests/phase47_merge_archive_diff.spec.ts`** — sanitize, archive copy + manifest stability, diff deltas + deterministic MD, **`resolveSnapshotIdFromReports`**, root path.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase47_merge_archive_diff.spec.ts` (**pass**).
- **Current state:** Operators run **`npm run archive:merge`** after a full merge; **`npm run diff:merge-archives -- --left data/reports/merge_archive/<A> --right data/reports/merge_archive/<B>`** for evidence-based comparison.
- **Risks / follow-ups:** Archives are **gitignored** by default — copy or force-add for CI fixtures if needed.

### Phase 48 — Data-driven merge improvement (archive-validated, single change)

- **Assumptions:** Phase **47** complete (**`archive:merge`** / **`diff:merge-archives`**). **No** EV, breakeven, payout registry, combinatorics, ranking, filtering, or selection changes — **one** **`STAT_MAP`** extension only. Tracked **`tests/fixtures/merge_archive_phase48/`** pairs **A** (baseline dimensional pattern) and **B** (representative improved rollups) so CI can assert **`buildMergeArchiveDiffReport`** deltas without relying on **gitignored** **`data/reports/merge_archive/`**.
- **Files inspected:** `docs/PROJECT_STATE.md`; `src/fetch_underdog_props.ts` (NBA **`three_pointers_made`** / **`three_pointers`** → **`threes`**); `src/merge_odds.ts` (**`STAT_MAP`** / **`normalizeStatForMerge`**); `src/reporting/merge_archive_diff.ts`; `tests/phase47_merge_archive_diff.spec.ts`; `tests/phase45_merge_stat_normalization.spec.ts`; `data/reports/latest_merge_audit.json` (presence only — low‑N sample).
- **Baseline snapshot summary (root cause):** UD/PP import paths normalize 3PM props to **`threes`**, but raw pick keys **`three_pointers_made`** and **`three_pointers`** appear in feeds; **`STAT_MAP`** already had **`threes`**, **`player_threes`**, **`threepointersmade`**, etc., but **not** underscore forms — **`normalizeStatForMerge("three_pointers_made")`** returned the raw string, so it **did not** align with OddsAPI **`threes`** → dominant **`no_match`** / **`no_candidate`** for that stat pair (same as Phase **45** class: **label mismatch**, not line geometry).
- **Chosen improvement (single):** Add **`three_pointers_made: "threes"`** and **`three_pointers: "threes"`** to **`STAT_MAP`** (deterministic alias expansion; **no** tolerance change).
- **Files changed:** **`src/merge_odds.ts`** — **`STAT_MAP`**; **`tests/phase48_merge_archive_validated.spec.ts`** (**new**); **`tests/fixtures/merge_archive_phase48/snapshot_A_baseline/*`**, **`tests/fixtures/merge_archive_phase48/snapshot_B_after_stat_alias/*`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase48_merge_archive_validated.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior change:** **`normalizeStatForMerge`** maps **`three_pointers_made`** / **`three_pointers`** to canonical **`threes`**, so merge candidate filtering and **`findBestMatch`** see the same stat category as OddsAPI **`threes`** rows — **no** new **`StatCategory`** values; **no** line or juice logic touched.
- **Diff results (fixture A vs B):** **`mergeCoverage`** Δ **+0.45**, **`dropRate`** Δ **−0.45**, **`matched`** Δ **+9**, **`dropped`** Δ **−9**, **`no_match`** Δ **−9**, dimensional lines include **`three_pointers_made`** (read-only **`buildMergeArchiveDiffReport`** on tracked dirs). **Live** before/after: run **`npm run archive:merge -- --label <label>`** on the same slate pre/post change and **`npm run diff:merge-archives -- --left ... --right ...`**.
- **Risk assessment:** **Low** — same market as existing **`threes`** aliases; **no** fuzzy matching; unknown stats still fail closed. **False-match** risk is **not** increased (same **`threes`** bucket as **`player_threes`** / **`3pm`**).
- **Tests added/updated:** **`tests/phase48_merge_archive_validated.spec.ts`** — **`mergeWithSnapshot`** for **`three_pointers_made`** + **`three_pointers`** vs odds **`threes`**; archive diff assertions on **Phase 48** fixtures.
- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase48_merge_archive_validated.spec.ts tests/phase45_merge_stat_normalization.spec.ts`; `npm run diff:merge-archives -- --left tests/fixtures/merge_archive_phase48/snapshot_A_baseline --right tests/fixtures/merge_archive_phase48/snapshot_B_after_stat_alias` (stdout markdown sanity).

### Phase 49 — Next data-driven merge improvement (PRA PrizePicks aliases, archive-validated)

- **Assumptions:** Phase **48** complete. **No** EV, breakeven, payout, combinatorics, ranking, filtering, or selection changes — **one** **`STAT_MAP`** extension (**two** keys, **one** feed-alignment family). **`latest_merge_*`** on disk may reflect **Jest** smoke (e.g. unknown stat) rather than a full slate — **dominant** next mismatch is inferred by **cross-checking** **`src/fetch_props.ts`** **`mapStatType`** (PP **`stat_type`**) against **`STAT_MAP`**.
- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **48**); `data/reports/latest_merge_audit.json`; `data/reports/latest_merge_diagnostics.json`; `data/reports/merge_archive/2026-03-21T15-18-17.609Z__phase48-post-change/*` (latest archived snapshot — mirrors **test** merge); `src/fetch_props.ts` (**`pts_rebs_asts`**, **`pts+rebs+asts`** → **`pra`**); `src/merge_odds.ts` (**`STAT_MAP`**).
- **Baseline snapshot summary:** Archived **phase48-post-change** audit shows **`no_odds_stat: 1`** for **`totally_unknown_stat_xyz`** (not production). **Gap analysis:** PP importer maps **`pts_rebs_asts`** and **`pts+rebs+asts`** to **`pra`**, but merge **`STAT_MAP`** had **`pra`**, **`points_rebounds_assists`**, **`pts+reb+ast`**, **`player_pra`** — **not** the underscore / **`rebs`** spellings — so **`normalizeStatForMerge`** left raw strings → **dynamic “stat absent from odds”** filter treated picks as **`no_odds_stat`** even when OddsAPI rows used **`pra`**.
- **Root cause:** **Feed label mismatch** (PrizePicks **`stat_type`** strings vs OddsAPI canonical **`pra`**) — same category as Phase **45**/**48**, **not** line tolerance.
- **Chosen improvement (justification):** Add **`pts_rebs_asts: "pra"`** and **`"pts+rebs+asts": "pra"`** — **minimal** parity with **`fetch_props.mapStatType`**; **high impact** on **PRA** combo volume; **low risk** (maps into existing **`pra`** bucket only).
- **Files changed:** **`src/merge_odds.ts`** — **`STAT_MAP`**; **`tests/phase49_merge_archive_validated.spec.ts`** (**new**); **`tests/fixtures/merge_archive_phase49/snapshot_A_baseline/*`**, **`tests/fixtures/merge_archive_phase49/snapshot_B_after_stat_alias/*`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase49_merge_archive_validated.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior change:** **`normalizeStatForMerge`** maps PP **PRA** combo labels to **`pra`**, aligning **PP pre-filter** + **merge** with OddsAPI **`pra`** rows — **no** new stat categories; **no** line/juice change.
- **Diff results (fixture A vs B):** **`mergeCoverage`** Δ **+0.3**, **`dropRate`** Δ **−0.3**, **`matched`** **+6**, **`dropped`** **−6**, **`no_odds_stat`** **−6**, **`severity`** **WARN → INFO**; diagnostics: **`stat=pts_rebs_asts canonical=no_odds_stat: delta=-8`**, **`stat=points canonical=no_odds_stat: delta=+2`** (representative residual). CLI: **`npm run diff:merge-archives -- --left tests/fixtures/merge_archive_phase49/snapshot_A_baseline --right tests/fixtures/merge_archive_phase49/snapshot_B_after_stat_alias`**.
- **Risk assessment:** **Low** — aliases are **deterministic** and **identical** to **`fetch_props`**; **no** fuzzy matching; **false-match** surface unchanged (**same** **`pra`** market as existing keys).
- **Tests added/updated:** **`tests/phase49_merge_archive_validated.spec.ts`** — **`mergeWithSnapshot`** (**PP** pick **`pts_rebs_asts`** / **`pts+rebs+asts`** vs odds **`pra`**); archive diff assertions on **Phase 49** fixtures.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase49_merge_archive_validated.spec.ts` (**pass**); `npm run diff:merge-archives` on **Phase 49** fixtures (**pass**, stdout as above).

### Phase 50 — Next alias-family merge improvement (PP points+rebounds combo, archive-validated)

- **Assumptions:** Phase **49** complete. **No** EV, breakeven, payout, combinatorics, ranking, filtering, or selection changes — **one** **`STAT_MAP`** extension (**two** keys, **one** PP **PR** combo family). **`latest_merge_*`** may be **low‑N** or **test**-driven; **next** family is chosen by **`fetch_props.mapStatType`** vs **`STAT_MAP`** parity (same method as Phase **49**).
- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **49**); `data/reports/latest_merge_audit.json`; `data/reports/latest_merge_diagnostics.json`; `data/reports/merge_archive/` (latest snapshots on disk); `src/fetch_props.ts` (**`pts_rebs`**, **`pts+rebs`** → **`points_rebounds`**); `src/merge_odds.ts` (**`STAT_MAP`**).
- **Baseline snapshot summary:** **`fetch_props`** maps **`pts_rebs`** and **`pts+rebs`** to **`points_rebounds`**, but **`STAT_MAP`** had **`pr`**, **`points_rebounds`**, **`pts+reb`**, **`points+rebounds`** — **not** **`pts_rebs`** / **`pts+rebs`** — so **`normalizeStatForMerge`** left raw strings → **`buildPpStatsNotInOdds`** could mark **`no_odds_stat`** when OddsAPI rows used **`points_rebounds`**.
- **Root cause:** **Feed label mismatch** (PrizePicks **`stat_type`** for **PR** vs OddsAPI **`points_rebounds`**).
- **Chosen improvement (justification):** Add **`pts_rebs: "points_rebounds"`** and **`"pts+rebs": "points_rebounds"`** — **minimal** parity with **`fetch_props.mapStatType`**; **high** expected volume on **PP** combo markets; **low risk** (same canonical bucket as **`pr`** / **`pts+reb`**).
- **Files changed:** **`src/merge_odds.ts`** — **`STAT_MAP`**; **`tests/phase50_merge_archive_validated.spec.ts`** (**new**); **`tests/fixtures/merge_archive_phase50/snapshot_A_baseline/*`**, **`tests/fixtures/merge_archive_phase50/snapshot_B_after_stat_alias/*`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase50_merge_archive_validated.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior change:** **`normalizeStatForMerge`** maps PP **PR** combo labels to **`points_rebounds`**, aligning **PP** pre-filter + merge with OddsAPI **`points_rebounds`** rows.
- **Diff results (fixture A vs B):** **`mergeCoverage`** Δ **+0.3**, **`dropRate`** Δ **−0.3**, **`matched`** **+6**, **`dropped`** **−6**, **`no_odds_stat`** **−6**, **`severity`** **WARN → INFO**; diagnostics include **`pts_rebs`** **`no_odds_stat`** reduction (representative). CLI: **`npm run diff:merge-archives -- --left tests/fixtures/merge_archive_phase50/snapshot_A_baseline --right tests/fixtures/merge_archive_phase50/snapshot_B_after_stat_alias`**.
- **Risk assessment:** **Low** — deterministic aliases; **no** fuzzy matching; **false-match** surface unchanged (**same** **`points_rebounds`** bucket).
- **Tests added/updated:** **`tests/phase50_merge_archive_validated.spec.ts`** — **`mergeWithSnapshot`** (**PP** **`pts_rebs`** / **`pts+rebs`** vs odds **`points_rebounds`**); archive diff assertions on **Phase 50** fixtures.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase50_merge_archive_validated.spec.ts` (**pass**); `npm run diff:merge-archives` on **Phase 50** fixtures (**pass**); `npm run archive:merge -- --label phase50-after` (**pass**, local **`data/reports/merge_archive/`**; **`gitignore`**).

### Phase 51 — PP combo alias sweep (bounded, low-risk, archive-validated)

- **Assumptions:** Phase **50** complete. **No** EV, breakeven, payout, combinatorics, ranking, filtering, selection, **line tolerance**, or **tie-break** changes — **`STAT_MAP`** additions **only** for **remaining PP combo** strings already listed in **`fetch_props.mapStatType`** (NBA block).
- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **50**); `src/fetch_props.ts` (**`mapStatType`**, lines ~137–143); `src/merge_odds.ts` (**`STAT_MAP`**); `tests/phase49_merge_archive_validated.spec.ts` / **`tests/phase50_merge_archive_validated.spec.ts`** (pattern); `data/reports/latest_merge_audit.json` (presence only).
- **Baseline snapshot summary:** After Phases **49–50**, **`STAT_MAP`** still lacked **`pts_asts`**, **`pts+asts`**, **`rebs_asts`**, **`rebs+asts`**, and **`blks+stls`** — all returned by **`mapStatType`** alongside existing canonical keys (**`pa`**, **`pts+ast`**, **`ra`**, **`reb+ast`**, **`stocks`**) — so raw PP **`stat_type`** strings could fail **`normalizeStatForMerge`** alignment with OddsAPI **`points_assists`**, **`rebounds_assists`**, **`stocks`**.
- **Root cause:** **Feed label mismatch** (PP combo spellings vs merge normalization), **not** matching geometry.
- **Chosen improvement set (justification):** Single bounded sweep: **`pts_asts` / `pts+asts` → `points_assists`**, **`rebs_asts` / `rebs+asts` → `rebounds_assists`**, **`blks+stls` → `stocks`** — mirrors **`fetch_props`** exactly; **no** other alias families touched.
- **Files changed:** **`src/merge_odds.ts`** — **`STAT_MAP`**; **`tests/phase51_pp_combo_alias_sweep.spec.ts`** (**new**); **`tests/fixtures/merge_archive_phase51/snapshot_A_baseline/*`**, **`tests/fixtures/merge_archive_phase51/snapshot_B_after_pp_combo_sweep/*`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase51_pp_combo_alias_sweep.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).
- **Exact behavior change:** **`normalizeStatForMerge`** maps the five PP combo labels to existing **`StatCategory`** values used by Odds rows — **PP** dynamic stat filter + merge candidate sets stay **deterministic**; **no** change to **`findBestMatch`** ordering or **alt** / **nearest** logic.
- **Diff results (fixture A vs B):** **`mergeCoverage`** Δ **+0.3**, **`dropRate`** Δ **−0.3**, **`no_odds_stat`** Δ **−6**, **`matched`** **+6**, **`severity`** **WARN → INFO**; diagnostics show **`pts_asts`**, **`rebs_asts`**, **`blks+stls`** **`no_odds_stat`** reductions (representative). CLI: **`npm run diff:merge-archives -- --left tests/fixtures/merge_archive_phase51/snapshot_A_baseline --right tests/fixtures/merge_archive_phase51/snapshot_B_after_pp_combo_sweep`**.
- **Risk assessment:** **Low** — aliases are **closed** to **`mapStatType`** outputs; **no** new markets; **false-match** surface unchanged (**same** canonical buckets as **`pa`** / **`ra`** / **`stocks`**).
- **Tests added/updated:** **`tests/phase51_pp_combo_alias_sweep.spec.ts`** — **`mergeWithSnapshot`** for each combo family vs corresponding OddsAPI stat; archive diff assertions on **Phase 51** fixtures.
- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase51_pp_combo_alias_sweep.spec.ts` (**pass**); `npm run diff:merge-archives` on **Phase 51** fixtures (**pass**); `npm run archive:merge -- --label phase51-after` (**pass**, local snapshot under **`data/reports/merge_archive/`**).

### Phase 52 — Player-name alias audit (analysis only)

- **Assumptions:** Phase **51** complete (**PP combo** **`STAT_MAP`** sweep). This phase is **read-only** — **no** merge logic, **no** EV/breakeven/payout/combinatorics/selection changes. Question: after the **stat** alias sweep, are **player-name** mismatches plausibly the **next** highest-value merge gap?

- **Files inspected:** `docs/PROJECT_STATE.md` (Phases **45–51**); `data/reports/latest_merge_audit.json`; `data/reports/latest_merge_diagnostics.json`; `src/merge_odds.ts` (**`normalizeName`**, **`normalizeForMatch`**, **`stripAccents`**, **`stripNameSuffix`**, **`stripNamePunctuation`**, **`resolvePlayerNameForMatch`**, **`PLAYER_NAME_ALIASES`**, **`normalizeOddsPlayerName`**); `src/reporting/merge_diagnostics.ts` (**drop** rollups); `src/merge_contract.ts` (**`no_candidate`** definition).

- **Current evidence on player-name mismatch (workspace):** **`latest_merge_audit`** / **`latest_merge_diagnostics`** (timestamp **2026-03-21T15-27-28.423Z**) show **`drops: []`**, empty **`byStatCanonical`** / **`bySiteCanonical`** — **low‑N** (post–**Phase 51** test merge). **No** on-disk **full-slate** audit with **`no_candidate`** concentration is available here, so **this workspace cannot** prove a **ranking** of **name** vs **stat** vs **line** vs **absent market** as a driver of drops.

- **Current player matching contract** (`src/merge_odds.ts`): **Pick** name: **`normalizeName`** → **`resolvePlayerNameForMatch`** (**`PLAYER_NAME_ALIASES`**) → **`normalizeForMatch`**, which applies **`stripAccents`**, **`stripNameSuffix`** (Jr/Sr/II/III/IV), **`stripNamePunctuation`** (`.` / `'` / `’` / `-`), then **`stripNamePunctuation`** again for spacing. **Odds** **`player`** id: **`normalizeOddsPlayerName`** (underscores → spaces, drops **`<num>_<LEAGUE>`** suffix) → **`normalizeForMatch`**. Match is **equality** on normalized strings (no fuzzy distance). **Comment** on **`PLAYER_NAME_ALIASES`**: explicit entries for **PP/UD** spellings that don’t align with OddsAPI (**initials**, UD-specific strings).

- **Merge contract note:** **`no_candidate`** in **`merge_contract.ts`** means **no odds row** matched **player + stat + sport + league** (after filtering) — **not** uniquely “wrong name”; it could be **missing market**, **wrong slate**, **name mismatch**, or **line/alt** pool geometry **after** candidate filtering.

- **Can diagnostics prove name vs other causes?** **Not directly.** **`buildMergeDiagnosticsReport`** aggregates **`drops`** by **`site`**, **`stat`**, **`sport`** — **not** by player name or normalized player key. **Archive diff** compares coverage / rollups; it does **not** attribute **`no_candidate`** to **name shape**. **Conclusion:** **Inference only** — e.g. **high** **`no_candidate`** on **`points`** with **no** `no_odds_stat` suggests **player / slate / line**, but **not** name alone.

- **Likely remaining mismatch classes (if name is involved):** **(1)** **Initials / nicknames** not covered by **`PLAYER_NAME_ALIASES`** (e.g. new **`"X. Lastname"`** patterns). **(2)** **Suffix / punctuation** edge cases outside **`strip`** rules (e.g. **V**, **2nd**, non‑Latin scripts). **(3)** **Roster / ID drift** (PP vs OddsAPI **different player** for same display string — **not** fixable by alias). **(4)** **Transliteration** vs **accent** (partially covered by **`stripAccents`**). **(5)** **Hyphenated / compound** names with **unusual** spacing (partially covered by **`stripNamePunctuation`**).

- **Safe next improvement candidates:** **(a)** **Incremental `PLAYER_NAME_ALIASES`** entries when **repeatable** pairs appear in **`merge_report_*.csv`** / operator exports (same philosophy as existing comments). **(b)** **Narrow** extensions to **`stripNameSuffix`** / **`stripNamePunctuation`** **only** when a **documented** pattern repeats across books (keeps **determinism**). **(c)** **Additive** observability (future phase): **read-only** rollup of **`no_candidate`** by **normalized player key** (or **bucket**) to **measure** name vs stat — **no** matcher change.

- **Risky candidates to defer:** **Fuzzy** string matching (**Levenshtein**, **phonetic**), **global** nickname expansion, **automatic** “closest player” resolution — **high false‑match** risk and **non‑deterministic** behavior unless tightly bounded.

- **Recommended next implementation phase (exactly one):** **Do not** ship **broad** player-name matcher changes **yet** without **quantitative** evidence that **`no_candidate`** (after **`no_odds_stat`** is minimized) is **name‑dominated**. **Preferred next step when implementing:** **Evidence-driven explicit `PLAYER_NAME_ALIASES`** (and **only** narrow **`strip*`** tweaks if the same pattern hits many rows) — **not** fuzzy matching. **Optional precursor:** **additive diagnostics** by **player** dimension (read-only) **before** alias expansion, if the team needs **proof** that **`no_candidate`** is the right bucket to optimize.

- **Answers to the Phase 52 questions (must answer):**
  1. **Are player-name mismatches a meaningful remaining source of `no_match` / `no_candidate`?** **Plausible** — the pipeline is **designed** for them (**aliases + normalization**), but **this repo state** does **not** provide **full-slate** drop counts to **rank** them vs **stat**/**line**/**market**. After **PP combo** stat alignment, **name** is a **reasonable** **next hypothesis** for residual **`no_candidate`**, **not** a **proven** top driver.
  2. **Most likely name-shape differences:** **Initials** ( **`J.`** vs full first ), **punctuation** ( **`T.J.` / `'` / `-`** ), **suffixes** ( **`Jr.`** — partially stripped ), **accents** (handled via **`stripAccents`**). **Abbreviations** are the **primary** class handled by **`PLAYER_NAME_ALIASES`** today.
  3. **Proof vs suggestion:** **Current diagnostics** can **suggest** (via **`no_candidate`** + **`stat`** dimension) but **cannot** **prove** name mismatch **directly** — **no** **`byPlayer`** rollup in **`merge_diagnostics`**.
  4. **Safest strategy:** **Deterministic** **explicit** alias table **plus** existing **narrow** **normalization** — **no** fuzzy matching.
  5. **Next implementation:** **Not** “no change forever” — **prefer** **explicit alias table** when **CSV evidence** exists; **defer** **normalization-only** broadening unless **one** pattern is **repeatable**; **or** **diagnostics-only** phase first if **measurement** is required before **any** **`merge_odds`** name edit.

- **Validation commands run (agent):** Read-only inspection of **`docs/PROJECT_STATE.md`**, **`src/merge_odds.ts`**, **`src/reporting/merge_diagnostics.ts`**, **`src/merge_contract.ts`**, **`data/reports/latest_merge_audit.json`**, **`data/reports/latest_merge_diagnostics.json`** — **no** `npm test` / **no** merge run required for analysis-only phase.

### Phase 53 — `no_candidate` player-bucket diagnostics (additive only, no merge logic changes)

- **Assumptions:** Phase **52** complete. **No** EV, breakeven, payout, combinatorics, ranking, selection, **line tolerance**, or **tie-break** changes — **reporting only**. **`merge_odds`** passes **`normalizePickPlayerKeyForDiagnostics`** into **`finalizeMergeAuditArtifacts`** so **`merge_player_diagnostics`** does **not** import **`merge_odds`** (avoids circular dependency).

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_audit.ts` (**`finalizeMergeAuditArtifacts`**); `src/reporting/merge_diagnostics.ts`; `src/reporting/merge_archive_diff.ts`; `src/merge_contract.ts` (**`MergeDropRecord`**, **`no_candidate`**); `src/merge_odds.ts` (name pipeline).

- **Files changed:** **`src/merge_odds.ts`** — **`export function normalizePickPlayerKeyForDiagnostics`** (read-only key; same pipeline as **`normalizeName` → `resolvePlayerNameForMatch` → `normalizeForMatch`**); **`finalizeMergeAuditArtifacts`** calls pass **`normalizePickPlayerKeyForDiagnostics`**. **`src/reporting/merge_player_diagnostics.ts`** (**new**) — **`buildMergePlayerDiagnosticsReport`**, **`writeMergePlayerDiagnosticsArtifacts`**, **`formatMergePlayerDiagnosticsMarkdown`**, **`getMergePlayerDiagnosticsPaths`**. **`src/reporting/merge_audit.ts`** — writes **`latest_merge_player_diagnostics.json`** / **`.md`** after **`merge_diagnostics`**. **`src/reporting/merge_archive_diff.ts`** — **`archive:merge`** copies **`latest_merge_player_diagnostics.json`** → **`merge_player_diagnostics.json`**. **`tests/phase53_merge_player_diagnostics.spec.ts`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase53_merge_player_diagnostics.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added/changed:** On each **`finalizeMergeAuditArtifacts`**, **filter** `report.drops` where **`internalReason === "no_candidate"`**; aggregate by **injected** **`normalizePickPlayerKey(pick.player)`** into **`noCandidateByNormalizedPlayer`**, **`noCandidateByPlayerAndStat`**, **`noCandidateByPlayerAndSite`**, **`noCandidateByPlayerAndSport`**; **`topNoCandidatePlayers`** (cap **50**, sort **−count**, **+key**); **`concentration`** (**`top1ShareOfNoCandidate`**, **`interpretation`**: **`high_top_key_concentration`** if top share **≥0.5**, else **`distributed`**, else **`insufficient_data`**). **Does not** merge odds rows or alter **drop** counts. **Odds** player names are **not** used here (pick-side key only — per Phase **52** scope).

- **Tests added/updated:** **`tests/phase53_merge_player_diagnostics.spec.ts`** — aggregation, **`no_odds_stat`** ignored, deterministic sort, concentration, stable stringify, **`writeMergePlayerDiagnosticsArtifacts`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase53_merge_player_diagnostics.spec.ts tests/phase44_merge_diagnostics.spec.ts tests/phase47_merge_archive_diff.spec.ts tests/phase45_merge_stat_normalization.spec.ts tests/phase39_merge_contract_and_audit.spec.ts` (**pass**).

### Phase 54 — Player-alias decision (full-run evidence, no merge changes)

- **Assumptions:** Phase **53** complete. This phase is **decision-only** — **no** merge logic edits, **no** new aliases. Evidence from a **real** **`scripts/run_optimizer.ps1 -Force`** run (PP **NBA** full import + cached OddsAPI snapshot).

- **Files inspected:** `docs/PROJECT_STATE.md`; `data/reports/latest_merge_player_diagnostics.json`; `data/reports/latest_merge_diagnostics.json`; `data/reports/latest_merge_audit.json`; `data/reports/merge_archive/2026-03-21T15-37-08.823Z__phase54-full-run/` ( **`npm run archive:merge -- --label phase54-full-run`** ).

- **Full-run snapshot summary (2026-03-21T15:37:08.823Z):** **PrizePicks** raw props **5693**; OddsAPI rows in snapshot **50**; **match-eligible** **182**; **merged** **0** (optimizer **guardrail** exit **1** — expected when merge ratio is **0%**). **`droppedByInternalReason`:** **`no_odds_stat` 730**, **`no_candidate` 182** (`canonical` **`no_match`**), **`promo_or_special` 4684**, **`fantasy_excluded` 97**. **`byStatCanonical`:** all **`no_match` / `no_candidate`** mass is on **`points`** (**182**).

- **Player diagnostics summary:** **`totals.noCandidateDropCount`:** **182**; **`distinctNormalizedPlayers`:** **182**; **`top1ShareOfNoCandidate`:** **≈0.55%** (**1/182**); **`topNoCandidatePlayers`:** **50** entries each with **`count`: 1** (tie-break lexicographic keys). **Normalized keys** include many **single** players **and** **combo strings** (e.g. **`"… + …"`** multi-name PP labels).

- **Concentration classification:** **`distributed`** — **no** single player key dominates; **maximum** spread (**one** drop per distinct key across **182** keys).

- **Interpretation (name vs non-name):** **Not** consistent with a **single** systematic **name-alias** defect (would expect **high** concentration + repeat raw names). **182** unique pick-side keys with **`points`** **`no_candidate`** against a **50-row** odds snapshot points to **coverage / slate / line / market-shape** mismatch (including **PP combo display names** vs single-player odds rows) **before** spelling fixes. **`no_odds_stat` (730)** on combo stats remains **larger** than **`no_candidate` (182)** — **feed stat/market** gaps dominate volume-wise.

- **Recommended next phase (decision):** **Do not** make **`PLAYER_NAME_ALIASES`** the **next** implementation priority from this evidence. **Prefer next:** **(1)** **Odds breadth / snapshot refresh / more books or rows** so **`points`** (and others) overlap PP match-eligible props; **(2)** continue **stat / market** alignment work where **`no_odds_stat`** concentrates; **(3)** treat **combo / multi-player** PP labels as a **product-shape** issue (may need **explicit** handling or exclusion), **not** incremental single-name aliases alone. **Revisit** **player-alias** **only** if, **after** stronger odds overlap, **`top1ShareOfNoCandidate`** becomes **high** and CSV review shows **repeatable** **single-player** string drift.

- **Validation commands run (agent):** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (merge artifacts written; optimizer **exit 1** on guardrail — **expected**); `npm run archive:merge -- --label phase54-full-run` (**pass**).

### Phase 55 — Odds overlap / coverage audit (analysis + diagnostics only)

- **Assumptions:** Phase **54** complete. **No** merge matcher edits, **no** fetch changes in this phase — **read-only** audit of **Phase 54** artifacts + **`OddsSnapshotManager`** / cached snapshot files.

- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **54**); `data/reports/latest_merge_audit.json` (**`stageAccounting`**, **`drops`**); `data/reports/latest_merge_diagnostics.json`; `data/reports/merge_archive/2026-03-21T15-37-08.823Z__phase54-full-run/`; `data/odds_snapshots/OddsAPI_NBA_2026-03-21T14-25-54_3867c2be.json` (**`totalRows`**, **`rows`** sample); `data/odds_snapshots/state.json`; `src/odds/odds_snapshot_manager.ts` (**cache vs live**); `src/merge_odds.ts` (**`mergeCore`**, **`ppStatsNotInOdds`**, **`totalOddsRowsConsidered`**, **`unmatchedOddsRows`**).

- **Full-run overlap snapshot (Phase 54, unchanged):** **5693** PP raw props vs **50** odds rows ingested; **`filteredBeforeMerge` 5511** = **`promo_or_special` 4684** + **`no_odds_stat` 730** + **`fantasy_excluded` 97**; **182** **`propsConsideredForMatching`** (match-eligible); **0** merged; **`line_diff` / `juice`:** **0** for unmatched props.

- **Why ~50 odds rows vs 5,693 PP props?** **`totalOddsRowsConsidered`** equals **`oddsMarkets.length`** — the **cached** snapshot **`OddsAPI_NBA_2026-03-21T14-25-54_3867c2be.json`** declares **`totalRows`: 50** and rows use **placeholder** identities **`Player 0` … `Player 49`**, **`book`:** **`consensus`**, single **LAL/BOS**-style fixture. **`OddsSnapshotManager`** in **auto** mode used **cache** (snapshot age **~71m** &lt; **120m** stale threshold per log), so the run **did not** refetch a full live OddsAPI catalog. **5693** is **real** PP volume; **50** is **whatever was persisted** in that snapshot file — here **not** representative of production **player-prop** breadth.

- **Root-cause breakdown (remaining failure classes):**
  1. **Thin / unrepresentative odds snapshot (dominant):** Only **50** rows and **synthetic** player labels → almost **no** overlap with real PP names/lines. **`unmatchedOddsRows`:** **50** (no PP pick consumed those rows in a successful merge — **`usedOddsRowKeys`** empty when **merged=0**).
  2. **`no_odds_stat` (730):** PP **`buildPpStatsNotInOdds`** marks stats absent from normalized odds **`stat`** set; cached feed is effectively **points-only** in those **50** rows → **PRA / PA / rebounds / …** props skip **before** matching.
  3. **Combo / multi-player PP labels:** Of **182** **`no_candidate`** drops, **60** have the substring **`" + "`** in **`player`** (**~33%**); **122** are single-name strings — still fail vs **`Player N`** odds identities (**name mismatch** + **line** grid mismatch).
  4. **Line mismatch / juice:** **0** in this run — **not** the bottleneck here.

- **Are match-eligible props filtered correctly?** **Yes** relative to code: **PP** picks hit **`ppStatsNotInOdds`** → **`no_odds_stat`** when **`normalizeStatForMerge(pick.stat)`** ∉ odds **`stat`** set; **`points`**-only feed explains **730** skips. Non-skipped **points** picks become **match-eligible** (**182**) and then fail **`findBestMatch`** → **`no_candidate`** because **odds** player keys don’t align with **PP** (fixture names + combo strings).

- **Thin-odds explanation (summary):** **Not** an inherent OddsAPI “50-row limit” in code — **this** run used a **small, placeholder-heavy cached snapshot**. **`resolveRefreshMode`** chose **cache**; operators need **live** fetch or a **full** saved snapshot for meaningful overlap metrics.

- **Safe next improvement candidates:** **(1)** **Operational / pipeline:** force **live** odds refresh (**`--no-guardrails`** only after understanding risk) or lower **`AUTO_STALE_MINUTES`** / use **`refreshMode: live`** when validating coverage; **(2)** **Replace or regenerate** **`data/odds_snapshots/*.json`** used in cache with **real** OddsAPI pulls for **NBA** player props; **(3)** **Document** that **merge-quality** gates require **non-placeholder** odds data.

- **Risky candidates to defer:** Changing **merge** rules, **tolerance**, or **combo matching** **before** odds rows reflect **real** players — would **optimize the wrong failure mode**.

- **Recommended next phase (exactly one):** **Odds coverage expansion** — **refresh strategy + healthy snapshot** so **`oddsMarkets.length`** and **player/stat** rows reflect **real** markets (**live** fetch or curated full snapshot). **Defer** dedicated **combo-label handling** as a **product** phase until **overlap** is real and **`no_candidate`** still shows high **multi-player** share **against** real odds rows. **Stat/market alignment** ( **`no_odds_stat`** ) remains important but is **secondary** here because the **feed** is **statistically tiny** and **points-skewed**.

- **Validation commands run (agent):** Read-only inspection of artifacts above; `node -e` script counting **`no_candidate`** drops whose **`player`** contains **`" + "`** (**60** / **182**); **no** merge code changes.

### Phase 56 — Odds snapshot health + coverage hardening (no merge logic changes)

- **Assumptions:** Phase **55** complete. **No** **`merge_odds`** matcher edits, **no** EV / breakeven / payout / combinatorics / selection changes — **`OddsSnapshotManager`** + **reporting** only.

- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **55**); `src/odds/odds_snapshot_manager.ts`; `src/odds/odds_snapshot.ts`; `data/odds_snapshots/` (pointer + sample JSON); `.env.example` / **`config/.env.example`** (parity).

- **Files changed:** **`src/odds/odds_snapshot_health.ts`** (**new**) — **`isPlaceholderPlayerName`**, **`evaluateOddsSnapshotHealth`**, **`resolveOddsSnapshotHealthThresholds`**, **`writeOddsSnapshotHealthArtifacts`**, **`formatOddsSnapshotHealthMarkdown`**, **`getOddsSnapshotHealthPaths`**; **`src/odds/odds_snapshot.ts`** — optional **`health?: OddsSnapshotHealthReport`** on **`OddsSnapshot`**; **`src/odds/odds_snapshot_manager.ts`** — health probe on cached rows; **`refreshMode: "auto"`** rejects unhealthy cache → **live fetch**; **`refreshMode: "cache"`** keeps cache but **`console.warn`** + unhealthy artifact; **`finalizeSnapshot`** attaches **`health`**, writes **`data/reports/latest_odds_snapshot_health.json`** / **`.md`**, logs **`[OddsSnapshot] health=ok|UNHEALTHY`**. **`tests/phase56_odds_snapshot_health.spec.ts`** (**new**); **`package.json`** — **`verify:canonical`** includes Phase **56** test; **`.env.example`** + **`config/.env.example`** — **`ODDS_SNAPSHOT_HEALTH_*`** knobs (mirror parity).

- **Exact behavior added/changed:**
  1. **Health criteria (all must pass for `healthy: true`):** row count **≥** **`ODDS_SNAPSHOT_HEALTH_MIN_ROWS`** (default **200**); placeholder share **`^Player\s+\d+$`** **≤** **`ODDS_SNAPSHOT_HEALTH_MAX_PLACEHOLDER_SHARE`** (default **0.15**); distinct **`stat`** count **≥** **`ODDS_SNAPSHOT_HEALTH_MIN_DISTINCT_STATS`** (default **2**); **`ageMinutes`** **≤** **`maxAgeMinutes`** (same resolution as **`oddsMaxAgeMin`** **||** **`AUTO_STALE_MINUTES`** **120**).
  2. **Artifacts:** **`data/reports/latest_odds_snapshot_health.json`** (machine) and **`.md`** (operator table + reasons).
  3. **Cache vs refresh:** **`auto`** + resolved **cache** path: if health **fails** → **live fetch** (same as empty cache). **`cache`** mode: **never** auto-refetch; **warn** on unhealthy.
  4. **Merge:** unchanged — **`OddsSnapshot.rows`** are the same shape; **`health`** is **diagnostic** only.

- **Tests added/updated:** **`tests/phase56_odds_snapshot_health.spec.ts`** — placeholder detection, unhealthy vs healthy rows, stale age, artifact write, **`OddsSnapshotManager`** **auto** rejects bad cached snapshot **→** live mock (**300** rows). **`tests/phase19d_odds_snapshot.spec.ts`** — unchanged; still **pass** (expects extra health logs / cache warning).

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase56_odds_snapshot_health.spec.ts tests/phase19d_odds_snapshot.spec.ts` (**pass**).

- **Answers (Phase 56 questions):**
  1. **What makes a snapshot “healthy enough” for merge analysis?** All four checks above pass (row floor, **not** placeholder-heavy, **≥2** distinct stats, not older than **maxAgeMinutes** vs snapshot **`fetchedAtUtc`** age).
  2. **Tiny:** **`row_count_below_min`**; **placeholders:** **`placeholder_players_high`**; **stale:** **`snapshot_age_stale`**; **narrow markets:** **`narrow_stat_breadth`**.
  3. **When reject cache?** **`refreshMode === "auto"`** and cached rows **fail** health → **live fetch**. **`cache`** mode: **never** auto-reject; **warn** explicitly.
  4. **Operator surface:** **`latest_odds_snapshot_health.md`**, JSON sidecar, **`console.warn`** / **`health=UNHEALTHY`** log line with reason codes.

### Phase 57 — Post-health full-run merge reassessment (analysis only)

- **Assumptions:** Phase **56** complete. **No** **`merge_odds`** edits — **read-only** reassessment after **`scripts/run_optimizer.ps1 -Force`** with Phase **56** health active.

- **Files inspected:** `docs/PROJECT_STATE.md` (Phases **54–56**); `data/reports/latest_odds_snapshot_health.json` / **`.md`**; **`data/reports/latest_merge_audit.json`** (**note:** final write = **Underdog** merge in **`both`** run); **`data/reports/latest_merge_diagnostics.json`**; **`data/reports/latest_merge_player_diagnostics.json`**; **`data/reports/latest_merge_quality.json`** / **`merge_quality_status.json`**; run log (**`artifacts/logs/run_*.txt`** tail); archive **`data/reports/merge_archive/2026-03-21T16-05-34.017Z__phase57-full-run/`**.

- **Odds snapshot health summary (2026-03-21T16:05:15Z):** **`healthy: true`** — **6206** rows, **placeholderShare** **0**, **10** distinct stats, **live** fetch after **auto** rejected unhealthy cache (**`row_count_below_min`**, **`placeholder_players_high`**, **`narrow_stat_breadth`** on prior disk snapshot). **`effectiveRefreshMode`:** **`live`**.

- **Full-run merge summary:**
  - **PrizePicks** (from **run log** — PP pass precedes UD; **`latest_merge_audit.json`** is **UD-only** in **`both`** mode): **raw** **5455**; **pre-merge skips** **4632** (**promo** **4507**, **fantasy** **92**; PP **`no_odds_stat`/`ud_skipped`** **33**); **match-eligible** **823**; **merged** **668** (**main** **661** + **alt** **7**); **unmatched:** **`no_candidate` 154**, **`line_diff` 1**, **`juice` 0**. Odds rows in merge: **6210** (**2429** unique player/stat/league/line keys). Log: **dynamic stat filter** added **stocks**, **turnovers** (not in odds feed that run).
  - **Underdog** (**`latest_merge_audit.json`** **`stageAccounting`**): **raw** **1146**; **filteredBeforeMerge** **318**; **match-eligible** **828**; **merged** **365** (**exact** **360** + **nearest** **5**); **`skippedByReason`:** **`lineDiff` 380**, **`escalatorFiltered` 278**, **`juice` 52**, **`noOddsStat` 40** ( **`turnovers`** in **`byStatCanonical`** ), **`noCandidate` 31**, **`promoOrSpecial` 0**. **`totalOddsRowsConsidered`:** **6206**.

- **What changed vs Phase 54 (PP-focused baseline):** Phase **54** (**cached 50-row** placeholder snapshot): **5693** raw, **50** odds rows, **182** match-eligible, **0** merged, **`no_odds_stat` 730**, **`no_candidate` 182**. Phase **57**: **6206** healthy odds rows → **823** match-eligible, **668** merged, **`no_odds_stat` 33**, **`no_candidate` 154**. **Substrate:** Phase **56** **materially** improved odds coverage; **merge** is no longer **blocked** by **tiny** / **placeholder** snapshots.

- **Remaining dominant bottlenecks (PP):** **`no_candidate` (154)** **≫** **`no_odds_stat` (33)** **≫** **`line_diff` (1)**. **Stat/market:** residual **stocks** / **turnovers** (and any PP-only markets) still drive **`no_odds_stat`** when OddsAPI has no row. **Combo / multi-player** and **player-string** mismatch remain plausible drivers of **`no_candidate`** (Phase **55** **~33%** of **`no_candidate`** had **`" + "`** under the old snapshot; **not recomputed** here — **`latest_merge_player_diagnostics`** on this run is **UD**-scoped).

- **Safe next improvement candidates:** **(1)** **Bounded** **`STAT_MAP`** / **feed** alignment for **residual** **`no_odds_stat`** (**stocks**, **turnovers**) **when** OddsAPI or **synthetic** fallbacks exist; **(2)** **Evidence-backed** **`PLAYER_NAME_ALIASES`** for **repeat** **`no_candidate`** keys **with** real odds rows; **(3)** **Additive** **PP** **`no_candidate`** rollups (so **`both`** runs **don’t** overwrite **PP** audit visibility).

- **Risky candidates to defer:** **Broad** fuzzy name matching; **merge tolerance** changes **without** **`line_diff`** evidence (here **1** on PP); **large** combo-matching **without** **deterministic** rules.

- **Recommended next phase (exactly one):** **PP `no_candidate` reduction** — **combo-label handling** (explicit rules or exclusion) **plus** **targeted player-name aliases** **informed by** **`merge_report` / player diagnostics** **now that** odds overlap is **real** (**154** is the **actionable** mass **after** health). **Secondary** (separate future phase if preferred): **stat/market** for **stocks** / **turnovers** **`no_odds_stat`** (**33**).

- **Validation commands run (agent):** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); `npm run archive:merge -- --label phase57-full-run` (**pass**).

### Phase 58 — PP `no_candidate` observability hardening (additive only, no merge logic changes)

- **Assumptions:** Phase **57** complete. **No** **`merge_odds`** matcher edits, **no** EV / breakeven / payout / combinatorics / selection changes — **reporting** only.

- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **57**); `src/reporting/merge_audit.ts` (**`finalizeMergeAuditArtifacts`**); `src/reporting/merge_player_diagnostics.ts`; `src/reporting/merge_archive_diff.ts` (**`archiveMergeArtifacts`**).

- **Files changed:** **`src/reporting/merge_pp_no_candidate_observability.ts`** (**new**) — **`isPrizepicksComboPlayerLabel`** (`" + "` substring), **`buildPpNoCandidateObservabilityReport`**, **`writePpNoCandidateObservabilityArtifacts`**, **`formatPpNoCandidateObservabilityMarkdown`**; **`src/reporting/merge_audit.ts`** — after player diagnostics, if **`platformStats`** includes **`prizepicks`** (covers **all-merged** PP passes with **empty** `drops`), writes **`data/reports/latest_merge_pp_no_candidate_observability.json`** + **`.md`**; **`src/reporting/merge_archive_diff.ts`** — archives **`latest_merge_pp_no_candidate_observability.json`** → **`merge_pp_no_candidate_observability.json`**; **`tests/phase58_merge_pp_no_candidate_observability.spec.ts`** (**new**); **`package.json`** — **`verify:canonical`** includes Phase **58** test; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added/changed:**
  1. **PP-only `no_candidate` slice** from merge **`drops`** (`site === "prizepicks"` && **`internalReason === "no_candidate"`**).
  2. **Combo vs single:** **combo** = raw **`player`** contains **`" + "`**; **single-player** = else. Counts + **combo share** of PP **`no_candidate`**.
  3. **Single-player:** **`noCandidateByNormalizedPlayer`** / **player×stat** / **sport** (NBA-only typical), **`topSinglePlayerKeys`** (cap **50**), **concentration** on **single-player** mass only.
  4. **Combo:** **`noCandidateByStat`** for combo rows only.
  5. **`--platform both`:** **UD** finalize **does not** overwrite PP file — PP observability is written **only** when **`platformStats.prizepicks`** exists (**PP** pass).

- **Tests added/updated:** **`tests/phase58_merge_pp_no_candidate_observability.spec.ts`** — filter invariants, combo/single split, deterministic **`stableStringify`**, artifact write, markdown; **`tests/phase47_merge_archive_diff.spec.ts`**, **`tests/phase39_merge_contract_and_audit.spec.ts`** — still **pass**.

- **Answers (Phase 58 questions):** Artifact answers **(1–3)** **per run** from **`latest_merge_pp_no_candidate_observability.json`**: **(1)** **single vs combo** counts + **combo share**; **(2)** **`topSinglePlayerKeys`** + concentration (**single-player** only); **(3)** **`noCandidateBySport`** / **player×stat** for **single-player**; combo **by stat** under **`combo.noCandidateByStat`**. **(4)** **Next implementation** (from Phase **57** evidence): still **PP `no_candidate` reduction** (**combo handling** + **aliases**) — this phase is **reporting** so the **next** phase can pick **combo** vs **alias** with **numbers**, not a **smaller** reporting follow-up unless **only** plumbing is missing.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase58_merge_pp_no_candidate_observability.spec.ts tests/phase47_merge_archive_diff.spec.ts tests/phase39_merge_contract_and_audit.spec.ts` (**pass**).

### Phase 59 — PP `no_candidate` decision (analysis only, using Phase 58 artifacts)

- **Assumptions:** Phase **58** complete. **No** **`merge_odds`** edits — **read-only** decision from **`latest_merge_pp_no_candidate_observability.json`** after a **real** **`scripts/run_optimizer.ps1 -Force`** run (**2026-03-21**, **NBA** slate).

- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **58**); **`data/reports/latest_merge_pp_no_candidate_observability.json`** / **`.md`**; **`data/reports/latest_merge_audit.json`** (**UD**-final in **`both`** — **not** used for PP counts); **`latest_merge_diagnostics.json`** / **`latest_merge_player_diagnostics.json`** — **UD**-scoped for **`both`**; **PP** evidence = **Phase 58** artifact **only**.

- **PP `no_candidate` summary (this run):** **`ppNoCandidateDropCount`:** **156** (matches run log **`no_candidate=156`**).

- **Combo vs single-player breakdown:**
  - **Combo** (raw **`player`** contains **`" + "`**): **131** (**~84.0%** of PP **`no_candidate`**).
  - **Single-player** labels: **25** (**~16.0%**).

- **Concentration assessment (single-player `no_candidate` only):** **`top1ShareOfSinglePlayerNoCandidate`:** **0.28** (**nickeil alexander walker** **7** / **25**); **`interpretation`:** **`distributed`**. **Six** distinct normalized keys on **25** drops — **not** a single systematic alias target at **PP `no_candidate`** scale.

- **Combo-label failures — stats (this run):** **`points`** **58**, **`threes`** **32**, **`rebounds`** **26**, **`assists`** **15** (sum **131** = combo total).

- **Interpretation — classify:** **combo-dominant** (**≥50%** combo share). **Mixed** on **overall** PP unmatched mass: **line_diff** also **non-zero** on PP this run (**20** in log) — **out of scope** for this artifact; **`no_candidate`** driver for **product-shape** is **combo**.

- **Recommended next phase (exactly one):** **Explicit PP combo-label handling** (deterministic rules: **exclude** from match-eligibility, **separate** reporting bucket, or **future** structured decomposition) — **not** **`PLAYER_NAME_ALIASES`** as the **first** implementation priority: **single-player** **`no_candidate`** is **~16%** and **distributed**. **`PLAYER_NAME_ALIASES`** remains a **secondary** follow-up if **single-player** **`no_candidate`** persists **after** combo handling.

- **Validation commands run (agent):** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); read **`data/reports/latest_merge_pp_no_candidate_observability.json`** (**156** drops, **84%** combo).

### Phase 60 — Explicit PP combo-label handling (single implementation phase)

- **Assumptions:** Phase **59** complete. **No** EV / breakeven / payout / combinatorics / selection / **`PLAYER_NAME_ALIASES`** changes — **merge pre-filter** only for **PrizePicks** combo display labels.

- **Files inspected:** `docs/PROJECT_STATE.md` (Phase **59**); **`data/reports/latest_merge_pp_no_candidate_observability.json`** (Phase **59** evidence — **~84%** combo among PP **`no_candidate`**); **`src/merge_odds.ts`** (merge loop); **`src/merge_contract.ts`**; **`src/reporting/merge_pp_no_candidate_observability.ts`** (reuse **`isPrizePicksComboPlayerLabel`** from contract).

- **Root cause:** OddsAPI rows are **single-player**; PP **multi-player** strings (**`"A + B"`**) cannot honestly match **`no_candidate`** — they were **misclassified** as **`no_match`** when the matcher had no single-player key.

- **Chosen strategy (one):** **Explicit pre-match exclusion** for **`site === "prizepicks"`** when **`player`** contains **`PP_COMBO_LABEL_SUBSTRING`** (**`" + "`**). Internal reason **`combo_label_excluded`**; canonical **`combo_label_excluded`**. Rows **never** enter **`findBestMatch`** — **no** fuzzy decomposition, **no** alias table.

- **Files changed:** **`src/merge_contract.ts`** — **`MERGE_DROP_REASON.combo_label_excluded`**, **`PP_COMBO_LABEL_SUBSTRING`**, **`isPrizePicksComboPlayerLabel`**, **`canonicalMergeDropReason`** branch; **`src/merge_odds.ts`** — **`diag.skippedPpComboLabel`**, early **`continue`** after **`fantasy_excluded`**, **`MergeStageAccounting.skippedByReason.comboLabelExcluded`**, **`propsConsideredForMatchingRows`** / **`filteredBeforeMergeRows`** math, merge log **`combo_label_excluded=N`**; early **`stageAccounting`** branches **`comboLabelExcluded: 0`**; **`src/reporting/merge_pp_no_candidate_observability.ts`** — import combo helper from **`merge_contract`** (alias **`isPrizepicksComboPlayerLabel`** retained); **`tests/phase60_merge_pp_combo_label.spec.ts`** (**new**); **`tests/phase39_merge_contract_and_audit.spec.ts`**, **`phase11`**, **`phase16`**, **`phase40`**, **`phase41`**, **`phase44`** — **`skippedByReason.comboLabelExcluded`** in fixtures; **`package.json`** — **`verify:canonical`** includes **`tests/phase60_merge_pp_combo_label.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior change:** PP picks whose **`player`** contains **`" + "`** are **dropped** with **`combo_label_excluded`** **before** **`matchEligible++`**. **`no_candidate`** count **drops** by former combo **`no_match`** volume; **PP observability** combo slice (**`no_candidate`** + combo shape) trends **toward zero** for those rows (they are **no longer** **`no_candidate`**).

- **Risk assessment:** **Low** — deterministic substring; **only** PP; **Underdog** unchanged. **Product:** combo props **no longer** attempt merge → **no** false-positive matches from guessing.

- **Tests added/updated:** **`tests/phase60_merge_pp_combo_label.spec.ts`** — canonical code, PP combo excluded + **single** pick still merges, UD **`" + "`** not excluded by PP rule; **`phase39`** canonical mapping includes **`combo_label_excluded`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js` on **`tests/phase60_merge_pp_combo_label.spec.ts`**, **`tests/phase39_merge_contract_and_audit.spec.ts`**, **`tests/phase11_matching_coverage_baseline.spec.ts`**, **`tests/phase58_merge_pp_no_candidate_observability.spec.ts`**, **`tests/phase40_merge_quality.spec.ts`**, **`tests/phase41_merge_quality_enforcement.spec.ts`**, **`tests/phase44_merge_diagnostics.spec.ts`**, **`tests/phase16_tier1_scarcity_attribution.spec.ts`** (**pass**).

### Phase 61 — Post-combo full-run reassessment (analysis only)

- **Assumptions:** Phase **60** complete. **No** code changes — **read-only** reassessment after **`scripts/run_optimizer.ps1 -Force`** with **Phase 60** active (**2026-03-21**).

- **Files inspected:** `docs/PROJECT_STATE.md` (Phases **59–60**); **run log** (PP **`mergeOddsWithProps`** line); **`data/reports/latest_merge_pp_no_candidate_observability.json`** / **`.md`**; **`data/reports/latest_merge_quality.json`** (**note:** final **`metrics`** / **`dropReasonDistribution`** reflect **Underdog** last pass in **`both`** — **PP** counts taken from **log** + **PP** observability); **`data/reports/merge_archive/2026-03-21T17-06-23.722Z__phase61-full-run/`** (**`npm run archive:merge -- --label phase61-full-run`**).

- **Full-run post-combo summary (PP, this run):** **raw** **5095**; **`combo_label_excluded`:** **107**; **`no_odds_stat`:** **28**; **`no_candidate`:** **30**; **`line_diff`:** **19**; **`juice`:** **0**; **merged** **599**; **match-eligible** **648**. **`latest_merge_pp_no_candidate_observability.json`:** **`ppNoCandidateDropCount`:** **30** (all **single-player** — **`comboLabelCount`:** **0**, **`combo.totalDrops`:** **0**); **`top1ShareOfSinglePlayerNoCandidate`:** **≈0.233** (**7**/**30**); **9** distinct normalized keys; concentration **`distributed`**.

- **What changed vs pre-combo (Phase 59 evidence):** Phase **59** (earlier slate): **156** PP **`no_candidate`**, **~131** of which were **combo-shaped** (**~84%**). **Phase 60** moves combo-shaped rows to **`combo_label_excluded`** (not **`no_match`**). **This run:** **107** rows **`combo_label_excluded`**; **30** **`no_candidate`** (down from **156** on a **different** raw count — **5095** vs **~5678** in Phase **59**/**61** comparison runs). **Residual PP `no_candidate`** is **single-player-only** in the **Phase 58** artifact (**0** combo in **`no_candidate`** slice). **Sanity:** **107** + **30** **=** **137** vs old **156** **`no_candidate`** — same **order of magnitude**, consistent with **reclassification** + **slate drift**.

- **Remaining dominant PP bottlenecks (this run):** **`no_odds_stat` (28)** ≈ **`no_candidate` (30)**; **`line_diff` (19)** third. **Single-player `no_candidate`** remains **spread** across **9** players (**PRA** / **PA** / **combo stat** rows appear in **`noCandidateByPlayerAndStat`** — not only **`points`**).

- **Question — aliases justified?** **Not** as a **blind** primary phase: **`top1ShareOfSinglePlayerNoCandidate` ~0.23** &lt; **0.5** → **`distributed`**; same **repeat** names (**nickeil alexander walker**, **bub carrington**, etc.) may still merit **evidence-backed** **`PLAYER_NAME_ALIASES`**, but **concentration** does **not** dominate the **30** drops.

- **Failure mix (interpretation):** **`no_odds_stat`** → **residual stat/feed gaps** (log: **stocks**, **turnovers** dynamic filter). **`no_candidate`** (single-player) → **mixed**: **possible** name/slate/line/market-shape (**multi-stat** legs) — **not** proven **pure** spelling drift from this artifact alone. **`line_diff`** → **line** geometry / alt coverage.

- **Safe next improvement candidates:** **(1)** **PP `no_odds_stat` / stat–market alignment** where OddsAPI or **STAT_MAP** can safely add coverage; **(2)** **CSV-backed** incremental **`PLAYER_NAME_ALIASES`** for **repeat** normalized keys **after** operator review; **(3)** **operational** **`line_diff`** review (tolerance **unchanged** in code unless evidence).

- **Risky candidates to defer:** **Fuzzy** name matching; **broad** tolerance changes; **large** merge refactors **without** **`merge_report`** evidence.

- **Recommended next phase (exactly one):** **PP residual `no_odds_stat` / stat–feed alignment** (**stocks**, **turnovers**, and any **high-volume** gaps) — **ties** **`no_candidate`** in volume (**28** vs **30**) and is **explicitly** **feed-classified**; **aliases** remain **secondary** until **CSV** shows **repeatable** **single-player** string pairs **or** concentration rises **after** feed gaps shrink.

- **Validation commands run (agent):** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); `npm run archive:merge -- --label phase61-full-run` (**pass**); read **`latest_merge_pp_no_candidate_observability.json`**, run log.

### Phase 62 — PP residual `no_odds_stat` / stat–feed alignment (Odds API markets)

- **Assumptions:** Phase **61** complete. Scope: **PrizePicks ↔ Odds API** coverage only — **no** merge tolerance, **no** **`PLAYER_NAME_ALIASES`**, **no** composite-EV math changes.

- **Files inspected:** **`docs/PROJECT_STATE.md`** (Phase **61** baseline); **`src/fetch_oddsapi_props.ts`** (**`REQUIRED_MARKETS`**, **`DEFAULT_MARKETS_ALTERNATE`**, **`MARKET_KEY_TO_STAT`**); **[The Odds API betting markets](https://the-odds-api.com/sports-odds-data/betting-markets.html)** (NBA: **`player_blocks_steals`**, **`player_turnovers`**, **`player_turnovers_alternate`**); **`src/merge_odds.ts`** (**`buildPpStatsNotInOdds`**, **`normalizeStatForMerge`** / **`STAT_MAP`** — unchanged); **`src/fetch_props.ts`** **`mapStatType`** (PP already maps **`stocks`** / **`turnovers`**).

- **Residual PP `no_odds_stat` baseline (Phase 61 run):** **`no_odds_stat` = 28** on PP (**`[MergeStats]`**); Phase **61** text attributes dominant volume to **stocks** / **turnovers** appearing in the **dynamic** “not in odds feed” pre-filter while Odds API **never** requested those market keys.

- **Root cause:** **`buildPpStatsNotInOdds`** compares PP **`pick.stat`** (canonical **`stocks`**, **`turnovers`**) to **`oddsMarkets`** stats. The fetch layer only requested **10 + 4** NBA player markets — **excluding** **`player_blocks_steals`** (API name for blocks+steals) and **`player_turnovers`**. Feed rows for those stats were **absent**, so every PP **`stocks` / `turnovers`** leg was **truthfully** pre-skipped as **`no_odds_stat`** despite The Odds API supporting the markets.

- **Chosen alignment (single bounded set):** Extend **`REQUIRED_MARKETS`** with **`player_blocks_steals` → `stocks`** and **`player_turnovers` → `turnovers`**; extend **`DEFAULT_MARKETS_ALTERNATE`** with **`player_turnovers_alternate` → `turnovers`** (matches documented alternate NBA list). **Deterministic** key→stat mapping only; **no** fuzzy logic.

- **Files changed:** **`src/fetch_oddsapi_props.ts`**; **`tests/phase62_pp_stat_feed_nba_markets.spec.ts`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase62_pp_stat_feed_nba_markets.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior change:** Odds API event requests include **17** market keys (**12** primary + **5** alternate) instead of **14**. **`normalizeEvent`** ingests **`player_blocks_steals`** / **`player_turnovers`** / **`player_turnovers_alternate`** into **`InternalPlayerPropOdds`** with **`stat`** **`stocks`** / **`turnovers`**. **`buildPpStatsNotInOdds`** then sees those stats in **`oddsStatSet`** → PP **`stocks`/`turnovers`** picks are **no longer** pre-dropped as **`no_odds_stat`** when the feed has rows; they proceed to normal **candidate / line / juice** matching (**unchanged** tolerance and tie-break).

- **Evidence of impact (post-change run, 2026-03-21):** **`scripts/run_optimizer.ps1 -Force`** — PP **`[MergeStats]`:** **`noOddsStat=0`** (was **28** in Phase **61** baseline on a different slate). Log shows requested markets include **`player_blocks_steals`**, **`player_turnovers`**, **`player_turnovers_alternate`**. PP **`stat_balance`** includes **`turnovers=14`**, **`stocks=12`** merged legs. **`npm run archive:merge -- --label phase62-stat-feed`** → **`data/reports/merge_archive/2026-03-21T18-44-38.358Z__phase62-stat-feed/`**.

- **Risk assessment:** **Low** mapping risk (official API keys). **Operational:** **~21%** more markets per event (**14 → 17**) → higher Odds API **token** use per run; monitor **`[ODDS-QUOTA]`** / **`cost_report.json`**. **No** EV/breakeven/payout/combinatorics/selection code paths changed.

- **Tests added/updated:** **`tests/phase62_pp_stat_feed_nba_markets.spec.ts`** — asserts **`REQUIRED_MARKETS`** / **`DEFAULT_MARKETS_ALTERNATE`** contain the new keys and **`StatCategory`** mappings.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase62_pp_stat_feed_nba_markets.spec.ts` (**pass**); `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); `npm run archive:merge -- --label phase62-stat-feed` (**pass**).

### Phase 63 — Post-stat-feed reassessment (analysis only)

- **Assumptions:** Phase **62** complete (**Odds API** **`player_blocks_steals`** / **`player_turnovers`** markets live). **No** merge/code changes in this phase — **read-only** reassessment after **`scripts/run_optimizer.ps1 -Force`** (**2026-03-21**).

- **Files inspected:** **`docs/PROJECT_STATE.md`** (Phases **61–62**); **run log** (PP **`mergeOddsWithProps`** / **`[MergeStats] prizepicks`**); **`data/reports/latest_merge_pp_no_candidate_observability.json`**; **`data/reports/latest_merge_quality.json`** (**final** **`metrics`** reflect **Underdog** last pass in **`both`** — PP counts from **log** + **PP** observability); **`data/reports/merge_archive/2026-03-21T18-49-34.988Z__phase63-post-stat-feed/`** (**`npm run archive:merge -- --label phase63-post-stat-feed`**). **Phase 61** archive snapshot **`2026-03-21T17-06-23.722Z__phase61-full-run/`** for baseline comparison.

- **Full-run post-Phase-62 summary (PP, this run):** **raw** **5208**; **`combo_label_excluded`:** **107**; **`no_odds_stat`:** **0**; **`no_candidate`:** **22**; **`line_diff`:** **2**; **`juice`:** **1**; **merged** **662** (**660** exact + **2** nearest per log); **match-eligible** **687**. **`latest_merge_pp_no_candidate_observability.json`:** **`ppNoCandidateDropCount`:** **22** (all **single-player** — **`comboLabelCount`:** **0**); **`top1ShareOfSinglePlayerNoCandidate`:** **≈0.318** (**7**/**22**); **`interpretation`:** **`distributed`**; **7** distinct normalized keys.

- **What changed vs Phase 61 (same dimension, different slate):** Phase **61** evidence: **`no_odds_stat` = 28**, **`no_candidate` = 30**, **`line_diff` = 19**, **raw ~5095**, **merged ~599**. **This run:** **`no_odds_stat` → 0** (stat-feed gap **closed**); **`no_candidate` 22** vs **30**; **`line_diff` 2** vs **19**; **raw 5208** vs **5095**; **merged 662** vs **599**. **`combo_label_excluded` 107** vs **107** (stable substring gate). **Caveat:** slate/tape drift — compare **rates** and **dominant failure classes**, not only raw equality.

- **Did Phase 62 materially remove PP stat/feed failures?** **Yes** — PP **`no_odds_stat`** is **0** on **`[MergeStats]`** (Phase **61** had **28**). Residual PP merge friction is **no longer** dominated by missing **`stocks`/`turnovers`** markets.

- **Residual PP single-player `no_candidate` — aliases justified?** **Phase 58** **`top1Share`** **≈0.32** &lt; **0.5** → artifact label stays **`distributed`** (single-key **concentration** rule **not** met). **However,** **three** names (**nickeil alexander walker**, **tristan silva**, **herbert jones**) account for **7+6+5 = 18** of **22** drops (**≈82%** top-**3** share) with **multi-stat** **`noCandidateByPlayerAndStat`** — consistent with **repeatable** Odds↔PP **identity** gaps **if** **`merge_report`** shows systematic name mismatch (not proven from JSON alone). **Verdict:** **Blind** bulk **`PLAYER_NAME_ALIASES`** still **not** justified by **top-1** concentration alone; **evidence-backed**, **CSV/`merge_report`-verified** aliases for **those** high-repeat keys are **proportionally** the **best next merge lever** now that **`no_odds_stat` = 0**.

- **Remaining dominant PP bottlenecks (this run):** **`no_candidate` (22)** ≫ **`line_diff` (2)**; **`combo_label_excluded` (107)** is large but **by design** (Phase **60**). **`no_odds_stat`:** **0**.

- **Safe next improvement candidates:** **(1)** **Bounded `PLAYER_NAME_ALIASES`** (or small **deterministic** normalization table) keyed from **`merge_report`** / operator **CSV** for **repeat** normalized keys; **(2)** **Operational** review of **2** **`line_diff`** rows; **(3)** **Re-run** **`diff:merge-archives`** vs **Phase 62** archive when investigating regressions.

- **Risky candidates to defer:** **Fuzzy** name matching; **tolerance** widening; **merge** refactors **without** per-row evidence.

- **Recommended next phase (exactly one):** **PP evidence-backed `PLAYER_NAME_ALIASES`** (or equivalent **deterministic** name map) **limited** to **documented** OddsAPI↔PP string pairs — **after** **`merge_report`** / **`latest_merge_player_diagnostics`** confirms **name** vs **missing market** for the **~82%** top-**3** cluster.

- **Validation commands run (agent):** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); `npm run archive:merge -- --label phase63-post-stat-feed` (**pass**); read **`latest_merge_pp_no_candidate_observability.json`**, PP **`[MergeStats]`** line.

### Phase 64 — PP evidence-backed `PLAYER_NAME_ALIASES` (bounded pass)

- **Assumptions:** Phase **63** evidence read; aliases **only** where **`prizepicks_imported.csv`** display name **≠** Odds **`oddsapi_imported.csv`** normalized name for the **same** slate (crosswalk **2026-03-21**). **No** fuzzy matching, **no** tolerance/EV changes.

- **Files inspected:** **`docs/PROJECT_STATE.md`** (Phase **63**); **`prizepicks_imported.csv`** / **`oddsapi_imported.csv`** (grep: **Herbert** vs **Herb Jones**, **Tristan Silva** vs **Tristan da Silva**); **`data/reports/merge_archive/2026-03-21T18-49-34.988Z__phase63-post-stat-feed/`** (**`ppNoCandidateDropCount` = 22** baseline for that snapshot); **`src/merge_odds.ts`** **`PLAYER_NAME_ALIASES`**.

- **Residual PP `no_candidate` baseline (Phase 63 archive):** **`ppNoCandidateDropCount` = 22**; top volume on **`herbert jones`**, **`tristan silva`**, **`nickeil alexander walker`**, etc.

- **Documented alias pairs (PP `normalizeName` key → Odds-aligned target string):**
  1. **PP** **`Herbert Jones`** (`herbert jones`) ↔ **OddsAPI** **`Herb Jones`** (`herb jones`) — books use shortened first name; **not** fixable by punctuation normalization alone.
  2. **PP** **`Tristan Silva`** (`tristan silva`) ↔ **OddsAPI** **`Tristan da Silva`** (`tristan da silva`) — registered-name **`da`** in feed vs PP display.

- **Files changed:** **`src/merge_odds.ts`** — two **`PLAYER_NAME_ALIASES`** entries + comments; **`tests/phase64_pp_player_name_aliases.spec.ts`** (**new**); **`package.json`** — **`verify:canonical`** includes **`tests/phase64_pp_player_name_aliases.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior change:** For those picks only, **`resolvePlayerNameForMatch`** substitutes the Odds-side spelling **before** **`normalizeForMatch`**, so **`findBestMatchForPickWithReason`** can see **`(player, stat, league)`** candidates. **No** change to **`maxLineDiff`**, juice gates, or ordering.

- **Evidence of impact:** **`scripts/run_optimizer.ps1 -Force`** post-change — PP **`[MergeStats]`:** **`noCandidate=13`** (was **22** on Phase **63** snapshot; **same** run also shows **`line_diff=8`** vs **2** — former **name** failures can surface as **line** mismatch once matched to a player pool). **`latest_merge_pp_no_candidate_observability.json`:** **`ppNoCandidateDropCount` = 13**; **Herbert** / **Tristan** keys **absent** from **`noCandidateByNormalizedPlayer`**; **`top1ShareOfSinglePlayerNoCandidate` ≈ 0.54** (**Nickeil**-only tail). **`npm run archive:merge -- --label phase64-player-aliases`** → **`data/reports/merge_archive/2026-03-21T18-55-09.474Z__phase64-player-aliases/`**.

- **Risk assessment:** **Low** — **two** explicit string pairs; wrong mapping would mis-merge **only** those display names (deterministic). **Operational:** re-verify pairs if PP or books change legal-name formatting.

- **Tests added/updated:** **`tests/phase64_pp_player_name_aliases.spec.ts`** — **`mergeWithSnapshot`** happy paths for both aliases + **`normalizePickPlayerKeyForDiagnostics`** parity.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase64_pp_player_name_aliases.spec.ts` (**pass**); `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_optimizer.ps1 -Force` (**exit 0**); `npm run archive:merge -- --label phase64-player-aliases` (**pass**).

### Phase 65 — Residual PP merge reassessment (analysis only)

- **Assumptions:** Phase **64** complete. **`both`** run order (**PP** then **UD**) means **`latest_merge_audit.json`** / **`latest_merge_diagnostics.json`** / **`latest_merge_quality.json`** **last** reflect **Underdog** — **PP** volumes taken from **Phase** **64** documented **`[MergeStats] prizepicks`** line + **`latest_merge_pp_no_candidate_observability.json`** (aligned with **`merge_archive/2026-03-21T18-55-09.474Z__phase64-player-aliases/`**).

- **Files inspected:** **`docs/PROJECT_STATE.md`** (Phases **63–64**); **`data/reports/latest_merge_pp_no_candidate_observability.json`**; **`data/reports/merge_archive/2026-03-21T18-55-09.474Z__phase64-player-aliases/`** (**`merge_pp_no_candidate_observability.json`**, **`merge_audit.json`** header for **CLI** contract only); **`data/reports/latest_merge_audit.json`**, **`latest_merge_diagnostics.json`** (**UD**-weighted — **not** used for PP drop totals); Phase **64** run log excerpt in **`PROJECT_STATE`** (**PP** **`[MergeStats]`**).

- **Full-run residual PP summary (Phase 64 post-merge snapshot, `2026-03-21T18:54Z`):** **`combo_label_excluded`:** **107**; **`no_odds_stat`:** **0**; **`no_candidate`:** **13**; **`line_diff`:** **8**; **`juice`:** **1**; **merged** **673** (**671** exact + **2** nearest); **raw** **5127**; **match-eligible** **695**.

- **What changed vs Phase 64 baseline:** Phase **65** is **read-only** — **same** artifacts as **Phase** **64** **post-run** (no new optimizer execution in this phase). **vs Phase** **63** (**pre-alias**): **`no_candidate` 22 → 13** (**−9**); **`line_diff` 2 → 8** (**+6** — **expected** when **name** barriers fall and picks **meet** a **player** pool but **miss** **exact** **line**/juice); **`no_odds_stat`** stays **0** (**Phase** **62**).

- **Residual `no_candidate` keys & concentration:** **`ppNoCandidateDropCount` = 13**; **`distinctNormalizedPlayerKeys` = 7**; **`top1ShareOfSinglePlayerNoCandidate` ≈ 0.538** (**7**/**13**) → artifact **`high_top_key_concentration`** (**Nickeil** tail). **Per-player:** **`nickeil alexander walker`:** **7**; **six** **×1** keys (**coby white**, **isaiah joe**, **jalen green**, **justin edwards**, **kyle filipowski**, **ryan kalkbrenner**). **By stat (singletons + Nickeil):** **stocks** **4**, **rebounds_assists** **2**, **steals** **1**, plus **Nickeil** multi-stat block (**7**).

- **Phase 64 vs known name-mismatch cluster:** **Yes** — **Herbert** / **Tristan** **no longer** appear in **`noCandidateByNormalizedPlayer`**; **Phase 64** aliases addressed the **documented** **PP↔Odds** string pairs.

- **Next-best move (decision):** **Not** a **second** **alias** **sweep** (remaining **tails** are **mixed** **stats** — **stocks**/**RA**/**steals** — **not** **one** **repeat** **string** **pair**); **`Nickeil`** **concentration** is **high** **but** **not** **automatically** **alias**-eligible (**same** **canonical** **hyphen** **form** **already** **in** `PLAYER_NAME_ALIASES` **—** **likely** **coverage**/**line**/book **geometry**); **`line_diff` (8)** **now** **rivals** **`no_candidate` (13)** **for** **operator** **attention** **without** **tolerance** **changes**. **Residual** **stat/feed:** **`no_odds_stat` = 0** — **no** **broad** **Odds** **market** **gap** **on** **NBA** **core** **list**.

- **Safe next improvement candidates:** **Operational** **review** **of** **`merge_report`** **rows** **for** **`line_diff`** **+** **remaining** **`no_candidate`** (**Nickeil** **seven** **rows** **first**); **monitor** **weekly** **slates** **for** **regression**; **keep** **`PLAYER_NAME_ALIASES`** **append-only** **with** **CSV** **proof**.

- **Risky candidates to defer:** **Fuzzy** **names**; **tolerance** **widening**; **blind** **alias** **for** **Nickeil** **without** **row** **proof**; **large** **merge** **refactors**.

- **Recommended next implementation phase (exactly one):** **Pause routine PP merge feature work** — plateau after Phases **60** / **62** / **64**; **no default Phase 66 merge PR** unless **`merge_report`** or operator review finds a new deterministic pair or a regression. **Next engineering value** is **outside merge** (e.g. EV, selection, calibration, UD) unless product prioritizes a **scoped `line_diff` diagnostics export (read-only)**.

- **Validation commands run (agent):** **Read-only** **—** **`docs/PROJECT_STATE.md`**; **`data/reports/latest_merge_pp_no_candidate_observability.json`**; **`data/reports/merge_archive/2026-03-21T18-55-09.474Z__phase64-player-aliases/`**; **`data/reports/latest_merge_audit.json`** / **`latest_merge_diagnostics.json`** / **`latest_merge_quality.json`** (**context** **only**). **No** **optimizer** **re-run** **required** **for** **this** **snapshot** **(same** **as** **Phase** **64** **post-run** **artifacts**).

### Phase 66 — Calibration surface baseline (analysis / reporting only)

- **Assumptions:** **No** EV, breakeven, payout registry, or combinatorics changes; **no** new data pipeline — **`data/perf_tracker.jsonl`** is the sole outcome + prediction source; **predicted edge** requires **`trueProb`** and **`impliedProb`** on the row (older rows may land in **`edge_unavailable`**); **realized return proxy** uses **`rowRealizedProfitPerUnit`** (American stake=1) when open/chosen odds exist.

- **Purpose:** Deterministic **calibration surface** comparing predicted edge / EV vs realized hit rate and a per-leg ROI proxy, sliced by **site**, **structure**, **flex kind**, **leg count**, **edge buckets** (**<2%** … **8%+**), and **EV buckets** (same numeric cutpoints on **`projectedEV`**), plus **site × edge** cross-tab.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/perf_tracker_types.ts`**; **`src/perf_tracker_db.ts`**; **`src/tracking/export_model_evaluation.ts`**; **`src/config/parlay_structures.ts`**; **`data/perf_tracker.jsonl`**.

- **Files changed:** **`src/reporting/calibration_surface.ts`** — **`buildCalibrationSurfaceReport`**, **`renderCalibrationSurfaceMarkdown`**, deterministic **`edgeBucketId` / `evBucketId`**, **`inferSite`**, **`inferLegCountFromStructure`**; **`src/reporting/export_calibration_surface.ts`** — writes **`data/reports/latest_calibration_surface.json`** / **`.md`**; **`src/tracking/export_model_evaluation.ts`** — exports **`rowRealizedProfitPerUnit`**; **`package.json`** — **`export:calibration-surface`**, **`verify:canonical`** includes **`tests/phase66_calibration_surface.spec.ts`**; **`tests/phase66_calibration_surface.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`npm run export:calibration-surface`** reads **`readTrackerRows()`**, keeps only **`result ∈ {0,1}`**, aggregates per slice with **sample count**, **win rate**, **avg predicted edge** (basis count), **avg predicted EV** (basis count), **realized return proxy** (basis count); **empty buckets** show zero **N** and **—** in markdown via null metrics; schema version **`schemaVersion: 1`**.

- **Tests added:** **`tests/phase66_calibration_surface.spec.ts`** — bucket boundaries, **`edge_unavailable` / `ev_unavailable`**, PP vs UD **`inferSite`**, empty aggregation, stability, unresolved exclusion.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npm run verify:canonical` (**pass**); `npx jest --config jest.config.js tests/phase66_calibration_surface.spec.ts tests/phase16q_model_eval.spec.ts --runInBand` (**pass**); `npx ts-node src/reporting/export_calibration_surface.ts` (**writes** **`data/reports/latest_calibration_surface.*`**). **Note:** full-repo `npx jest --config jest.config.js --runInBand` reports **2** pre-existing failures in **`tests/prod.spec.ts`** — **not** introduced by Phase **66**.

- **Calibration findings summary (current `perf_tracker` snapshot, illustrative):** Resolved **N** is small; **site** slice is **PP-only** in the checked file; **predicted edge** is only populated where **`impliedProb`** exists (**7** / **16** resolved in sample); **<2%** edge bucket shows low realized win rate vs higher buckets in the small **EV** stratification — interpret cautiously until **UD** volume and **implied** coverage grow.

- **Risks / follow-ups:** Regenerate **`latest_calibration_surface.*`** after tracker backfill / scrape updates.

### Phase 67 — Implied probability completion & tracker integrity

- **Assumptions:** **No** optimizer EV/breakeven/selection/merge changes; **`data/perf_tracker.jsonl`** remains append-only contract; **platform** / **trueProb** / **impliedProb** / **projectedEV** completeness uses **deterministic** **leg_id** platform inference and **never** fabricates odds; snapshot recovery reuses **`loadSnapshots`** + conservative market match (same shape as CLV close reconciliation, but **earliest** pre-start snapshot for open-line recovery when row/CSV lack odds).

- **Purpose:** Measurable **tracker completeness** and **grounded** **`impliedProb`** backfill so Phase **66** edge buckets are not silently starved; explicit **primary-reason** breakdown for resolved-but-not-calibratable rows.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/perf_tracker_types.ts`**; **`src/perf_tracker_db.ts`**; **`src/backfill_perf_tracker.ts`**; **`src/tracking/reconcile_closing_lines.ts`** (**`loadSnapshots`**); **`src/reporting/calibration_surface.ts`** / **`export_calibration_surface.ts`**; **`data/perf_tracker.jsonl`**.

- **Files changed:** **`src/tracking/tracker_integrity_contract.ts`** — **`computeTrackerCompleteness`**, **`primaryCompletenessReasonResolved`**, **`isFullyCalibratableResolved`**; **`src/tracking/implied_prob_recovery.ts`** — **`tryDeriveImpliedProbFromRowFields`**, **`resolveEarliestPreStartChosenOdds`**, **`applyGroundedTrackerEnrichment`**; **`src/reporting/export_tracker_integrity.ts`** — **`latest_tracker_integrity.*`**; **`src/backfill_perf_tracker.ts`** — export **`LegCsvRecord`**, **`loadLegsMap`**, **`existingLegCsvPaths`**; **`src/reporting/calibration_surface.ts`** — additive **`definitions.trackerIntegrity`**; **`package.json`** — **`export:tracker-integrity`**, **`backfill:tracker-implied`**, **`verify:canonical`** includes **`tests/phase67_tracker_integrity.spec.ts`**; **`tests/phase67_tracker_integrity.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`npm run export:tracker-integrity`** runs enrichment **in memory**, writes JSON/MD with **before/after** completeness + **enrichmentStats** + **primaryReason** tables + residual missing-implied diagnostics; **`npm run backfill:tracker-implied`** persists **`writeTrackerRows`** after the same pass. **`impliedProb`** filled from **`openImpliedProb`**, **`openOddsAmerican`**, **over/under + side**, **legs CSV** odds merge, then **snapshot** (requires **`gameStartTime`** for snapshot path).

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npm run verify:canonical` (**pass**); `npx jest --config jest.config.js tests/phase67_tracker_integrity.spec.ts tests/phase66_calibration_surface.spec.ts --runInBand` (**pass**); `npx ts-node src/reporting/export_tracker_integrity.ts` + **`export:calibration-surface`** (**writes** reports). Full-repo Jest without **`verify:canonical`** may still hit unrelated **`tests/prod.spec.ts`** failures — **not** part of this phase.

- **Tracker integrity findings summary (illustrative repo snapshot):** With current **`perf_tracker`**, **dry-run** enrichment **did not** increase **fully calibratable** resolved rows (**7**/**16**) because **9** resolved legs lack **`gameStartTime`** (snapshot path skipped) and **legs CSV** merge found **0** additional **`leg_id`** joins in this tree — **blockers are explicit** in **`latest_tracker_integrity.json`** (**`skippedSnapshotNoGameStart`**, **`missing_game_start`** residual). **`platformFilledFromInference`** persists explicit **`platform`** when missing (completeness already counted via **leg_id**).

- **Risks / follow-ups:** Run **`enrichExistingTrackerStartTimes`** / backfill pipeline so **`gameStartTime`** exists where possible; re-run **`backfill:tracker-implied`** after **`data/legs_archive`** / tier CSVs cover historical **`leg_id`**s.

### Phase 68 — Game-time backfill & temporal integrity

- **Assumptions:** **No** EV/breakeven/merge/selection/ranking changes; **no** fuzzy schedule inference; **no** per-market commence times from OddsAPI snapshot rows in-repo (**`fromSnapshotEvent: 0`**); **`implied_prob_recovery`** imports **`legs_csv_index`** (same **`loadLegsMap` / `existingLegCsvPaths`** as backfill) — **no** recovery math changes beyond rows that gain valid **`gameStartTime`** becoming snapshot-eligible.

- **Purpose:** Maximize **grounded**, **attributable** **`gameStartTime`** on **`perf_tracker`** rows so Phase **67** snapshot-based **`impliedProb`** recovery can run on materially more resolved legs; measure coverage, source attribution, and explicit untimed reason codes.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/backfill_perf_tracker.ts`**; **`src/tracking/legs_csv_index.ts`**; **`src/tracking/tracker_start_time_sources.ts`**; **`src/tracking/tracker_temporal_integrity.ts`**; **`src/tracking/implied_prob_recovery.ts`**; **`src/reporting/export_tracker_integrity.ts`** (pattern).

- **Files changed:** **`src/backfill_perf_tracker.ts`** — remove duplicate CSV/candidate helpers; **`enrichExistingTrackerStartTimes`** delegates to **`enrichTrackerGameStartTimes`** + **`toLegacyEnrichStats`**; **`src/reporting/export_tracker_temporal_integrity.ts`** — **`latest_tracker_temporal_integrity.*`**; **`src/tracking/implied_prob_recovery.ts`** — import **`legs_csv_index`**; **`package.json`** — **`export:tracker-temporal-integrity`**, **`backfill:tracker-start-times`**, **`verify:canonical`** includes **`tests/phase68_tracker_temporal_integrity.spec.ts`**; **`tests/phase68_tracker_temporal_integrity.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`computeTemporalIntegritySnapshot`** / **`enrichTrackerGameStartTimes`** (CSV **`leg_id`** first, then JSON + **`oddsapi_today`**; conflict fail-closed; invalid non-empty **`gameStartTime`** not overwritten); **`export:tracker-temporal-integrity`** writes JSON/MD with before/after coverage + enrichment stats + implied outlook; **`backfill:tracker-start-times`** persists when **`rowsBackfilledThisPass > 0`**.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase68_tracker_temporal_integrity.spec.ts`; `npm run export:tracker-temporal-integrity`; `npm run verify:canonical` (or note any unrelated Jest failures).

- **Temporal integrity findings summary:** See **`data/reports/latest_tracker_temporal_integrity.json`** on the repo snapshot used when the export was run; resolved **`gameStartTime`** coverage and **`reasonBreakdownUntimed`** are the operator-facing blockers.

- **Risks / follow-ups:** Populate **`data/legs_archive`** / root legs CSVs with historical **`leg_id`** + **`gameTime`** where available; re-run **`export:tracker-integrity`** / **`export:calibration-surface`** after **`backfill:tracker-start-times`** + **`backfill:tracker-implied`**.

### Phase 69 — Tracker creation-time completeness hardening

- **Assumptions:** **No** EV/breakeven/merge/selection/ranking changes; **no** fabricated fields — only data already on tier/legs CSV at backfill time; historical rows are **not** retro-tagged; **`appendTrackerRow`** remains only from **`backfillPerfTracker`** in this repo.

- **Purpose:** New **`perf_tracker`** rows carry **`platform`**, valid **`gameStartTime`** when present on legs CSV, **`trueProb`**, implied/open-odds context, **`projectedEV`**, plus **`selectionSnapshotTs`**, **`creationTimestampUtc`**, **`creationSource`**, **`creationProvenance`**; reduce reliance on Phase **67** recovery for rows created after this phase.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/backfill_perf_tracker.ts`**; **`src/perf_tracker_types.ts`**; **`src/tracking/tracker_integrity_contract.ts`**; **`src/tracking/tracker_temporal_integrity.ts`** (`isValidGameStartTime`); **`src/reporting/export_tracker_temporal_integrity.ts`** (report pattern).

- **Files changed:** **`src/perf_tracker_types.ts`** — optional **`creationTimestampUtc`**, **`creationSource`**, **`creationProvenance`**; **`src/tracking/tracker_creation_integrity_contract.ts`** — creation contract + **`resolvePlatformForBackfill`**; **`src/tracking/tracker_creation_backfill.ts`** — **`buildPerfTrackerRowFromTierLeg`**; **`src/backfill_perf_tracker.ts`** — delegates row build to **`buildPerfTrackerRowFromTierLeg`**; **`src/reporting/export_tracker_creation_integrity.ts`** — **`latest_tracker_creation_integrity.*`**; **`package.json`** — **`export:tracker-creation-integrity`**, **`verify:canonical`** includes **`tests/phase69_tracker_creation_integrity.spec.ts`**; **`tests/phase69_tracker_creation_integrity.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** Tagged rows = **`creationTimestampUtc`** set; **`computeCreationIntegritySnapshot`** / inventory counts; primary reason codes for tagged-but-incomplete rows; provenance aggregate **`field=value`** keys; archive guidance in report notes only (no new storage paths).

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase69_tracker_creation_integrity.spec.ts --runInBand` (**pass**); `npm run export:tracker-creation-integrity` (**writes** reports); `npm run verify:canonical` (**pass**).

- **Creation-time integrity findings summary (current repo snapshot):** **`rowsCreated` (tagged) = 0** until new backfill appends; **`inventoryAllRows`** still reports full-stock creation-contract coverage for operator visibility.

- **Risks / follow-ups:** After next **`backfillPerfTracker`** run, re-check **`latest_tracker_creation_integrity.*`** and Phase **67** exports for improved implied coverage on new legs.

### Phase 70 — Fresh data seeding & post-hardening validation

- **Assumptions:** **No** optimizer/EV/merge changes; validation uses **only** existing **`tier1.csv` / `tier2.csv`**, **`existingLegCsvPaths`**, and current **`data/perf_tracker.jsonl`**; if no new **(date, leg_id)** keys exist, **zero** new tagged rows is **evidence**, not failure.

- **Purpose:** Run the narrowest backfill path, regenerate integrity + calibration reports, and record **pre/post-style** metrics in one comparison artifact; prove whether Phase **69** tagging can activate on this tree or document the **exact** missing pipeline output.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/backfill_perf_tracker.ts`**; **`package.json`**; existing **`data/reports/latest_*.json`**; **`tier1.csv`**, **`tier2.csv`**, **`data/perf_tracker.jsonl`**.

- **Files changed:** **`scripts/phase70_post_hardening_validation.ts`** — **`runPhase70Validation`**, writes **`latest_phase70_post_hardening_comparison.*`**; **`package.json`** — **`validate:phase70`**; **`docs/PROJECT_STATE.md`** (this section). Regenerated: **`latest_tracker_creation_integrity.*`**, **`latest_tracker_temporal_integrity.*`**, **`latest_tracker_integrity.*`**, **`latest_calibration_surface.*`**, **`latest_phase70_post_hardening_comparison.*`**.

- **Exact behavior added:** Script calls **`backfillPerfTracker()`** then **`exportTrackerCreationIntegrity`**, **`exportTrackerTemporalIntegrity`**, **`exportTrackerIntegrity`**, **`exportCalibrationSurface`**; JSON aggregates tagged count, resolved calibratable/implied/gameStart rates, **`edge_unavailable`** resolved count; **`blocker`** object when **`appended===0`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npm run validate:phase70` (**pass**; **`appended=0`**, **`skipped=30`**); `npm run verify:canonical` (**pass**).

- **Post-hardening findings summary:** **No** new tracker rows appended — root tier CSVs are already fully keyed in **`perf_tracker`**; **`creationTaggedRows=0`**; comparison snapshot still captures downstream metrics (**e.g.** resolved fully calibratable **7**/**16**, resolved **`gameStartTime`** **0**/**16**, **`edge_unavailable`** resolved **9**). **Unblock:** run a fresh optimizer pass that writes **new** tier CSV rows + **matching** legs CSV rows, then **`npm run validate:phase70`** again.

- **Risks / follow-ups:** Commit **`data/reports/latest_phase70_post_hardening_comparison.*`** after real pipeline runs for audit trail; do not fabricate tier rows.

### Phase 71 — Full PP/UD pipeline trace diagnosis

- **Assumptions:** **No** EV/breakeven/payout/merge behavior changes; diagnosis reads **committed** **`data/reports/*.json`** from the latest full run (**`runTimestampEt` ~ 2026-03-21T18:00:11 ET**) plus **`data/output_logs/underdog-legs.csv`** for a concrete **-650** example; PP merge detail uses **`latest_platform_survival_summary.json`** when **`latest_merge_audit.json`** lists **Underdog** only in **`matchedBySite`**.

- **Purpose:** Single artifact family proving where PP cards go to **zero** and whether UD extreme prices are mishandled — reusing Phase **17**–**70** reports and **`math_models/juice_adjust.ts`** for leg EV semantics.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`data/reports/latest_platform_survival_summary.json`**, **`latest_run_status.json`**, **`latest_eligibility_policy_contract.json`**, **`latest_merge_audit.json`**, **`latest_final_selection_observability.json`**, **`latest_final_selection_reasons.json`**, **`latest_tracker_integrity.json`**, **`latest_calibration_surface.json`**; **`data/output_logs/underdog-legs.csv`**; **`math_models/juice_adjust.ts`**; **`src/calculate_ev.ts`**.

- **Files changed:** **`src/reporting/export_pipeline_trace_diagnosis.ts`**; **`package.json`** — **`export:pipeline-trace-diagnosis`**, **`verify:canonical`** includes **`tests/phase71_pipeline_trace_diagnosis.spec.ts`**; **`tests/phase71_pipeline_trace_diagnosis.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section). Generated: **`data/reports/latest_pipeline_trace_diagnosis.*`**.

- **Exact behavior added:** Aggregates stage counts (PP: **5** legs after player cap **&lt; 6** → early exit, **0** cards; UD: merge/export chain); classifies PP root cause **`early_exit_insufficient_eligible_legs_lt_min_for_card_build`**; traces **-650** leg — **`juiceAwareLegEv` = trueProb − 0.5** (odds unused per **`juice_adjust.ts`**), CSV **`legEv`** matches canonical; **fair** de-vig over prob ≈ model **trueProb** for the sample row (interpretation vs naive leg metric).

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase71_pipeline_trace_diagnosis.spec.ts --runInBand` (**pass**); `npm run export:pipeline-trace-diagnosis` (**pass**); `npm run verify:canonical` (**pass**).

- **Root-cause findings summary:** **PP:** Not merge-zero (**671** matched); collapse at **global player cap** leaves **5** eligible legs **&lt; `ppMinEligibleLegsForCardBuild` (6)** per eligibility contract → **`early_exit` / `insufficient_eligible_legs`**. **UD -650:** No implied-prob conversion bug; leg EV is **naive** **trueProb−0.5** by design in **`juiceAwareLegEv`**; card EV uses separate payout path.

- **Risks / follow-ups:** Changing leg EV to juice-aware edge would be an explicit **`math_models`** / policy decision — out of scope for Phase **71**.

### Phase 72 — Cross-platform market-edge alignment diagnosis

- **Assumptions:** **No** gating/EV/breakeven changes; diagnosis reads **root** **`prizepicks-legs.csv`** / **`underdog-legs.csv`** when present; thresholds from **`getDefaultCliArgs()`** + **`computePpRunnerLegEligibility`** / **`computeUdRunnerLegEligibility`**; UD gate simulation uses **`standardPickMinLegEv`** (**0.005**) as in **`filterUdEvPicksCanonical`** for standard picks (not **`udMinLegEv`** **0.012** alone).

- **Purpose:** Quantify distortion between **current** survival metric (**`juiceAwareLegEv`** = trueProb−0.5) and **market-relative** edge (**trueProb − fair chosen** via **`fairBeFromTwoWayOdds`**).

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`math_models/juice_adjust.ts`**; **`src/calculate_ev.ts`**; **`src/policy/runtime_decision_pipeline.ts`**; **`prizepicks-legs.csv`**, **`underdog-legs.csv`**.

- **Files changed:** **`src/reporting/market_edge_alignment_analysis.ts`**; **`src/reporting/export_market_edge_alignment_diagnosis.ts`**; **`package.json`** — **`export:market-edge-alignment-diagnosis`**, **`verify:canonical`** includes **`tests/phase72_market_edge_alignment.spec.ts`**; **`tests/phase72_market_edge_alignment.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section). Generated: **`data/reports/latest_market_edge_alignment_diagnosis.*`**.

- **Exact behavior added:** Per-leg **implied / fair / marketEdgeFair / delta**; PP **3-stage** analogous simulation; UD **edge + std floor** analogous simulation; extreme-price (**≤ −300** on over side) aggregates; root-cause classification **metric_definition_mismatch_plus_threshold_stacking**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase72_market_edge_alignment.spec.ts --runInBand` (**pass**); `npm run export:market-edge-alignment-diagnosis` (**pass**); `npm run verify:canonical` (**pass**).

- **Findings summary (illustrative snapshot):** On sampled CSVs, **PP** naive legs can pass floors while **marketEdgeFair** clears **0** at the same numeric thresholds; **UD** shows **many** fewer survivors under **marketEdgeFair** vs naive — consistent with **UD looking “healthier”** under naive leg EV. **Not** an implied-prob conversion bug; **metric mismatch** vs de-vig fair edge.

- **Risks / follow-ups:** Next phase: narrowly scoped **`juiceAwareLegEv`** / policy alignment if product approves — **not** implemented here.

### Phase 73 — Cross-platform gating metric correction

- **Assumptions:** **No** card EV, breakeven, payout registry, or combinatorics changes; single canonical leg-edge definition in **`math_models/juice_adjust.ts`**; PP/UD eligibility still compares **`leg.edge`** / **`leg.legEv`** (and UD **`udAdjustedLegEv`** for boosted tiers) — values now come from market-relative **`juiceAwareLegEv`** where two-way odds exist.

- **Purpose:** Replace naive **`trueProb − 0.5`** gating with **`marketEdgeFair`** = **`trueProb − fairProbChosenSide`** (two-way de-vig), keep **`legacyNaiveLegMetric`** on **`EvPick`** and CSV for transition visibility.

- **Files inspected:** **`math_models/juice_adjust.ts`**, **`math_models/nonstandard_canonical_leg_math.ts`**, **`src/calculate_ev.ts`**, **`src/nonstandard_canonical_mapping.ts`**, **`src/policy/runtime_decision_pipeline.ts`**, **`src/ev/leg_ev_pipeline.ts`**, **`src/reporting/market_edge_alignment_analysis.ts`**, **`src/run_optimizer.ts`**, **`src/run_underdog_optimizer.ts`**.

- **Files changed:** **`math_models/juice_adjust.ts`** — **`fairProbChosenSide`**, **`marketRelativeLegEdge`**, **`legacyNaiveLegMetric`**, **`juiceAwareLegEv`** (side-aware); **`math_models/nonstandard_canonical_leg_math.ts`** — **`outcome`** on input; **`src/nonstandard_canonical_mapping.ts`**; **`src/calculate_ev.ts`** — **`legacyNaiveLegMetric`**, **`fairProbChosenSide`**; **`src/types.ts`**; **`src/ev/juice_adjust.ts`**; **`src/ev/leg_ev_pipeline.ts`**; **`src/run_optimizer.ts`**, **`src/run_underdog_optimizer.ts`** — CSV columns; **`src/reporting/market_edge_alignment_analysis.ts`** — delegates to **`math_models`**; **`src/reporting/export_market_edge_alignment_diagnosis.ts`**, **`src/reporting/export_pipeline_trace_diagnosis.ts`**; **`src/reporting/export_gating_metric_correction.ts`** (new); **`src/validation/phase8_verify.ts`**; **`package.json`** — **`export:gating-metric-correction`**, **`verify:canonical`** includes **`tests/phase73_gating_metric_correction.spec.ts`**; **`tests/phase73_gating_metric_correction.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`juiceAwareLegEv(trueProb, over, under, side)`** uses **`fairProbChosenSide`** when both prices exist; **`EvPick.legacyNaiveLegMetric`** = **`effectiveTrueProb − 0.5`**; **`fairProbChosenSide`** optional on pick; legs CSV adds **`legacyNaiveLegMetric`**, **`fairProbChosenSide`**; Phase **72**-style simulation in **`export:gating-metric-correction`** documents before/after survival and viability flags.

- **Tests added:** **`tests/phase73_gating_metric_correction.spec.ts`** — fair-parity, side-aware canonical edge, extreme favorite, PP filter surface, report export.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase73_gating_metric_correction.spec.ts --runInBand` (**pass**); `npm run export:gating-metric-correction` (**pass**); `npm run verify:canonical` (**pass**).

- **Findings summary:** Gating aligns with **market-relative** edge vs two-way fair; UD **`udAdjustedLegEv`** is unchanged (structure breakeven vs **`trueProb`**). **Threshold retuning** explicitly deferred — use report **`thresholdFollowUpRecommendation`** for next phase.

- **Risks / follow-ups:** Re-run optimizer to refresh legs CSV so **`edge`/`legEv`** match live **`juiceAwareLegEv`**; Phase **74** may adjust floors or PP sourcing if pools collapse.

### Phase 74 — Threshold & viability rebalancing

- **Assumptions:** **No** EV math, breakeven, payout registry, combinatorics, or reintroduction of naive gating metrics; analysis uses **`marketEdgeFair`** only; UD CSV simulation is **standard-path** (boosted **`udAdjustedLegEv`** tier not reconstructed from exported CSV).

- **Purpose:** Identify **binding** PP/UD gates under market-relative edge, run **controlled** sweeps / **`T*`** search, apply **minimal** default threshold relaxations, and ship **JSON/MD** artifacts for operators.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`data/reports/latest_gating_metric_correction.json`**; **`src/policy/eligibility_policy.ts`**; **`src/policy/runtime_decision_pipeline.ts`**; **`src/reporting/market_edge_alignment_analysis.ts`**; **`prizepicks-legs.csv`** / **`underdog-legs.csv`**.

- **Files changed:** **`src/reporting/threshold_rebalancing_analysis.ts`** (simulation + **`T*`** helpers); **`src/reporting/export_threshold_rebalancing_analysis.ts`** (report + **`prePhase74ReferenceDefaults`**); **`src/policy/eligibility_policy.ts`** — non-volume **PP** **`adjustedEvThreshold` 0.03 → 0.0225**, **UD** **`udMinEdge` 0.008 → 0.006**; **`package.json`** — **`export:threshold-rebalancing-analysis`**, **`verify:canonical`** includes **`tests/phase74_threshold_rebalancing.spec.ts`**; **`tests/phase74_threshold_rebalancing.spec.ts`**; **`tests/phase17j_eligibility_policy_contract.spec.ts`** (mirror formulas); **`tests/phase17i_platform_survival.spec.ts`** (fixture thresholds); **`tests/phase19c_engine_parity.spec.ts`** (UD default **minEdge**); **`docs/PROJECT_STATE.md`** (this section). Generated: **`data/reports/latest_threshold_rebalancing_analysis.*`**.

- **Exact behavior added:** **`buildThresholdRebalancingAnalysis`** records baseline **`computePpRunnerLegEligibility` / `computeUdRunnerLegEligibility`**, sequential PP drops vs **`marketEdgeFair`**, FCFS **player cap** on combined floor, **UD** standard-path counts, **`findMinimalUdCombinedFloorForGoal`** (default goal **8** legs), rounded **recommended** floors when **`T*`** is null; **policy** defaults relaxed as above (CLI overrides unchanged).

- **Tests added:** **`tests/phase74_threshold_rebalancing.spec.ts`** — **`ppCombinedFloor`**, synthetic **`T*`**, policy defaults, artifact export, determinism.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase74_threshold_rebalancing.spec.ts --runInBand` (**pass**); `npm run export:threshold-rebalancing-analysis` (**pass**); `npm run verify:canonical` (**pass**).

- **Findings summary (illustrative on repo CSVs):** PP pool **5** legs → **cannot** reach **6** for card build regardless of floors (merge/source constraint); binding can be **`pp_min_edge`** when all **`marketEdgeFair < 0.015`**. UD **`T* ≈ 0`** achieves **≥8** legs on standard-path sim; code uses **0.006** **`udMinEdge`** (vs report-pure **0.005** recommendation) to avoid over-loosening.

- **Risks / follow-ups:** Monitor **CLV** / tracker after deploy; if PP remains starved, prioritize **merge breadth** before deeper floor cuts.

### Phase 75 — PP merge breadth expansion

- **Assumptions:** **No** EV math, gating metric, or threshold changes; **no** fuzzy matching; **no** duplicated math outside **`math_models/`**; site-invariant pipeline preserved; PrizePicks JSON may include **`stat_display_name`** and/or **`relationships.stat_type`** + **`included`** `stat_type` resources.

- **Purpose:** Recover **RawPick** rows lost to unmapped **`stat_type`** shapes and **spaced combo** labels; add **explicit** `STAT_MAP` **`p+a`** / **`r+a`** tokens for merge alignment with OddsAPI combo markets.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/fetch_props.ts`**; **`src/merge_odds.ts`**; **`pp_projections_sample.json`**; **`prizepicks-legs.csv`**; **`data/reports/latest_merge_audit.json`**.

- **Files changed:** **`src/fetch_props.ts`** — **`resolvePrizePicksStatTypeRaw`**, **`buildStatTypeMap`**, **`mapPrizePicksStatType`** (exported; **`nbaComboTokenMatch`** spacing collapse + **`P+A`/`R+A`**), **`mapJsonToRawPicks`** (exported), **`PrizePicksProjectionsResponse`** export; **`src/merge_odds.ts`** — **`STAT_MAP`** **`p+a`**, **`r+a`**; **`src/reporting/export_pp_merge_breadth_analysis.ts`**; **`data/reports/latest_pp_merge_breadth_analysis.json`** / **`.md`**; **`package.json`** — **`export:pp-merge-breadth-analysis`**, **`verify:canonical`** includes **`tests/phase75_pp_merge_breadth.spec.ts`**; **`tests/phase75_pp_merge_breadth.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`resolvePrizePicksStatTypeRaw`** prefers string **`stat_type`**, then **`stat_display_name`**, then **`relationships.stat_type.id`** → **`included`** `stat_type` **name/display**; **`mapPrizePicksStatType`** matches NBA **combo** patterns after removing **whitespace** around **`+`**; **`merge_odds`** maps raw **`p+a`** / **`r+a`** to **`points_assists`** / **`rebounds_assists`**.

- **Tests added:** **`tests/phase75_pp_merge_breadth.spec.ts`** — spacing collapse, legacy no-collapse, **`P+A`/`R+A`**, **`resolve`/`mapJsonToRawPicks`**, merge **`p+a`**/**`r+a`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase75_pp_merge_breadth.spec.ts` (**pass**); `npm run export:pp-merge-breadth-analysis` (**pass**); `npm run verify:canonical` (**pass**).

- **Findings summary:** Committed **`pp_projections_sample.json`** already uses string **`stat_type`** on all projections → fixture diagnostic **gain** counts **0**; **behavior** is proven by **unit tests** and **merge** smoke. **End-to-end** PP **≥6** eligible legs and PP **cards** require a **live** optimizer run (**NOT VERIFIED** in-repo snapshot **`prizepicks-legs.csv`** still shows **5** rows from an earlier run).

- **Risks / follow-ups:** Re-run **`scripts/run_optimizer.ps1`** with **ODDSAPI_KEY** + network; refresh **`prizepicks-legs.csv`** / survival summaries to confirm **≥6** PP legs post-merge.

### Phase 76 — Pre-diversification card pipeline diagnosis

- **Assumptions:** **No** changes to EV math, gating metric, thresholds, diversification, or payout registries; observability only. PP **`attributeFilterAndOptimizeBatch`** mirrors **`filterAndOptimize`**; UD **`attributeFinalSelectionUdFormatEntries`** mirrors **`applyFinalSelectionToFormatEntries`** (Phase 17S parity tests).

- **Purpose:** Prove **where** candidate cards drop to zero **before** Phase 77 diversification — stage counts (eligible legs → builder → per-type min EV → SelectionEngine → sort → diversification input → export), per-structure PP stats, UD k-combo enumeration + gates, **`classifyPreDiversificationRootCause`**.

- **Files changed:** **`src/reporting/pre_diversification_card_diagnosis.ts`** — **`updatePreDiversificationCardDiagnosisSection`**, **`writePreDiversificationMarkdown`**, **`classifyPreDiversificationRootCause`**; **`src/run_optimizer.ts`** — PP tail instrumentation + **`PpStructureBuildStats`** from **`buildCardsForSize`**; **`src/run_underdog_optimizer.ts`** — **`UdBuildFromFilteredStats`** from **`buildUdCardsFromFiltered`**, **`attributeFinalSelectionUdFormatEntries`** for final UD selection; **`data/reports/latest_pre_diversification_card_diagnosis.json`** / **`.md`** (written on PP/UD runs); **`tests/phase76_pre_diversification_card_diagnosis.spec.ts`**; **`package.json`** — **`verify:canonical`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase76_pre_diversification_card_diagnosis.spec.ts`; `npm run verify:canonical` (after adding to bundle).

- **Risks / follow-ups:** Re-run the optimizer to refresh diagnosis artifacts on real slates; compare **`dominantDropStage`** vs **`latest_final_selection_observability`** when triaging zero-card runs.

### Phase 79 — Card EV / structure viability (read-only diagnosis)

- **Assumptions:** **No** changes to EV math, payout registries, combinatorics, or gating. Reporting uses existing **`getStructureEV`** (same i.i.d. binomial path as **`evaluateFlexCard`**), **`getBreakevenThreshold`** / registry, **`getEvaluateFlexCardSportThreshold`**, and **`computeLocalEvDP`** from **`math_models`** for diagnostic contrast only.

- **Purpose:** After Phase **78**, zero exported cards can still occur because **raw card EV** (before per-type min EV / SelectionEngine) is below the sport floor or negative at plausible leg probabilities — distinguish **expected slate tightness** vs **post-EV pipeline** issues.

- **Artifacts:** **`data/reports/latest_card_ev_viability.json`**, **`data/reports/latest_card_ev_viability.md`**.

- **Implementation:** **`src/reporting/card_ev_viability.ts`** — load **`prizepicks-legs.json`**, **`buildPpCardBuilderPool`**, lexicographic k-combinations (capped), **`firstCardConstructionGateFailure`**, per-structure histogram + greedy max-**`trueProb`** combo; **`scripts/export_card_ev_viability.ts`**; **`npm run export:card-ev-viability`**; **`tests/phase79_card_ev_viability.spec.ts`**; **`package.json`**; **`src/card_ev.ts`** exports **`getEvaluateFlexCardSportThreshold`** (refactor only, same **`evaluateFlexCard`** behavior).

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase79_card_ev_viability.spec.ts`; `npm run export:card-ev-viability`; `npm run verify:canonical` (when **`verify:breakeven`** can write **`artifacts/`** in the environment).

- **Risks / follow-ups:** Sampling is capped (default **300** combos / structure) — extreme high-EV combos might be missed; **`rootCauseClassification`** flags that case.

### Phase 80 — Historical / context feature registry (backtest-ready)

- **Assumptions:** **No** changes to EV math, breakeven, payout registries, combinatorics, or live gating/selection. Features are derived only from existing **`perf_tracker`** rows plus read-only **`opp_adjust`** static NBA defensive ranks; **no** fabricated minutes/usage series.

- **Purpose:** Canonical schema + export for calibration research, future meta-modeling, and sportsbook reuse — **data layer only** until backtests justify wiring.

- **Artifacts:** **`data/reports/latest_historical_feature_registry.json`**, **`data/reports/latest_historical_feature_registry.md`**, **`artifacts/historical_feature_rows.jsonl`** (full rows).

- **Implementation:** **`src/modeling/historical_feature_registry.ts`** (schema, families, **`HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION`**); **`src/modeling/historical_feature_extract.ts`** (load tracker, chronological market groups, prior-only rolling stats); **`math_models/rolling_stats.ts`** (generic mean/variance/slope — not duplicated in **`src`** EV paths); **`scripts/export_historical_feature_registry.ts`**; **`npm run export:historical-feature-registry`**; **`tests/phase80_historical_feature_registry.spec.ts`**; **`package.json`** (**`verify:canonical`**).

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase80_historical_feature_registry.spec.ts`; `npm run export:historical-feature-registry`; `npm run verify:canonical` (full bundle when environment allows).

- **Coverage findings summary:** Rolling form fields populate when **≥1** prior resolved row exists in the same **market group** (sparse early history → explicit **`missingnessNotes`**). Opponent rank null when **`opponent`** missing or stat unmapped in **`opp_adjust`**. **`roleMinutesTrend`** remains schema-only (**`schema_only_no_minutes_series_in_repo`**). Market/CLV fields depend on tracker backfill density.

- **Risks / follow-ups:** Add minutes/pace feeds before role or environment features; optional multi-book dispersion requires snapshot joins not done in Phase **80**.

### Phase 78 — PP card builder pool aligned with market-edge eligibility

- **Assumptions:** **No** changes to **`evaluateFlexCard`**, per-type **`minCardEv`**, SelectionEngine, combinatorics, payout registries, or eligibility **thresholds** — only removal of an **extra** builder-only screen inconsistent with Phase 73+ leg gating (**`edge`** / **`legEv`** / effective EV from **`calculate_ev`** + **`juice_adjust`** market-relative benchmark).

- **Purpose:** Phase **76** showed **`poolLegsAfterTrueProbFilter = 0`** with **18** eligible legs: **`buildCardsForSize`** applied **`leg.trueProb >= getBreakevenThreshold(flexType) + minEdge`**, mixing **card-level** breakeven probability with a **min-edge scalar** and rejecting every leg. Eligibility already enforces market-relative edge floors; the builder must not apply a second, incompatible metric.

- **Files changed:** **`src/policy/pp_card_builder_pool.ts`** (**`buildPpCardBuilderPool`**, **`PP_CARD_BUILDER_MAX_POOL_LEGS`**); **`src/run_optimizer.ts`** — **`buildCardsForSize`** uses **`buildPpCardBuilderPool(legs)`**; **`src/reporting/pre_diversification_card_diagnosis.ts`** (comment on **`poolLegsAfterTrueProbFilter`**); **`tests/phase78_pp_builder_pool_alignment.spec.ts`**; **`package.json`** — **`verify:canonical`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior:** Builder pool = **all** legs passed into **`buildCardsForSize`** (post–player-cap **`filtered`**), sorted **`b.edge - a.edge`**, **`slice(0, 30)`** — no **`trueProb`** vs structure BE filter; volume vs non-volume no longer branches on **`trueProb > 0.5`** at pool construction (eligibility already applied volume policy).

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase78_pp_builder_pool_alignment.spec.ts`; `npm run verify:canonical`; `scripts/run_optimizer.ps1 -Force` (when network/API available — refreshes diagnosis artifacts).

- **Risks / follow-ups:** If **`filtered`** is ever passed incorrectly, the pool could include sub-threshold legs — contract is **caller supplies eligibility output only** (unchanged from pre–Phase 78).

### Phase 77 — Portfolio diversification / exposure policy

- **Assumptions:** **No** changes to EV math, breakeven, payout registries, combinatorics, merge, or gating thresholds; diversification runs **only** after valid candidate cards exist and primary ranking (**`sort_cards`**) is computed; site-invariant policy module is shared for PP flat cards and UD **`{ format, card }[]`**.

- **Purpose:** Reduce repeated leg/player/game concentration in the **exported** portfolio using greedy selection with **soft** exposure penalties and **explicit** hard guardrails; preserve evaluator **`cardEv`** on each card.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/run_optimizer.ts`** (PP export); **`src/run_underdog_optimizer.ts`** (UD export); **`src/policy/shared_final_selection_policy.ts`**; **`src/policy/shared_post_eligibility_optimization.ts`**; **`src/cli_args.ts`**.

- **Files changed:** **`src/policy/portfolio_diversification.ts`** ( **`DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY`**, **`selectDiversifiedPortfolioExport`**, **`selectDiversifiedPortfolioFormatEntries`**, **`canonicalLegKey`**, **`cardIdentityKey`** ); **`src/reporting/portfolio_diversification_artifacts.ts`** / **`data/reports/latest_portfolio_diversification.json`** / **`.md`**; **`src/types.ts`** — **`rawCardEv`**, **`diversificationAdjustedScore`**, **`portfolioDiversification`**, **`PortfolioDiversificationCardMeta`**; **`src/run_optimizer.ts`**, **`src/run_underdog_optimizer.ts`** — wire + CSV columns; **`src/cli_args.ts`** — **`portfolioDiversification`** + **`--no-portfolio-diversification`**; **`src/policy/eligibility_policy.ts`** — stage order note; **`package.json`** — **`verify:canonical`** includes **`tests/phase77_portfolio_diversification.spec.ts`**; **`tests/phase77_portfolio_diversification.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** Greedy loop on primary-ranked candidates: score = **`cardEv`** − penalties (leg / player / player+stat / game-cluster / max pairwise overlap with selected); hard skips when **max leg occurrences**, **max player leg slots**, or **max pairwise shared legs** would be exceeded; exported cards annotated with **`rawCardEv`**, **`diversificationAdjustedScore`**, **`portfolioDiversification`** breakdown; merged JSON/MD report **pp** / **ud** sections.

- **Tests added:** **`tests/phase77_portfolio_diversification.spec.ts`** — ordering under zero penalty, **`cardEv` immutability**, overlap/skip behavior, hard/soft helpers.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase77_portfolio_diversification.spec.ts` (**pass**); `npm run verify:canonical` (**pass**).

- **Findings summary:** Portfolio layer **does not** re-rank by mutating EV; **`--no-portfolio-diversification`** restores prior **slice-only** export. Reports populate **fully** when the corresponding platform runs with diversification enabled; placeholder file may show **`enabled: false`** until a full run.

- **Risks / follow-ups:** Tune **`DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY`** only with backtests; **final_selection** observability JSON is unchanged — **Phase 77** reports are the dedicated concentration view.

### Phase 81 — Dashboard visibility (artifact-driven)

- **Assumptions:** **No** EV/breakeven/payout/combinatorics/selection changes; **no** `math_models/` edits; dashboard reads **only** existing report JSON and the same CSV snapshot the UI already loads for the slate window hint.

- **Purpose:** Three compact panels so an operator can see **last run counts (PP/UD picks + cards)**, **why exported cards are zero** (pre-diversification + card EV viability copy), and **historical feature registry coverage** — all from real artifacts.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/vite.config.ts`; `data/reports/latest_run_status.json`; `data/reports/latest_pre_diversification_card_diagnosis.json`; `data/reports/latest_card_ev_viability.json`; `data/reports/latest_historical_feature_registry.json`; `src/reporting/run_status.ts` (schema reference only).

- **Files changed:** **`scripts/sync_dashboard_reports.ts`**; **`package.json`** (`sync:dashboard-reports`); **`web-dashboard/src/lib/dashboardArtifacts.ts`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`web-dashboard/src/App.tsx`** ( **`OptimizerStatePanels`** + full-CSV not-started leg counts ); **`web-dashboard/public/data/reports/*.json`** (copied via sync); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`npm run sync:dashboard-reports`** copies four report JSON files into **`web-dashboard/public/data/reports/`**. Main dashboard fetches them (cache-busted) and renders: (1) run / slate summary with **latest_run_status** counts and a **CSV-derived** not-started leg hint; (2) playability + diagnosis narrative from **pre-diversification** + **card EV viability** (plus fatal/early exit from run status when present); (3) top coverage rows from **historical feature registry**. Missing files show an explicit sync reminder — **no mock data**.

- **Tests added/updated:** none (UI wiring + static copies only).

- **Validation commands run (agent):** `npm run sync:dashboard-reports` (**pass**); `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** After exports, run **`sync:dashboard-reports`** before deploy so the dashboard matches **`data/reports/`**; optional Playwright assertion on **`data-testid="optimizer-state-panels"`** if CI should gate this surface.

### Phase 82 — Dashboard decision clarity (operator verdict)

- **Assumptions:** Same artifact sync path as Phase **81**; **no** changes to EV math, thresholds in code, or new report pipelines — presentation and CSV-inferred slate timing only.

- **Purpose:** One prominent **operator verdict** so users can immediately see playability, the **single dominant reason** for zero cards, explicit **slate status**, and **viability vs threshold** when the card EV viability export is present.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/App.tsx`; `web-dashboard/src/lib/dashboardArtifacts.ts`; `data/reports/latest_*.json` (shapes).

- **Files changed:** **`web-dashboard/src/lib/dashboardDecisionClarity.ts`** ( **`deriveOperatorDecision`**, **`computeSlateStatus`**, **`computeViabilityGap`**, **`derivePrimaryReason`**, **`buildDiagnosticDetailLines`** ); **`web-dashboard/src/components/OptimizerStatePanels.tsx`** (full-width decision card + renamed **`legsWindow`** prop ); **`web-dashboard/src/App.tsx`** ( **`LegsWindowSnapshot`**: **`csvSnapshotReady`**, **`msUntilEarliestNotStarted`**, **`useMemo`** snapshot ); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** Top **Operator verdict** card: **`PLAYABLE`** / **`NOT PLAYABLE`** from **`latest_run_status.json`** exported card counts; if run status JSON is missing, **NOT PLAYABLE** with an explicit sync message. **One primary reason** chosen in documented precedence (fatal/early exit → EV below threshold from artifacts → PP **`buildCardsForSize`** dominant stage → UD selection/breakeven elimination → **`pp_builder_zero_accepted_candidates`** → **`rootCauseClassification`** → fallback). **Slate status** from legs CSV: **UNKNOWN** until first fetch, **NO FUTURE LEGS** if zero rows, **OUTSIDE WINDOW** if no future game times, **NEAR LOCK** if next future leg is within **45** minutes, else **ACTIVE**. **Best EV / Required / Gap** from **`globalRawEvMax`** and **`sportCardEvThreshold`** only when both exist. Supporting column lists non-primary diagnostic lines; playable runs suppress redundant diagnostics.

- **Tests added/updated:** none (presentation-only).

- **Validation commands run (agent):** `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** **NEAR LOCK** uses a fixed **45** minute window; tune only if operators want a different definition. Viability row is diagnosis sampling — same caveat as Phase **79** export.

### Phase 83 — Opportunity surface (top cards & near-misses)

- **Assumptions:** **No** optimizer, EV, or threshold changes; **no** new exports — dashboard reads existing synced CSV and **`latest_card_ev_viability.json`** only.

- **Purpose:** After Phase **82**, answer **what to play** (exported cards) vs **what is closest to viable** when nothing exported (structure-level greedy samples from the Phase **79** viability artifact).

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/App.tsx`; `web-dashboard/src/lib/dashboardArtifacts.ts`; `data/reports/latest_card_ev_viability.json`.

- **Files changed:** **`web-dashboard/src/lib/opportunitySurface.ts`** ( **`topNearMissStructures`** ); **`web-dashboard/src/components/OpportunitySurfacePanel.tsx`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`** (wire panel ); **`web-dashboard/src/App.tsx`** ( **`opportunityTopCards`** **`useMemo`** ); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** Single **Opportunity surface** panel (**`data-testid="opportunity-surface-panel"`**) directly under the decision card. **PLAYABLE:** up to **5** rows from merged card CSV sorted by **`cardEv`** desc — **flexType**, EV%, **PP/UD**, truncated **`resolvePlayerPropLine`**. Empty CSV shows explicit message. **NOT PLAYABLE:** up to **5** structures with largest **gap** = **`bestCaseRawEvIid` − `sportCardEvThreshold`** (artifact fields); shows EV%, required%, gap; footnote that rows are PP viability samples and UD is not in this JSON. Missing **`structures`** shows sync/export reminder.

- **Tests added/updated:** none (UI-only).

- **Validation commands run (agent):** `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** Near-miss is **per-structure greedy sample**, not a ranked list of candidate parlays; a future phase could add a richer artifact without changing this panel’s contract.

### Phase 84 — Edge concentration surface

- **Assumptions:** **No** new artifacts, exports, or optimizer math; aggregation uses the same **top-5-by-`cardEv`** **`Card[]`** slice as Phase **83** and existing **`LegsLookup`** from synced CSV.

- **Purpose:** Operators see **where visible opportunity clusters** — PP vs UD, **`flexType`** mix, and **stat** labels on legs — plus one **grounded** interpretation sentence.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/components/OpportunitySurfacePanel.tsx`; `web-dashboard/src/lib/opportunitySurface.ts`.

- **Files changed:** **`web-dashboard/src/lib/edgeConcentration.ts`**; **`web-dashboard/src/components/EdgeConcentrationPanel.tsx`**; **`web-dashboard/src/App.tsx`** ( **`opportunitySliceCards`** shared with opportunity rows ); **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`EdgeConcentrationPanel`** (**`data-testid="edge-concentration-panel"`**) renders under **`OpportunitySurfacePanel`**. With **≥1** card in the slice: **Site** chips (counts + %), **Structures** chips (**`flexType`** or **N-leg**), **Markets (legs)** chips (abbreviated stat labels counted per leg row in **`legs`**). **Interpretation** string is built only from those aggregates. If the slice is **empty** and verdict is **NOT PLAYABLE**, **near-miss** **`flexType`** list reuses **`topNearMissStructures`** (same **5** as opportunity) with a **PP-only** note and a separate interpretation; if still empty, explicit insufficient-data copy.

- **Tests added/updated:** none (UI-only).

- **Validation commands run (agent):** `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** Stat chips depend on **legs CSV** alignment with card leg ids; near-miss path has **no** UD/stat dimension by design of the viability JSON.

### Phase 85 — Operator action surface

- **Assumptions:** **No** new artifacts or backend changes; recommendations use only state already in **`OptimizerStatePanels`** (Phase **81–84** inputs).

- **Purpose:** A single **recommended next step** with **one** explanation and **≤2** follow-up chips so operators do not re-read every panel.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/lib/dashboardDecisionClarity.ts`.

- **Files changed:** **`web-dashboard/src/lib/operatorAction.ts`**; **`web-dashboard/src/components/OperatorActionPanel.tsx`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** Precedence **1** load/sync failure or missing **`latest_run_status`**; **2** PLAYABLE with top-EV CSV rows **or** PLAYABLE with empty slice (reconcile); **3** **`NO_FUTURE_LEGS`** / **`OUTSIDE_WINDOW`**; **4** **`NEAR_LOCK`** + NOT PLAYABLE; **5** NOT PLAYABLE + near-miss structures in viability JSON; **6** NOT PLAYABLE + full viability row + negative gap; **7** fallback. Secondary chips (max **2**) from registry missing, viability row incomplete, near-lock watch, or CSV/playable mismatch. Panel shows rule id (**Phase 85 · rule n**).

- **Tests added/updated:** none (UI-only).

- **Validation commands run (agent):** `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** Precedence is intentionally simple; edge cases with **`UNKNOWN`** slate often fall through to **7**.

### Phase 86 — Dashboard snapshot export (plain text)

- **Assumptions:** **No** new reports, APIs, or math; text is built only from UI state already loaded in **`OptimizerStatePanels`** / **`OperatorActionPanel`**.

- **Purpose:** Operators copy a **compact plain-text snapshot** (verdict, reason, slate, optional gap, optional top card or near-miss line, primary action) for chat / notes.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/components/OperatorActionPanel.tsx`; `web-dashboard/src/lib/operatorAction.ts`.

- **Files changed:** **`web-dashboard/src/lib/dashboardSnapshotText.ts`** (**`buildDashboardSnapshotText`** only); **`web-dashboard/src/lib/dashboardSnapshotClipboard.ts`** (clipboard + **`.txt`** download); **`web-dashboard/src/components/OperatorActionPanel.tsx`** (**`Copy snapshot`** + **`data-testid`**s); **`web-dashboard/src/components/OptimizerStatePanels.tsx`** (first top card / first near-miss one-liners); **`tests/phase86_dashboard_snapshot_text.spec.ts`**; **`package.json`** (**`verify:canonical`** includes Phase **86** spec); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** Button **`Copy snapshot`** next to **Recommended next step**; snapshot lines omit **Run** / **Gap** / **Top Card** / **Top Near Miss** when not present in state; clipboard first, **`dfs-optimizer-snapshot.txt`** download if copy fails.

- **Tests added/updated:** **`tests/phase86_dashboard_snapshot_text.spec.ts`** — formatter line presence / omission.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase86_dashboard_snapshot_text.spec.ts` (**pass**); `web-dashboard` **`npm run build`** (**pass**).

- **Risks / follow-ups:** None beyond browser clipboard permissions on non-HTTPS hosts (download fallback covers common cases).

### Phase 87 — AI / context feature input foundation (non-math)

- **Assumptions:** **No** changes to **`math_models/`**, selection, gating, payouts, or EV; **no** automation, APIs, or mock data.

- **Purpose:** A single place and contract for **future** contextual inputs (L5, home/away, matchup, etc.) without touching optimizer math.

- **Files inspected:** `docs/PROJECT_STATE.md`; `math_models/` layout (no edits).

- **Files changed:** **`src/feature_input/context_feature_contract.ts`**; **`src/feature_input/normalize_context_feature_value.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase87_feature_input_foundation.spec.ts`**; **`package.json`** (**`verify:canonical`** includes Phase **87** spec); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`ContextFeatureRecord`** + **`FeatureValueKind`** / **`ContextFeatureFamily`**; **`normalizeContextFeatureValue`** (deterministic coerce / clamp / round); **`FEATURE_INPUT_MODULE_PREFIX`** constant; docs describe **boundary vs `math_models/`** and site-invariant rules.

- **Tests added/updated:** **`tests/phase87_feature_input_foundation.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase87_feature_input_foundation.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Callers must not import this layer into EV/breakeven paths until an explicit wiring phase approves it.

### Phase 88 — Rolling form (first context feature family)

- **Assumptions:** **No** **`math_models/`**, selection, or gating changes; **no** tracker I/O inside the helper; **no** mock data.

- **Purpose:** One **recent-form** family on top of Phase **87**: L5 / L10 **binary hit rates** from prior **0/1** outcomes (same window idea as **`historical_feature_extract`**, pure function only).

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/`; `src/modeling/historical_feature_extract.ts` (semantics reference only).

- **Files changed:** **`src/feature_input/rolling_form_features.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase88_rolling_form_context_features.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`buildRollingFormBinaryFeatures`** → **`ContextFeatureRecord`** rows **`rolling_form_l5_hit_rate`** / **`rolling_form_l10_hit_rate`** (`family: rolling_form`, **`normalizeContextFeatureValue`** + **[0,1]** clamp). Invalid entries are dropped (only **0**/**1** kept).

- **Tests added/updated:** **`tests/phase88_rolling_form_context_features.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase88_rolling_form_context_features.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Continuous stat means (non-binary) are out of scope; wire from tracker/reporting only in a later phase if needed.

### Phase 89 — Minutes + availability context features

- **Assumptions:** **No** **`math_models/`**, EV, gating, or selection changes; **no** **`nba_api`** calls inside **`feature_input`**; callers pass rows only.

- **Purpose:** One **minutes + availability** family: rolling minute means, trend vs L10, L10 std, recent max, games played in L5/L10, **recent DNP** (last game **0** min), **consistency bucket** from std (below **3** / **5** thresholds).

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/` (Phase **87–88**).

- **Files changed:** **`src/feature_input/context_feature_contract.ts`** (**`minutes_availability`** family); **`src/feature_input/minutes_availability_features.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase89_minutes_availability_features.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`buildMinutesAvailabilityFeatures({ subjectId, asOfUtc, gameLogRowsChronological })`** → nine keys; all numeric outputs through **`normalizeContextFeatureValue`**; invalid minute rows dropped.

- **Tests added/updated:** **`tests/phase89_minutes_availability_features.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase89_minutes_availability_features.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Callers map **nba_api** logs to **`GameLogMinuteRow`** in a separate layer; no automatic sync in this phase.

### Phase 90 — Game environment context features

- **Assumptions:** **No** **`math_models/`**, EV, or selection changes; **no** new APIs, OddsAPI client code, or automation in **`feature_input`**; values are **caller-supplied** after existing pipeline merge.

- **Purpose:** One **game environment** family from optional **game total** and **team spread** (positive = subject team favored).

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/types.ts` (**`MergedPick`** has no game total — inputs stay **explicit** on **`GameEnvironmentInput`**); `src/feature_input/` (Phase **87–89**).

- **Files changed:** **`src/feature_input/context_feature_contract.ts`** (**`game_environment`** family); **`src/feature_input/game_environment_features.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase90_game_environment_features.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`buildGameEnvironmentFeatures`** emits rows only for fields with valid inputs; **`team_implied_total`**, **`opponent_implied_total`**, **`implied_total_delta_vs_game`** only when **both** **`gameTotal`** and **`spread`** are finite; **`favorite_flag`** omitted when **spread** is 0 or missing; **`blowout_risk_bucket`** from **|spread|** when **spread** present.

- **Tests added/updated:** **`tests/phase90_game_environment_features.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase90_game_environment_features.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Callers must pass **main/closing** lines consistently; **SGO** historical backfill remains out of scope.

### Phase 91 — Team weak-defense context features

- **Assumptions:** **No** **`math_models/`**, EV, or selection changes; **no** APIs or fetch inside **`feature_input`**; stats are **caller-resolved** (e.g. **LeagueDashTeamStats** mapped outside this module).

- **Purpose:** Non–position-specific **opponent defense** surface: allowed totals, **%**s, optional **defensive rating**, optional **ranks**, trivial **composite** when **both** ranks exist.

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/` (Phase **87–90**).

- **Files changed:** **`src/feature_input/context_feature_contract.ts`** (**`team_defense_context`** family); **`src/feature_input/team_defense_features.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase91_team_defense_features.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`buildTeamDefenseFeatures`** emits only keys with finite inputs; **FG/3P** **%** accepts **0–1** or **0–100**; **`composite_defense_score`** = average(**rank / 30**) for **points** + **FG%** ranks when both set.

- **Tests added/updated:** **`tests/phase91_team_defense_features.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase91_team_defense_features.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Rank convention (**1** = best vs **30** = weakest) must match caller; document at join site if mixed.

### Phase 92 — Feature join & integration boundary

- **Assumptions:** **No** new feature builders; **no** **`math_models/`**, EV, selection, or weighting; **no** new data sources.

- **Purpose:** Single **`subjectId`** + **`asOfUtc`** view of **`ContextFeatureRecord`** rows grouped by **`family`** for downstream attach (reports, future AI), without optimizer behavior changes.

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/context_feature_contract.ts`.

- **Files changed:** **`src/feature_input/feature_join.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase92_feature_join.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`joinContextFeaturesForSubject`** returns **`JoinedContextFeatures`** with **`features[family][key] = value`**; rows with other **`subjectId`** / **`asOfUtc`** skipped; duplicate **`key`** in same family: **last** in input order wins.

- **Tests added/updated:** **`tests/phase92_feature_join.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase92_feature_join.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Callers concatenate builder outputs then join once per subject snapshot.

### Phase 93 — Feature snapshot + debug surface

- **Assumptions:** **No** new feature families or builder changes; **no** **`math_models/`**, scoring, weighting, or optimizer integration.

- **Purpose:** A stable, **JSON-serializable** view of joined context features for debugging and future modeling.

- **Files inspected:** `docs/PROJECT_STATE.md`; **`src/feature_input/feature_join.ts`**.

- **Files changed:** **`src/feature_input/feature_snapshot.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase93_feature_snapshot.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`buildFeatureSnapshot({ subjectId, asOfUtc, records })`** calls **`joinContextFeaturesForSubject`** and returns **`{ subjectId, asOfUtc, featureFamilies }`** where **`featureFamilies`** equals **`JoinedContextFeatures.features`**.

- **Tests added/updated:** **`tests/phase93_feature_snapshot.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase93_feature_snapshot.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Optional UI or export wiring in a later phase; this module stays pure.

### Phase 94 — Deterministic feature scoring (non-EV)

- **Assumptions:** **No** **`math_models/`**, EV, probabilities, selection changes, or post-game outcomes; **not** a learned model.

- **Purpose:** Transparent **`signals`** object for interpretation/debug only.

- **Files inspected:** **`src/feature_input/feature_snapshot.ts`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/feature_input/feature_scoring.ts`**; **`src/feature_input/index.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase94_feature_scoring.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** **`scoreFeatureSnapshot`** → **`minutes_signal`**, **`usage_signal`** (rolling hit rate or games-played / DNP), **`environment_signal`** (blowout bucket or **spread_abs** / **game_total** fallbacks), **`defense_signal`** (composite or rank); formulas fixed in source comments.

- **Tests added/updated:** **`tests/phase94_feature_scoring.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase94_feature_scoring.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Tune constants only in explicit future phases; do not wire to gating without review.

### Phase 94B — Feature scoring corrections

- **Assumptions:** **No** feature builder changes, **`math_models/`** changes, or optimizer integration; **only** `src/feature_input/feature_scoring.ts` logic + tests/docs.

- **Purpose:** Align each **`signal** with its family: minutes (L5 / std / trend), usage (**`usg_*`** only), environment (combined game lines), defense unchanged.

- **Files inspected:** **`src/feature_input/feature_scoring.ts`** (pre-correction); **`docs/FEATURE_INPUT_LAYER.md`**.

- **Files changed:** **`src/feature_input/feature_scoring.ts`**; **`tests/phase94_feature_scoring.spec.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior changed:** **`minutes_signal`** no longer uses L10 avg; **`usage_signal`** no **`rolling_form`** / games / DNP; **`environment_signal`** averages bucket + **`game_total`** + **`spread_abs`** when present.

- **Tests added/updated:** **`tests/phase94_feature_scoring.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase94_feature_scoring.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** **`usg_*`** rows must be supplied by callers (e.g. under **`other`**) until a dedicated builder exists.

### Phase 95 — Attach feature signals to picks/cards (no decision impact)

- **Assumptions:** **No** **`math_models/`**, EV, breakeven, selection, or card-builder logic changes; **no** filtering/ranking; optional fields default unset.

- **Purpose:** **`featureSnapshot`** / **`featureSignals`** on **`EvPick`** and **`CardEvResult`** for visibility; **`attachFeatureContextToCard`** / **`attachFeatureContextToPick`** when **`ContextFeatureRecord`** rows exist.

- **Files inspected:** `src/types.ts`; `src/run_optimizer.ts` (export site); `src/run_underdog_optimizer.ts` (unified JSON); `src/feature_input/`.

- **Files changed:** **`src/types.ts`**; **`src/feature_input/attach_context_features.ts`**; **`src/feature_input/index.ts`**; **`src/run_optimizer.ts`** (comment); **`src/run_underdog_optimizer.ts`** (pass-through); **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase95_feature_attachment.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added:** Optional **`featureSnapshot?: FeatureSnapshot`**, **`featureSignals?: FeatureScoreSignals`**; UD unified export includes same keys when set.

- **Tests added/updated:** **`tests/phase95_feature_attachment.spec.ts`**.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase95_feature_attachment.spec.ts` (**pass**); `npx tsc --noEmit` (**pass**).

- **Risks / follow-ups:** Large JSON if many cards get full snapshots — attach only when needed.

### Phase 96 — Feature signal diagnostics (validation only)

- **Assumptions:** **No** **`math_models/`**, EV/breakeven, selection, gating, or card construction changes; **no** filtering, ranking, or output schema changes; diagnostics are read-only aggregates.

- **Purpose:** **`summarizeFeatureSignals(picks)`** reports **`count`** and mean/min/max per axis (**`minutes_signal`**, **`usage_signal`**, **`environment_signal`**, **`defense_signal`**) over picks that have **`featureSignals`** — for distribution sanity checks, not optimization.

- **Files inspected:** `src/types.ts` (**`EvPick`**, **`FeatureScoreSignals`**); `src/feature_input/`.

- **Files changed:** **`src/feature_input/feature_diagnostics.ts`**; **`src/feature_input/index.ts`**; **`tests/phase96_feature_diagnostics.spec.ts`**; **`package.json`** (**`verify:canonical`** list); **`docs/FEATURE_INPUT_LAYER.md`**; **`docs/PROJECT_STATE.md`** (this section).

- **Exact behavior added:** **`summarizeFeatureSignals`** ignores picks without **`featureSignals`**; **`count`** is that subset size. Empty subset: all axes **`{ mean: 0, min: 0, max: 0 }`**. No pipeline wiring — callers opt in.

- **Tests added/updated:** **`tests/phase96_feature_diagnostics.spec.ts`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase96_feature_diagnostics.spec.ts` (**pass**).

- **Risks / follow-ups:** If future wiring passes **`featureSignals`**, summary stats can be logged or exported in a dedicated phase; remains non-influential on decisions.

### Phase 96B — Canonical verify merge-quality triage (clarify non-fatal FAIL)

- **Assumptions:** **`verify_merge_quality_canonical.ts`** contract unchanged: exit **1** on **FAIL** only when **`MERGE_QUALITY_ENFORCE=true`**; no **`math_models/`**, merge matching, or merge-quality threshold changes.

- **Purpose:** Operators reported **`npm run verify:canonical`** “failing” on merge quality because **`MERGE QUALITY VERIFY: FAIL`** looked like a hard failure. Triage showed **`verify:merge-quality`** exits **0** by default; **`FAIL`** reflects **`data/reports/merge_quality_status.json`** (e.g. **`coverage_below_fail`** when **`mergeCoverage`** is very low after a local merge). A full **`verify:canonical`** failure observed in triage was **`tests/phase23_canonical_samples_ui.spec.ts`** (invalid **`artifacts/samples/sample_cards_ud.json`** in one run), not the merge-quality exit code.

- **Files inspected:** `scripts/verify_merge_quality_canonical.ts`; `tests/phase42_merge_quality_operator.spec.ts`; `data/reports/merge_quality_status.json` (local); `package.json` (**`verify:canonical`** chain); `docs/PROJECT_STATE.md` (Phase **40–42**).

- **Files changed:** **`scripts/verify_merge_quality_canonical.ts`**; **`tests/phase42_merge_quality_operator.spec.ts`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet).

- **Exact behavior added/changed:** When **`overallSeverity`** is **FAIL** and enforcement is off, prints one extra **`MERGE QUALITY VERIFY:`** line stating that this npm step exits **0** and that **`MERGE_QUALITY_ENFORCE=true`** is required to fail the step.

- **Tests added/updated:** **`tests/phase42_merge_quality_operator.spec.ts`** — relaxed assertion to **`toContain`** for the new multi-line output.

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase42_merge_quality_operator.spec.ts` (**pass**); `npm run verify:merge-quality` (**pass**, exit **0**); `npm run verify:canonical` (**pass**).

- **Risks / follow-ups:** Stale **`merge_quality_status.json`** with **FAIL** still indicates a real merge-quality problem for operators; regenerate merge artifacts or fix odds/props inputs — **`MERGE_QUALITY_ENFORCE=true`** remains the gate for CI that must block on **FAIL**.

### Phase 97 — Signal vs outcome validation (read-only)

- **Assumptions:** **No** **`math_models/`**, EV/breakeven, selection, gating, or card construction changes; **no** weighting, regression, or ML; **`gradedLegOutcome`** is optional and unset by default pipeline.

- **Purpose:** Compare **0–1** feature **`signals`** to graded leg results (**`hit` / `miss` / `push`**) for exploratory predictive value — **not** to change decisions.

- **Files inspected:** `src/types.ts` (**`EvPick`**); `src/feature_input/feature_scoring.ts` (**`FeatureScoreSignals`**); `src/feature_input/feature_diagnostics.ts` (pattern); `package.json`; `docs/PROJECT_STATE.md`.

- **Files changed:** **`src/types.ts`** (**`gradedLegOutcome?`**); **`src/feature_input/feature_outcome_validation.ts`**; **`src/feature_input/index.ts`**; **`tests/phase97_feature_outcome_validation.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added:** **`evaluateSignalPerformance(picks)`** — per signal axis, **`overall`** + **`low_bucket` / `mid_bucket` / `high_bucket`** (**[0,0.33)**, **[0.33,0.66)**, **[0.66,1]** on clamped **[0,1]**); **`count`** includes pushes; **`hit_rate`** = hits / (hits + misses). **`signalValueBucket`** exported for tests. Picks need **`featureSignals`** + **`gradedLegOutcome`**; non-finite signal on an axis skips that axis only.

- **Tests added/updated:** **`tests/phase97_feature_outcome_validation.spec.ts`** — bucket boundaries, empty input, aggregation, skips.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase97_feature_outcome_validation.spec.ts` (**pass**).

- **Risks / follow-ups:** Callers must supply **`gradedLegOutcome`** from tracker/CSV join; no automatic grading in this phase.

### Phase 98 — Signal outcome validation artifact (reporting only)

- **Assumptions:** **No** optimizer, EV, gating, card construction, grading pipeline, or tracker schema changes; artifacts are read-only summaries of Phase **97** math.

- **Purpose:** Stable **`data/reports/latest_feature_outcome_validation.json`** / **`.md`** for operators after a validation step or offline join of **`gradedLegOutcome`**.

- **Files inspected:** `src/reporting/merge_diagnostics.ts` (write pattern); `src/feature_input/feature_outcome_validation.ts`; `src/reporting/final_selection_observability.ts` (**`stableStringifyForObservability`**); `package.json`; `docs/PROJECT_STATE.md`.

- **Files changed:** **`src/reporting/feature_outcome_validation_report.ts`**; **`tests/phase98_feature_outcome_validation_report.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added:** **`buildFeatureOutcomeValidationArtifact(picks, generatedAtUtc)`** wraps **`evaluateSignalPerformance`** with **`schemaVersion`**, counts, bucket-definition strings, and **`formatFeatureOutcomeValidationJson` / `formatFeatureOutcomeValidationMarkdown`**; **`writeFeatureOutcomeValidationArtifacts`** writes both files; **`getFeatureOutcomeValidationPaths`**.

- **Tests added/updated:** **`tests/phase98_feature_outcome_validation_report.spec.ts`** — JSON repeatability, markdown **`##`** order, empty/partial picks, temp write.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase98_feature_outcome_validation_report.spec.ts` (**pass**).

- **Risks / follow-ups:** Call **`writeFeatureOutcomeValidationArtifacts`** from a script or tool when picks are prepared; no automatic hook in **`run_optimizer`**.

### Phase 99 — Feature outcome validation runner (explicit CLI)

- **Assumptions:** **No** optimizer, EV, gating, or grading changes; input is a **prepared** JSON array of **`EvPick`** (operators supply **`featureSignals`** + **`gradedLegOutcome`** where applicable).

- **Purpose:** One command to load picks from a **required** **`--input`** path and write Phase **98** **`data/reports/latest_feature_outcome_validation.*`** under optional **`--cwd`** (default **`process.cwd()`**).

- **Files inspected:** `scripts/run_feature_outcome_validation.ts` (new); `src/reporting/feature_outcome_validation_report.ts`; `package.json`; `docs/PROJECT_STATE.md`.

- **Files changed:** **`scripts/run_feature_outcome_validation.ts`**; **`tests/phase99_run_feature_outcome_validation.spec.ts`**; **`package.json`** (**`validate:feature-outcome`**, **`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added:** Parses **`--input=`** (required), **`--cwd=`**, **`--generated-at=`** (optional ISO for reproducible artifacts); **`loadEvPicksJsonFile`** validates array JSON; **`buildFeatureOutcomeValidationArtifact`** + **`writeFeatureOutcomeValidationArtifacts`**; **`require.main`** guard so tests can import helpers. Prints paths + **`input_picks`** / **`evaluation_rows`**.

- **Tests added/updated:** **`tests/phase99_run_feature_outcome_validation.spec.ts`** — parse errors, load errors, CLI success + deterministic JSON with fixed timestamp, missing **--input** exit **1**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase99_run_feature_outcome_validation.spec.ts` (**pass**).

- **Risks / follow-ups:** No default input path — operators must pass **`--input`** explicitly.

### Phase 100 — Real feature outcome validation run (execution / analysis)

- **Assumptions:** Phases **97–99** unchanged; **no** fabricated pick arrays; **no** formula or optimizer edits.

- **Purpose:** Run **`npm run validate:feature-outcome -- --input=<path>`** on a **real** prepared graded pick export and interpret **`latest_feature_outcome_validation.*`**.

- **Files inspected:** Repo-wide search (**`*.json`**, **`data/`**) for **`featureSignals`** / **`gradedLegOutcome`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** bullet) only.

- **Execution result:** **No** committed or workspace JSON file found that is a **`EvPick[]`** with both **`featureSignals`** and **`gradedLegOutcome`**. Existing **`prizepicks-*.json`** / **`data/processed/*.json`** do not contain these fields. **Therefore `validate:feature-outcome` was not run** on a grounded production-style file (would require inventing or synthesizing input — out of scope).

- **Artifact inspection:** **`data/reports/latest_feature_outcome_validation.json`** / **`.md`** not regenerated in this phase; prior content (if any) is from local runs only and not used as evidence here.

- **Findings:** Workflow is **ready**; **next step** is an operator-built export (e.g. join graded tracker legs to **`attachFeatureContextToPick`** output, or a dedicated serializer) saved as JSON array, then **`npm run validate:feature-outcome -- --input=<that path>`**. Signal separation cannot be assessed without that input.

- **Validation commands run (agent):** Content search only (**no** **`npm run validate:feature-outcome`** on synthetic repo data).

- **Risks / follow-ups:** When a grounded file exists, re-run Phase **100** and record **`input_picks`**, **`evaluation_rows`**, and per-bucket **`hit_rate`** lines from the markdown artifact.

### Phase 101 — Graded pick export for feature validation

- **Assumptions:** **No** optimizer, EV, gating, scoring formulas, or **`math_models/`** changes; **`perf_tracker.jsonl`** and legs CSVs are the only grounded sources; rows without **`result`** 0/1 are not exported here (existing **`readTrackerRowsWithResult`** semantics).

- **Purpose:** Produce **`data/reports/feature_validation_input.json`** ( **`EvPick[]`** with **`featureSignals`** + **`gradedLegOutcome`**) for **`npm run validate:feature-outcome -- --input=...`**.

- **Files inspected:** **`src/perf_tracker_types.ts`**, **`src/perf_tracker_db.ts`**, **`src/tracking/legs_csv_index.ts`**, **`src/feature_input/attach_context_features.ts`**, **`src/matchups/opp_adjust.ts`**, **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/reporting/feature_validation_export.ts`**; **`scripts/export_feature_validation_picks.ts`**; **`tests/phase101_feature_validation_export.spec.ts`**; **`package.json`** (**`export:feature-validation-picks`**, **`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added:** **`exportFeatureValidationPicks`** loads tracker (**`--tracker=`** default **`data/perf_tracker.jsonl`**), filters **`result` ∈ {0,1}**, joins **`existingLegCsvPaths`** by **`leg_id`**, builds minimal **`EvPick`**, sets **`gradedLegOutcome`**, attaches **`ContextFeatureRecord`** for **`opp_points_allowed_rank`** when **`getOppAdjustment`** resolves (else empty records → zeroed non-defense signals). Dedupes **`date|leg_id`**. **`export:feature-validation-picks`** writes stable JSON; exits **1** if nothing exported.

- **Tests added/updated:** **`tests/phase101_feature_validation_export.spec.ts`** — join + attach, deterministic stringify, skip without leg, empty defense records.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase101_feature_validation_export.spec.ts` (**pass**).

- **Risks / follow-ups:** Minimal **`EvPick`** fields vs full merge pipeline; minutes/usage/environment signals stay **0** unless future records are added alongside opponent rank.

### Phase 101C — Historical grounded leg-source coverage (JSON + paths)

- **Assumptions:** **No** optimizer, EV, gating, scoring, or **`math_models/`** changes; **no** fabricated rows; join remains exact **`leg_id`** / existing suffix rule only; JSON merge fills keys **only** when missing from CSV (CSV wins).

- **Purpose:** Phase **101** export could not join graded tracker legs when only “current” root **`prizepicks-legs.csv`** / **`.json`** reflected a later slate; expand **grounded** discovery so dated **`data/legs_archive/*-legs-YYYYMMDD.json`**, **`web-dashboard/public/data/*-legs.json`**, and **`data/output_logs/*-legs.json`** participate in the same deterministic merge as root JSON.

- **Files inspected:** **`src/reporting/feature_validation_export.ts`**, **`src/tracking/legs_csv_index.ts`**, **`scripts/export_feature_validation_picks.ts`**, **`tests/phase101_feature_validation_export.spec.ts`**, **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/tracking/legs_csv_index.ts`** — **`existingGroundedLegJsonPaths`**; **`src/reporting/feature_validation_export.ts`** — **`mergeLegsFromJsonFiles`** uses that list; **`legRecordFromLegsJsonItem`** accepts **`leg_id`** when **`id`** absent; **`scripts/export_feature_validation_picks.ts`** (comment + error hint); **`tests/phase101_feature_validation_export.spec.ts`** (archive JSON + **`leg_id`** cases); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact failure cause (pre-fix):** **`mergeLegsFromJsonFiles`** only read a **fixed** short list of JSON paths (root + **`data/output_logs/`**), omitting **`web-dashboard/public/data`**, **`data/legs_archive`** dated JSON, and any future same-pattern files — so historical **`leg_id`**s present only in those artifacts were invisible to the join.

- **Exact behavior added/changed:** **`existingGroundedLegJsonPaths(cwd)`** returns existing files only: root **`prizepicks-legs.json`** / **`underdog-legs.json`**, **`data/output_logs/`** pair, **`web-dashboard/public/data/`** pair, then **`data/legs_archive/prizepicks|underdog-legs-YYYYMMDD.json`** (sorted by filename). **`mergeLegsFromJsonFiles`** iterates that list in order; still **add-if-missing** only (no CSV override).

- **Tests added/updated:** **`tests/phase101_feature_validation_export.spec.ts`** — dated archive JSON merge; **`leg_id`**-only JSON item.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase101_feature_validation_export.spec.ts` (**pass**); `npm run export:feature-validation-picks` (**exit 1** — **`skipped_no_leg=16`** with current repo data; no **`validate:feature-outcome`** run because no export file written).

- **Risks / follow-ups:** Commit or restore historical **`legs_archive`** JSON/CSV that contain tracker **`leg_id`**s; re-run **`export:feature-validation-picks`** then **`validate:feature-outcome`**.

### Phase 101D — Historical CSV leg archive discovery (verification + determinism)

- **Assumptions:** **No** optimizer / EV / math / gating changes; **no** fabricated legs; join rules unchanged (**`resolveLegCsvRecord`**).

- **Purpose:** Confirm whether **`data/legs_archive/*.csv`** participates in **`existingLegCsvPaths` → `loadLegsMap`** for Phase **101** export; remove any doubt about “missing discovery” vs **true **`leg_id`** mismatch**.

- **Files inspected:** **`src/tracking/legs_csv_index.ts`**, **`src/reporting/feature_validation_export.ts`**, **`data/legs_archive/prizepicks-legs-20260312.csv`**, **`data/perf_tracker.jsonl`** (graded rows), **`package.json`**, **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/tracking/legs_csv_index.ts`** — **`data/legs_archive`** dated CSV filenames are **sorted** before append (deterministic load order, parity with JSON archive listing); **`tests/legs_csv_archive_paths.spec.ts`** (sorted paths + **`Sport,id,...`** parse smoke); **`package.json`** (**`verify:canonical`** includes new spec); **`docs/PROJECT_STATE.md`** (this section).

- **Exact failure cause:** **`data/legs_archive/*.csv`** were **already** discovered and parsed (**`id`** column is the second header **`Sport,id,...`** — **`loadLegsMap`** indexes **`id`** by name, not position). The **16** graded tracker rows use **Feb 2026** PrizePicks **`leg_id`**s (e.g. **`prizepicks-10056650-rebounds-5.5`**); committed archives are **20260312–20260316** with **different** projection ids (e.g. **`prizepicks-10515851-...`**). **No grounded row shares those **`leg_id`** strings**, so **`skipped_no_leg=16`** is **exact id mismatch**, not a CSV discovery bug.

- **Exact behavior added/changed:** Archive CSV entries from **`readdirSync`** are **sorted** by filename before **`out.push`**; behavior of **`loadLegsMap`** / headers unchanged.

- **Tests added/updated:** **`tests/legs_csv_archive_paths.spec.ts`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/legs_csv_archive_paths.spec.ts` (**pass**); `npm run export:feature-validation-picks` (**exit 1**, **`skipped_no_leg=16`** — expected until tracker **`leg_id`**s exist in grounded legs sources); **`validate:feature-outcome`** **not** run (no export file).

- **Risks / follow-ups:** Add **`legs_archive`** slices (or root legs CSV) that contain the **same** **`leg_id`** strings as graded tracker rows (e.g. Feb slate exports), then re-run export.

### Phase 102 — Legs snapshot integrity + tracker binding

- **Assumptions:** **No** **`math_models/`** edits; **no** EV/breakeven/edge/ranking/selection changes; **no** loosened matching or fuzzy joins; **no** fabricated February backfills; additive **`legsSnapshotId`** only; old **`perf_tracker`** lines without it must still parse.

- **Purpose:** Persist immutable grounded legs snapshots per run so tracker rows remain replayable against the exact legs set used at run time; bind rows to **`legsSnapshotId`**; prefer snapshot legs in feature-validation export when present; emit read-only integrity counts.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/run_optimizer.ts`**; **`src/reporting/feature_validation_export.ts`**; **`src/perf_tracker_db.ts`**; **`src/perf_tracker_types.ts`**; **`src/backfill_perf_tracker.ts`**; **`src/tracking/tracker_creation_backfill.ts`**; **`src/tracking/legs_snapshot.ts`**; **`src/reporting/export_legs_snapshot_integrity.ts`**; **`scripts/export_legs_snapshot_integrity.ts`**; **`package.json`**; **`tests/phase102_legs_snapshot.spec.ts`**.

- **Files changed:** **`src/tracking/legs_snapshot.ts`** — **`deriveLegsSnapshotId`**, **`persistLegsSnapshotFromRootOutputs`** (no overwrite; collision **`_2`+**), **`loadRunTimestampToLegsSnapshotId`**, **`legsSnapshotDirectory`**; **`src/run_optimizer.ts`** — **`tryPersistLegsSnapshotFromRootOutputs`** after grounded legs writes; **`src/perf_tracker_types.ts`** — optional **`legsSnapshotId`**; **`src/tracking/tracker_creation_backfill.ts`** / **`src/backfill_perf_tracker.ts`** — pass snapshot id when tier timestamp matches archive meta; **`src/reporting/feature_validation_export.ts`** — **`loadLegsMapForSnapshotId`**, snapshot-first path when **`row.legsSnapshotId`** set; **`src/reporting/export_legs_snapshot_integrity.ts`** + **`scripts/export_legs_snapshot_integrity.ts`** + **`npm run export:legs-snapshot-integrity`**; **`src/perf_tracker_db.ts`** — **`readTrackerRows(cwd?)`** for cwd-scoped reads; **`tests/phase102_legs_snapshot.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added/changed:** On successful grounded output, copy **`prizepicks-legs.*`** / **`underdog-legs.*`** from the run root into **`data/legs_archive/<id>/`** with **`snapshot_meta.json`**; write **`artifacts/legs_snapshot_ref.json`** when created. Tracker rows record **`legsSnapshotId`** when known. Export: if **`legsSnapshotId`** set, use **only** that snapshot’s legs map (exact **`leg_id`** then Phase **101E** reconstruction; missing snapshot or no match → skip). Rows without **`legsSnapshotId`** use existing global discovery. Integrity report: counts rows with/without id, distinct ids, directory existence — **no** recovery.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase101_feature_validation_export.spec.ts tests/phase102_legs_snapshot.spec.ts` (**pass**).

- **Backward-compatibility:** Historical JSONL without **`legsSnapshotId`** unchanged; **`readTrackerRows()`** default **`cwd`** = **`process.cwd()`**; integrity + export tests use temp **`cwd`**.

- **Risks / follow-ups:** None required for math; re-run **`export:legs-snapshot-integrity`** after tracker/archive changes.

### Phase 103 — Snapshot-backed export observability + enforcement

- **Assumptions:** **No** **`math_models/`**; **no** EV/breakeven/edge/selection changes; **no** fuzzy joins; additive stats + reporting only; legacy **`perf_tracker`** rows without **`legsSnapshotId`** unchanged in default mode.

- **Purpose:** Operator-visible counts and stable skip reasons for snapshot-bound vs legacy feature-validation export; compact **`latest_feature_validation_snapshot_status.*`**; optional fail-closed enforcement for CI when snapshot-bound rows must all resolve.

- **Files inspected:** **`docs/PROJECT_STATE.md`**; **`src/reporting/feature_validation_export.ts`**; **`scripts/export_feature_validation_picks.ts`**; **`package.json`**; **`tests/phase101_feature_validation_export.spec.ts`**; **`tests/phase102_legs_snapshot.spec.ts`**.

- **Files changed:** **`src/reporting/feature_validation_export.ts`** — **`collectReconstructionCandidateIds`**, **`countReconstructionCandidates`**, extended **`FeatureValidationExportStats`**, per-row snapshot vs legacy accounting, **`skipReasonSamples`**, **`enforceSnapshotResolved`** / **`enforcementFailed`** (from **`opts`** or **`FEATURE_VALIDATION_SNAPSHOT_ENFORCE`**), **`writeSnapshotStatusArtifacts`**; **`src/reporting/feature_validation_snapshot_status.ts`** — **`writeFeatureValidationSnapshotStatusArtifacts`**; **`scripts/export_feature_validation_picks.ts`** — **`--enforce-snapshot`**, **`--no-snapshot-status`**, extended logging + exit **1** on **`enforcementFailed`**; **`tests/phase103_feature_validation_snapshot_status.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added/changed:** Stats include **`rowsWithLegsSnapshotId`** / **`rowsWithoutLegsSnapshotId`**, **`snapshotReferencedDirExistsRows`** / **`snapshotReferencedDirMissingRows`**, **`snapshotJoinedByLegId`** / **`snapshotJoinedByReconstruction`**, **`legacyJoinedByLegId`** / **`legacyJoinedByReconstruction`**, **`skippedMissingSnapshotDirectory`**, **`skippedSnapshotPresentNoLegMatch`**, **`skippedSnapshotAmbiguousReconstruction`**, **`skippedLegacyNoLegMatch`**; **`joinedByLegId`** / **`joinedByReconstruction`** remain totals. JSON/MD status artifact mirrors **`stats`** + samples. Enforcement: any snapshot-bound skip → **`enforcementFailed`** when enforcement is on; default export behavior unchanged.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase101_feature_validation_export.spec.ts tests/phase102_legs_snapshot.spec.ts tests/phase103_feature_validation_snapshot_status.spec.ts` (**pass**).

- **Backward-compatibility:** **`exportFeatureValidationPicks`** without new options behaves as Phase **102** plus richer **`stats`** (callers must tolerate extra fields); status files written only when **`writeSnapshotStatusArtifacts: true`** (CLI default **true**).

- **Risks / follow-ups:** Operators should treat **`enforcementFailed`** as a pipeline gate only when **`--enforce-snapshot`** is intentionally enabled.

### Phase 104 — Snapshot adoption hardening + legacy debt visibility

- **Assumptions:** **No** **`math_models/`**; **no** EV/selection changes; **no** fabricated **`legsSnapshotId`** on historical rows; additive mapping + reporting only.

- **Purpose:** Ensure **`runTimestamp`** → **`legsSnapshotId`** resolution uses archive meta **and** the latest **`artifacts/legs_snapshot_ref.json`** when the archive index is empty; document the single append path; surface adoption vs debt in **`latest_legs_snapshot_adoption.*`**.

- **Files inspected:** **`src/backfill_perf_tracker.ts`**; **`src/tracking/tracker_creation_backfill.ts`**; **`src/tracking/legs_snapshot.ts`**; **`src/perf_tracker_db.ts`**; **`docs/PROJECT_STATE.md`**; **`package.json`**.

- **Files changed:** **`src/tracking/legs_snapshot.ts`** — **`mergeLegsSnapshotRefFromArtifacts`**, **`loadRunTimestampToLegsSnapshotId`** merges ref after archive scan; **`src/reporting/export_legs_snapshot_adoption.ts`** — **`buildLegsSnapshotAdoptionReport`**, **`writeLegsSnapshotAdoptionArtifacts`**, **`formatLegsSnapshotAdoptionSummaryLine`**; **`scripts/export_legs_snapshot_adoption.ts`**; **`src/perf_tracker_db.ts`** — JSDoc on **`appendTrackerRow`**; **`tests/phase104_legs_snapshot_adoption.spec.ts`**; **`package.json`** (**`export:legs-snapshot-adoption`**, **`verify:canonical`**); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added/changed:** Ref file fills **`runTimestamp`** keys missing from archive directories (same timestamp string as tier CSV / meta). Adoption report: totals, graded split, **`pctSnapshotBound`**, **`byMonth`**, one-line **`summaryLine`**. **Documented:** only **`appendTrackerRow`** production path is **`backfillPerfTracker`**; mutating **`writeTrackerRows`** paths preserve fields.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase104_legs_snapshot_adoption.spec.ts` (**pass**).

- **Backward-compatibility:** **`loadRunTimestampToLegsSnapshotId`** is a superset (ref merge only adds missing keys); legacy JSONL lines unchanged.

- **Risks / follow-ups:** Rows remain without **`legsSnapshotId`** until a matching archive/ref exists for that tier **`runTimestamp`** — expected, not auto-filled.

### Phase 105 — Snapshot enforcement policy for new rows only

- **Assumptions:** **No** **`math_models/`**; **no** EV/selection changes; **no** fabricated **`legsSnapshotId`** on historical rows; enforcement applies only to **`backfillPerfTracker`** new appends.

- **Purpose:** Block silent new rows without snapshot provenance; explicit escape hatch; compact enforcement report.

- **Files inspected:** **`src/backfill_perf_tracker.ts`**; **`src/tracking/tracker_creation_backfill.ts`**; **`src/perf_tracker_db.ts`**; **`scripts/phase70_post_hardening_validation.ts`**; **`tests/phase16t_coverage_accumulation.spec.ts`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/backfill_perf_tracker.ts`** — **`BackfillPerfTrackerOptions`**, **`BackfillPerfTrackerResult`**, enforcement gate + **`appendWithoutSnapshotOverride`**; **`src/tracking/tracker_creation_backfill.ts`** — **`appendWithoutSnapshotOverride`** + **`creationProvenance.legsSnapshotAppend`**; **`src/reporting/export_tracker_snapshot_new_row_enforcement.ts`** — artifacts + **`formatTrackerSnapshotNewRowEnforcementSummaryLine`**; **`tests/phase105_tracker_snapshot_new_row_enforcement.spec.ts`**; **`tests/phase16t_coverage_accumulation.spec.ts`** (fixture **`snapshot_meta.json`**); **`scripts/phase70_post_hardening_validation.ts`** (markdown table rows); **`package.json`** (**`verify:canonical`**); **`src/perf_tracker_db.ts`** (JSDoc); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Without resolved **`legsSnapshotId`**, new tier leg rows are **not** appended unless escape hatch is on; each blocked attempt increments **`blockedMissingLegsSnapshotId`** and logs one warning line. With hatch: append proceeds, **`creationProvenance.legsSnapshotAppend`** = **`override_without_snapshot_id`**, separate **`console.warn`**. Every backfill run writes **`latest_tracker_snapshot_new_row_enforcement.*`**. CLI **`--allow-append-without-snapshot`** mirrors env.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase105_tracker_snapshot_new_row_enforcement.spec.ts tests/phase16t_coverage_accumulation.spec.ts tests/phase69_tracker_creation_integrity.spec.ts tests/phase104_legs_snapshot_adoption.spec.ts` (**pass**).

- **Backward-compatibility:** **`readTrackerRows`** / **`parseTrackerLine`** unchanged; **`writeTrackerRows`** paths unchanged; **`backfillPerfTracker()`** signature extended return (callers using **`appended`/`skipped`** only remain valid).

- **Risks / follow-ups:** Operator workflows that relied on implicit appends without archives must add **`snapshot_meta`** or use the escape hatch deliberately.

### Phase 106 — Historical replay readiness + validation segmentation

- **Assumptions:** **No** **`math_models/`**; **no** EV/selection changes; **no** fabricated **`legsSnapshotId`**; read-only classification; same dedupe as **`exportFeatureValidationPicks`**.

- **Purpose:** Segment graded **`perf_tracker`** rows for replay safety vs legacy best-effort vs strict snapshot validation eligibility.

- **Files inspected:** **`src/reporting/feature_validation_export.ts`**; **`docs/PROJECT_STATE.md`**; **`package.json`**.

- **Files changed:** **`src/reporting/feature_validation_export.ts`** — export **`readTrackerRowsFromFile`**; **`src/reporting/export_feature_validation_replay_readiness.ts`** — **`buildFeatureValidationReplayReadinessReport`**, **`writeFeatureValidationReplayReadinessArtifacts`**, **`formatFeatureValidationReplayReadinessSummaryLine`**; **`scripts/export_feature_validation_replay_readiness.ts`**; **`tests/phase106_feature_validation_replay_readiness.spec.ts`**; **`package.json`** (**`export:feature-validation-replay-readiness`**, **`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Snapshot rows: **`replay_ready`** = archive dir exists and legs map non-empty; **`strict_validation_eligible`** = replay-ready **and** **`resolveLegCsvRecordOrReconstruction`** in snapshot map. Legacy rows: counted in **`legacy_without_snapshot_id`**; **`legacy_resolved_best_effort`** when global legacy map resolves. **`strict_validation_ineligible`** = graded − strict eligible; breakdown into missing dir / no leg match in snapshot / legacy graded.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase106_feature_validation_replay_readiness.spec.ts tests/phase101_feature_validation_export.spec.ts` (**pass**).

- **Backward-compatibility:** Additive reporting only; **`exportFeatureValidationPicks`** behavior unchanged.

- **Risks / follow-ups:** Operators should treat **`strict_validation_eligible`** as the slice that matches Phase **103** snapshot-bound export success criteria (per-row).

### Phase 107 — Validation policy surfacing + strict-mode operator workflow

- **Assumptions:** **No** **`math_models/`**; **no** EV/breakeven/edge or optimizer selection changes; **no** fabricated **`legsSnapshotId`**; additive reporting and explicit operator labels only.

- **Purpose:** Every feature-validation export run states which join policy was used (**legacy-inclusive best-effort**, **snapshot-preferred default**, or **snapshot-only strict**), with graded/excluded counts and a compact policy artifact alongside existing snapshot status.

- **Files inspected:** **`src/reporting/feature_validation_export.ts`**; **`src/reporting/export_feature_validation_replay_readiness.ts`**; **`scripts/export_feature_validation_picks.ts`**; **`docs/PROJECT_STATE.md`**; **`package.json`**.

- **Files changed:** **`src/reporting/export_feature_validation_policy_status.ts`** — **`buildFeatureValidationPolicyStatusArtifact`**, **`writeFeatureValidationPolicyStatusArtifacts`**, **`formatFeatureValidationPolicySummaryLine`**; **`src/reporting/feature_validation_export.ts`** — **`writePolicyStatusArtifacts`** hook (dynamic **`require`**); **`scripts/export_feature_validation_picks.ts`** — **`--policy=`**, **`--no-policy-status`**, startup log; **`tests/phase107_feature_validation_policy.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** **`exportFeatureValidationPicks`** resolves **`policy`** from **`opts.policy`** → **`FEATURE_VALIDATION_POLICY`** → **`snapshot_preferred`**. **`snapshot_strict`** skips graded rows with no **`legsSnapshotId`** (**`policyExcludedNoSnapshotId`** / **`policyExcludedGradedRows`**). **`legacy_best_effort`** never loads snapshot maps for joining; increments **`exportedViaLegacyMapJoin`** on success. **`snapshot_preferred`** matches prior snapshot-vs-legacy join behavior when **`legsSnapshotId`** is set. Optional **`writePolicyStatusArtifacts`** writes JSON/MD with stable skip buckets, replay-readiness counts (Phase **106**), and a deterministic **`summaryLine`** (no wall-clock). CLI defaults **`writePolicyStatusArtifacts: true`** (API default remains opt-in **`false`** unless callers pass **`true`**).

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest tests/phase107_feature_validation_policy.spec.ts tests/phase103_feature_validation_snapshot_status.spec.ts tests/phase101_feature_validation_export.spec.ts` (**pass**).

- **Backward-compatibility:** Default validation semantics remain **`snapshot_preferred`** (same as pre–Phase **107** implicit behavior). Programmatic callers that do not set **`writePolicyStatusArtifacts`** do not write policy artifacts unless they opt in.

- **Risks / follow-ups:** Operators running strict workflows should pass **`--policy=snapshot_strict`** (or env) and confirm **`policy_excluded_no_snapshot_id`** in the artifact matches expectations.

### Phase 108 — Operator defaults + validation artifact consolidation

- **Assumptions:** **No** **`math_models/`**; **no** EV/edge/selection changes; **no** changes to Phase **104**/**106** classification logic; additive overview only.

- **Purpose:** One compact operator-facing place for validation/provenance health; detailed drill-down remains in existing Phase **103**/**104**/**105**/**106**/**107** artifacts.

- **Files inspected:** **`src/reporting/export_feature_validation_replay_readiness.ts`**; **`src/reporting/export_legs_snapshot_adoption.ts`**; **`src/reporting/export_tracker_snapshot_new_row_enforcement.ts`**; **`src/reporting/export_feature_validation_policy_status.ts`**; **`docs/PROJECT_STATE.md`**; **`package.json`**.

- **Files changed:** **`src/reporting/export_feature_validation_overview.ts`** — **`buildFeatureValidationOverviewReport`**, **`writeFeatureValidationOverviewArtifacts`**, **`formatFeatureValidationOverviewSummaryLine`**, **`resolveEffectiveFeatureValidationPolicy`** (re-export for scripts); **`scripts/export_feature_validation_overview.ts`**; **`tests/phase108_feature_validation_overview.spec.ts`**; **`package.json`** (**`export:feature-validation-overview`**, **`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Overview JSON/MD merges replay readiness counts (Phase **106**), adoption row counts (Phase **104**), effective policy from env/default (same resolution as feature export), optional **`lastExportPolicy`** from last policy-status artifact, optional Phase **105** enforcement counts from on-disk JSON when present (**`blocked_new_wo=na`** / **`override_appends=na`** when absent). Stable sorted JSON via **`stableStringifyForObservability`**. No writes other than overview paths from the Phase **108** CLI.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest tests/phase108_feature_validation_overview.spec.ts` (**pass**).

- **Backward-compatibility:** Existing artifacts and exporters unchanged; Phase **108** is additive.

- **Risks / follow-ups:** **`lastExportPolicy`** is informational only; effective policy for the next export run is **`FEATURE_VALIDATION_POLICY`** / default.

### Phase 109 — Validation overview dashboard/operator surface

- **Assumptions:** **No** **`math_models/`**; **no** EV/edge/selection or validation policy semantics changes; read-only UI + parse only.

- **Purpose:** Surface Phase **108** **`latest_feature_validation_overview.json`** in **`OptimizerStatePanels`** so operators see validation/provenance health without leaving the dashboard workflow.

- **Files inspected:** **`scripts/sync_dashboard_reports.ts`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`web-dashboard/vite.config.ts`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/reporting/feature_validation_overview_dashboard.ts`** — **`parseFeatureValidationOverviewDashboardJson`**; **`web-dashboard/src/components/FeatureValidationOverviewPanel.tsx`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`** (fetch + panel); **`web-dashboard/tsconfig.json`** + **`vite.config.ts`** (**`@repo/feature-validation-overview-dashboard`** alias); **`scripts/sync_dashboard_reports.ts`** (**`OPTIONAL_FILES`**); **`tests/phase109_feature_validation_dashboard.spec.ts`**; **`tests/fixtures/latest_feature_validation_overview_min.json`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** **`sync:dashboard-reports`** copies four required JSON files unchanged; **`latest_feature_validation_overview.json`** is optional (warn if missing, no exit **1**). Dashboard fetches overview with cache-bust; **`parseFeatureValidationOverviewDashboardJson`** returns **null** on invalid shape → explicit error string (**no mock data**). Panel lists policy, graded/replay/strict/legacy/missing-dir, snapshot-bound all+graded, blocked/override (**`na`** when enforcement absent), and **`summaryLine`**.

- **Validation commands run (agent):** `npx ts-node scripts/export_feature_validation_overview.ts`; `npm run sync:dashboard-reports`; `npx tsc --noEmit` (root); `web-dashboard` **`npm run build`**; `npx jest tests/phase109_feature_validation_dashboard.spec.ts` (**pass**).

- **Backward-compatibility:** Required sync set unchanged; pipelines that never run overview export still sync successfully.

- **Risks / follow-ups:** Run **`export:feature-validation-overview`** before **`sync:dashboard-reports`** when operators want the panel populated in **`public/data/reports/`**.

### Phase 110 — One-command validation/provenance refresh workflow

- **Assumptions:** **No** **`math_models/`**; **no** EV/edge/selection or validation policy changes; orchestration only (**`execSync`** **`npm run`** — same scripts as manual runs).

- **Purpose:** One operator command to regenerate replay + adoption + overview artifacts and sync the dashboard **`public/data/reports/`** copy for the Phase **109** panel.

- **Files inspected:** **`package.json`**; **`scripts/sync_dashboard_reports.ts`**; **`scripts/export_feature_validation_*.ts`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/reporting/validation_reporting_refresh_contract.ts`** — step order + **`npmScript`** keys; **`scripts/refresh_validation_reporting_surface.ts`**; **`package.json`** (**`refresh:validation-reporting`**); **`tests/phase110_validation_reporting_refresh.spec.ts`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** **`refresh:validation-reporting`** runs in order: (1) **`latest_feature_validation_replay_readiness.*`**, (2) **`latest_legs_snapshot_adoption.*`**, (3) **`latest_feature_validation_overview.*`**, (4) dashboard sync (four required JSON + optional overview). Does **not** run feature-validation-picks / policy-status (not required for overview build). Stdout: header, four **`step_id: OK`** lines, one **`overview:`** line with the overview **`summaryLine`**; stderr + exit **1** on first failing **`npm run`**. No partial-success wording.

- **Validation commands run (agent):** `npm run refresh:validation-reporting`; `npx jest tests/phase110_validation_reporting_refresh.spec.ts`; `npx tsc --noEmit`.

- **Backward-compatibility:** Individual **`npm run export:…`** scripts unchanged.

- **Risks / follow-ups:** **`execSync`** uses the shell on Windows — same as other Node orchestration; long runs inherit child stdout suppression (**`stdio`** pipe).

### Phase 111 — Validation reporting workflow integration

- **Assumptions:** **No** **`math_models/`**; **no** EV/edge/selection/policy changes; post-run orchestration only.

- **Purpose:** After a successful model-artifact refresh in **`post_run_model_refresh.ps1`**, run **`npm run refresh:validation-reporting`** so operators using **`run:with-post-refresh`** / **`postrun:model-refresh`** get updated validation/provenance artifacts + dashboard sync without a separate manual step.

- **Files inspected:** **`scripts/post_run_model_refresh.ps1`**; **`scripts/run_with_post_refresh.ps1`**; **`src/tracking/post_run_wrapper.ts`**; **`tests/phase16x_post_run_wrapper.spec.ts`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`scripts/post_run_model_refresh.ps1`** — **`Invoke-Step`** **`refresh_validation_reporting`**; **`src/tracking/post_run_wrapper.ts`** — third **`defaultPostRunSteps`** entry; **`tests/phase16x_post_run_wrapper.spec.ts`**; **`tests/phase111_validation_reporting_refresh_integration.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Capture → model artifacts → **validation reporting refresh**; failure on any step exits **1** with structured log (**`data/logs/post_run_model_refresh.log`**). **`npm run agent`**, **`run_optimizer.ps1`**, **`verify_wiring.ps1`** unchanged (no automatic validation refresh). **`runMainThenPostRun`** skipped log references **`npm run postrun:model-refresh`**.

- **Validation commands run (agent):** `npx jest tests/phase16x_post_run_wrapper.spec.ts tests/phase111_validation_reporting_refresh_integration.spec.ts`; `npx tsc --noEmit`.

- **Backward-compatibility:** Post-run takes longer; failures surface explicitly (same class as model refresh failure).

- **Risks / follow-ups:** Operators on **`agent`**-only workflows still run **`npm run refresh:validation-reporting`** manually or switch to **`run:with-post-refresh`**.

### Phase 112 — Validation refresh freshness linkage

- **Assumptions:** **No** **`math_models/`**; **no** EV/edge/selection/policy changes; mtime comparison only.

- **Purpose:** Operators see whether synced dashboard validation JSON is **fresh** (synced after last repo overview write) or **stale** / **unknown**.

- **Files inspected:** **`scripts/refresh_validation_reporting_surface.ts`**; **`scripts/sync_dashboard_reports.ts`**; **`web-dashboard/src/components/FeatureValidationOverviewPanel.tsx`**; **`docs/PROJECT_STATE.md`**.

- **Files changed:** **`src/reporting/validation_reporting_freshness.ts`** — **`classifyValidationReportingDashboardSync`**, **`writeValidationReportingFreshnessArtifacts`**; **`src/reporting/validation_reporting_freshness_dashboard.ts`** — parse; **`scripts/refresh_validation_reporting_surface.ts`** (writes freshness + **`freshness:`** log line); **`scripts/sync_dashboard_reports.ts`** (optional **`latest_validation_reporting_freshness.json`**); **`web-dashboard`** alias + **`OptimizerStatePanels`** / **`FeatureValidationOverviewPanel`**; **`tests/phase112_validation_reporting_freshness.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** **`lastValidationReportingRefreshUtc`** = artifact write time (only after full refresh success). **Stale** when dashboard overview copy missing or **`mtimeMs`** strictly older than repo **`data/reports/latest_feature_validation_overview.json`**. UI: badge **fresh** / **stale** / **unknown** + reason line; missing artifact → explicit message (no mock numbers).

- **Validation commands run (agent):** `npm run refresh:validation-reporting`; `npm run sync:dashboard-reports`; `npx jest tests/phase112_validation_reporting_freshness.spec.ts`; `npx tsc --noEmit`; **`web-dashboard`** **`npm run build`**.

- **Backward-compatibility:** Optional sync file; dashboard works without freshness (explicit unknown/error strip).

- **Risks / follow-ups:** Filesystems with coarse mtimes: classification uses strict **`<`** for stale; equal mtimes = **fresh**.

### Phase 113 — Validation/provenance operator runbook + command matrix

- **Assumptions:** Documentation only; **no** code path or math changes.

- **Purpose:** Single authoritative operator doc for validation/provenance workflows (Phases **102–112**).

- **Files changed:** **`docs/VALIDATION_PROVENANCE_RUNBOOK.md`**; **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE** pointer); **`tests/phase113_validation_provenance_runbook.spec.ts`**; **`package.json`** (**`verify:canonical`**).

- **Compact command matrix (detail in runbook):** **`export:feature-validation-replay-readiness`** / **`export:legs-snapshot-adoption`** / **`export:feature-validation-overview`** → drill-down; **`refresh:validation-reporting`** → full chain + freshness + dashboard sync; **`postrun:model-refresh`** / **`run:with-post-refresh`** → post-run includes validation refresh; **`export:feature-validation-picks`** → picks + policy flags.

- **Validation commands run (agent):** `npx jest tests/phase113_validation_provenance_runbook.spec.ts`.

- **Backward-compatibility:** N/A (docs + test only).

### Phase 114 — Validation/provenance audit bundle + dashboard export proof

- **Assumptions:** **No** **`math_models/`**, EV, breakeven, optimizer ranking, or validation **policy semantics** changes; **no** fabricated metrics — existence checks + light JSON field reads only.

- **Purpose:** One compact proof artifact that validation/provenance wiring is healthy end-to-end (repo reports → optional dashboard public JSON → operator runbook), with explicit dashboard sync visibility classification.

- **Files inspected:** `docs/PROJECT_STATE.md`; `scripts/sync_dashboard_reports.ts`; `data/reports/`; `web-dashboard/public/data/reports/`; `docs/VALIDATION_PROVENANCE_RUNBOOK.md`.

- **Files changed:** **`src/reporting/dashboard_sync_contract.ts`** (SSOT lists); **`src/reporting/validation_provenance_audit_bundle.ts`**; **`scripts/sync_dashboard_reports.ts`** (import contract); **`scripts/export_validation_provenance_audit_bundle.ts`**; **`package.json`** (**`export:validation-provenance-audit-bundle`**, **`verify:canonical`**); **`tests/phase114_validation_provenance_audit_bundle.spec.ts`**; **`data/reports/latest_validation_provenance_audit_bundle.json`** / **`.md`** (generated); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact behavior added/changed:** **`buildValidationProvenanceAuditBundle` / `writeValidationProvenanceAuditBundleArtifacts`** — **`classifyDashboardSyncVisibilityProof`** (**`proven`** = repo+public overview + both freshness copies; **`missing`** = missing repo overview or public overview; **`partial`** otherwise). **`dashboardExportProof`** includes booleans + counts of required/optional JSON under **`web-dashboard/public/data/reports/`** vs **`DASHBOARD_SYNC_*`**. CLI prints stable **`summaryLine`**.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase114_validation_provenance_audit_bundle.spec.ts`; `npm run export:validation-provenance-audit-bundle`.

- **Backward-compatibility:** Additive reporting only; default optimizer and export scripts unchanged.

### Phase 115 — Live merge / data quality hardening

- **Assumptions:** **No** **`math_models/`** changes; merge matching rules unchanged; timestamps treated as **coarse** (snapshot age + wall-clock skew when ISO fetch time exists); **`alias_resolution_rate`** counts **explicit** **`PLAYER_NAME_ALIASES`** map hits only (not fuzzy).

- **Purpose:** Operator-visible merge/input quality: **match_rate_pp**, **match_rate_ud**, **unmatched_legs_count**, **alias_resolution_rate**, **dropped_due_to_missing_market** / **line_diff** (canonical **no_match** / **line_mismatch**), freshness/staleness fields, identity/alias notes; **degraded-input** signal without new hard-stop unless existing merge-quality FAIL policy applies.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/reporting/merge_quality.ts`; `src/reporting/merge_audit.ts`; `src/merge_odds.ts`; `data/reports/` merge artifacts; `src/reporting/dashboard_sync_contract.ts`; `src/reporting/run_status.ts`; `src/run_optimizer.ts`; `src/run_underdog_optimizer.ts`.

- **Files changed:** **`src/merge_odds.ts`** (**`MergeStageAccounting`**: **`explicitAliasResolutionHits`**, **`multiBookConsensusPickCount`**; **`mergeCore`** snapshot freshness; alias hit counter); **`src/reporting/merge_audit.ts`** (**`mergePlatformStats`** on audit); **`src/reporting/merge_quality.ts`** (schema **v3** status; **`liveMergeQuality`**, **`freshness`**, **`identityVisibility`**; **`readLiveMergeInputForRunStatus`**); **`src/reporting/merge_platform_quality_by_pass.ts`** (new); **`src/reporting/merge_quality_operator.ts`**; **`src/reporting/run_status.ts`** (**`LiveMergeInputSummary`**); **`src/run_optimizer.ts`** / **`src/run_underdog_optimizer.ts`** (PP/UD upsert + run status); **`src/reporting/dashboard_sync_contract.ts`** (optional sync files); **`package.json`** (**`verify:canonical`**); **`tests/phase115_merge_live_data_quality.spec.ts`**; **`tests/phase42_merge_quality_operator.spec.ts`**; stage-accounting test helpers; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Per-merge **explicit alias** counter (match-eligible picks only). **Merge quality** JSON/MD: **live** metrics table, **freshness** (fetch ISO, snapshot age minutes, merge-vs-fetch skew minutes, conservative note), **identity** pointer to **`latest_merge_player_diagnostics.json`**. **`merge_platform_quality_by_pass.json`**: upsert on PP then UD so **both** mode retains **match_rate_pp** after UD finalize. **`latest_run_status.json`**: optional **`liveMergeInput`** when status file readable. **`merge_quality_status.json`**: **`liveInputDegraded`**, **`liveMergeQualityLine`**.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest` (Phase **115**, **40**, **41**, **42**, **39**, **114**, **17F**, **17G**, **17H**).

- **Backward-compatibility:** Additive JSON fields; older **`merge_quality_status`** without new fields may be skipped by **`readLiveMergeInputForRunStatus`**.

- **Risks / follow-ups:** **`latest_merge_audit`** remains **last merge pass** only — **`merge_platform_quality_by_pass`** is the cross-pass operator view; dashboard UI can surface **`liveMergeQualityLine`** after **`npm run sync:dashboard-reports`**.

### Phase 116 — Dashboard live input quality panel

- **Assumptions:** **No** **`math_models/`** or merge matcher changes; dashboard is read-only; optional JSON may be absent after sync.

- **Purpose:** Operator-visible **degraded input**, **per-pass PP/UD** metrics, **summary line**, **staleness** / identity notes from Phase **115** artifacts.

- **Files inspected:** `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/App.tsx`; `src/reporting/dashboard_sync_contract.ts`; Phase **115** merge quality artifacts; `web-dashboard/vite.config.ts` / `tsconfig.json`.

- **Files changed:** **`src/reporting/live_input_quality_dashboard.ts`** (parse + **`severityBadgeClass`**); **`src/reporting/dashboard_sync_contract.ts`** (optional **`latest_merge_quality.json`**); **`web-dashboard/src/components/LiveInputQualityPanel.tsx`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`web-dashboard/src/lib/dashboardArtifacts.ts`** (**`RunStatusArtifact.liveMergeInput`**); **`web-dashboard/vite.config.ts`**, **`web-dashboard/tsconfig.json`** (alias); **`tests/phase116_live_input_quality_dashboard.spec.ts`**; **`package.json`** (**`verify:canonical`**); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added/changed:** Fetches **`merge_quality_status.json`**, **`merge_platform_quality_by_pass.json`**, **`latest_merge_quality.json`** alongside existing reports; panel shows severity badge, degraded line, **`liveMergeQualityLine`**, key rates, PP/UD pass blocks when present, optional freshness/identity from full merge quality JSON; empty state when no artifacts; parse errors only for malformed status/by-pass when present.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest tests/phase116_live_input_quality_dashboard.spec.ts tests/phase114_validation_provenance_audit_bundle.spec.ts tests/phase109_feature_validation_dashboard.spec.ts`; **`web-dashboard` `npm run build`**.

- **Risks / follow-ups:** Full **`latest_merge_quality.json`** must be synced for staleness strip — run **`npm run sync:dashboard-reports`** after optimizer export; **React** panel not covered by Jest (parse tests only).

### Supplement — Archived-vs-fresh run path verification (read-only diagnosis, pre–Phase 102 implementation note)

- **Assumptions:** **No** **`math_models/`**, EV, breakeven, payout, combinatorics, or ranking changes; analysis used committed logs/reports only.

- **Purpose:** Resolve whether “empty cards” came from **archived slate inputs**, **start-time / outside-window** zeroing, or another stage — per operator hypothesis (Feb archive richness vs later empty **`prizepicks-cards.csv`**).

- **Files inspected:** **`scripts/run_optimizer.ps1`**, **`scripts/_auto_window.ps1`**, **`src/run_optimizer.ts`** (PP ingest path), **`artifacts/last_run.json`**, **`artifacts/logs/run_20260321-204509.txt`**, **`data/reports/latest_run_status.json`**, **`data/reports/latest_pre_diversification_card_diagnosis.json`**.

- **Exact failure cause (empty PP cards on examined success run):** **Not** archived-vs-fresh confusion for the canonical pipeline: log shows **`fetchPrizePicksRawProps`** → **“built … from live PrizePicks”** and OddsAPI snapshot (**`refreshMode=cache`** within age guard). **Not** zero legs at ingest: **433** merged picks → **17** legs after runner filters. **Not** auto-window abort (**`Test-AutoWindow`** would exit **0** with **“Outside window. Use -Force.”** before Node — this run completed). The **first** stage that produced **zero** PP **`prizepicks-cards.csv`** rows was **card construction + per-structure EV evaluation**: **`builderEvEvaluationsReturned`** **725** with **`evRejected`** summing to **725** and **`feasibilityPruned`** **0** (**`latest_pre_diversification_card_diagnosis.json`** / log **“EV evaluation rejected … cards”**). Comparing **offline** archived **`prizepicks-legs-*.csv`** (historical EV snapshot) to a **later** live run is not the same population — archive files are **not** read as **`run_optimizer`** PP input unless a separate workflow loads them. **Phase 102** adds **run-time** archive copies for **reproducibility**; ingest path remains live unless **`--mock-legs`** or another explicit loader.

- **Observability:** **`latest_pre_diversification_card_diagnosis.json`**, **`latest_run_status.json`**, **`artifacts/logs/run_*.txt`**.

- **Risks / follow-ups:** When debugging “no cards”, read **`latest_pre_diversification_card_diagnosis.json`** **`structureBuildStats[].evRejected`** vs **`feasibilityPruned`**; distinguish **leg-pool** issues (merge/eligibility) from **card EV** rejections.

### Phase 101E — Deterministic leg reconstruction join

- **Assumptions:** **No** optimizer / EV / breakeven / **`math_models/`** changes; **no** fuzzy matching; fail-closed on **0** or more than **1** grounded leg match.

- **Purpose:** When tracker **`leg_id`** does not appear in grounded legs, still export **`EvPick[]`** if exactly one legs row matches **player**, **stat** (**`normalizeStatToken`**), **line**, **team**, **opponent**, and **gameStartTime** when either side supplies it (both required and equal if either non-empty).

- **Files inspected / changed:** **`src/types.ts`** (**`EvPick.featureValidationJoin`**); **`src/reporting/feature_validation_export.ts`** (**`findReconstructionLegMatch`**, **`resolveLegCsvRecordOrReconstruction`**, **`exportFeatureValidationPicks`** stats **`joinedByLegId`** / **`joinedByReconstruction`**); **`scripts/export_feature_validation_picks.ts`** (log line); **`tests/phase101_feature_validation_export.spec.ts`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added:** After **`leg_id`** (+ suffix) join fails, scan **`legsMap`** for exact field equality; **`buildEvPickFromTrackerLeg`** sets **`projectionId`** / site from **`matchedLegCsvId`**; **`featureValidationJoin`** records **`method`** **`leg_id`** \| **`reconstruction`**.

- **Validation commands run (agent):** `npx tsc --noEmit` (**pass**); `npx jest --config jest.config.js tests/phase101_feature_validation_export.spec.ts` (**pass**).

- **Risks / follow-ups:** Collisions possible when **team**/**opponent**/**gameTime** omitted in both tracker and CSV; operator should prefer rows with full context or rely on **`leg_id`** when unique.

### Phase 101F — Feature validation reconstruction mismatch audit (read-only)

- **Assumptions:** **No** optimizer / matching / export code changes; analysis used **`data/perf_tracker.jsonl`** graded rows + **`existingLegCsvPaths`** + **`mergeLegsFromJsonFiles`** (same **`legsMap`** shape as **`exportFeatureValidationPicks`**).

- **Purpose:** Explain **16/16** **`skipped_no_leg`** after Phase **101E** — field-level reason vs **101E** **`findReconstructionLegMatch`**.

- **Files inspected:** **`src/reporting/feature_validation_export.ts`** (**`findReconstructionLegMatch`**), **`data/perf_tracker.jsonl`**, grounded **`prizepicks-legs*.csv`** / **`.json`** (via **`loadLegsMap`**), **`data/reports/latest_feature_validation_reconstruction_mismatch.json`** / **`.md`**.

- **Files changed:** **`data/reports/latest_feature_validation_reconstruction_mismatch.json`** / **`.md`** (audit output); **`docs/PROJECT_STATE.md`** (this section + **CURRENT_OBJECTIVE**).

- **Exact mismatch findings:** For **all 16** graded rows, **`psl_candidate_count`** = **0** — **no** grounded leg row shares **player + normalized stat + line** with the tracker row (**`legs_map_size`** **518**). **Primary blocker:** slate / projection mismatch (Feb **2026** tracker projection ids **10056xxx–10134xxx** vs **current** repo legs dominated by **later** PrizePicks ids — e.g. no **“GG Jackson”** on **rebounds 5.5** in any discovered **`\*legs*.csv`**). **Team/opponent/gameTime** did **not** differ for these rows because reconstruction **never reached** that stage — there was **no** **(player, stat, line)** candidate. **Secondary (hypothetical):** committed tracker rows lack **`team`**, **`opponent`**, **`gameStartTime`**; typical legs rows include **team**/**opponent** — if **PSL** were to match, **101E** would still require **`"" === "LAL"`**-style equality unless both sides empty.

- **Validation commands run (agent):** One-off **`loadLegsMap` + `mergeLegsFromJsonFiles`** audit (same as export ingest); wrote **`data/reports/latest_feature_validation_reconstruction_mismatch.*`**.

- **Recommended smallest next fix (data, not code):** Add grounded legs artifacts (**CSV/JSON**) that contain the **same** **`leg_id`** strings **or** the **same** **(player, stat, line)** rows as the graded tracker slate (e.g. Feb run **`prizepicks-legs`** output archived under **`data/legs_archive`**); optionally backfill **`team` / `opponent` / `gameStartTime`** on tracker rows when reconstruction without **`leg_id`** is desired.

### Phase 117 — Optimizer edge quality audit layer

- **Assumptions:** No **`math_models/`** or EV/breakeven formula changes; metrics derive only from existing **`CardEvResult`** exports, candidate pool counts, **`latest_portfolio_diversification.json`** hints when present, and CLI/env **`cardEvFloor`** (**`MIN_CARD_EV`** / **`--min-card-ev`**).

- **Purpose:** Operator-visible **output-quality** visibility (concentration, shallow export vs pool, fragility flags, explainability lines) and a lightweight **empty / thin / moderate / strong** status plus **`degradedOutput`** — not a new selection gate.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/run_optimizer.ts`; `src/reporting/run_status.ts`; `src/reporting/dashboard_sync_contract.ts`; `scripts/sync_dashboard_reports.ts`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/lib/dashboardArtifacts.ts`.

- **Files changed:** **`src/reporting/optimizer_edge_quality_audit.ts`** (build/write/summary); **`src/reporting/run_status.ts`** (optional **`optimizerEdgeQuality`** + markdown section); **`src/run_optimizer.ts`** (wire all success/early-exit/fatal/UD-only paths); **`src/reporting/dashboard_sync_contract.ts`** (optional **`latest_optimizer_edge_quality.json`**); **`web-dashboard/src/lib/optimizerEdgeQualityAudit.ts`**; **`web-dashboard/src/components/OptimizerStatePanels.tsx`**; **`web-dashboard/src/lib/dashboardArtifacts.ts`**; **`tests/phase117_optimizer_edge_quality_audit.spec.ts`**; **`package.json`** (`verify:canonical`); **`docs/PROJECT_STATE.md`**.

- **Exact behavior added:** After each run path that writes run status, **`tryWriteOptimizerEdgeQualityAuditFromRunParts`** builds per-platform slices (top EVs, top-1 share of top-5 sum, EV drop 1→5, share ≥ **`cardEvFloor`**, count above high-EV bar, leg-key reuse in top-5, dominant stat), **`explainability.lines`** + **`fragilityFlags`**, and **`outputQuality`**. **`formatRunStatusMarkdown`** includes a Phase **117** block when present.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase117_optimizer_edge_quality_audit.spec.ts tests/phase17f_run_status.spec.ts`; `cd web-dashboard && npm run build` (expected pass after changes).

- **Risks / follow-ups:** Pool sizes are best-effort (**PP:** **`sortedCards.length`**; **UD:** **`survival.generatedTotal`** when survival exists); if **`survival`** is absent on a future path, shallow-export flags may be suppressed — extend wiring only when that field is grounded.

### Phase 118 — Historical feature coverage audit + expansion plan

- **Assumptions:** No **`math_models/`** or EV/breakeven changes; audit is **read-only** reporting grounded in **`src/feature_input/`**, **`src/modeling/historical_feature_*`**, **`docs/FEATURE_INPUT_LAYER.md`**, and optional on-disk **`latest_historical_feature_registry.json`**.

- **Purpose:** Single SSOT view of **historical / contextual** feature readiness (families, sources, consumption depth, gaps) and **one** recommended next slice — **emit `home_away_split` + `schedule_rest` as `ContextFeatureRecord` from fields already computed on `HistoricalFeatureRow`** (narrow; no new fetches).

- **Files inspected:** `docs/PROJECT_STATE.md`; `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/context_feature_contract.ts`; `src/feature_input/index.ts`; `src/modeling/historical_feature_registry.ts`; `src/modeling/historical_feature_extract.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/dashboard_sync_contract.ts`.

- **Files changed:** **`src/reporting/historical_feature_coverage_audit.ts`**; **`scripts/export_historical_feature_coverage_audit.ts`**; **`package.json`** (`export:historical-feature-coverage-audit`, **`verify:canonical`**); **`src/reporting/dashboard_sync_contract.ts`** (optional sync); **`tests/phase118_historical_feature_coverage_audit.spec.ts`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added:** **`buildHistoricalFeatureCoverageAudit`** + **`writeHistoricalFeatureCoverageAuditArtifacts`**; stable **`summaryLine`**; markdown operator view; **`nextImplementationSlice`** documents scope/non-goals; no duplicate feature **definitions** (references contract + modules only).

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase118_historical_feature_coverage_audit.spec.ts`.

- **Recommended next implementation phase (119 suggestion):** ~~Implement **`schedule_home_away_context_records`**~~ — **done in Phase 119**; ~~audit **`nextImplementationSlice`** now suggests **`rolling_form_context_alignment`**~~ superseded by Phase **120**.

### Phase 119 — Schedule / home-away context records

- **Assumptions:** No **`math_models/`** changes; no EV/breakeven/edge changes; no optimizer ranking/selection/gating; only grounded **`HistoricalFeatureRow`** / **`PerfTrackerRow`** fields as in **`historical_feature_extract.ts`**.

- **Purpose:** **`ContextFeatureRecord`** coverage for **`home_away_split`** and **`schedule_rest`** on the **feature validation export** path; default optimizer unchanged.

- **Files inspected:** `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/context_feature_contract.ts`; `src/modeling/historical_feature_extract.ts`; `src/reporting/feature_validation_export.ts`.

- **Files changed:** **`src/feature_input/schedule_home_away_context_features.ts`**; **`src/feature_input/index.ts`**; **`src/reporting/feature_validation_export.ts`**; **`docs/FEATURE_INPUT_LAYER.md`**; **`src/reporting/historical_feature_coverage_audit.ts`** (inventory row + next slice); **`tests/phase119_schedule_home_away_context_features.spec.ts`**; **`tests/phase118_historical_feature_coverage_audit.spec.ts`**; **`package.json`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added:** **`buildScheduleHomeAwayContextRecords`**; **`buildContextRecordsForFeatureValidation`** merges defense + schedule/home; **`extractHistoricalFeaturesFromRows(rowsToProcess)`** precomputes **`HistoricalFeatureRow`** map by **`rowKey`** for each exported pick.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase119_schedule_home_away_context_features.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts`.

- **Risks / follow-ups:** Schedule fields require prior graded rows in the **same export row set** for chain computation; sparse trackers yield more nulls. Next suggested slice from this point is handled by **Phase 120** below.

### Phase 120 — Rolling form context alignment

- **Assumptions:** No **`math_models/`** changes; no EV/breakeven/edge changes; no optimizer ranking/selection/gating/card-construction changes. Rolling context records derive only from grounded **`HistoricalFeatureRow`** fields computed in **`historical_feature_extract.ts`**.

- **Purpose:** Add explicit **`rolling_form`** **`ContextFeatureRecord`** coverage on the validation/reporting path by mapping existing Phase **80** rolling fields, reusing current taxonomy and attachment flow.

- **Files inspected:** `docs/FEATURE_INPUT_LAYER.md`; `src/feature_input/rolling_form_features.ts`; `src/feature_input/context_feature_contract.ts`; `src/modeling/historical_feature_registry.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `tests/phase119_schedule_home_away_context_features.spec.ts`.

- **Files changed:** **`src/feature_input/rolling_form_context_features.ts`**; **`src/feature_input/index.ts`**; **`src/reporting/feature_validation_export.ts`**; **`src/reporting/historical_feature_coverage_audit.ts`** (rolling coverage evidence + next slice); **`docs/FEATURE_INPUT_LAYER.md`**; **`tests/phase120_rolling_form_context_alignment.spec.ts`**; **`tests/phase101_feature_validation_export.spec.ts`** (name clarifier only); **`tests/phase118_historical_feature_coverage_audit.spec.ts`** (next-slice id update); **`package.json`**; **`docs/PROJECT_STATE.md`**.

- **Exact behavior added:** **`buildRollingFormContextRecordsFromHistoricalRow`** emits:
  - **`rolling_form_l5_hit_rate`** (ratio, clamp [0,1]) from **`formL5HitRate`**
  - **`rolling_form_l10_hit_rate`** (ratio, clamp [0,1]) from **`formL10HitRate`**
  - **`rolling_form_l20_hit_rate`** (ratio, clamp [0,1]) from **`formL20HitRate`**
  - **`rolling_form_prior_sample_size`** (count) from **`formPriorSampleSize`**
  - **`rolling_form_l10_hit_trend_slope`** (zscore kind) from **`formL10HitTrendSlope`**
  Skips null/non-finite inputs conservatively. **`feature_validation_export.ts`** now merges these with existing defense + schedule/home records when historical rows are available.

- **Validation commands run (agent):** `npx tsc --noEmit`; `npx jest --config jest.config.js tests/phase120_rolling_form_context_alignment.spec.ts tests/phase119_schedule_home_away_context_features.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts`.

- **Risks / follow-ups:** Rolling-form records depend on historical extraction over the export row set; sparse trackers still produce missing rates. Next recommended phase: **market-context alignment** (map grounded Phase 80 market fields into context records on validation/reporting path).

### Phase 121 — End-to-end run reliability audit + hardening

- **Assumptions:** No `math_models/` edits; no EV/breakeven/edge/ranking formula changes; hardening focuses on run-path reliability, status clarity, and artifact consistency across PP-only, UD-only, and both-mode flows.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/run_optimizer.ts`; `src/run_underdog_optimizer.ts`; `src/reporting/run_status.ts`; `scripts/run_optimizer.ps1`; `tests/phase17f_run_status.spec.ts`; `tests/phase17g_early_exit_run_status.spec.ts`; `tests/phase17h_fatal_exit_run_status.spec.ts`.

- **Files changed:** `src/reporting/run_status.ts`; `src/run_optimizer.ts`; `src/run_underdog_optimizer.ts`; `scripts/run_optimizer.ps1`; `tests/phase17f_run_status.spec.ts`; `tests/phase17g_early_exit_run_status.spec.ts`; `tests/phase17h_fatal_exit_run_status.spec.ts`; `tests/phase121_run_reliability_hardening.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact behavior added/changed:**
  - Run status now includes `runHealth` with explicit operator states: `success`, `degraded_success`, `partial_completion`, `hard_failure`; markdown output includes the same line.
  - `buildEarlyExitRunStatus` now emits `runHealth=partial_completion`; `buildFatalExitRunStatus` emits `runHealth=hard_failure`; full-success paths can mark `degraded_success` when post-optimizer steps fail.
  - `run_optimizer` now captures and evaluates `runSheetsPush` exit codes in both-mode full-success and both-mode partial branches (insufficient legs / no viable PP structures) instead of silently discarding failures; those failures are surfaced in status notes.
  - UD guardrail fatal in `run_underdog_optimizer` no longer hard-exits via `process.exit(1)` inside the pipeline branch; it throws an error so orchestration-level fatal status/artifact writers can run consistently.
  - `scripts/run_optimizer.ps1` now reads `data/reports/latest_run_status.json` and propagates `runHealth`/`run_outcome` into `artifacts/last_run.json` and the markdown run report, improving wrapper-level status consistency.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase17f_run_status.spec.ts tests/phase17g_early_exit_run_status.spec.ts tests/phase17h_fatal_exit_run_status.spec.ts tests/phase121_run_reliability_hardening.spec.ts` (**pass**)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -DryRun` (**pass**)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/verify_wiring.ps1" -Flow optimizer` (**pass**)

- **Risks / follow-ups:** Remaining run health is still note-driven for some degraded scenarios (e.g., non-fatal optional artifact write failures outside status builder call sites). Next reliability slice should centralize final run finalization into one helper that always emits run status + operator artifacts with explicit degradation flags for every non-fatal writer failure.

### Phase 122 — Run finalization consolidation

- **Assumptions:** No `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; consolidation is operational and status/artifact focused.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/run_optimizer.ts`; `src/reporting/run_status.ts`; `scripts/run_optimizer.ps1`; `tests/phase17f_run_status.spec.ts`; `tests/phase17g_early_exit_run_status.spec.ts`; `tests/phase17h_fatal_exit_run_status.spec.ts`.

- **Files changed:** `src/reporting/run_status.ts`; `src/reporting/run_finalization.ts`; `src/run_optimizer.ts`; `scripts/run_optimizer.ps1`; `tests/phase17f_run_status.spec.ts`; `tests/phase17g_early_exit_run_status.spec.ts`; `tests/phase17h_fatal_exit_run_status.spec.ts`; `tests/phase122_run_finalization_consolidation.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact behavior added/changed:**
  - Added canonical finalization helper: `finalizeCanonicalRunStatus` in `src/reporting/run_finalization.ts`.
  - Consolidated all major `run_optimizer` status write paths (UD-only full, both/PP early exits, full success, fatal catch, fatal helper) to use the same finalization helper.
  - `RunStatusJson` now includes structured fields:
    - `degradationReasons: string[]`
    - `missingExpectedArtifacts: string[]`
  - Finalization computes missing expected artifacts from real disk paths and promotes them into structured degradation (`missing_expected_artifact:<file>`), with deterministic run-health mapping:
    - `fatal_exit -> hard_failure`
    - `early_exit -> partial_completion`
    - `full_success + degradation -> degraded_success`
    - `full_success + no degradation -> success`
  - `formatRunStatusMarkdown` now renders degradation/missing-artifact summaries and detailed sections when present.
  - Wrapper artifact consistency extended: `scripts/run_optimizer.ps1` now propagates `degradation_reasons` and `missing_expected_artifacts` from `data/reports/latest_run_status.json` into `artifacts/last_run.json` and run markdown.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase17f_run_status.spec.ts tests/phase17g_early_exit_run_status.spec.ts tests/phase17h_fatal_exit_run_status.spec.ts tests/phase121_run_reliability_hardening.spec.ts tests/phase122_run_finalization_consolidation.spec.ts` (**pass**, via focused reruns after static-wiring expectation updates)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -DryRun` (**pass**)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/verify_wiring.ps1" -Flow optimizer` (**pass**)

- **Risks / follow-ups:** Run finalization is now centralized for run status emission, but non-status operator artifacts (Phase 17I/17R/17S/17T/17U outputs) are still emitted in distributed `try/catch` blocks. Next reliability micro-phase could capture those write failures into `degradationReasons` in the same canonical finalizer payload.

### Phase 123A — End-to-end live run verification + blocker harvest

- **Assumptions:** No `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; verification prioritized real run-path behavior and operator artifacts over card-yield tuning.

- **Commands executed (in order):**
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -DryRun`
  - `node dist/src/run_optimizer.js --platform pp --sports NBA --providers PP,UD --bankroll 600 --no-sheets --no-require-alt-lines`
  - `npx tsc -p .`
  - `node dist/src/run_optimizer.js --platform pp --sports NBA --providers PP,UD --bankroll 600 --no-sheets --no-require-alt-lines` (post-compile rerun)
  - `node dist/src/run_optimizer.js --platform ud --sports NBA --providers PP,UD --bankroll 600 --no-sheets --no-require-alt-lines`
  - `node dist/src/run_optimizer.js --platform both --sports NBA --providers PP,UD --bankroll 600 --no-sheets --no-require-alt-lines`
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -Force`
  - `npx tsc -p .`
  - `node dist/src/run_optimizer.js --platform pp --sports NBA --providers PP,UD --bankroll 600 --no-sheets --no-require-alt-lines` (after blocker fix)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -Force` (after blocker fix)

- **Run modes attempted:** dry-run wrapper; PP-only live; UD-only live; both-mode live (`--no-sheets`); canonical wrapper live both-mode (`scripts/run_optimizer.ps1 -Force` with sheets/telegram side effects).

- **Outcome summary by run mode:**
  - **Dry-run wrapper:** `artifacts/last_run.json` wrote `status=dry_run_ok`; no fresh `latest_run_status.*` emitted (stale prior file remains by design).
  - **PP-only live:** completed end-to-end, no crash; initially reported `runHealth=success` despite degraded merge/input and empty output quality (blocker found).
  - **UD-only live:** completed end-to-end, no crash; 0 cards exported; status emitted with canonical schema.
  - **Both-mode live (`--no-sheets`):** completed end-to-end, no crash; status/artifacts emitted.
  - **Wrapper both-mode live (`-Force`):** completed compile + run + sheets setup/push + telegram side effects; wrapper artifacts emitted.

- **Files inspected:** `docs/PROJECT_STATE.md`; `scripts/run_optimizer.ps1`; `scripts/run-both.ps1`; `data/reports/latest_run_status.json`; `data/reports/latest_run_status.md`; `artifacts/last_run.json`; `artifacts/nba_optimizer_*.md`; `data/reports/latest_optimizer_edge_quality.json`.

- **Blocker found and fixed (surgical):**
  - **Blocker:** canonical finalization could still emit `runHealth=success` when `liveMergeInput.liveInputDegraded=true` and/or `optimizerEdgeQuality.degradedOutput=true` (degradation visible only in nested sections).
  - **Fix:** `src/reporting/run_finalization.ts` now auto-adds structured degradation reasons:
    - `live_input_degraded`
    - `optimizer_output_degraded`
    and this correctly elevates `runHealth` to `degraded_success`.
  - **Validation reruns:** PP-only live and wrapper both-mode live were rerun after compile; both now emit `runHealth=degraded_success` with structured `degradationReasons`, and wrapper `artifacts/last_run.json` matches.

- **Remaining environment/external dependency issues (not code-path blockers):**
  - Live behavior depends on external OddsAPI/Underdog/PrizePicks availability.
  - Sheets side effects may legitimately report “no rows to push” on empty-card slates.
  - Telegram behavior depends on configured bot/chat credentials and remote API availability.

- **Validation commands run (post-fix):**
  - `npx tsc -p .` (**pass**)
  - live PP-only rerun (**pass**; status now `degraded_success` when degraded flags present)
  - wrapper both-mode rerun (**pass**; `artifacts/last_run.json` now carries `status=degraded_success` + `degradation_reasons`)

- **Recommendation:** Reliability is sufficiently stabilized for the next planned step (**Phase 123 rebrand/dashboard cleanup**). Keep one follow-up reliability micro-slice after rebrand to decide whether dry-run should also emit a canonical `latest_run_status.*` snapshot rather than relying only on `artifacts/last_run.json`.

### Phase 123 — Website/Dashboard rebrand + operator UX cleanup

- **Assumptions:** `docs/PROJECT_STATE.md` treated as SSOT; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; backend wiring changes limited to existing canonical run-status fields already emitted by Phase 121/122/123A.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/src/components/AppHeader.tsx`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/components/LiveInputQualityPanel.tsx`; `web-dashboard/src/components/OperatorActionPanel.tsx`; `web-dashboard/src/lib/dashboardArtifacts.ts`; `web-dashboard/src/lib/dashboardDecisionClarity.ts`; `data/reports/latest_run_status.json`.

- **Files changed:** `web-dashboard/src/lib/dashboardArtifacts.ts`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/components/LiveInputQualityPanel.tsx`; `web-dashboard/src/components/AppHeader.tsx`; `web-dashboard/src/components/OperatorActionPanel.tsx`; `web-dashboard/src/App.tsx`; `docs/PROJECT_STATE.md`.

- **Exact behavior added/changed:**
  - Dashboard run-status types now include canonical Phase 122 fields from `latest_run_status.json`: `runHealth`, `degradationReasons`, `missingExpectedArtifacts`.
  - Added a high-signal top **Latest run health summary** panel in `OptimizerStatePanels`:
    - run-health chip mapped to canonical states (`success`, `degraded_success`, `partial_completion`, `hard_failure`) with explicit UI labels/colors;
    - run timestamp + outcome shown together;
    - degradation reasons section shown only when present;
    - missing expected artifacts section shown only when present;
    - explicit "no degradation/missing artifacts" success state when both are empty;
    - explicit loading and missing-sync states.
  - Existing decision card label cleaned from "Operator verdict" to "Card Export Verdict" to reduce ambiguity versus canonical run health.
  - Supporting panel labels cleaned for operator clarity:
    - App header title rebranded to **DFS Optimizer Operator Dashboard**.
    - `App.tsx` side card renamed from **Run Status** to **Local CSV snapshot** (avoids collision with canonical run-status panel).
    - `OperatorActionPanel` heading renamed to **Operator action cue**.
    - Live input quality degraded line now explicitly calls out operator action before trusting output.
  - No optimizer behavior/math/backend run logic changed.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase116_live_input_quality_dashboard.spec.ts tests/phase109_feature_validation_dashboard.spec.ts tests/phase86_dashboard_snapshot_text.spec.ts` (**pass**)
  - `ReadLints` on edited dashboard files (**no errors**)

- **Recommendation (next phase):** Move to a focused dashboard content cleanup pass that standardizes panel copy and pruning (Phase 123B), then run the planned reliability micro-slice to decide dry-run canonical `latest_run_status.*` emission.

### Phase 124 — Dry-run canonical status parity

- **Assumptions:** `docs/PROJECT_STATE.md` is SSOT; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; dry-run should reuse canonical finalization rather than a parallel status writer.

- **Files inspected:** `docs/PROJECT_STATE.md`; `scripts/run_optimizer.ps1`; `src/run_optimizer.ts`; `src/reporting/run_finalization.ts`; `src/reporting/run_status.ts`; `tests/phase122_run_finalization_consolidation.spec.ts`; `tests/phase17f_run_status.spec.ts`.

- **Files changed:** `scripts/write_dry_run_canonical_status.ts`; `scripts/run_optimizer.ps1`; `tests/phase124_dry_run_canonical_status_parity.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact behavior added/changed:**
  - Added `scripts/write_dry_run_canonical_status.ts`, which emits dry-run canonical status via existing `finalizeCanonicalRunStatus` (no new custom status schema/path).
  - `scripts/run_optimizer.ps1 -DryRun` now:
    - calls `npx ts-node scripts/write_dry_run_canonical_status.ts`,
    - emits fresh canonical `data/reports/latest_run_status.json` + `.md`,
    - reads that canonical JSON and writes aligned `artifacts/last_run.json` fields (`status`, `run_outcome`, `degradation_reasons`, `missing_expected_artifacts`).
  - Removed legacy dry-run-only `status=dry_run_ok` write path.
  - Dry-run semantics are explicit and operator-safe:
    - `outcome=full_success`,
    - `runHealth=degraded_success`,
    - `degradationReasons=["dry_run_no_live_execution"]`,
    - notes clarify execution was intentionally skipped.
  - Live-run behavior/path was not changed.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase124_dry_run_canonical_status_parity.spec.ts tests/phase122_run_finalization_consolidation.spec.ts tests/phase17f_run_status.spec.ts` (**pass**)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/run_optimizer.ps1" -DryRun` (**pass**)
  - `powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/verify_wiring.ps1" -Flow optimizer` (**pass**)

- **Observed parity result:** After dry-run, `data/reports/latest_run_status.json` and `artifacts/last_run.json` now agree on dry-run health semantics (`degraded_success` + `dry_run_no_live_execution`) with no stale canonical-status ambiguity.

- **Recommendation (next phase):** Return to reliability-adjacent operator hardening only where external dependencies can create ambiguity (e.g., explicit operator messaging for Sheets/Telegram no-op conditions), then resume planned feature expansion.

### Phase 125 — Resume feature expansion (single slice: market-context alignment)

- **Assumptions:** Feature roadmap resumes from pre-reliability pause point; one reporting/validation-first slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes.

- **Paused-lane summary (SSOT):**
  - Last completed feature phase before reliability pivot: **Phase 120** (`rolling_form` context alignment on validation export path).
  - Paused lane: **feature-input expansion on reporting/validation path** (ContextFeatureRecord coverage parity vs Phase 80 historical registry fields).
  - Next recommended feature slice at pause point: **market-context alignment** (`open/close implied, deltas, CLV, odds bucket` mapping into context records).

- **Phase 124 drift-check result:** clean.
  - `scripts/write_dry_run_canonical_status.ts` remains a thin adapter that only calls `finalizeCanonicalRunStatus`.
  - Dry-run and live status both emit canonical `RunStatusJson` schema via the same finalization/status writers (`run_finalization.ts` + `run_status.ts`).

- **Files inspected:** `docs/PROJECT_STATE.md`; `scripts/write_dry_run_canonical_status.ts`; `src/reporting/run_finalization.ts`; `src/reporting/run_status.ts`; `src/modeling/historical_feature_registry.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase101_feature_validation_export.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`.

- **Files changed:** `src/feature_input/market_context_features.ts`; `src/feature_input/index.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase125_market_context_alignment.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added **Phase 125** mapper: `buildMarketContextRecordsFromHistoricalRow` (`src/feature_input/market_context_features.ts`), mapping grounded `HistoricalFeatureRow` market fields into `ContextFeatureRecord`s:
    - `market_open_implied_prob` (ratio),
    - `market_close_implied_prob` (ratio),
    - `market_implied_prob_delta_close_minus_open` (zscore),
    - `market_clv_delta` (zscore),
    - `market_clv_pct` (zscore),
    - `market_odds_bucket` (categorical).
  - Mapper is wired into `buildContextRecordsForFeatureValidation` in `feature_validation_export.ts` (historical-row path only; conservative null/non-finite skips).
  - `historical_feature_coverage_audit.ts` now reflects market-context consumption as `validation_export_only` and advances `nextImplementationSlice` to the next missing-family gap (`matchup_context_builder_foundation`).
  - `docs/FEATURE_INPUT_LAYER.md` updated with a Phase 125 market-context family note.
  - No optimizer hot-path or scoring/gating behavior changed.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase125_market_context_alignment.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts tests/phase120_rolling_form_context_alignment.spec.ts` (**pass**)

- **Recommendation (next phase):** Implement one minimal `matchup_context` builder on validation/export path (still reporting-first, no optimizer math/selection wiring) to continue closing taxonomy coverage gaps incrementally.

### Phase 126 — Matchup context builder foundation

- **Assumptions:** SSOT roadmap remains reporting/validation-first; one slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/feature_input/market_context_features.ts`; `src/feature_input/schedule_home_away_context_features.ts`; `src/feature_input/rolling_form_context_features.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`.

- **Files changed:** `src/feature_input/matchup_context_features.ts`; `src/feature_input/index.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase126_matchup_context_builder_foundation.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added minimal matchup-context mapper: `buildMatchupContextRecordsFromHistoricalRow` in `src/feature_input/matchup_context_features.ts`.
  - Mapper uses grounded `HistoricalFeatureRow` opponent fields only:
    - `opponentAbbrevResolved` → `matchup_opponent_abbrev` (`family: matchup_context`, `kind: categorical`)
    - `opponentDefRankForStat` → `matchup_opponent_def_rank_for_stat` (`family: matchup_context`, `kind: count`)
  - Conservative handling: null/blank/non-finite fields are skipped; no fabricated values.
  - Wired only into `buildContextRecordsForFeatureValidation` (`src/reporting/feature_validation_export.ts`) when historical rows are present.
  - Coverage audit updated: `matchup_context` now `partial` + `validation_export_only`; next slice advanced to `role_stability_input_foundation`.
  - `docs/FEATURE_INPUT_LAYER.md` updated with Phase 126 matchup-context foundation note.
  - No live optimizer behavior changes.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase126_matchup_context_builder_foundation.spec.ts tests/phase125_market_context_alignment.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Implement a minimal role-stability input foundation on validation/export path only (single slice, no optimizer-path wiring), then reassess remaining taxonomy gaps.

### Phase 127 — Role stability input foundation

- **Assumptions:** One reporting/validation slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/modeling/historical_feature_registry.ts`; `src/feature_input/matchup_context_features.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`.

- **Files changed:** `src/feature_input/role_stability_features.ts`; `src/feature_input/index.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase127_role_stability_input_foundation.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added minimal role-stability mapper: `buildRoleStabilityRecordsFromHistoricalRow` in `src/feature_input/role_stability_features.ts`.
  - Mapper uses grounded `HistoricalFeatureRow` role fields only:
    - `roleMinutesTrend` → `role_minutes_trend` (`family: other`, `kind: zscore`) only when finite.
    - `roleStabilityNote` → `role_stability_note` (`family: other`, `kind: categorical`) when non-blank.
  - Conservative handling: null/blank/non-finite values are skipped; no fabricated role/rotation model added.
  - Wired only into `buildContextRecordsForFeatureValidation` (`src/reporting/feature_validation_export.ts`) when historical rows are present.
  - Coverage audit updated: `role_stability` now `partial` + `validation_export_only`; next slice advanced to `minutes_availability_grounded_bridge`.
  - `docs/FEATURE_INPUT_LAYER.md` updated with Phase 127 role-stability foundation note.
  - No live optimizer behavior changes.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase127_role_stability_input_foundation.spec.ts tests/phase126_matchup_context_builder_foundation.spec.ts tests/phase125_market_context_alignment.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Add a minimal grounded bridge for `minutes_availability` on the validation/export path only (single slice, no optimizer-path wiring) to reduce remaining taxonomy-to-consumption drift.

### Phase 128 — Minutes availability grounded bridge

- **Assumptions:** One reporting/validation slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/modeling/historical_feature_registry.ts`; `src/feature_input/minutes_availability_features.ts`; `src/feature_input/role_stability_features.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`.

- **Files changed:** `src/feature_input/minutes_availability_grounded_bridge.ts`; `src/feature_input/index.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase128_minutes_availability_grounded_bridge.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added minimal grounded bridge mapper: `buildMinutesAvailabilityRecordsFromHistoricalRow` in `src/feature_input/minutes_availability_grounded_bridge.ts`.
  - Bridge uses already-grounded `HistoricalFeatureRow` fields only, scoped conservatively to minutes-stat rows (`statNormalized=minutes|min`):
    - `formL5ScrapeStatMean` → `minutes_l5_avg` (`family: minutes_availability`, `kind: unknown`) when finite and non-negative.
    - `formL10ScrapeStatMean` → `minutes_l10_avg` (`family: minutes_availability`, `kind: unknown`) when finite and non-negative.
    - `formL5ScrapeStatMean - formL10ScrapeStatMean` → `minutes_trend_delta` when both values are finite and non-negative.
    - `formPriorSampleSize` → `games_played_l10` (`kind: count`) when finite and non-negative.
  - Conservative handling: non-minutes rows and null/blank/non-finite/unsupported values are skipped; no broad injury/availability modeling added.
  - Wired only into `buildContextRecordsForFeatureValidation` (`src/reporting/feature_validation_export.ts`) when historical rows are present.
  - Coverage audit updated: `minutes_availability` consumption moved to `validation_export_only`; `nextImplementationSlice` advanced to `game_environment_grounded_bridge`.
  - `docs/FEATURE_INPUT_LAYER.md` updated with Phase 128 minutes-availability grounded-bridge note.
  - **Role-stability taxonomy check:** kept under `family: other` as-is; SSOT/project patterns still treat it as a placeholder and do not yet establish a dedicated `role_stability` context family.
  - No live optimizer behavior changes.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase128_minutes_availability_grounded_bridge.spec.ts tests/phase127_role_stability_input_foundation.spec.ts tests/phase126_matchup_context_builder_foundation.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Add a minimal grounded bridge for `game_environment` on validation/export path only (single slice, no optimizer-path wiring), then reassess remaining taxonomy-to-consumption gaps.

### Phase 129 — Game environment grounded bridge

- **Assumptions:** One reporting/validation slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/modeling/historical_feature_registry.ts`; `src/modeling/historical_feature_extract.ts`; `src/feature_input/game_environment_features.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`.

- **Files changed:** `src/feature_input/game_environment_grounded_bridge.ts`; `src/feature_input/index.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase129_game_environment_grounded_bridge.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added minimal grounded bridge mapper: `buildGameEnvironmentRecordsFromHistoricalRow` in `src/feature_input/game_environment_grounded_bridge.ts`.
  - Bridge uses already-grounded `HistoricalFeatureRow` game-context stress fields only:
    - `daysRest` → `env_days_rest` (`family: game_environment`, `kind: count`) when finite/non-negative.
    - `isBackToBack` → `env_back_to_back_flag` (`kind: ratio`, 0/1) when boolean.
    - `playerGamesInLast4CalendarDays` → `env_schedule_density_last4d` (`kind: count`) when finite/non-negative.
  - Conservative handling: null/non-finite/unsupported values are skipped; no fabricated totals/spread values introduced.
  - Wired only into `buildContextRecordsForFeatureValidation` (`src/reporting/feature_validation_export.ts`) when historical rows are present.
  - Coverage audit updated: `game_environment` consumption moved to `validation_export_only`; `nextImplementationSlice` advanced to `game_environment_totals_spread_grounding`.
  - `docs/FEATURE_INPUT_LAYER.md` updated with Phase 129 game-environment grounded-bridge note.
  - No live optimizer behavior changes.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase129_game_environment_grounded_bridge.spec.ts tests/phase128_minutes_availability_grounded_bridge.spec.ts tests/phase127_role_stability_input_foundation.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Add a narrow historical grounding slice for direct `game_environment` totals/spread fields (when already present on source rows), then map those into validation-export `game_environment` records without touching optimizer-path wiring.

### Phase 130 — Game environment totals/spread grounding

- **Assumptions:** One reporting/validation slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/perf_tracker_types.ts`; `src/modeling/historical_feature_registry.ts`; `src/modeling/historical_feature_extract.ts`; `src/feature_input/game_environment_grounded_bridge.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`.

- **Files changed:** `src/perf_tracker_types.ts`; `src/modeling/historical_feature_registry.ts`; `src/modeling/historical_feature_extract.ts`; `src/feature_input/game_environment_grounded_bridge.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase130_game_environment_totals_spread_grounding.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added optional grounded totals/spread source fields to row contracts:
    - `PerfTrackerRow.gameTotal` / `PerfTrackerRow.spread` (optional, passthrough only).
    - `HistoricalFeatureRow.gameTotal` / `HistoricalFeatureRow.spread` (optional, passthrough only).
  - `extractHistoricalFeaturesFromRows` now carries `gameTotal`/`spread` from source rows into historical rows only when finite (else null).
  - `buildGameEnvironmentRecordsFromHistoricalRow` now maps grounded totals/spread through existing `buildGameEnvironmentFeatures` to emit canonical `game_environment` keys when present:
    - `game_total`, `spread`, `spread_abs`, `favorite_flag`, `team_implied_total`, `opponent_implied_total`, `implied_total_delta_vs_game`, `blowout_risk_bucket`.
  - Existing Phase 129 schedule-stress keys remain unchanged (`env_days_rest`, `env_back_to_back_flag`, `env_schedule_density_last4d`).
  - Conservative handling: missing/non-finite totals/spread emit no totals/spread-derived keys; no inference/reconstruction.
  - Validation/export path only; no optimizer-path wiring and no live optimizer behavior changes.
  - Coverage audit updated to reflect grounded totals/spread support in `game_environment`, and next slice advanced.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase130_game_environment_totals_spread_grounding.spec.ts tests/phase129_game_environment_grounded_bridge.spec.ts tests/phase128_minutes_availability_grounded_bridge.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Align `market_context` validation-export records to a dedicated family taxonomy (currently under `family: other`) via one narrow reporting/validation slice, with no optimizer-path wiring.

### Phase 131 — Market context family taxonomy alignment

- **Assumptions:** One reporting/validation slice only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `src/feature_input/context_feature_contract.ts`; `src/feature_input/market_context_features.ts`; `src/reporting/feature_validation_export.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase125_market_context_alignment.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`.

- **Files changed:** `src/feature_input/context_feature_contract.ts`; `src/feature_input/market_context_features.ts`; `src/reporting/historical_feature_coverage_audit.ts`; `docs/FEATURE_INPUT_LAYER.md`; `tests/phase125_market_context_alignment.spec.ts`; `tests/phase118_historical_feature_coverage_audit.spec.ts`; `docs/PROJECT_STATE.md`.

- **Exact reporting/validation behavior added/changed:**
  - Added dedicated `market_context` member to `ContextFeatureFamily` in `src/feature_input/context_feature_contract.ts`.
  - Updated `buildMarketContextRecordsFromHistoricalRow` (`src/feature_input/market_context_features.ts`) so market-context records now emit under `family: market_context` instead of `family: other`.
  - Kept all market-context keys/values/provenance unchanged:
    - `market_open_implied_prob`
    - `market_close_implied_prob`
    - `market_implied_prob_delta_close_minus_open`
    - `market_clv_delta`
    - `market_clv_pct`
    - `market_odds_bucket`
  - Validation/export wiring path unchanged (still via `buildContextRecordsForFeatureValidation`); no optimizer-path changes.
  - Coverage audit updated to reflect dedicated market-context family alignment and next slice advanced to `role_stability_family_taxonomy_alignment`.
  - `docs/FEATURE_INPUT_LAYER.md` updated to reflect the family alignment.
  - No live optimizer behavior changes.

- **Validation commands run (agent):**
  - `npx tsc --noEmit` (**pass**)
  - `npx jest --config jest.config.js tests/phase125_market_context_alignment.spec.ts tests/phase130_game_environment_totals_spread_grounding.spec.ts tests/phase101_feature_validation_export.spec.ts tests/phase118_historical_feature_coverage_audit.spec.ts` (**pass**)

- **Recommendation (next phase):** Implement one narrow reporting/validation-only `role_stability_family_taxonomy_alignment` slice to move role-stability records off `family: other` if contract support is added cleanly.

### Phase 132 — UI readiness + fresh data run verification

- **Assumptions:** Operational verification only; no `math_models/` edits; no EV/breakeven/edge/ranking/gating/card-construction changes; no optimizer-path wiring.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/package.json`; `package.json`; `scripts/run_optimizer.ps1`; `web-dashboard/src/App.tsx`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/lib/dashboardArtifacts.ts`; `data/reports/latest_run_status.json`; `data/reports/latest_run_status.md`; `artifacts/last_run.json`; `web-dashboard/public/data/reports/latest_run_status.json`.

- **Commands executed:**
  - `cd web-dashboard && npm run build`
  - `npm run agent`
  - `npm run sync:dashboard-reports`
  - `npm run export:card-ev-viability`
  - `npm run export:historical-feature-registry`
  - `npm run sync:dashboard-reports`

- **Operational verification results:**
  - UI/web dashboard is present and runnable locally (`vite` app in `web-dashboard`; build passed).
  - Dashboard read path is correct/current: `OptimizerStatePanels` fetches `public/data/reports/latest_run_status.json` plus related synced report artifacts.
  - Fresh optimizer run completed (`npm run agent`) and emitted fresh canonical/wrapper status artifacts.
  - Run outcome is degraded-success (not hard failure): `live_input_degraded`, `optimizer_output_degraded`; canonical artifacts still emitted cleanly.
  - Reporting freshness for dashboard was normalized by re-exporting/syncing stale optional report files (`latest_card_ev_viability.json`, `latest_historical_feature_registry.json`).
  - Phase 131 SSOT wording already correctly states the small `ContextFeatureFamily` contract expansion (`market_context`) while remaining reporting/validation-only; no wording correction required.

- **Artifacts confirmed fresh (UTC mtime):**
  - `data/reports/latest_run_status.json` — 2026-03-23T21:09:33.8899838Z
  - `data/reports/latest_run_status.md` — 2026-03-23T21:09:33.8899838Z
  - `artifacts/last_run.json` — 2026-03-23T21:09:34.0254040Z
  - `data/reports/latest_card_ev_viability.json` — 2026-03-23T21:10:18.1846307Z
  - `data/reports/latest_historical_feature_registry.json` — 2026-03-23T21:10:19.5955530Z
  - Dashboard copies synced with matching mtimes for the above under `web-dashboard/public/data/reports/`.

- **Files changed:** `docs/PROJECT_STATE.md` only.

- **Recommendation (next step):** If operationally desired, run `npm run run:with-post-refresh` for future production-style passes so model/validation reporting refresh chain is performed in one wrapper flow.

### Phase 133 — Live dashboard publish (IONOS /dfs/) + optional auto-publish after post-run

- **Assumptions:** Operational/deploy wiring only; no `math_models/`; no optimizer math, EV, or selection changes; secrets stay in root `.env` (not committed). Live host remains **IONOS** subdomain **`https://dfs.gamesmoviesmusic.com/`** → server docroot segment **`/dfs/`** (existing **`scripts/deploy-ftp.js`** / **`scripts/deploy-rsync.js`**).

- **Root cause (why local updates did not show on the live site):** **`npm run run:with-post-refresh`** ends after **`post_run_model_refresh.ps1`** (capture → model refresh → **`refresh:validation-reporting`**, which already includes **`sync:dashboard-reports`**). It never ran **`npm run deploy`** / **`deploy:ftp`**, so **`web-dashboard/dist/`** was not rebuilt and uploaded. The browser loads static files from the remote **`/dfs/`** tree, not the repo.

- **Discovered publish path (reuse, no new stack):**
  - **Served content:** Vite **`npm run build`** in **`web-dashboard/`** emits **`web-dashboard/dist/`** (includes **`public/`** assets such as **`data/reports/*.json`** after sync).
  - **FTP/SFTP:** **`npm run deploy:ftp`** → **`scripts/deploy-ftp.js`** — copies root CSVs into **`web-dashboard/public/data`**, builds, uploads **`dist/`** to **`/dfs/`**.
  - **rsync (SSH):** **`npm run deploy`** → **`scripts/deploy-rsync.js`** — builds, **`rsync`** **`dist/`** to **`FTP_USERNAME@SFTP_SERVERdfs`** (see script header).

- **Commands / scripts added or changed:**
  - **`npm run publish:dashboard-live`** → **`scripts/publish_dashboard_live.js`**: **`sync:dashboard-reports`** then **`deploy:ftp`** or **`deploy`** (auto-pick: FTP when **`FTP_PASSWORD`** + host + user; else rsync when **`SFTP_SERVERdfs`** + user; override **`DFS_PUBLISH_METHOD=ftp|rsync`**). Fails with explicit step labels on sync or deploy failure.
  - **`npm run run:with-post-refresh:publish`** → **`scripts/run_with_post_refresh.ps1 -PublishDashboard`** sets **`DFS_AUTO_PUBLISH_DASHBOARD=1`** for the child post-run script.
  - **`scripts/post_run_model_refresh.ps1`**: if **`DFS_AUTO_PUBLISH_DASHBOARD=1`**, runs **`npm run publish:dashboard-live`** after validation reporting (fail-fast).
  - **`scripts/run_with_post_refresh.ps1`**: **`-PublishDashboard`** switch sets env before post-run.
  - **`package.json`**: **`publish:dashboard-live`**, **`run:with-post-refresh:publish`**.
  - **`.env.example`** / **`config/.env.example`**: optional deploy keys (**`SFTP_SERVER`**, **`FTP_USERNAME`**, **`FTP_PASSWORD`**, **`SFTP_SERVERdfs`**, **`LIVE_DOMAIN`**) — empty placeholders, no secrets.

- **Push live now (operator, with credentials in `.env`):** `npm run publish:dashboard-live` (or `npm run deploy:ftp` / `npm run deploy` if sync already done). **Not executed in agent** (no remote credentials).

- **Standard automatic path for future runs:** `npm run run:with-post-refresh:publish` **or** `$env:DFS_AUTO_PUBLISH_DASHBOARD='1'; npm run run:with-post-refresh` (PowerShell). Unset **`DFS_AUTO_PUBLISH_DASHBOARD`** for local-only post-run.

- **Verification (live):** After publish, hard-refresh the site; optional: request **`/data/reports/latest_run_status.json`** (or another synced report) and confirm **`Last-Modified`** / body changed. **Live URL not re-verified in agent** (no deploy from this environment).

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase19a_env_example_contract.spec.ts` (recommended after `.env.example` edit).

- **Hardening (optional):** CI should **not** auto-publish without secrets; keep publish manual or on a scheduled runner with **`DFS_AUTO_PUBLISH_DASHBOARD=1`** and locked **`.env`**. Consider **`npm run deploy:check`** before publish in a separate ops script if you want a static asset guard without changing **`deploy-ftp.js`**. **GitHub Actions:** **`.github/workflows/deploy-dashboard.yml`** deploys on push to **`main`** only when paths under **`web-dashboard/**`** (or the workflow / **`deploy-ftp.js`**) change — a commit that only updates **`data/reports/`** at repo root does **not** trigger that workflow, which is another way the live site can lag behind a data-only push.

### Phase 134 — Dashboard multi-view IA (Overview / Explore / Diagnostics)

- **Assumptions:** `docs/PROJECT_STATE.md` SSOT; **no** `math_models/` edits; **no** EV/breakeven/edge/ranking/gating/card-construction or pipeline changes; dashboard remains a read-only consumer of synced **`public/data/reports/*.json`** and CSVs under **`public/data/`**.

- **Files inspected:** `docs/PROJECT_STATE.md`; `web-dashboard/src/App.tsx`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `web-dashboard/src/components/AppHeader.tsx`; `web-dashboard/src/components/PrimarySecondaryTabs.tsx` (unchanged wiring).

- **Files changed:** `web-dashboard/src/components/DashboardPageNav.tsx` (new); `web-dashboard/src/App.tsx`; `web-dashboard/src/components/AppHeader.tsx`; `web-dashboard/src/components/OptimizerStatePanels.tsx`; `docs/PROJECT_STATE.md`.

- **Exact layout / view split:**
  - **Overview** (default landing): export verdict + viability row (**`OptimizerStatePanels`** `variant="overview"`), status strip (dashboard refresh label, canonical run timestamp, run-health chip, PP/UD card counts from **`latest_run_status`**, optional CSV snapshot counts, compact degradation/missing-artifact lines), **`OperatorActionPanel`**, compact near-miss list when verdict is **NOT PLAYABLE**.
  - **Explore Legs:** three-column workspace only — filters, game pills, export, local CSV snapshot, portfolio range, **`PrimarySecondaryTabs`** + **`TopLegsView`** / **`CardsView`** / **`PickTracker`**, card detail, results snapshot (match coverage removed from this column).
  - **Diagnostics:** **`OptimizerStatePanels`** `variant="diagnostics"` — full run health, **`LiveInputQualityPanel`**, optimizer edge quality strip, **`OpportunitySurfacePanel`**, **`EdgeConcentrationPanel`**, **`FeatureValidationOverviewPanel`**, three-column run counters / pipeline diagnostics / historical feature coverage; below that, **Match coverage quality** (guest/admin) moved from Explore.
  - **URL:** `?page=explore` or `?page=diagnostics`; default Overview clears **`page`** from the query via **`replaceState`**. **`?view=canonical-samples`** unchanged.

- **Visual hierarchy / styling:** Shell **`bg-zinc-950`** + zinc neutrals; reduced cyan/violet gradient frames on decision/run-health; panels use **`border-zinc-800/50`** and **`bg-zinc-900/40`** instead of heavy boxed chrome; primary nav uses a single light pill for the active tab; Explore game pills use neutral selected state (less cyan competition).

- **Validation commands run (agent):** `cd web-dashboard && npm run build` (**pass** — `tsc` + `vite build`).

- **Recommendation (next UI pass):** Optional deep-link from Overview near-miss to Diagnostics opportunity panel; mobile nav (horizontal scroll or drawer); soften **`OpportunitySurfacePanel`** / **`EdgeConcentrationPanel`** borders to match zinc system without changing data.

### Phase 135 — Project-state doc split (CURRENT_STATE / guardrails / runbook / roadmap / phase history)

- **Assumptions:** Docs-only; **no** code or pipeline behavior change; **`docs/PROJECT_STATE.md`** tests (**Phase 113**, **Phase 17U**) remain satisfied via compatibility stub.

- **Purpose:** Replace monolithic project-state reading with focused files: **`docs/CURRENT_STATE.md`** (read-first SSOT), **`docs/ARCHITECTURE_GUARDRAILS.md`**, **`docs/OPERATIONS_RUNBOOK.md`**, **`docs/FEATURE_ROADMAP.md`**, **`docs/PHASE_HISTORY.md`** (append-only archive of prior **`PROJECT_STATE`** body + new entries).

- **Files changed:** **`docs/CURRENT_STATE.md`** (new); **`docs/ARCHITECTURE_GUARDRAILS.md`** (new); **`docs/OPERATIONS_RUNBOOK.md`** (new); **`docs/FEATURE_ROADMAP.md`** (new); **`docs/PHASE_HISTORY.md`** (new — migrated content from former **`docs/PROJECT_STATE.md`**); **`docs/PROJECT_STATE.md`** (compatibility index stub); **`docs/STATUS_ROADMAP.md`** (pointer to **`FEATURE_ROADMAP`**); **`docs/PHASE_HISTORY.md`** (Phase 113 bullet updated for split).

- **Validation commands run (agent):** `npx jest --config jest.config.js tests/phase113_validation_provenance_runbook.spec.ts tests/phase17u_repo_hygiene_audit.spec.ts` (**pass**).

- **Recommendation (next):** Point any remaining external bookmarks to **`docs/CURRENT_STATE.md`**; after future tasks, update **`CURRENT_STATE`** compactly and append here instead of growing the stub.
