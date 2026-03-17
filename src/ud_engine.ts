// src/ud_engine.ts
// Underdog engine wrapper — Step 2 refactor.
// Wraps existing UD filter/build/export from run_underdog_optimizer.ts behind
// the PlatformEngine interface.  NO math changes — factor logic, structure
// thresholds, and udAdjustedLegEv() are all unchanged.

import {
  PlatformEngine,
  LegCandidate,
  CardCandidate,
  EngineThresholds,
  EngineSummary,
  breakEvenProbLabel,
} from "./engine_contracts";
import { EvPick } from "./types";
import { cliArgs } from "./cli_args";
import { getSelectionEv } from "./constants/evSelectionUtils";

// ── Thresholds (exact same values as run_underdog_optimizer.ts) ─────────────

const udVolume = !!cliArgs.udVolume;
const UD_MIN_LEG_EV = udVolume
  ? 0.010
  : (cliArgs.udMinEv ?? cliArgs.minEv ?? 0.012);
const UD_MIN_EDGE = cliArgs.minEdge ?? 0.008;
const UD_MAX_LEGS_PER_PLAYER = 1;

// ── UD Engine ───────────────────────────────────────────────────────────────

export class UnderdogEngine implements PlatformEngine {
  readonly platform = "ud" as const;

  getThresholds(): EngineThresholds {
    return {
      minEdge: UD_MIN_EDGE,
      minLegEv: UD_MIN_LEG_EV,
      maxLegsPerPlayer: UD_MAX_LEGS_PER_PLAYER,
      platform: "ud",
      extra: {
        udVolume,
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
    const filtered: EvPick[] = filterEvPicksForEngine(evPicks);

    return filtered.map((pick) => ({
      pick,
      effectiveEv: getSelectionEv(pick),
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

export const udEngine = new UnderdogEngine();
