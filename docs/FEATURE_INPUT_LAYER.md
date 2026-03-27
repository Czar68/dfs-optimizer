# Feature input layer (non-math)

## Where it lives

- **Code:** `src/feature_input/` — contracts and pure normalization only.
- **Not here:** `math_models/` (EV, breakeven, payouts, DP, Kelly), selection/gating, card construction.

## Contract

- **`ContextFeatureRecord`** (`context_feature_contract.ts`) — one contextual observation: `key`, `family`, `kind`, `asOfUtc`, `subjectId`, `value`, optional `provenance`.
- **`FeatureValueKind`** — `ratio` | `count` | `zscore` | `categorical` | `unknown` (semantic hint for consumers, not used inside `math_models/` today).

## Normalization

- **`normalizeContextFeatureValue`** (`normalize_context_feature_value.ts`) — deterministic coercion, optional clamp, fixed rounding by kind. No I/O, no randomness.

## Families (incremental)

- **Rolling form (binary)** — **`buildRollingFormBinaryFeatures`** (`rolling_form_features.ts`): from a chronological list of prior **0/1** outcomes, emits **`rolling_form_l5_hit_rate`** and **`rolling_form_l10_hit_rate`** (`ContextFeatureRecord`, `family: rolling_form`). Same last-*window* idea as the historical registry extract; **no tracker dependency** in this helper.

- **Rolling form (historical-row mapping, Phase 120)** — **`buildRollingFormContextRecordsFromHistoricalRow`** (`rolling_form_context_features.ts`): from grounded **`HistoricalFeatureRow`** fields emits **`rolling_form_l5_hit_rate`**, **`rolling_form_l10_hit_rate`**, **`rolling_form_l20_hit_rate`**, **`rolling_form_prior_sample_size`**, **`rolling_form_l10_hit_trend_slope`** under **`family: rolling_form`**. Any null/non-finite source value is skipped (except sample size count, including 0). Wired in **`feature_validation_export.ts`** when historical rows are available. No optimizer-path wiring.

- **Minutes + availability** — **`buildMinutesAvailabilityFeatures`** (`minutes_availability_features.ts`): from **`gameLogRowsChronological`** with **`minutes`** per game (oldest → newest), emits **`minutes_l5_avg`**, **`minutes_l10_avg`**, **`minutes_trend_delta`**, **`minutes_std_dev_l10`**, **`minutes_recent_max`**, **`games_played_l5`**, **`games_played_l10`**, **`recent_dnp_flag`**, **`minutes_consistency_bucket`** (`family: minutes_availability`). **No nba_api calls** inside — callers pass rows only. Consistency bucket: **low** / **medium** / **high** from sample std of minutes (below **3** / below **5** / else).

- **Game environment** — **`buildGameEnvironmentFeatures`** (`game_environment_features.ts`): **pre-parsed** only — **`gameTotal`**, **`spread`** (subject team favored when **spread** > 0). Emits whatever is computable: **`game_total`**, **`spread`**, **`spread_abs`**, **`favorite_flag`** (omit when **spread** is 0 or missing), **`team_implied_total`**, **`opponent_implied_total`**, **`implied_total_delta_vs_game`** when both total and spread exist (**team_implied** = **(gameTotal + spread) / 2**), **`blowout_risk_bucket`** from **|spread|** (low **≤3** / medium **≤7** / high). **No OddsAPI or fetch** in this module.

- **Team defense (opponent)** — **`buildTeamDefenseFeatures`** (`team_defense_features.ts`): **`opp_points_allowed`**, **`opp_fg_pct_allowed`**, **`opp_3p_pct_allowed`**, **`opp_rebounds_allowed`**, **`opp_assists_allowed`**, **`opp_def_rating`**, **`opp_points_allowed_rank`**, **`opp_fg_pct_allowed_rank`** when passed; **`composite_defense_score`** = mean(**rank / 30**) only when **both** rank fields are present. FG/3P **%** may be **0–1** or **0–100**. **No fetching.**

- **Schedule + home/away (Phase 119)** — **`buildScheduleHomeAwayContextRecords`** (`schedule_home_away_context_features.ts`): from grounded **`homeAway`**, **`daysRest`**, **`isBackToBack`**, **`playerGamesInLast4CalendarDays`** (same semantics as **`HistoricalFeatureRow`** / **`historical_feature_extract.ts`**). Emits **`home_away_role`** under **`home_away_split`** only when **`homeAway`** is **`home`** \| **`away`**; schedule metrics under **`schedule_rest`** only when values are non-null (skips missing evidence). **`src/reporting/feature_validation_export.ts`** merges these with defense records using **`extractHistoricalFeaturesFromRows`** on the export row set + tracker fallback for **`homeAway`** only. Default **optimizer** does **not** attach — validation/export path only.

- **Market context (Phases 125, 131)** — **`buildMarketContextRecordsFromHistoricalRow`** (`market_context_features.ts`): maps grounded **`HistoricalFeatureRow`** market fields into `ContextFeatureRecord`s on the validation/export path: **`market_open_implied_prob`**, **`market_close_implied_prob`**, **`market_implied_prob_delta_close_minus_open`**, **`market_clv_delta`**, **`market_clv_pct`**, **`market_odds_bucket`** under dedicated **`family: market_context`**. No optimizer-path wiring.

