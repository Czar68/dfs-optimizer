// src/pp_engine.ts
// PrizePicks engine wrapper — Step 2 refactor.
// Wraps existing PP filter/build/export logic from run_optimizer.ts behind
// the PlatformEngine interface.  NO math changes — calls the same functions.

import {
  PlatformEngine,
  LegCandidate,
  CardCandidate,
  EngineThresholds,
  EngineSummary,
} from "./engine_contracts";
import { EvPick, CardEvResult, FlexType } from "./types";
import { cliArgs } from "./cli_args";
import {
  computeBucketCalibrations,
  getCalibration,
  adjustedEV,
} from "./calibrate_leg_ev";

// ── Thresholds (exact same values as run_optimizer.ts) ──────────────────────

const PP_MIN_EDGE = cliArgs.minEdge ?? 0.015;
const PP_MIN_LEG_EV = cliArgs.minEv ?? 0.020;
const PP_EV_ADJ_THRESH = 0.03;
const PP_MAX_LEGS_PER_PLAYER = 1;

// ── PP Engine ───────────────────────────────────────────────────────────────

export class PrizepicksEngine implements PlatformEngine {
  readonly platform = "pp" as const;

  getThresholds(): EngineThresholds {
    return {
      minEdge: PP_MIN_EDGE,
      minLegEv: PP_MIN_LEG_EV,
      maxLegsPerPlayer: PP_MAX_LEGS_PER_PLAYER,
      platform: "pp",
      extra: { evAdjThresh: PP_EV_ADJ_THRESH },
    };
  }

  /**
   * Filter EV picks using the exact same logic currently inline in
   * run_optimizer.ts lines 904–958.
   *
   * Steps (unchanged):
   *  1) edge >= MIN_EDGE_PER_LEG
   *  2) legEv >= MIN_LEG_EV
   *  2b) calibration: apply hist mult + under bias → adjEv
   *  2c) effectiveEv(l) >= EV_ADJ_THRESH
   *  3) max 1 leg per player
   */
  filterLegs(evPicks: EvPick[]): LegCandidate[] {
    // 1) Edge filter
    const legsAfterEdge = evPicks.filter((leg) => leg.edge >= PP_MIN_EDGE);

    // 2) Raw EV filter
    let legsAfterEvFilter = legsAfterEdge.filter(
      (leg) => leg.legEv >= PP_MIN_LEG_EV
    );

    // 2b) Calibration
    const calibrations = computeBucketCalibrations();
    let legsWithCalibration = 0;
    for (const leg of legsAfterEvFilter) {
      const { mult, underBonus, bucket } = getCalibration(
        calibrations,
        leg.player,
        leg.stat,
        leg.line,
        leg.book ?? "",
        leg.outcome === "under",
        leg.overOdds ?? undefined,
        leg.underOdds ?? undefined
      );
      const isUnder = leg.outcome === "under";
      const adj = adjustedEV(leg.legEv, mult, isUnder, underBonus);
      if (bucket) {
        leg.adjEv = adj;
        legsWithCalibration++;
        if (legsWithCalibration <= 5) {
          const pct = (bucket.histHit * 100).toFixed(0);
          console.log(
            `  Calib: ${leg.player} ${leg.stat} adjEV=${(adj * 100).toFixed(1)}% (mult=${mult.toFixed(2)} hist${pct}%)`
          );
        }
      }
    }
    if (calibrations.length > 0) {
      console.log(
        `  Calibration: ${legsWithCalibration} legs with hist bucket (${calibrations.length} buckets)`
      );
    }

    const effectiveEv = (l: EvPick) => l.adjEv ?? l.legEv;
    legsAfterEvFilter = legsAfterEvFilter.filter(
      (l) => effectiveEv(l) >= PP_EV_ADJ_THRESH
    );

    console.log(
      `Legs after edge filter (>= ${PP_MIN_EDGE}): ${legsAfterEdge.length} of ${evPicks.length}`
    );
    console.log(
      `Legs after EV filter (>= ${(PP_MIN_LEG_EV * 100).toFixed(1)}% raw, then adjEV >= ${(PP_EV_ADJ_THRESH * 100).toFixed(0)}%): ${legsAfterEvFilter.length} of ${legsAfterEdge.length}`
    );

    // 3) Player cap
    const counts = new Map<string, number>();
    const filtered: EvPick[] = legsAfterEvFilter.filter((leg) => {
      const key = leg.player;
      const count = counts.get(key) ?? 0;
      if (count + 1 > PP_MAX_LEGS_PER_PLAYER) return false;
      counts.set(key, count + 1);
      return true;
    });

    console.log(
      `Legs after player cap (<= ${PP_MAX_LEGS_PER_PLAYER} per player): ${filtered.length} of ${legsAfterEvFilter.length}`
    );

    return filtered.map((pick) => ({
      pick,
      effectiveEv: effectiveEv(pick),
      platform: "pp" as const,
    }));
  }

  /**
   * Card building is delegated back to run_optimizer.ts's buildCardsForSize().
   * This stub exists so the interface is satisfied; the actual wiring happens
   * in run_optimizer.ts where buildCardsForSize is still called inline
   * (moving it fully here would require moving 200+ lines of helper functions
   * with no behavioral benefit in this refactor step).
   */
  async buildCards(
    _legs: LegCandidate[],
    _runTimestamp: string
  ): Promise<CardCandidate[]> {
    throw new Error(
      "PP card building is still inline in run_optimizer.ts for Step 2. " +
      "Use buildCardsForSize() directly."
    );
  }

  /** Export is still handled inline in run_optimizer.ts for Step 2. */
  exportResults(
    _legs: LegCandidate[],
    _cards: CardCandidate[],
    _runTimestamp: string
  ): void {
    throw new Error(
      "PP export is still inline in run_optimizer.ts for Step 2. " +
      "Use writeLegsCsv/writeCardsCsv directly."
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

export const ppEngine = new PrizepicksEngine();
