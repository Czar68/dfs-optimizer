# Pipeline trace diagnosis (Phase 71)

Generated: 2026-03-21T22:13:35.928Z

## Sources inspected
- **data/reports/latest_platform_survival_summary.json** — PP/UD stage counts + thresholds
- **data/reports/latest_run_status.json** — Early exit + pick/card counts
- **data/reports/latest_eligibility_policy_contract.json** — PP stage order + min legs for cards
- **data/reports/latest_merge_audit.json** — Merge stage accounting (this run: Underdog matches in matchedBySite)
- **data/reports/latest_final_selection_observability.json** — UD export cap vs built pool
- **data/reports/latest_final_selection_reasons.json** — Dominant removal reasons (UD)
- **data/reports/latest_tracker_integrity.json** — Resolved calibratable / implied gaps
- **data/reports/latest_calibration_surface.json** — Edge bucket / predicted edge availability
- **artifacts/last_run.json** — Last agent flow metrics (if present)

## A. Cross-platform stage accounting
### PP (from platform survival + run status)
```json
{
  "rawSourceRows": 5219,
  "mergeMatchedRows": 671,
  "postNormalizationRows": "not_emitted_separately — see merge path in run_optimizer",
  "mergeCandidateRows": 671,
  "mergedMatchedRows": 671,
  "afterEvCompute": 671,
  "afterMinEdge": 51,
  "afterMinLegEv": 24,
  "afterAdjEvThreshold": 6,
  "afterGlobalPlayerCap": 5,
  "postStructureEvaluationCards": null,
  "postFinalSelectionCards": null,
  "exportedLegsCsvApprox": 5,
  "exportedCards": 0,
  "operatorNotes": [
    "PP: eligible legs after player cap (5) < 6 — PP cards skipped.",
    "UD may still run when platform=both or --force-ud."
  ]
}
```
### UD
```json
{
  "rawSourceRows": 1149,
  "mergedProps": 386,
  "evComputed": 339,
  "afterFilterEvPicks": 38,
  "finalLegPoolForCards": 38,
  "generatedTotalCards": 981,
  "exportedTotalCards": 400,
  "mergeAuditRawRows": 1149,
  "mergeAuditEmittedRows": 386
}
```
> latest_merge_audit.json stageAccounting reflects the OddsAPI merge pass for this run (propsConsideredForMatchingRows=856, emittedRows=386). PP-specific merge breakdown is not split in matchedBySite here; use platform survival for PP mergeMatchedProps.

## B. PP zero-output root cause
- **Code:** `early_exit_insufficient_eligible_legs_lt_min_for_card_build`
- Run outcome: early_exit (insufficient_eligible_legs). After PP leg pipeline stages, platform survival shows afterPlayerCap=5, while eligibility contract requires ppMinEligibleLegsForCardBuild=6. With only 5 eligible legs, PP card construction is skipped — not a merge-to-zero and not an export-only skip.
- **Artifacts:** data/reports/latest_run_status.json, data/reports/latest_platform_survival_summary.json, data/reports/latest_eligibility_policy_contract.json

## C. UD extreme-price trace
- **Conclusion:** `interpretation_naive_leg_ev_documented`
- Leg-level EV uses math_models/juice_adjust.ts juiceAwareLegEv, which returns trueProb − 0.5 (odds arguments are currently unused). Extreme American prices do not enter that leg EV — high positive legEv here reflects high model trueProb vs 50%, not ‘full value’ vs the -650 implied. Card-level EV uses payout tables separately (see card_ev / policy).

```json
{
  "sourceFile": "data/output_logs/underdog-legs.csv",
  "legId": "underdog-0b76ef71-6440-466a-bc4e-5951940e616d-points-7.5",
  "rawOverAmerican": -650,
  "rawUnderAmerican": 390,
  "impliedProbOverVig": 0.8666666666666667,
  "impliedProbUnderVig": 0.20408163265306123,
  "fairBreakevenOverFromTwoWayDeVig": 0.8094027954256671,
  "modelTrueProb": 0.8094027954256671,
  "legEvFromJuiceAwareCanonical": 0.30940279542566707,
  "edgeColumnFromCsv": 0.30940279542566707,
  "legEvColumnFromCsv": 0.30940279542566707,
  "matchesCanonicalLegEv": true
}
```
- **Code references:** math_models/juice_adjust.ts — juiceAwareLegEv; math_models/nonstandard_canonical_leg_math.ts — computeCanonicalLegMarketEdge → juiceAwareLegEv; src/calculate_ev.ts — calculateEvForMergedPick

## D. Artifact cross-links
- **latest_platform_survival_summary.json:** PP: 5219 raw → 671 merge-matched → 5 after player cap; UD: 1149 raw → 386 merged → 38 final leg pool.
- **latest_merge_audit.json (stageAccounting):** This snapshot’s matchedBySite lists underdog only; rawRows=1149 aligns with UD prop feed. PP merge counts come from survival (671), not this audit’s matchedBySite.
- **latest_final_selection_reasons.json (ud):** Dominant post-build removal: export_cap_truncation (581 cards); anti_dilution removes 7F/8F flex from ranked pool before cap.
- **latest_tracker_integrity.json:** Downstream calibration trust: resolved fully calibratable rate and implied gaps tie to historical perf_tracker rows — separate from this run’s leg EV semantics.
- **latest_calibration_surface.json:** Predicted edge availability limited by impliedProb coverage on resolved rows (see definitions.trackerIntegrity cross-link).

## E. Next actions
- PP: To obtain PP cards, raise eligible PP legs to ≥6 after all gates (lower thresholds/volume, or widen merge coverage — product decision), or run when more distinct players pass min edge / adj EV / player cap.
- UD: If leg ranking should reflect juice-aware edge vs fair market, that would be a deliberate math_models/policy change — not done in Phase 71 (diagnosis only).
- Re-run this export after the next full pipeline to refresh JSON inputs.
