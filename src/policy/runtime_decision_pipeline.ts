/**
 * Phase 17K — Canonical runtime decision pipeline for leg eligibility (PP + UD).
 * Centralizes threshold stages; EV/breakeven/card-EV math unchanged.
 */

import type { CliArgs } from "../cli_args";
import type { EvPick } from "../types";
import {
  computeBucketCalibrations,
  getCalibration,
  adjustedEV,
} from "../calibrate_leg_ev";
import {
  computePpRunnerLegEligibility,
  computeUdRunnerLegEligibility,
  computeUdFilterBoostedFloors,
  computeUdFilterEvPicksStandardFloors,
  PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD,
  UD_MIN_TRUE_PROB,
} from "./eligibility_policy";
import { resolveUdFactor, udAdjustedLegEv } from "./ud_pick_factor";
import {
  applySharedFirstComeFirstServedCap,
  sharedLegPassesMinEdge,
} from "./shared_leg_eligibility";

/** Compact, stable failure / pass codes for audits and tests. */
export const PP_FAIL_EDGE = "PP_EDGE" as const;
export const PP_FAIL_MIN_LEG_EV = "PP_MIN_LEG_EV" as const;
export const PP_FAIL_EFFECTIVE_EV = "PP_EFFECTIVE_EV" as const;
export const PP_FAIL_PLAYER_CAP = "PP_PLAYER_CAP" as const;
export const PP_PASS = "PP_PASS" as const;

export type PpEligibilityFailCode =
  | typeof PP_FAIL_EDGE
  | typeof PP_FAIL_MIN_LEG_EV
  | typeof PP_FAIL_EFFECTIVE_EV
  | typeof PP_FAIL_PLAYER_CAP
  | typeof PP_PASS;

export type PpLegRuntimePolicy = ReturnType<typeof computePpRunnerLegEligibility>;

export interface PpLegStageResult {
  stageId: string;
  inputCount: number;
  outputCount: number;
}

/** Re-export canonical PP policy resolver (single numeric source). */
export { computePpRunnerLegEligibility, PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD };

export function effectivePpLegEv(leg: EvPick): number {
  return leg.adjEv ?? leg.legEv;
}

export function filterPpLegsByMinTrueProb(legs: EvPick[], minTrueProb: number): EvPick[] {
  return legs.filter((leg) => leg.trueProb >= minTrueProb);
}

/**
 * Historical bucket calibration (mutates leg.adjEv when bucket hits).
 * Same loop as former run_optimizer / pp_engine.
 */
