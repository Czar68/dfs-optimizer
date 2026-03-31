# Eligibility Policy Contract

## 1. Generated timestamp
- UTC: 2026-03-31T21:59:15.368Z
- schemaVersion: 1

## 2. Shared policy
- Both platforms merge props with the same OddsSnapshot rows when run in unified mode.
- Leg EV and trueProb come from the same calculateEvForMergedPicks / juice-aware path (no duplicate EV formulas in this policy).
- Neither this contract nor Phase 17J changes EV, breakeven, ranking, or payout math.
- Phase 17K/17N: UD leg filter executes via filterUdEvPicksCanonical (shared FCFS cap + udMinEdge gate; runner and ud_engine aligned).
- Phase 17K: PP leg threshold stages execute via src/policy/runtime_decision_pipeline.ts (runner and pp_engine aligned).

## 3. PrizePicks-only policy
- runtimeSource: src/run_optimizer.ts
- runnerLegEligibility: {"maxLegsPerPlayerGlobal":1,"minTrueProb":0.532,"volumeMode":false}
- legGates: {"effectiveEvDefinition":"adjEv ?? legEv","maxLegsPerPlayerGlobal":1,"minTrueProb":0.532,"volumeMode":false}
- cardConstructionGates: {"dedupeTiming":"after_candidate_generation_dedupeCardCandidatesByLegIdSetBestCardEv_shared_card_construction_gates","maxCardBuildTries":3000,"maxLegsPool":30,"oppositeSideExclusionTiming":"during_candidate_sampling_firstCardConstructionGateFailure_shared_card_construction_gates","poolMinEdgeVersusStructureBreakeven":0.015,"ppMinEligibleLegsForCardBuild":6,"volumePoolRule":"trueProb >= structureBE + minEdge"}
- exportAndRanking: {"exportResolver":"resolvePrizePicksRunnerExportCardLimit","exportUncap":false,"maxExportOrMaxCardsWhenBoth":2,"sortOrder":"cardEv_desc_then_winProbCash_then_leg_ids"}
- ppEngineWrapper: {"maxLegsPerPlayer":1,"minTrueProb":0.532}
- runnerVsEngineDivergence: false
- stageOrder:
  - merge_with_odds_snapshot
  - calculate_ev_for_merged_picks
  - filter_min_edge_per_leg
  - filter_min_leg_ev
  - calibration_pipeline_tweaks_adj_ev
  - filter_effective_ev_vs_adjusted_threshold
  - global_player_cap_across_legs
  - early_exit_if_legs_lt_6
  - build_cards_per_structure
  - filter_cards_per_slip_min_ev
  - selection_engine_breakeven_anti_dilution
  - sort_cards
  - export_slice
  - portfolio_diversification_greedy_export
- note: Engine snapshot: minTrueProb=0.532 maxLegsPerPlayer=1
- note: Phase 77: after export_slice, optional greedy portfolio diversification (src/policy/portfolio_diversification.ts) unless --no-portfolio-diversification; writes data/reports/latest_portfolio_diversification.*.
- note: pp_engine.ts (PrizepicksEngine) uses fixed-style floors that diverge from run_optimizer when --volume is set — see ppEngineWrapperThresholds in contract JSON.

## 4. Underdog-only policy
- runtimeSource: src/run_underdog_optimizer.ts
- runnerLegEligibility: {"maxLegsPerPlayerPerStat":1,"udMinEdge":0.006,"udMinLegEv":0.004,"udVolume":false}
- legGates: {"boostedPickUdAdjustedLegEvFloor":0,"factorLt1":"decline_all","maxLegsPerPlayerPerStat":1,"noteRegistryFloorVsFilter":"UNDERDOG_GLOBAL_LEG_EV_FLOOR used in structure helpers; filterEvPicks applies leg.edge>=udMinEdge (sharedLegPassesMinEdge) after factor decline, then trueProb/adj tiers; card builder uses udMinLegEv.","standardPickMinTrueProbInFilterEvPicks":0.524,"udMinEdgeDefault":0.006,"udMinLegEvForCardBuilder":0.004,"udVolume":false,"underdogGlobalLegEvFloorRegistry":0.004}
- cardConstructionGates: {"dedupeTiming":"after_generation_dedupeFormatCardEntriesByLegSetBestCardEv_shared_card_construction_gates","edgeFloorInCardBuilder":0.004,"flexStructureIdsAllowed":["UD_3F_FLX","UD_4F_FLX","UD_5F_FLX","UD_6F_FLX","UD_7F_FLX","UD_8F_FLX"],"globalCardSort":"cardEv_desc_all_structures","oppositeSideExclusionTiming":"during_k_combo_sampling_firstCardConstructionGateFailure_shared_card_construction_gates","standardStructureIdsAllowed":["UD_2P_STD","UD_3P_STD","UD_4P_STD","UD_5P_STD","UD_6P_STD"],"structureBreakevenPlusEdgeWhenNotUdVolume":"trueProb >= be(structureId) + edgeFloor"}
- exportAndRanking: {"exportOrdering":"same_as_sorted_all_cards_after_cap","exportResolver":"resolveUnderdogRunnerExportCardCap","exportUncap":false,"maxCardsCap":2}
- stageOrder:
  - merge_with_odds
  - calculate_ev_for_merged_picks
  - ud_platform_math_factor_lt1_decline
  - shared_min_edge_gate_udMinEdge
  - ud_platform_math_std_boost_ev_tiers
  - shared_fcfs_cap_per_site_player_stat
  - optional_site_underdog_only_when_not_shared_legs
  - build_ud_cards_by_structure
  - global_sort_all_cards_by_card_ev
  - slice_max_cards_cap_shared_resolver
  - write_csv_json
- note: Phase AS/AT: boosted builder viableLegs on-path — boosted legs use udAdjustedLegEv vs boosted floor (passesUdBuilderViableLegEvFloor); disable via env UD_BOOSTED_BUILDER_VIABLE_LEGS_EXPERIMENT=0 or CLI --no-ud-boosted-builder-viable-legs-experiment (explicit CLI wins over env).
- note: Shared legs mode (platform=both) reuses PP-filtered legs — policy for that path is 'shared_legs' not raw UD API.

## 5. Differences requiring review
- (none — all differences are classified shared or approved platform-specific)

## 6. Notes
- Full comparison (all classifications):
  - [platform_specific_approved] legGates.maxLegsPerPlayerGlobal_vs_maxLegsPerPlayerPerStat (intentionally_different): pp=1 ud=1
  - [platform_specific_approved] legGates.minTrueProb_vs_udMinEdge (intentionally_different): pp=0.532 ud=0.006
  - [platform_specific_approved] legGates.pp_effective_ev_vs_ud_factor_policy (intentionally_different): pp="PP: adjEv ?? legEv vs threshold" ud="UD: decline factor<1; std 0.005/0.004; boosted udAdjustedLegEv"
  - [shared] legGates.volumeMode_vs_udVolume (identical): pp=false ud=false
  - [shared] volume.volumeMode_vs_udVolume (identical): pp=false ud=false
- Policy computations live in src/policy/eligibility_policy.ts (single normalization layer).
