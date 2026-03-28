// src/pp_engine.ts
// PrizePicks engine wrapper — Step 2 refactor.
// Phase 17K: leg eligibility uses the same canonical pipeline as run_optimizer (runtime_decision_pipeline).
// Phase 17Y: thresholds read from explicit CliArgs (no direct process-global cliArgs in engine methods).

import {
  PlatformEngine,
  LegCandidate,
  CardCandidate,
  EngineThresholds,
  EngineSummary,
} from "./engine_contracts";
import { EvPick, CardEvResult, FlexType } from "./types";
import type { CliArgs } from "./cli_args";
import { computePpRunnerLegEligibility } from "./policy/eligibility_policy";
import {
  applyPpHistoricalCalibrationPass,
  effectivePpLegEv,
  filterPpLegsByEffectiveEvFloor,
  filterPpLegsByMinTrueProb,
  filterPpLegsGlobalPlayerCap,
} from "./policy/runtime_decision_pipeline";

export class PrizepicksEngine implements PlatformEngine {
  readonly platform = "pp" as const;

  constructor(private readonly cli: CliArgs) {}

  getThresholds(): EngineThresholds {
    const p = computePpRunnerLegEligibility(this.cli);
    return {
      minEdge: p.minTrueProb, // Using trueProb as new "edge" metric
      minLegEv: 0, // Not used in new trueProb-based pipeline
      maxLegsPerPlayer: p.maxLegsPerPlayerGlobal,
      platform: "pp",
      extra: { evAdjThresh: 0, volumeMode: p.volumeMode }, // Not used in new pipeline
    };
  }

  /**
   * Filter EV picks using the canonical PP leg pipeline (same thresholds as run_optimizer).
   */
  filterLegs(evPicks: EvPick[]): LegCandidate[] {
    const policy = computePpRunnerLegEligibility(this.cli);
    const afterTrueProb = filterPpLegsByMinTrueProb(evPicks, policy.minTrueProb);
    console.log(`Legs after trueProb filter (>= ${policy.minTrueProb}): ${afterTrueProb.length} of ${evPicks.length}`);

    let legs = afterTrueProb;
    applyPpHistoricalCalibrationPass(legs);
    // No effective EV floor filtering in new trueProb-based pipeline
    console.log(
      `Legs after calibration and trueProb filter: ${legs.length} of ${afterTrueProb.length}`
    );

    const beforePlayerCap = legs.length;
    legs = filterPpLegsGlobalPlayerCap(legs, policy.maxLegsPerPlayerGlobal);
    console.log(
      `Legs after player cap (<= ${policy.maxLegsPerPlayerGlobal} per player): ${legs.length} of ${beforePlayerCap}`
    );

    return legs.map((pick) => ({
      pick,
      effectiveEv: effectivePpLegEv(pick),
      platform: "pp" as const,
    }));
  }

  async buildCards(
    _legs: LegCandidate[],
    _runTimestamp: string
  ): Promise<CardCandidate[]> {
    throw new Error(
      "PP card building is still inline in run_optimizer.ts for Step 2. " + "Use buildCardsForSize() directly."
    );
  }

  exportResults(
    _legs: LegCandidate[],
    _cards: CardCandidate[],
    _runTimestamp: string
  ): void {
    throw new Error(
      "PP export is still inline in run_optimizer.ts for Step 2. " + "Use writeLegsCsv/writeCardsCsv directly."
    );
  }

  summarize(
    mergedCount: number,
    legs: LegCandidate[],
    cards: CardCandidate[]
  ): EngineSummary {
    const sortedEvs = cards
      .map((c) => c.card.cardEv)
      .sort((a, b) => b - a);
    return {
      platform: "pp",
      mergedPicks: mergedCount,
      legsAfterFilter: legs.length,
      cardsBuilt: cards.length,
      cardsAfterFilter: cards.length,
      topCardEvs: sortedEvs.slice(0, 5),
    };
  }
}

/** Engine construction requires explicit resolved CliArgs (caller supplies bootstrap snapshot or defaults). */
export function createPrizepicksEngine(cli: CliArgs): PrizepicksEngine {
  return new PrizepicksEngine(cli);
}
