# Historical feature coverage audit (Phase 118)

- **Generated (UTC):** 2026-03-23T19:54:00.113Z
- **Summary:** historical_feature_coverage_audit families=10 registry_present=1 registry_rows=22

## Taxonomy
Two taxonomies coexist: (1) `ContextFeatureFamily` + `src/feature_input/*` builders for live `ContextFeatureRecord` paths; (2) Phase 80 `HistoricalFeatureRow` + `HISTORICAL_FEATURE_FAMILIES` for backtest/registry export from `perf_tracker`. They are related but not automatically unified — see `docs/FEATURE_INPUT_LAYER.md` and `src/modeling/historical_feature_registry.ts`.

## Registry artifact
- **data/reports/latest_historical_feature_registry.json** — present=true rows=22 marketGroups=22

## Cross-cutting
- **Contract:** `src/feature_input/context_feature_contract.ts`
- **Registry schema:** `src/modeling/historical_feature_registry.ts`
- **Docs:** `docs/FEATURE_INPUT_LAYER.md`
- **Optimizer attachment:** Optional `attachFeatureContextToCard` / `attachFeatureContextToPick` — default optimizer does not attach (see `run_optimizer.ts` Phase 95 comment).
- No dedicated AI or Monte Carlo *feature* pipeline under `src/feature_input/`; 'simulation' strings in reporting refer to threshold/diagnostic scripts (e.g. market-edge alignment), not learned features.

## Family inventory
### Rolling form (binary hit rates) (`rolling_form_binary`)
- **Readiness:** partial
- **Context / note:** rolling_form
- **Consumption:** validation_export_only
- **Evidence:**
  - `src/feature_input/rolling_form_features.ts` — `buildRollingFormBinaryFeatures` (L5/L10 from 0/1 priors).
  - **Phase 120** — `buildRollingFormContextRecordsFromHistoricalRow` maps `HistoricalFeatureRow.formL5/10/20HitRate` + sample size + trend slope into `rolling_form` context records on validation export path.
  - `src/modeling/historical_feature_registry.ts` — `formL5HitRate` / `formL10HitRate` / `formL20HitRate` from `perf_tracker` (same window idea; Phase 80).
  - `docs/FEATURE_INPUT_LAYER.md` — aligned semantics; not wired to selection.
- **Data sources:**
  - Chronological 0/1 priors (feature_input)
  - perf_tracker.jsonl + prior rows (registry export)
- **Gaps:**
  - Default `run_optimizer` / card paths do not call `attachFeatureContextToCard`.
  - Parallel representations still exist (`rolling_form_features.ts` from raw binary chain vs historical-row mapping).

### Minutes & availability (`minutes_availability`)
- **Readiness:** partial
- **Context / note:** minutes_availability
- **Consumption:** none
- **Evidence:**
  - `src/feature_input/minutes_availability_features.ts` — `buildMinutesAvailabilityFeatures` (L5/L10 avg, trend, DNP bucket).
  - `src/feature_input/feature_scoring.ts` — `minutes_signal` consumes this family only.
- **Data sources:**
  - Caller-supplied game log rows (`MinutesAvailabilityInput`); no fetch inside module.
- **Gaps:**
  - No default ingestion from NBA feeds in repo; requires caller to supply rows.

### Game environment (total, spread, implied) (`game_environment`)
- **Readiness:** partial
- **Context / note:** game_environment
- **Consumption:** none
- **Evidence:**
  - `src/feature_input/game_environment_features.ts` — pre-parsed totals/spread only.
  - `src/feature_input/feature_scoring.ts` — `environment_signal` uses `game_environment` only.
- **Data sources:**
  - Pre-parsed `gameTotal` / `spread` passed by caller.
- **Gaps:**
  - No OddsAPI fetch inside feature_input; must be threaded by caller.

### Team defense / opponent allowance (`team_defense_context`)
- **Readiness:** partial
- **Context / note:** team_defense_context
- **Consumption:** validation_export_only
- **Evidence:**
  - `src/feature_input/team_defense_features.ts` — ranks + `composite_defense_score` when ranks present.
  - `src/modeling/historical_feature_registry.ts` — `opponentDefRankForStat` via `src/matchups/opp_adjust.ts` static table (Phase 80).
  - `src/reporting/feature_validation_export.ts` — may attach context via `attachFeatureContextToPick` on validation export path.
- **Data sources:**
  - nba_api-style ranks passed in
  - Static NBA opponent table for registry extract
- **Gaps:**
  - Live optimizer legs do not populate defense ranks into `ContextFeatureRecord` by default.