- **Matchup context foundation (Phase 126)** — **`buildMatchupContextRecordsFromHistoricalRow`** (`matchup_context_features.ts`): maps grounded **`HistoricalFeatureRow`** opponent fields into `ContextFeatureRecord`s under **`family: matchup_context`**: **`matchup_opponent_abbrev`**, **`matchup_opponent_def_rank_for_stat`**. Validation/export path only; no optimizer-path wiring.

- **Role-stability foundation (Phase 127)** — **`buildRoleStabilityRecordsFromHistoricalRow`** (`role_stability_features.ts`): maps grounded role fields into `ContextFeatureRecord`s on validation/export path: **`role_minutes_trend`** (only when finite) and **`role_stability_note`** (when non-blank). Uses **`family: other`** to match current taxonomy placeholders; no optimizer-path wiring.

- **Minutes-availability grounded bridge (Phase 128)** — **`buildMinutesAvailabilityRecordsFromHistoricalRow`** (`minutes_availability_grounded_bridge.ts`): maps grounded historical fields into `minutes_availability` records on validation/export path only, scoped to minutes-stat rows (`statNormalized=minutes|min`): **`minutes_l5_avg`**, **`minutes_l10_avg`**, **`minutes_trend_delta`**, **`games_played_l10`**. Conservative skips for null/non-finite/negative values; no injury/rotation expansion.

- **Game-environment grounded bridge (Phase 129)** — **`buildGameEnvironmentRecordsFromHistoricalRow`** (`game_environment_grounded_bridge.ts`): maps existing grounded historical game-context stress fields into `game_environment` records on validation/export path: **`env_days_rest`**, **`env_back_to_back_flag`**, **`env_schedule_density_last4d`** from `daysRest`, `isBackToBack`, `playerGamesInLast4CalendarDays`. Conservative skips for null/non-finite/unsupported values; no fabricated totals/spread in this slice.

- **Game-environment totals/spread grounding (Phase 130)** — `HistoricalFeatureRow` now carries optional grounded `gameTotal` / `spread` when present on source rows, and `buildGameEnvironmentRecordsFromHistoricalRow` maps them through the existing `buildGameEnvironmentFeatures` path to emit canonical keys (`game_total`, `spread`, `spread_abs`, `favorite_flag`, implied totals, blowout bucket) on validation/export only. Missing totals/spread remain omitted (no inference/reconstruction).

- **Join (integration boundary)** — **`joinContextFeaturesForSubject`** (`feature_join.ts`): filters **`ContextFeatureRecord`** rows to a single **`subjectId`** + **`asOfUtc`**, nests **`key` → `value`** under each **`ContextFeatureFamily`** (duplicate keys in one family: last wins). **No** scoring or optimizer coupling.

- **Snapshot (debug)** — **`buildFeatureSnapshot`** (`feature_snapshot.ts`): wraps **`joinContextFeaturesForSubject`** as **`{ subjectId, asOfUtc, featureFamilies }`** for **`JSON.stringify`**. Same family keys as **`ContextFeatureFamily`** (no separate **`usage`** name).

- **Scoring (non-EV, Phase 94 / 94B)** — **`scoreFeatureSnapshot`** (`feature_scoring.ts`): deterministic **[0,1]** **`signals`** from a **`FeatureSnapshot`**. **Not** EV, **not** optimizer input.
  - **`minutes_signal`** — only **`minutes_availability`**: **`minutes_l5_avg`**, **`minutes_std_dev_l10`** (variance penalty on base), **`minutes_trend_delta`** (bonus if **> 0**).
  - **`usage_signal`** — only **`usg_last5`**, **`usg_season`**, **`usg_delta_last5_vs_season`** (lookup across families, typically **`other`**). No **`rolling_form`**, games played, or DNP.
  - **`environment_signal`** — only **`game_environment`**: **mean** of available among **`blowout_risk_bucket`** score, **`game_total`**, **`spread_abs`** (no single-metric fallback chain).
  - **`defense_signal`** — **`team_defense_context`**: **`composite_defense_score`** or **`opp_points_allowed_rank`/30**.

- **Attachment (Phase 95)** — **`attachFeatureContextToCard`** / **`attachFeatureContextToPick`** (`attach_context_features.ts`): sets optional **`featureSnapshot`** + **`featureSignals`** on **`CardEvResult`** / **`EvPick`** (types in **`src/types.ts`**). Default pipeline does **not** call these — no ranking/filter change.

- **Diagnostics (Phase 96)** — **`summarizeFeatureSignals`** (`feature_diagnostics.ts`): **`count`** + mean/min/max per **`signals`** axis over **`EvPick`** rows with **`featureSignals`**. Read-only; no decisions.

## Boundary vs SSOT math

- Enriched inputs (L5, home/away, matchup, etc.) may be **joined in reporting, tracking, or future AI layers** by `subjectId` + `asOfUtc`.
- They **must not** alter `trueProb`, edge, breakeven, registry lookups, or final card selection until an explicit phase wires a **read-only** or **policy-approved** path. Until then, **`math_models/` imports stay unchanged.**

## Site-invariant processing

- Any future per-site presentation of these records must respect the same site-invariant rules as the rest of the pipeline (no hidden cross-site blending in math).
