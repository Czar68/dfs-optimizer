// src/ud_engine.ts
// Underdog engine wrapper — Step 2 refactor.
// Wraps existing UD filter/build/export from run_underdog_optimizer.ts behind
// the PlatformEngine interface.  NO math changes — factor logic, structure
// thresholds, and udAdjustedLegEv() are all unchanged.
// Phase 17Y: thresholds read from explicit CliArgs (no direct process-global cliArgs in engine methods).

import {
  PlatformEngine,
  LegCandidate,
  CardCandidate,
  EngineThresholds,
  EngineSummary,
  breakEvenProbLabel,
} from "./engine_contracts";
import { EvPick } from "./types";
import type { CliArgs } from "./cli_args";
import { computeUdRunnerLegEligibility } from "./policy/eligibility_policy";

// ── UD Engine ───────────────────────────────────────────────────────────────

export class UnderdogEngine implements PlatformEngine {
  readonly platform = "ud" as const;

  constructor(private readonly cli: CliArgs) {}

  getThresholds(): EngineThresholds {
    const p = computeUdRunnerLegEligibility(this.cli);
    return {
      minEdge: p.udMinEdge,
      minLegEv: p.udMinLegEv, // Still used by UD runner for compatibility
      maxLegsPerPlayer: p.maxLegsPerPlayerPerStat,
      platform: "ud",
      extra: {
        udVolume: p.udVolume,
        breakEvenNote: breakEvenProbLabel("ud"),
      },
    };
  }

  /**
   * UD leg filtering is still performed by filterEvPicks() inside
   * run_underdog_optimizer.ts.  This wrapper exists so the PlatformEngine
   * interface is satisfied; the actual call site is in runUnderdogOptimizer().
   *
   * The existing UD filter already handles:
   *  - factor-aware 3-way admission (standard / boosted / discounted)
   *  - udAdjustedLegEv() with UD_2P_STD_BREAKEVEN ≈ 0.5345
   *  - max 1 leg per player per stat
   */
  filterLegs(evPicks: EvPick[]): LegCandidate[] {
    // NOTE: This is the contract-conforming wrapper.  In Step 2, the actual
    // UD main() still calls its own filterEvPicks().  This method is provided
    // for future unified pipeline use and for parity testing.
    //
    // We import filterEvPicks lazily to avoid circular dependency issues
    // (run_underdog_optimizer.ts is a standalone entry point).
    const { filterEvPicksForEngine } = require("./run_underdog_optimizer");
    const filtered: EvPick[] = filterEvPicksForEngine(evPicks, this.cli);

    return filtered.map((pick) => ({
      pick,
      effectiveEv: pick.adjEv ?? pick.legEv,
      platform: "ud" as const,
    }));
  }

  /**
   * UD card building is still performed by buildUdCardsFromFiltered() inside
   * run_underdog_optimizer.ts.  Stub exists for interface satisfaction.
   */
  async buildCards(
    _legs: LegCandidate[],
    _runTimestamp: string
  ): Promise<CardCandidate[]> {
    throw new Error(
      "UD card building is still inline in run_underdog_optimizer.ts for Step 2. " +
      "Use buildUdCardsFromFiltered() directly."
    );
  }

  /** Export is still handled inline in run_underdog_optimizer.ts for Step 2. */
  exportResults(
    _legs: LegCandidate[],
    _cards: CardCandidate[],
    _runTimestamp: string
  ): void {
    throw new Error(
      "UD export is still inline in run_underdog_optimizer.ts for Step 2. " +
      "Use writeUnderdogCardsToFile() directly."
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
      platform: "ud",
      mergedPicks: mergedCount,
      legsAfterFilter: legs.length,
      cardsBuilt: cards.length,
      cardsAfterFilter: cards.length,
      topCardEvs: sortedEvs.slice(0, 5),
    };
  }
}

/** Engine construction requires explicit resolved CliArgs (caller supplies bootstrap snapshot or defaults). */
export function createUnderdogEngine(cli: CliArgs): UnderdogEngine {
  return new UnderdogEngine(cli);
}
