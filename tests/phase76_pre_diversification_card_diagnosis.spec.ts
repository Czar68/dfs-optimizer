import { classifyPreDiversificationRootCause } from "../src/reporting/pre_diversification_card_diagnosis";

describe("Phase 76 — pre-diversification root-cause classification", () => {
  it("classifies PP early exit (too few legs)", () => {
    const c = classifyPreDiversificationRootCause({
      pp: {
        eligibleLegsAfterRunnerFilters: 5,
        minLegsRequiredForCardBuild: 6,
        earlyExitTooFewLegs: true,
        noViableStructuresAllSkippedByLegEv: false,
        viableStructureFlexTypes: [],
        skippedStructureFlexTypes: [],
        maxEffectiveLegEvObserved: 0.02,
        builderAttemptLoopsScheduled: 0,
        builderSuccessfulFullLegSets: 0,
        builderEvEvaluationsReturned: 0,
        structureBuildStats: [],
        cardsAfterBuilderPostStructureDedupe: 0,
        cardsAfterPerTypeMinEvFilter: 0,
        selectionEngineBreakevenDropped: 0,
        selectionEngineAntiDilutionAdjustments: 0,
        cardsAfterSelectionEngine: 0,
        cardsAfterPrimaryRankSort: 0,
        cardsInputToDiversificationLayer: 0,
        cardsExportedAfterCapOrDiversification: 0,
        portfolioDiversificationEnabled: true,
        exampleBreakevenDropped: null,
      },
      ud: null,
    });
    expect(c.rootCause).toBe("insufficient_legs_for_minimum_card_size");
    expect(c.dominantDropStage).toContain("early_exit");
  });

  it("classifies PP no viable structures (max leg EV below structure floors)", () => {
    const c = classifyPreDiversificationRootCause({
      pp: {
        eligibleLegsAfterRunnerFilters: 16,
        minLegsRequiredForCardBuild: 6,
        earlyExitTooFewLegs: false,
        noViableStructuresAllSkippedByLegEv: true,
        viableStructureFlexTypes: [],
        skippedStructureFlexTypes: ["6F", "5P"],
        maxEffectiveLegEvObserved: 0.01,
        builderAttemptLoopsScheduled: 0,
        builderSuccessfulFullLegSets: 0,
        builderEvEvaluationsReturned: 0,
        structureBuildStats: [],
        cardsAfterBuilderPostStructureDedupe: 0,
        cardsAfterPerTypeMinEvFilter: 0,
        selectionEngineBreakevenDropped: 0,
        selectionEngineAntiDilutionAdjustments: 0,
        cardsAfterSelectionEngine: 0,
        cardsAfterPrimaryRankSort: 0,
        cardsInputToDiversificationLayer: 0,
        cardsExportedAfterCapOrDiversification: 0,
        portfolioDiversificationEnabled: true,
        exampleBreakevenDropped: null,
      },
      ud: null,
    });
    expect(c.rootCause).toBe("no_viable_pp_structures_max_leg_ev_below_structure_floor");
  });

  it("classifies PP per-type min EV when builder produced candidates but none survived filter", () => {
    const c = classifyPreDiversificationRootCause({
      pp: {
        eligibleLegsAfterRunnerFilters: 16,
        minLegsRequiredForCardBuild: 6,
        earlyExitTooFewLegs: false,
        noViableStructuresAllSkippedByLegEv: false,
        viableStructureFlexTypes: ["6F"],
        skippedStructureFlexTypes: [],
        maxEffectiveLegEvObserved: 0.02,
        builderAttemptLoopsScheduled: 3000,
        builderSuccessfulFullLegSets: 100,
        builderEvEvaluationsReturned: 50,
        structureBuildStats: [],
        cardsAfterBuilderPostStructureDedupe: 12,
        cardsAfterPerTypeMinEvFilter: 0,
        selectionEngineBreakevenDropped: 0,
        selectionEngineAntiDilutionAdjustments: 0,
        cardsAfterSelectionEngine: 0,
        cardsAfterPrimaryRankSort: 0,
        cardsInputToDiversificationLayer: 0,
        cardsExportedAfterCapOrDiversification: 0,
        portfolioDiversificationEnabled: true,
        exampleBreakevenDropped: null,
      },
      ud: null,
    });
    expect(c.rootCause).toBe("pp_per_type_min_ev_filter_removed_all");
  });

  it("classifies UD builder empty when combos were enumerated", () => {
    const c = classifyPreDiversificationRootCause({
      pp: null,
      ud: {
        eligibleLegsAfterRunnerFilters: 12,
        combosEnumeratedFromKCombinations: 500,
        combosPassedConstructionGate: 400,
        combosPassedStructureThreshold: 0,
        cardsPreDedupe: 0,
        cardsPostDedupe: 0,
        cardsAfterSelectionEngine: 0,
        selectionEngineBreakevenDropped: 0,
        selectionEngineAntiDilutionAdjustments: 0,
        cardsInputToDiversificationLayer: 0,
        cardsExportedAfterCapOrDiversification: 0,
        portfolioDiversificationEnabled: true,
        exampleBreakevenDropped: null,
      },
    });
    expect(c.rootCause).toBe("ud_builder_zero_accepted_candidates");
    expect(c.dominantDropStage).toContain("ud:");
  });
});