### Home/away & schedule (tracker-backed) (`home_away_schedule_registry`)
- **Readiness:** partial
- **Context / note:** home_away_split + schedule_rest (contract) vs registry columns
- **Consumption:** validation_export_only
- **Evidence:**
  - **Phase 119** — `buildScheduleHomeAwayContextRecords` (`schedule_home_away_context_features.ts`) + `feature_validation_export.ts` attach `ContextFeatureRecord`s when historical row or `PerfTrackerRow.homeAway` is present.
  - `src/modeling/historical_feature_extract.ts` — fills `homeAway`, `daysRest`, `isBackToBack`, `playerGamesInLast4CalendarDays` on `HistoricalFeatureRow` when tracker/game data allows.
  - Registry `missingnessByFamily` notes: `homeAway` only when present on tracker row; `daysRest` needs prior game.
- **Data sources:**
  - perf_tracker row fields + chronological prior rows
- **Gaps:**
  - Default optimizer run does not call `attachFeatureContextToPick` — only feature-validation export path.

### Matchup context (`matchup_context`)
- **Readiness:** missing
- **Context / note:** matchup_context
- **Consumption:** none
- **Evidence:**
  - `matchup_context` listed in `ContextFeatureFamily` — no builder exported from `src/feature_input/index.ts`.
- **Gaps:**
  - No implemented builder; name reserved for future use.

### Market / line movement (tracker fields) (`market_context_registry`)
- **Readiness:** partial
- **Context / note:** registry_only (market_context)
- **Consumption:** reporting_only
- **Evidence:**
  - `HistoricalFeatureRow` — `openImpliedProb`, `closeImpliedProb`, `clvDelta`, `clvPct`, `oddsBucket` (Phase 80).
  - Phase 80 family doc: fields already on PerfTrackerRow; no new snapshot fetches in Phase 80 export.
- **Data sources:**
  - perf_tracker columns
- **Gaps:**
  - Not mapped to `ContextFeatureFamily` rows in feature_input.

### Role stability / usage trends (`role_stability`)
- **Readiness:** missing
- **Context / note:** other (placeholder)
- **Consumption:** none
- **Evidence:**
  - `HistoricalFeatureRow.roleMinutesTrend` is null; `roleStabilityNote: schema_only_no_minutes_series_in_repo` (Phase 80).
  - `feature_scoring.ts` references `usg_*` keys under `other` — not populated by default builders in index.
- **Gaps:**
  - No minutes/usage time series pipeline in repo.

### Historical feature registry export (Phase 80) (`historical_registry_export`)
- **Readiness:** ready
- **Context / note:** registry_only
- **Consumption:** reporting_only
- **Evidence:**
  - `npm run export:historical-feature-registry` → `data/reports/latest_historical_feature_registry.json` + `artifacts/historical_feature_rows.jsonl`.
  - `src/modeling/historical_feature_extract.ts` builds coverage + sample rows.
- **Data sources:**
  - data/perf_tracker.jsonl
- **Gaps:**
  - Not consumed by `trueProb` / edge / gating (per Phase 80 contract).

### Feature attachment on validation export (`feature_validation_attachment`)
- **Readiness:** partial
- **Context / note:** attach_context_features
- **Consumption:** validation_export_only
- **Evidence:**
  - `src/reporting/feature_validation_export.ts` — `attachFeatureContextToPick` on exported `EvPick`s when context records are built.
  - Default `run_optimizer` does not attach (`run_optimizer.ts` comment Phase 95).
- **Data sources:**
  - Joined legs + optional defense context
- **Gaps:**
  - Live cards from optimizer typically lack `featureSnapshot` / `featureSignals`.

## Recommended next implementation slice
- **ID:** `market_context_alignment`
- **Title:** Map historical market-context fields into `ContextFeatureRecord` rows on validation export path
- **Justification:
  - `HistoricalFeatureRow` already has `openImpliedProb`, `closeImpliedProb`, `impliedProbDeltaCloseMinusOpen`, `clvDelta`, `clvPct`.
  - Phase 120 covered rolling-form alignment; market-context remains registry-only in the audit.
  - A context-record mapper would improve reporting comparability without touching EV math.
- **Scope:** Add one mapper from `HistoricalFeatureRow` market fields to existing context families (`other` or an already-approved family), wire in `feature_validation_export`, and add tests/docs.
- **Explicit non-goals:
  - No changes to `math_models/` or selection/gating.
  - No requirement to alter odds snapshot ingestion or tracker writes.