export function applyPpHistoricalCalibrationPass(
  legs: EvPick[],
  options?: { maxFirstLogs?: number }
): { legsWithCalibration: number; calibrationBucketCount: number } {
  const calibrations = computeBucketCalibrations();
  let legsWithCalibration = 0;
  const maxLog = options?.maxFirstLogs ?? 5;
  for (const leg of legs) {
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
      if (legsWithCalibration <= maxLog) {
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
  return { legsWithCalibration, calibrationBucketCount: calibrations.length };
}

export function filterPpLegsByEffectiveEvFloor(legs: EvPick[], minEffectiveEv: number): EvPick[] {
  return legs.filter((l) => effectivePpLegEv(l) >= minEffectiveEv);
}

/** First-come first-served global player cap (shared primitive; PP grouping = per player). */
export function filterPpLegsGlobalPlayerCap(legs: EvPick[], maxPerPlayer: number): EvPick[] {
  return applySharedFirstComeFirstServedCap(legs, maxPerPlayer, "per_player");
}

export interface ExecutePpLegPipelineOptions {
  /** Injected after calibration, before effective-EV gate (pipeline / opp / corr in run_optimizer). */
  afterCalibrationBeforeEffectiveEv?: (legs: EvPick[]) => void;
  calibrationLogLimit?: number;
}

/**
 * Canonical PP leg threshold path: edge → min leg EV → calibration → (optional hook) → effective EV → player cap.
 */
export function executePrizePicksLegEligibilityPipeline(
  evPicks: EvPick[],
  policy: PpLegRuntimePolicy,
  options?: ExecutePpLegPipelineOptions
): EvPick[] {
  let legs = filterPpLegsByMinTrueProb(evPicks, policy.minTrueProb);
  applyPpHistoricalCalibrationPass(legs, { maxFirstLogs: options?.calibrationLogLimit ?? 5 });
  options?.afterCalibrationBeforeEffectiveEv?.(legs);
  legs = filterPpLegsGlobalPlayerCap(legs, policy.maxLegsPerPlayerGlobal);
  return legs;
}

/** First failure code for a leg traversing trueProb → player cap. */
export function ppLegFirstFailureCode(
  leg: EvPick,
  policy: PpLegRuntimePolicy,
  effectiveEv: number
): PpEligibilityFailCode {
  if (leg.trueProb < policy.minTrueProb) return PP_FAIL_EDGE;
  return PP_PASS;
}

export function summarizePpPipelineStages(
  evPicks: EvPick[],
  policy: PpLegRuntimePolicy,
  afterHook?: (legs: EvPick[]) => void
): PpLegStageResult[] {
  const s1 = filterPpLegsByMinTrueProb(evPicks, policy.minTrueProb);
  const s1b = [...s1];
  applyPpHistoricalCalibrationPass(s1b, { maxFirstLogs: 0 });
  afterHook?.(s1b);
  const s2 = filterPpLegsGlobalPlayerCap(s1b, policy.maxLegsPerPlayerGlobal);
  return [
    { stageId: "pp_min_true_prob", inputCount: evPicks.length, outputCount: s1.length },
    { stageId: "pp_player_cap", inputCount: s1b.length, outputCount: s2.length },
  ];
}

// --- UD canonical filter (approved platform-specific: factor tiers) ---

export const UD_FAIL_FACTOR_LT1 = "UD_FACTOR_LT1" as const;
export const UD_FAIL_STANDARD_LEG_EV = "UD_STANDARD_LEG_EV" as const;
export const UD_FAIL_BOOSTED_ADJ_EV = "UD_BOOSTED_ADJ_EV" as const;
export const UD_FAIL_PLAYER_STAT_CAP = "UD_PLAYER_STAT_CAP" as const;
export const UD_FAIL_MIN_EDGE = "UD_MIN_EDGE" as const;
/** `leg.edge` (same basis as `leg.legEv`) below `udMinEdge` after factor gate — shared comparator with PP. */
export const UD_FAIL_SHARED_MIN_EDGE = "UD_SHARED_MIN_EDGE" as const;
export const UD_PASS = "UD_PASS" as const;

export type UdEligibilityFailCode =
  | typeof UD_FAIL_FACTOR_LT1
  | typeof UD_FAIL_MIN_EDGE
  | typeof UD_FAIL_SHARED_MIN_EDGE
  | typeof UD_FAIL_STANDARD_LEG_EV
  | typeof UD_FAIL_BOOSTED_ADJ_EV
  | typeof UD_FAIL_PLAYER_STAT_CAP
  | typeof UD_PASS;

export interface FilterUdEvPicksOptions {
  overrides?: { standardPickMinTrueProb?: number };
  maxLegsPerPlayerPerStat?: number;
}

/**
 * Canonical UD leg filter: factor decline, shared min-edge (udMinEdge), std/boost EV floors, FCFS cap (per player/stat/site).
 * `overrides.udMinLegEv` reserved for API parity (auto-boost path); std floors remain 0.005/0.004 per legacy behavior.
 */
export function filterUdEvPicksCanonical(evPicks: EvPick[], args: CliArgs, options?: FilterUdEvPicksOptions): EvPick[] {
  const policy = computeUdRunnerLegEligibility(args);
  const { standardPickMinTrueProb } = computeUdFilterEvPicksStandardFloors(policy.udVolume);
  const { boostedAdjLegEvFloor, boostedMinTrueProb } = computeUdFilterBoostedFloors(policy.udVolume);
  const maxPerKey = options?.maxLegsPerPlayerPerStat ?? 1;
  const udMinEdge = policy.udMinEdge;
  void (options?.overrides?.standardPickMinTrueProb ?? 0);

  const declined: string[] = [];
  const nonStdBoosted: string[] = [];
  evPicks.forEach((p) => {
    const f = resolveUdFactor(p);
    if (f !== null && f < 1.0) {
      declined.push(`${p.player} ${p.stat} ${p.line} (f=${f.toFixed(2)})`);
      return;
    }
    if (f !== null && f > 1.0) {
      nonStdBoosted.push(`${p.player} ${p.stat} ${p.line} (f=${f.toFixed(2)}, trueProb=${p.trueProb.toFixed(3)})`);
    }
  });
  if (declined.length > 0) {
    console.log(`[UD] Declined ${declined.length} picks (factor < 1.0 — discounted favorites):`);
    declined.slice(0, 5).forEach((s) => console.log(`  ✗ ${s}`));
    if (declined.length > 5) console.log(`  … and ${declined.length - 5} more`);
  }
  if (nonStdBoosted.length > 0) {
    console.log(`[UD] ${nonStdBoosted.length} boosted picks (factor>1.0) will be analyzed`);
  }

  const filteredByEv = evPicks.filter((p) => {
    const f = resolveUdFactor(p);
    if (f !== null && f < 1.0) return false;
    if (!sharedLegPassesMinEdge(p, udMinEdge)) return false;
    /** Phase AK: boosted-only experiment — skips std/trueProb tiers; still requires shared min-edge above; then udAdjustedLegEv vs boosted floor. */
    if (args.udBoostedGateExperiment && f !== null && f > 1.0) {
      return udAdjustedLegEv(p) >= boostedAdjLegEvFloor;
    }
    if (p.trueProb < UD_MIN_TRUE_PROB) return false;
    if (f === null || f === 1.0) {
      return p.trueProb >= standardPickMinTrueProb;
    }
    return udAdjustedLegEv(p) >= boostedAdjLegEvFloor && p.trueProb >= boostedMinTrueProb;
  });

  const leakedCount = filteredByEv.filter((p) => {
    const f = resolveUdFactor(p);
    return f !== null && f < 1.0;
  }).length;
  if (leakedCount > 0) {
    console.error(`[UD] CRITICAL: ${leakedCount} picks with factor<1.0 leaked through filter — removing`);
  }
  const safeFiltered =
    leakedCount > 0
      ? filteredByEv.filter((p) => {
          const f = resolveUdFactor(p);
          return f === null || f >= 1.0;
        })
      : filteredByEv;

  const stdCount = safeFiltered.filter((p) => resolveUdFactor(p) === null || resolveUdFactor(p) === 1.0).length;
  const boostCount = safeFiltered.filter((p) => {
    const f = resolveUdFactor(p);
    return f !== null && f > 1.0;
  }).length;
  console.log(
    `[UD] Leg filter: ${safeFiltered.length} of ${evPicks.length} (${stdCount} std, ${boostCount} boost; declined ${declined.length} with factor<1.0)`
  );
  if (safeFiltered.length > 0) {
    console.log(
      `[UD]   adj-EV range: ${(Math.min(...safeFiltered.map(udAdjustedLegEv)) * 100).toFixed(1)}% – ${(Math.max(...safeFiltered.map(udAdjustedLegEv)) * 100).toFixed(1)}%`
    );
  }
  if (args.udBoostedGateExperiment) {
    const boostedIn = evPicks.filter((p) => {
      const f = resolveUdFactor(p);
      return f !== null && f > 1.0;
    }).length;
    const boostedPass = safeFiltered.filter((p) => {
      const f = resolveUdFactor(p);
      return f !== null && f > 1.0;
    }).length;
    console.log(
      `[UD] Phase AK udBoostedGateExperiment=ON: boosted legs in=${boostedIn} passing_filter=${boostedPass} (raw edge gate skipped for boosted only)`
    );
  }

  return applySharedFirstComeFirstServedCap(safeFiltered, maxPerKey, "per_player_per_stat_site");
}

export function udLegFirstFailureCode(p: EvPick, args: CliArgs): UdEligibilityFailCode {
  const policy = computeUdRunnerLegEligibility(args);
  const { standardPickMinTrueProb } = computeUdFilterEvPicksStandardFloors(policy.udVolume);
  const { boostedAdjLegEvFloor, boostedMinTrueProb } = computeUdFilterBoostedFloors(policy.udVolume);
  const f = resolveUdFactor(p);
  if (f !== null && f < 1.0) return UD_FAIL_FACTOR_LT1;
  if (!sharedLegPassesMinEdge(p, policy.udMinEdge)) return UD_FAIL_SHARED_MIN_EDGE;
  /** Phase AK: boosted-only experiment — align first-failure with filter (after shared min-edge). */
  if (args.udBoostedGateExperiment && f !== null && f > 1.0) {
    if (udAdjustedLegEv(p) < boostedAdjLegEvFloor) return UD_FAIL_BOOSTED_ADJ_EV;
    return UD_PASS;
  }
  if (p.trueProb < UD_MIN_TRUE_PROB) return UD_FAIL_MIN_EDGE;
  if (f === null || f === 1.0) {
    if (p.trueProb < standardPickMinTrueProb) return UD_FAIL_STANDARD_LEG_EV;
    return UD_PASS;
  }
  if (udAdjustedLegEv(p) < boostedAdjLegEvFloor) return UD_FAIL_BOOSTED_ADJ_EV;
  return UD_PASS;
}
