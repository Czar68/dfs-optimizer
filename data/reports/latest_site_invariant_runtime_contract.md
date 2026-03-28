# Site-invariant runtime contract audit

- **schemaVersion:** 1
- **generatedAtUtc:** 2026-03-28T21:52:55.923Z
- **runTimestampEt:** 2026-03-28T17:51:47 ET
- **overallVerdict:** `compliant_with_explicit_irreducible_differences`
- **verdictRationale:** No non-math variance bugs in contract table; PP/UD differences are classified as irreducible platform math or input semantics only.
- **contractRevisionNote:** Phase 17T baseline — aligns with EVALUATION_BUCKET_ORDER, Phase 17N–17S shared modules, APPROVED_PLATFORM_MATH_VARIANCE in evaluation_buckets.ts.

## Overall verdict
- **compliant_with_explicit_irreducible_differences**

## Retained irreducible differences
- [ingest] irreducible_platform_input_semantics: Different sportsbook prop sources and schemas; orchestrated only in entrypoints. No shared raw-ingest module by design.
- [normalize] irreducible_platform_input_semantics: Platform-specific CSV normalization; no EV/decision logic.
- [platform_math] irreducible_platform_math: Same EV core; UD payout factor + std/boost floors are platform math (see src/pipeline/evaluation_buckets.ts APPROVED_PLATFORM_MATH_VARIANCE).
- [render_input] irreducible_platform_input_semantics: Entrypoint orchestration only; PP may emit extra diagnostics. No duplicate card EV or selection logic in render_input.
- [shared_eligibility] irreducible_platform_math: Shared FCFS + export resolvers; UD adds factor-aware tiers and udMinEdge ordering (Phase 17N) — approved in APPROVED_PLATFORM_MATH_VARIANCE.
- [structure_evaluation] irreducible_platform_math: Shared structural gates/dedupe; card EV evaluators are platform-native (PP vs UD registry structures) — not duplicated in policy layer.

## Non-math variance bugs (must be empty for production contract)
- **none recorded**

## Stage-by-stage contract
### ingest
- **divergenceClassification:** `irreducible_platform_input_semantics`
- **usesSharedCanonicalDecisionPath:** false
- **PP:** src/run_optimizer.ts → fetchPrizePicksRawProps (src/fetch_props.ts) | mock: createSyntheticEvPicks
- **UD:** src/run_underdog_optimizer.ts → fetchUnderdogRawPropsWithLogging (src/fetch_underdog_props.ts) | mock | shared legs
- **notes:** Different sportsbook prop sources and schemas; orchestrated only in entrypoints. No shared raw-ingest module by design.

### normalize
- **divergenceClassification:** `irreducible_platform_input_semantics`
- **usesSharedCanonicalDecisionPath:** false
- **PP:** src/run_optimizer.ts → writePrizePicksImportedCsv (src/export_imported_csv.ts)
- **UD:** src/run_underdog_optimizer.ts → writeUnderdogImportedCsv
- **notes:** Platform-specific CSV normalization; no EV/decision logic.

### match_merge
- **divergenceClassification:** `shared_same_canonical_implementation`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/merge_odds.ts → mergeWithSnapshot (shared OddsAPI snapshot rows)
- **UD:** src/merge_odds.ts → mergeWithSnapshot (shared OddsAPI snapshot rows)
- **notes:** MATCH_MERGE_SHARED_ENTRYPOINT — both platforms consume the same merge path (see src/pipeline/evaluation_buckets.ts).

### shared_eligibility
- **divergenceClassification:** `irreducible_platform_math`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/run_optimizer.ts guardrails + src/policy/runtime_decision_pipeline.ts (PP helpers) + src/policy/shared_leg_eligibility.ts (FCFS)
- **UD:** src/run_underdog_optimizer.ts guardrails + src/policy/runtime_decision_pipeline.ts → filterUdEvPicksCanonical + src/policy/shared_leg_eligibility.ts
- **notes:** Shared FCFS + export resolvers; UD adds factor-aware tiers and udMinEdge ordering (Phase 17N) — approved in APPROVED_PLATFORM_MATH_VARIANCE.

### platform_math
- **divergenceClassification:** `irreducible_platform_math`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/calculate_ev.ts → calculateEvForMergedPicks; src/policy/runtime_decision_pipeline.ts → executePrizePicksLegEligibilityPipeline / PP_LEG_POLICY
- **UD:** src/calculate_ev.ts → calculateEvForMergedPicks; src/policy/ud_pick_factor.ts → udAdjustedLegEv; filterUdEvPicksCanonical
- **notes:** Same EV core; UD payout factor + std/boost floors are platform math (see src/pipeline/evaluation_buckets.ts APPROVED_PLATFORM_MATH_VARIANCE).

### structure_evaluation
- **divergenceClassification:** `irreducible_platform_math`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/run_optimizer.ts → buildCardsForSize + src/card_ev.ts evaluateFlexCard + src/policy/shared_card_construction_gates.ts
- **UD:** src/run_underdog_optimizer.ts → buildUdCardsFromFiltered + src/underdog_card_ev.ts + src/policy/shared_card_construction_gates.ts
- **notes:** Shared structural gates/dedupe; card EV evaluators are platform-native (PP vs UD registry structures) — not duplicated in policy layer.

### selection_export
- **divergenceClassification:** `shared_same_canonical_implementation`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/policy/shared_final_selection_policy.ts + src/policy/shared_post_eligibility_optimization.ts + src/policy/shared_leg_eligibility.ts (export caps)
- **UD:** src/policy/shared_final_selection_policy.ts + shared_post_eligibility_optimization + shared_leg_eligibility
- **notes:** Final selection + export slice are centralized (Phase 17Q). Resolvers resolvePrizePicksRunnerExportCardLimit vs resolveUnderdogRunnerExportCardCap differ by CLI flags only.

### render_input
- **divergenceClassification:** `irreducible_platform_input_semantics`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/run_optimizer.ts render_input bucket (innovative / tracker / diagnostics — feature-flagged)
- **UD:** src/run_underdog_optimizer.ts render_input bucket (no-op placeholder; card writes occur in selection_export per 17L contract)
- **notes:** Entrypoint orchestration only; PP may emit extra diagnostics. No duplicate card EV or selection logic in render_input.

### final_selection_observability
- **divergenceClassification:** `shared_same_canonical_implementation`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/reporting/final_selection_observability.ts ← PP tail arrays from shared pipeline
- **UD:** src/reporting/final_selection_observability.ts ← UdRunResult from shared pipeline (Phase 17R)
- **notes:** Observability reads live pipeline arrays — not reconstructed from CSV.

### final_selection_reason_attribution
- **divergenceClassification:** `shared_same_canonical_implementation`
- **usesSharedCanonicalDecisionPath:** true
- **PP:** src/reporting/final_selection_reason_attribution.ts + src/policy/shared_final_selection_policy.ts attribution helpers
- **UD:** Same reporting + policy modules; UD uses attributeFinalSelectionUdFormatEntries
- **notes:** Phase 17S — reasons tied to SelectionEngine-equivalent attribution batch helpers.
