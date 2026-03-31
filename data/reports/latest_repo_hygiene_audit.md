# Repo hygiene audit

- **schemaVersion:** 2
- **generatedAtUtc:** 2026-03-31T16:57:40.711Z
- **runTimestampEt:** 2026-03-31T12:57:24 ET
- **summary:** candidates=21; safe_remove=1; safe_archive=0; keep_active=17; keep_needs_review=3; safe_removals_applied=2; archived_this_phase=1; removed_this_phase=0; skipped_needs_review=3
- **auditRevisionNote:** Phase 17U baseline — curated classifications; Phase 17V adds archivedThisPhase / removedThisPhase / skippedNeedsReview execution fields. Conservative execution only.

## Safe removals performed (this pass)
- docs: removed broken external refactor-report link from PROJECT_STATE CURRENT_OBJECTIVE (living index is this file + Phase 17T)
- tests: added tests/phase16_tier1_scarcity_attribution.spec.ts to npm run verify:canonical bundle (was orphaned from canonical Jest run)

## Archived this phase (Phase 17V)
- src/validation/tweak_backtest.ts → tools/archive/validation/tweak_backtest.ts (offline CLI; not in src/ tsc root; run: npx ts-node tools/archive/validation/tweak_backtest.ts)

## Removed this phase (Phase 17V)
- (none)

## Skipped (needs review)
- dist/** — build output; policy unchanged
- safe_remove file targets — no ambiguous mass deletes in Phase 17V
- src/scripts/scrape_underdog_champions.ts — manual Playwright CLI (not package.json)

## Candidates (sorted by path)
### `dist/**`
- **classification:** `keep_needs_review`
- **rationale:** Build output — gitignored; should not be hand-edited or treated as source.
- **canonicalOwnerOrReplacement:** TypeScript build

### `docs/PROJECT_STATE.md`
- **classification:** `keep_active`
- **rationale:** Authoritative project state; required living doc.
- **canonicalOwnerOrReplacement:** —

### `math_models/**`
- **classification:** `keep_active`
- **rationale:** Canonical breakeven / registry / combinatorics — never treated as dead code.
- **canonicalOwnerOrReplacement:** —

### `src/fetch_oddsapi_legacy_alias.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17W canonical module: OddsAPI legacy alias (fetchSgoPlayerPropOdds + DEFAULT_MARKETS re-export). Primary script import: report_single_bet_ev.
- **canonicalOwnerOrReplacement:** —

### `src/fetch_oddsapi_odds.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17W compatibility shim: re-exports fetch_oddsapi_legacy_alias.ts for legacy import paths (explicit re-export only).
- **canonicalOwnerOrReplacement:** src/fetch_oddsapi_legacy_alias.ts

### `src/fetch_oddsapi_props.ts`
- **classification:** `keep_active`
- **rationale:** Primary Odds API fetch for snapshot + merge.
- **canonicalOwnerOrReplacement:** —

### `src/fetch_props.ts`
- **classification:** `keep_active`
- **rationale:** Active PrizePicks projections fetch for run_optimizer / fantasy_analyzer / run_nfl_raw_export.
- **canonicalOwnerOrReplacement:** —

### `src/pipeline/evaluation_buckets.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17L canonical bucket order + runBucketSlice.
- **canonicalOwnerOrReplacement:** —

### `src/policy/runtime_decision_pipeline.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17K+ canonical PP/UD leg eligibility; replaces scattered runner thresholds.
- **canonicalOwnerOrReplacement:** —

### `src/policy/shared_card_construction_gates.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17O shared structural gates + dedupe.
- **canonicalOwnerOrReplacement:** —

### `src/policy/shared_final_selection_policy.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17Q–17S final selection + attribution hooks.
- **canonicalOwnerOrReplacement:** —

### `src/policy/shared_leg_eligibility.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17N FCFS + export resolvers shared by PP/UD.
- **canonicalOwnerOrReplacement:** —

### `src/policy/shared_post_eligibility_optimization.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17P shared ranking / duplicate-player penalty.
- **canonicalOwnerOrReplacement:** —

### `src/reporting/final_selection_observability.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17R observability from pipeline arrays.
- **canonicalOwnerOrReplacement:** —

### `src/reporting/final_selection_reason_attribution.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17S reason attribution from shared policy helpers.
- **canonicalOwnerOrReplacement:** —

### `src/reporting/site_invariant_runtime_contract.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17T runtime contract table.
- **canonicalOwnerOrReplacement:** —

### `src/scripts/scrape_underdog_champions.ts`
- **classification:** `keep_needs_review`
- **rationale:** Manual Playwright CLI (not package.json); supports underdog_props_scraped.json for UD ingest.
- **canonicalOwnerOrReplacement:** —

### `src/server.ts`
- **classification:** `keep_active`
- **rationale:** Express dashboard API — active server-side path for web-dashboard.
- **canonicalOwnerOrReplacement:** —

### `stale-doc-reference:refactor_report.md`
- **classification:** `safe_remove`
- **rationale:** Broken reference to non-existent refactor_report.md in PROJECT_STATE (Phase 17U hygiene fix).
- **canonicalOwnerOrReplacement:** docs/PROJECT_STATE.md (self-contained)

### `tests/phase16_tier1_scarcity_attribution.spec.ts`
- **classification:** `keep_needs_review`
- **rationale:** Tier1 scarcity tests exist but were outside verify:canonical until Phase 17U alignment.
- **canonicalOwnerOrReplacement:** npm run verify:canonical (add spec to bundle)

### `tools/archive/validation/tweak_backtest.ts`
- **classification:** `keep_active`
- **rationale:** Phase 17V: offline tweak backtest CLI archived here (moved from src/validation/tweak_backtest.ts); not wired to optimizer entrypoints.
- **canonicalOwnerOrReplacement:** Manual: npx ts-node tools/archive/validation/tweak_backtest.ts
