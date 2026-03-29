// src/run_optimizer.ts

/* eslint-disable no-console */

import "./optimizer_cli_bootstrap";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

import { fetchPrizePicksRawProps } from "./fetch_props";
import { mergeOddsWithProps, mergeOddsWithPropsWithMetadata, mergeWithSnapshot, OddsSourceMetadata, SnapshotAudit, MergeStageAccounting } from "./merge_odds";
import { OddsSnapshotManager } from "./odds/odds_snapshot_manager";
import { OddsSnapshot, formatSnapshotLogLine } from "./odds/odds_snapshot";
import { fetchOddsAPIProps, DEFAULT_MARKETS } from "./fetch_oddsapi_props";
import { calculateOversEV, writeOversEVReport } from "./calculate_overs_delta_ev";
import { writePrizePicksImportedCsv } from "./export_imported_csv";
import { calculateEvForMergedPicks } from "./calculate_ev";
import { evaluateFlexCard } from "./card_ev";
import { CardEvResult, EvPick, FlexType } from "./types";
import { runFantasyAnalyzer } from "./fantasy_analyzer";
import { getCliArgs, type CliArgs } from "./cli_args";
import { runUnderdogOptimizer } from "./run_underdog_optimizer";
import { createSyntheticEvPicks } from "./mock_legs";
import { buildInnovativeCards, writeInnovativeCardsCsv, writeTieredCsvs } from "./build_innovative_cards";
import { enrichLegsWithLiveLiquidity }                  from "./live_liquidity";
import { writeRadarChart }                              from "./stat_balance_chart";
import { pushTop5ToTelegram, pushUdTop5FromCsv, sendTelegramAlert } from "./telegram_pusher";
import { 
  getStructureEVs,
  resetPerformanceCounters,
  logPerformanceMetrics,
  finalizePendingEVRequests,
  isEvEngineDegraded,
} from "./engine_interface";
import { loadStructureCalibrations } from "./historical/calibration_store";
import { loadPlayerTrends } from "./historical/trend_analyzer";
import {
  applyPipelineToLegs,
  mergePipelineAdjustments,
} from "./ev/leg_ev_pipeline";
import { applyOppAdjust } from "./matchups/opp_adjust";
import { applyCorrelationAdjustments } from "./stats/correlation_matrix";
import { createPrizepicksEngine } from "./pp_engine";
import { breakEvenProbLabel } from "./engine_contracts";
import { getBreakevenForStructure, BREAKEVEN_TABLE_ROWS } from "./config/binomial_breakeven";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";
import { computeBestBetScore } from "./best_bets_score";
import { printTopStructuresTable } from "./best_ev_engine";
import { buildTier1ScarcityAttribution } from "./reporting/tier1_scarcity";
import {
  EARLY_EXIT_REASON,
  FATAL_REASON,
  countCsvDataLines,
} from "./reporting/run_status";
import { finalizeCanonicalRunStatus } from "./reporting/run_finalization";
import {
  buildHighEvTelegramMessages,
  summarizeHighEvDigestCounts,
} from "./notifications/telegram_high_ev_digest";
import {
  countPpCardsByFlexType,
  writePhase17iOperatorArtifacts,
} from "./reporting/platform_survival_summary";
import {
  buildFinalSelectionObservabilityReport,
  buildPpFinalSelectionObservability,
  writeFinalSelectionObservabilityArtifacts,
} from "./reporting/final_selection_observability";
import {
  buildFinalSelectionReasonsReport,
  buildPpFinalSelectionReasons,
  writeFinalSelectionReasonsArtifacts,
} from "./reporting/final_selection_reason_attribution";
import { readLiveMergeInputForRunStatus } from "./reporting/merge_quality";
import { upsertMergePlatformQualityByPass } from "./reporting/merge_platform_quality_by_pass";
import { writeSiteInvariantRuntimeContractFromRun } from "./reporting/site_invariant_runtime_contract";
import { writeRepoHygieneAuditFromRun } from "./reporting/repo_hygiene_audit";
import { tryWriteOptimizerEdgeQualityAuditFromRunParts } from "./reporting/optimizer_edge_quality_audit";
import { computePpRunnerLegEligibility, writeEligibilityPolicyContractArtifacts } from "./policy/eligibility_policy";
import {
  applyPpHistoricalCalibrationPass,
  filterPpLegsByEffectiveEvFloor,
  filterPpLegsByMinTrueProb,
  filterPpLegsGlobalPlayerCap,
} from "./policy/runtime_decision_pipeline";
import { resolvePrizePicksRunnerExportCardLimit } from "./policy/shared_leg_eligibility";
import {
  CARD_GATE_PASS,
  dedupeCardCandidatesByLegIdSetBestCardEv,
  firstCardConstructionGateFailure,
} from "./policy/shared_card_construction_gates";
import { buildPpCardBuilderPool } from "./policy/pp_card_builder_pool";
import {
  applyPostEvaluatorDuplicatePlayerLegPenalty,
  postEligibilityLegValueMetric,
  sortCardsForExportPrimaryRanking,
  sortLegsByPostEligibilityValue,
} from "./policy/shared_post_eligibility_optimization";
import {
  applyExportCapSliceRankedCards,
  attributeFilterAndOptimizeBatch,
} from "./policy/shared_final_selection_policy";
import {
  selectDiversifiedPortfolioExport,
  DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY,
} from "./policy/portfolio_diversification";
import { updatePortfolioDiversificationArtifactSection } from "./reporting/portfolio_diversification_artifacts";
import {
  updatePreDiversificationCardDiagnosisSection,
  type PpStructureBuildStats,
} from "./reporting/pre_diversification_card_diagnosis";
import {
  EVALUATION_BUCKET_ORDER,
  runBucketSlice,
  type EvaluationBucketId,
} from "./pipeline/evaluation_buckets";
import { tryPersistLegsSnapshotFromRootOutputs } from "./tracking/legs_snapshot";

// TEMPORARY: Clear cache to debug EV engine issues
resetPerformanceCounters();
console.log(" Cache cleared - starting fresh");

/** Phase 17H: ET run label for fatal status when run() fails after timestamp is set. */
let runContextTimestampEt: string | null = null;

function emitFatalRunStatus(
  fatalReason: string,
  overrides?: { ppPicksCount?: number | null; notes?: string[] }
): void {
  const cwd = process.cwd();
  const cardEvFloor = Number(process.env.MIN_CARD_EV ?? 0.008);
  const optimizerEdgeQuality = tryWriteOptimizerEdgeQualityAuditFromRunParts(cwd, {
    ppExportCards: [],
    udExportCards: [],
    ppCandidatePoolCount: null,
    udCandidatePoolCount: null,
    cardEvFloor,
  });
  const notes = [
    "Telegram high-EV digest is not persisted as a file (chat-only).",
    ...(overrides?.notes ?? []),
  ];
  const degradationReasons = [`fatal:${fatalReason}`];
  finalizeCanonicalRunStatus({
    rootDir: cwd,
    generatedAtUtc: new Date().toISOString(),
    runTimestamp: runContextTimestampEt,
    success: false,
    outcome: "fatal_exit",
    runHealth: "hard_failure",
    fatalReason,
    ppCards: [],
    ppPicksCount: overrides?.ppPicksCount ?? null,
    udCards: [],
    udPicksCount: null,
    digest: { generated: false, shownCount: null, dedupedCount: null },
    liveMergeInput: readLiveMergeInputForRunStatus(cwd),
    optimizerEdgeQuality: optimizerEdgeQuality ?? undefined,
    notes,
    degradationReasons,
    expectedArtifacts: {},
  });
}

// Guardrails: hard-fail thresholds (use --no-guardrails to skip in debug)
const GUARDRAIL_ODDS_MAX_AGE_MINUTES = 120;
const GUARDRAIL_PP_MERGE_MIN_RATIO = 0.12;
const GUARDRAIL_UD_MERGE_MIN_RATIO = 0.10;

// ---- Dynamic Card Build Attempt Scaling ----

// Per-structure target accepted cards for all plays
// Conservative targets reflect that 5F/6F will dominate but leave room for high-edge smaller plays
const FLEX_TARGET_ACCEPTED_CARDS: Record<FlexType, number> = {
  '2P': 1,   // Rare, but accept when it hits
  '3P': 2,   // Three-leg power, conservative
  '3F': 2,   // Three-leg flex, rare at 5% floor
  '4P': 2,   // Four-leg power, selective
  '4F': 3,   // Four-leg flex, slightly more feasible
  '5P': 3,   // Five-leg power version
  '5F': 8,   // Main structure
  '6P': 2,   // Six-leg power, rare but possible
  '6F': 6,   // Second main structure
  '7P': 0,   // Not used by PrizePicks
  '7F': 0,   // Not used by PrizePicks
  '8P': 0,   // Not used by PrizePicks
  '8F': 0,   // Not used by PrizePicks
};

// Base attempts per target accepted card for flex structures
const FLEX_BASE_ATTEMPTS_PER_CARD = 25; // 25 attempts per desired +EV card (tuned for performance)

// Maximum fraction of global attempts per flex structure
const FLEX_MAX_ATTEMPTS_FRACTION_OF_GLOBAL = 0.4; // At most 40% of MAX_CARD_BUILD_TRIES per structure

// Legacy constants for backward compatibility (deprecated)
const BASE_ATTEMPTS_PER_FLEX_CARD = FLEX_BASE_ATTEMPTS_PER_CARD;
const MAX_ATTEMPTS_FLEX_FRACTION = FLEX_MAX_ATTEMPTS_FRACTION_OF_GLOBAL;

// Target number of accepted cards per structure (unified mapping for all structures)
const TARGET_ACCEPTED_CARDS: Record<string, number> = {
  '2P': FLEX_TARGET_ACCEPTED_CARDS['2P'],
  '3P': FLEX_TARGET_ACCEPTED_CARDS['3P'],
  '3F': FLEX_TARGET_ACCEPTED_CARDS['3F'],
  '4P': FLEX_TARGET_ACCEPTED_CARDS['4P'],
  '4F': FLEX_TARGET_ACCEPTED_CARDS['4F'],
  '5P': FLEX_TARGET_ACCEPTED_CARDS['5P'],
  '5F': FLEX_TARGET_ACCEPTED_CARDS['5F'],
  '6P': FLEX_TARGET_ACCEPTED_CARDS['6P'],
  '6F': FLEX_TARGET_ACCEPTED_CARDS['6F'],
};

// ---- Flex Feasibility Pruning ----

// Enable/disable flex feasibility pruning to reduce wasted EV calls
const ENABLE_FLEX_FEASIBILITY_PRUNING = true;

// Simple upper bound multiplier for converting leg EV to card EV
// This is a conservative overestimate - if this bound fails, the real EV will definitely fail
const LEG_EV_TO_CARD_EV_MULTIPLIER = 1.2; // 120% of average leg EV as upper bound for card EV (was 0.6, too conservative)

/**
 * Precompute feasibility data for flex structures
 * This data is reused across all card evaluations for efficiency
 */
interface FlexFeasibilityData {
  viableLegs: EvPick[]; // Legs sorted by descending leg EV
  allLegEvsSortedDesc: number[]; // Just the EV values in descending order
  maxAvgEvBySize: Record<number, number>; // Maximum possible average leg EV for each structure size
}

/**
 * Precompute feasibility data for the current run
 * @param legs - Filtered viable legs
 * @returns Feasibility data for 5F and 6F structures
 */
function precomputeFlexFeasibilityData(legs: EvPick[]): FlexFeasibilityData {
  // Sort legs by descending leg EV (best legs first)
  const viableLegs = [...legs].sort((a, b) => b.legEv - a.legEv);
  
  // Extract just the EV values in descending order for easy access
  const allLegEvsSortedDesc = viableLegs.map(leg => leg.legEv);
  
  // Precompute maximum possible average leg EV for each structure size
  const maxAvgEvBySize: Record<number, number> = {};
  
  // For structure size 5 (5F): top 5 legs average
  if (viableLegs.length >= 5) {
    const top5 = viableLegs.slice(0, 5);
    maxAvgEvBySize[5] = top5.reduce((sum, leg) => sum + leg.legEv, 0) / 5;
  } else {
    maxAvgEvBySize[5] = 0;
  }
  
  // For structure size 6 (6F): top 6 legs average
  if (viableLegs.length >= 6) {
    const top6 = viableLegs.slice(0, 6);
    maxAvgEvBySize[6] = top6.reduce((sum, leg) => sum + leg.legEv, 0) / 6;
  } else {
    maxAvgEvBySize[6] = 0;
  }
  
  console.log(`🔍 Flex feasibility precomputed:`);
  console.log(`   Viable legs: ${viableLegs.length} (best leg EV: ${viableLegs[0]?.legEv.toFixed(3) || 'N/A'})`);
  console.log(`   Max avg leg EV for 5F: ${maxAvgEvBySize[5].toFixed(3)}`);
  console.log(`   Max avg leg EV for 6F: ${maxAvgEvBySize[6].toFixed(3)}`);
  
  return { viableLegs, allLegEvsSortedDesc, maxAvgEvBySize };
}

/**
 * Check if a partial flex card has any chance of meeting the EV threshold
 * This is a cheap upper bound check - if it fails, the card cannot possibly succeed
 * 
 * @param currentLegs - Legs already selected for the card
 * @param structureSize - Total legs needed (5 or 6)
 * @param threshold - Required card EV threshold
 * @param feasibilityData - Precomputed feasibility data
 * @returns true if card might meet threshold, false if definitely below threshold
 */
function checkFlexCardFeasibility(
  currentLegs: EvPick[],
  structureSize: number,
  threshold: number,
  feasibilityData: FlexFeasibilityData
): boolean {
  if (!ENABLE_FLEX_FEASIBILITY_PRUNING) {
    return true; // Pruning disabled - always evaluate
  }
  
  const { viableLegs } = feasibilityData;
  const currentSize = currentLegs.length;
  
  // Early exit: not enough legs available
  if (viableLegs.length < structureSize) {
    return false;
  }
  
  // Calculate current average leg EV
  const currentAvgEv = currentLegs.reduce((sum, leg) => sum + leg.legEv, 0) / currentSize;
  
  // Determine best possible average leg EV by filling remaining slots with top legs
  const remainingSlots = structureSize - currentSize;
  let bestPossibleAvgEv = currentAvgEv * currentSize; // Start with current total
  
  // Add best remaining legs (excluding ones already used)
  const usedPlayerIds = new Set(currentLegs.map(leg => leg.player));
  let addedCount = 0;
  
  for (const leg of viableLegs) {
    if (addedCount >= remainingSlots) break;
    if (!usedPlayerIds.has(leg.player)) {
      bestPossibleAvgEv += leg.legEv;
      addedCount++;
    }
  }
  
  bestPossibleAvgEv /= structureSize; // Convert to average
  
  // Apply conservative upper bound multiplier
  // This is a generous overestimate - if even this fails, real EV will definitely fail
  const bestPossibleCardEv = bestPossibleAvgEv * LEG_EV_TO_CARD_EV_MULTIPLIER;
  
  const isFeasible = bestPossibleCardEv >= threshold;
  
  // Optional: Log pruning decisions for debugging
  if (!isFeasible && currentSize >= 2) {
    console.log(`🚫 Pruned ${structureSize}F card (${currentSize}/${structureSize} legs): best possible EV ${bestPossibleCardEv.toFixed(3)} < threshold ${threshold}`);
  }
  
  return isFeasible;
}

/**
 * Get best-case EV upper bound for flex structure
 * This helper provides a best-case EV upper bound used only for pruning and does not affect the actual EV calculation.
 * 
 * @param params - Configuration for upper bound calculation
 * @returns Upper bound on card EV for pruning decisions
 */
function getBestCaseFlexEvUpperBound(params: {
  structureSize: 5 | 6;
  currentLegEvs: number[];      // EVs of legs already chosen for this candidate
  allLegEvsSortedDesc: number[];// EVs of all viable legs, sorted desc
  structureThresholdEv: number; // required EV for this structure (existing threshold value)
}): number {
  const { structureSize, currentLegEvs, allLegEvsSortedDesc, structureThresholdEv } = params;
  
  const currentSize = currentLegEvs.length;
  const remainingSlots = structureSize - currentSize;
  
  // If we already have a full card, just use the current average
  if (remainingSlots === 0) {
    const currentAvgEv = currentLegEvs.reduce((sum, ev) => sum + ev, 0) / currentSize;
    return currentAvgEv * LEG_EV_TO_CARD_EV_MULTIPLIER;
  }
  
  // Create a set of current leg EVs to avoid duplicates
  const currentEvSet = new Set(currentLegEvs);
  
  // Get the best possible leg EVs by taking top structureSize EVs from all available legs
  // Mix in current legs and fill remaining slots with best available legs
  const bestPossibleLegEvs: number[] = [...currentLegEvs];
  
  // Add best remaining legs (excluding ones already used)
  let addedCount = 0;
  for (const legEv of allLegEvsSortedDesc) {
    if (addedCount >= remainingSlots) break;
    if (!currentEvSet.has(legEv)) {
      bestPossibleLegEvs.push(legEv);
      addedCount++;
    }
  }
  
  // If we couldn't fill all slots, not enough legs available
  if (bestPossibleLegEvs.length < structureSize) {
    return 0; // Cannot possibly meet threshold
  }
  
  // Take the top structureSize EVs from the combined set
  bestPossibleLegEvs.sort((a, b) => b - a);
  const topLegEvs = bestPossibleLegEvs.slice(0, structureSize);
  
  // Calculate best possible average leg EV
  const bestPossibleAvgEv = topLegEvs.reduce((sum, ev) => sum + ev, 0) / structureSize;
  
  // Apply conservative upper bound multiplier
  // This is a generous overestimate - if even this fails, real EV will definitely fail
  const bestPossibleCardEv = bestPossibleAvgEv * LEG_EV_TO_CARD_EV_MULTIPLIER;
  
  return bestPossibleCardEv;
}

/**
 * Calculate maximum card build attempts for a structure based on viable legs and targets
 * 
 * @param params - Configuration for attempt calculation
 * @returns Number of attempts to try (always integer ≥ 0)
 */
function getMaxAttemptsForStructure(params: {
  structureSize: 2 | 3 | 4 | 5 | 6;
  viableLegCount: number;
  targetAcceptedCards: number;
  globalMaxAttempts: number;
}): number {
  const { structureSize, viableLegCount, targetAcceptedCards, globalMaxAttempts } = params;
  
  // Early exit: not enough legs to build structure
  if (viableLegCount < structureSize) {
    return 0;
  }
  
  // Safe combinatorial ceiling (upper bound without heavy math)
  // C(n, k) = n! / (k! * (n-k)!) - we use a safe upper bound
  let combinatorialCeiling: number;
  if (viableLegCount <= structureSize + 1) {
    // Small case: exact calculation is safe
    combinatorialCeiling = viableLegCount * (viableLegCount - 1) * (viableLegCount - 2);
  } else {
    // Large case: use safe upper bound (n^k / k!)
    const safeUpperBound = Math.pow(viableLegCount, structureSize) / factorial(structureSize);
    combinatorialCeiling = Math.min(safeUpperBound, globalMaxAttempts);
  }
  
  // Desired attempts based on target cards
  const desiredAttempts = targetAcceptedCards * FLEX_BASE_ATTEMPTS_PER_CARD;
  
  // Global max per structure (fraction of total budget)
  const globalMaxForStructure = Math.floor(globalMaxAttempts * FLEX_MAX_ATTEMPTS_FRACTION_OF_GLOBAL);
  
  // Return the minimum of all constraints
  const maxAttempts = Math.min(
    combinatorialCeiling,
    desiredAttempts,
    globalMaxForStructure
  );
  
  // Ensure integer and non-negative
  return Math.max(0, Math.floor(maxAttempts));
}

/**
 * Simple factorial helper for small numbers (5 and 6)
 */
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Minimum card EV by slip type (fraction of stake). Used when building and when filtering before write.
 *
 * Data-driven thresholds from scripts/analyze_thresholds.ts (27-leg SGO sample, 2026-02-07):
 *
 *   2P: never +EV (-18% to -5%)     → drop all (threshold 0%)
 *   3P: -15% to +5%, 5.5% are +EV   → floor +3%, keeps 1.4% with avg +4.15%
 *   3F: never +EV with typical edges → drop all (threshold 0%)
 *   4P: always -EV (-27% to -2%)     → drop all (threshold 0%)
 *   4F: -14% to +4%, 2.9% are +EV   → keep +EV only (threshold 0%)
 *   5P: -24% to +10%, 2.3% are +EV  → keep +EV only (threshold 0%)
 *   5F: -14% to +12%, 19.7% are +EV → floor +5%, keeps 1.7% with avg +6.31%
 *   6P: -26% to +11%, 4.0% are +EV  → keep +EV only (threshold 0%)
 *   6F: -19% to +16%, 19.3% are +EV → floor +5%, keeps 2.8% with avg +6.85%
 */
/**
 * Unified 5% EV floor across all structures
 * No exceptions: all structures must earn +5% edge or they don't generate
 * This maintains edge integrity and prevents creep toward marginal 2-3% plays
 * Bankroll discipline: $500-$1K requires consistent 5% minimum edge
 */
function getMinEvForFlexType(_flexType: FlexType, cli: CliArgs): number {
  return cli.minCardEv ?? (cli.volume ? 0.005 : 0.015);
}

// ---- Timezone helpers (EST/EDT via America/New_York) ----

function toEasternIsoString(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const year = parts.year ?? "0000";
  const month = parts.month ?? "01";
  const day = parts.day ?? "01";
  const hour = parts.hour ?? "00";
  const minute = parts.minute ?? "00";
  const second = parts.second ?? "00";

  // Example: 2026-01-26T14:05:30 ET
  return `${year}-${month}-${day}T${hour}:${minute}:${second} ET`;
}

/** Convert UTC ISO string to Eastern time string for Sheets meta (e.g. "2026-02-28T14:30:00 ET"). */
function utcIsoToEasternString(utcIso: string): string {
  try {
    return toEasternIsoString(new Date(utcIso));
  } catch {
    return utcIso;
  }
}

// ---- EV-based card construction ----

const MAX_CARD_BUILD_TRIES = 3000; // how many attempts per size

async function buildCardsForSize(
  legs: EvPick[],
  size: number,
  flexType: FlexType,
  feasibilityData: FlexFeasibilityData | undefined,
  cli: CliArgs
): Promise<{ cards: CardEvResult[]; stats: PpStructureBuildStats }> {
  const minCardEvFallback = cli.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.008);
  // Phase 78: Pool = eligibility output only, ranked by market `edge` (same metric as runtime pipeline).
  // Legacy pool filter compared trueProb to (per-structure breakeven + minEdge) and could empty the pool (Phase 78).
  const pool = buildPpCardBuilderPool(legs);

  let maxAttempts = MAX_CARD_BUILD_TRIES;
  const targetCards = TARGET_ACCEPTED_CARDS[flexType] || 3;
  maxAttempts = getMaxAttemptsForStructure({
    structureSize: size as 2 | 3 | 4 | 5 | 6,
    viableLegCount: pool.length,
    targetAcceptedCards: targetCards,
    globalMaxAttempts: MAX_CARD_BUILD_TRIES
  });

  if (maxAttempts === 0) {
    return {
      cards: [],
      stats: {
        flexType,
        size,
        poolLegsAfterTrueProbFilter: pool.length,
        maxAttempts: 0,
        successfulCardBuilds: 0,
        failedCardBuilds: 0,
        feasibilityPruned: 0,
        evRejected: 0,
        evCallsMade: 0,
        candidatesPreDedupe: 0,
        candidatesPostDedupe: 0,
        cardEvMin: null,
        cardEvMax: null,
        cardEvMedian: null,
      },
    };
  }

  const candidates: CardEvResult[] = [];
  let evCallsMade = 0;
  let cardsAccepted = 0;
  let prunedCandidates = 0;
  let successfulCardBuilds = 0;
  let failedCardBuilds = 0;
  let feasibilityPruned = 0;
  let evRejected = 0;
  const startTime = Date.now();

  for (let t = 0; t < maxAttempts; t += 1) {
    if (isEvEngineDegraded()) break;

    const shuffled =
      t === 0 ? pool : [...pool].sort(() => Math.random() - 0.5);

    const chosen: EvPick[] = [];
    const usedPlayers = new Set<string>();

    for (const leg of shuffled) {
      if (chosen.length >= size) break;
      if (usedPlayers.has(leg.player)) continue;
      const prospective = [...chosen, leg];
      if (firstCardConstructionGateFailure(prospective) !== CARD_GATE_PASS) continue;
      chosen.push(leg);
      usedPlayers.add(leg.player);
    }

    if (chosen.length !== size) { failedCardBuilds++; continue; }
    successfulCardBuilds++;

    const cardLegs = chosen.map((pick) => ({ pick, side: "over" as const }));

    // Feasibility pruning
    if (feasibilityData) {
      const threshold = getMinEvForFlexType(flexType, cli);
      const currentLegEvs = chosen.map(leg => leg.legEv);
      const upperBound = getBestCaseFlexEvUpperBound({
        structureSize: size as 5 | 6,
        currentLegEvs,
        allLegEvsSortedDesc: feasibilityData.allLegEvsSortedDesc,
        structureThresholdEv: threshold
      });
      if (upperBound < threshold) { prunedCandidates++; feasibilityPruned++; continue; }
    }

    const rawResult = await evaluateFlexCard(flexType, cardLegs, 1, { minCardEvFallback });
    evCallsMade++;
    if (!rawResult) { evRejected++; continue; }
    const result = applyPostEvaluatorDuplicatePlayerLegPenalty(rawResult);

    if (!Number.isFinite(result.cardEv)) continue;
    if (result.cardEv < getMinEvForFlexType(flexType, cli)) continue;

    candidates.push(result);
    cardsAccepted++;
  }

  const elapsedMs = Date.now() - startTime;
  console.log(`     Failed card builds: ${failedCardBuilds}`);
  console.log(`     Feasibility pruned: ${feasibilityPruned}`);
  console.log(`     EV rejections: ${evRejected}`);
  console.log(`     EV calls made: ${evCallsMade}`);
  console.log(`     Final candidates: ${candidates.length}`);
  
  if (candidates.length === 0) {
    console.log(`  🚨 [DEBUG] ${flexType}: DIAGNOSIS - 0 candidates!`);
    if (failedCardBuilds === maxAttempts) {
      console.log(`     → ALL attempts failed to build cards (couldn't get ${size} legs)`);
      console.log(`     → Check if pool has enough unique players or correlation limits are too strict`);
    } else if (feasibilityPruned > 0) {
      console.log(`     → Feasibility pruning removed ${feasibilityPruned} cards`);
      console.log(`     → Check if feasibility thresholds are too strict`);
    } else if (evRejected > 0) {
      console.log(`     → EV evaluation rejected ${evRejected} cards`);
      console.log(`     → Check if EV thresholds are too strict or EV engine has issues`);
    } else {
      console.log(`     → Unknown cause - investigate further`);
    }
  }

  const finalCards = dedupeCardCandidatesByLegIdSetBestCardEv(candidates);

  const evs = candidates
    .map((c) => c.cardEv)
    .filter((x): x is number => Number.isFinite(x));
  evs.sort((a, b) => a - b);
  let cardEvMedian: number | null = null;
  if (evs.length > 0) {
    const mid = Math.floor(evs.length / 2);
    cardEvMedian =
      evs.length % 2 === 1 ? evs[mid] : (evs[mid - 1] + evs[mid]) / 2;
  }

  const stats: PpStructureBuildStats = {
    flexType,
    size,
    poolLegsAfterTrueProbFilter: pool.length,
    maxAttempts,
    successfulCardBuilds,
    failedCardBuilds,
    feasibilityPruned,
    evRejected,
    evCallsMade,
    candidatesPreDedupe: candidates.length,
    candidatesPostDedupe: finalCards.length,
    cardEvMin: evs.length ? evs[0] : null,
    cardEvMax: evs.length ? evs[evs.length - 1] : null,
    cardEvMedian,
  };

  // Compact summary: one line per structure
  console.log(
    `  ${flexType}: ${finalCards.length} cards | ` +
    `${maxAttempts} attempts ${elapsedMs}ms | ` +
    `evCalls=${evCallsMade} accept=${cardsAccepted} prune=${prunedCandidates} evReject=${evRejected}`
  );

  return { cards: finalCards, stats };
}

// ---- CSV writers ----

function writeLegsCsv(
  legs: EvPick[],
  outPath: string,
  runTimestamp: string
): void {
  const headers = [
    "Sport",
    "id",
    "player",
    "team",
    "stat",
    "line",
    "league",
    "book",
    "overOdds",
    "underOdds",
    "trueProb",
    "rawTrueProb",
    "calibratedTrueProb",
    "probCalibrationApplied",
    "probCalibrationBucket",
    "edge",
    "legEv",
    "legacyNaiveLegMetric",
    "fairProbChosenSide",
    "runTimestamp",
    "gameTime",
    "IsWithin24h",
    "leg_key",
    "leg_label",
    "ppNConsensusBooks",
    "ppConsensusDevigSpreadOver",
  ];

  const lines: string[] = [];
  lines.push(headers.join(","));

  const runDate = new Date();

  for (const leg of legs) {
    let gameTime = "";
    let isWithin24h = "";

    if (leg.startTime) {
      gameTime = leg.startTime;
      const start = new Date(leg.startTime);
      const diffMs = start.getTime() - runDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      isWithin24h = diffHours >= 0 && diffHours <= 24 ? "TRUE" : "FALSE";
    }

    const row = [
      leg.sport,
      leg.id,
      leg.player,
      leg.team ?? "",
      leg.stat,
      leg.line,
      leg.league ?? "",
      leg.book ?? "",
      leg.overOdds ?? "",
      leg.underOdds ?? "",
      leg.trueProb,
      leg.rawTrueProb ?? leg.trueProb,
      leg.calibratedTrueProb ?? leg.trueProb,
      leg.probCalibrationApplied ? "TRUE" : "FALSE",
      leg.probCalibrationBucket ?? "",
      leg.edge,
      leg.legEv,
      leg.legacyNaiveLegMetric ?? "",
      leg.fairProbChosenSide ?? "",
      runTimestamp,
      gameTime,
      isWithin24h,
      leg.legKey ?? "",
      leg.legLabel ?? "",
      leg.ppNConsensusBooks ?? "",
      leg.ppConsensusDevigSpreadOver ?? "",
    ].map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") ? s.replace(/,/g, ";") : s;
    });

    lines.push(row.join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

/** Expected number of legs for a slip type (2P→2, 6P→6, 3F→3, etc.). Used to avoid exporting mismatched cards. */
function expectedLegCountForFlexType(flexType: FlexType): number {
  const n = parseInt(flexType.replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : 0;
}

const PP_STAT_ABBREV: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", threes: "3PM",
  steals: "STL", blocks: "BLK", fantasy_points: "FP", pra: "PRA",
  "pts+reb+ast": "PRA", points_rebounds_assists: "PRA",
  "pts+ast": "PA", "pts+reb": "PR", "reb+ast": "RA",
  turnovers: "TO", stocks: "STK",
};

function formatLegPlayerPropLine(leg: { pick: EvPick }): string {
  const p = leg.pick;
  const abbr = PP_STAT_ABBREV[p.stat?.toLowerCase() ?? ""] ?? p.stat?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";
  return `${p.player} ${abbr} o${p.line}`;
}

function writeCardsCsv(
  cards: CardEvResult[],
  outPath: string,
  runTimestamp: string
): void {
  // Headers: include Site-Leg, Player-Prop-Line for dashboard + Sheets
  const headers = [
    "Sport",
    "site",
    "flexType",
    "Site-Leg",
    "Player-Prop-Line",
    "cardEv",
    "winProbCash",
    "winProbAny",
    "avgProb",
    "avgEdgePct",
    "breakevenGap",
    "leg1Id",
    "leg2Id",
    "leg3Id",
    "leg4Id",
    "leg5Id",
    "leg6Id",
    "kellyRawFraction",
    "kellyCappedFraction",
    "kellyFinalFraction",
    "kellyStake",
    "kellyRiskAdjustment",
    "efficiencyScore",
    "portfolioRank",
    "runTimestamp",
    "bestBetScore",
    "bestBetTier",
    "rawCardEv",
    "divAdjustedScore",
    "divPenaltyTotal",
  ];

  const lines: string[] = [];
  lines.push(headers.join(","));

  let skippedMismatch = 0;
  for (const card of cards) {
    const expectedLegs = expectedLegCountForFlexType(card.flexType);
    if (expectedLegs > 0 && card.legs.length !== expectedLegs) {
      skippedMismatch++;
      continue;
    }
    const legIds = card.legs.map((leg) => leg.pick.id);
    const sport = card.legs.length > 0 ? card.legs[0].pick.sport : "NBA";
    const kr = card.kellyResult;
    const siteLeg = `pp-${card.flexType.toLowerCase()}`;
    const playerPropLine = card.legs.map(formatLegPlayerPropLine).join(" | ");

    const bb = computeBestBetScore({
      cardEv: card.cardEv,
      avgEdgePct: card.avgEdgePct,
      winProbCash: card.winProbCash,
      legCount: card.legs.length,
      sport,
    });

    const breakevenGap =
      card.breakevenGap ??
      (card.avgProb - getBreakevenThreshold(card.flexType));

    const row = [
      sport,
      "PP",
      card.flexType,
      siteLeg,
      playerPropLine,
      card.cardEv,
      card.winProbCash,
      card.winProbAny,
      card.avgProb,
      card.avgEdgePct,
      breakevenGap,
      legIds[0] ?? "",
      legIds[1] ?? "",
      legIds[2] ?? "",
      legIds[3] ?? "",
      legIds[4] ?? "",
      legIds[5] ?? "",
      kr?.rawKellyFraction     ?? "",
      kr?.cappedKellyFraction  ?? "",
      kr?.finalKellyFraction   ?? "",
      kr?.recommendedStake     ?? "",
      kr?.riskAdjustment       ?? "",
      card.efficiencyScore     ?? "",
      card.portfolioRank       ?? "",
      runTimestamp,
      bb.score,
      bb.tier,
      card.rawCardEv ?? "",
      card.diversificationAdjustedScore ?? "",
      card.portfolioDiversification?.penaltyTotal ?? "",
    ].map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${String(s).replace(/"/g, '""')}"` : s;
    });

    lines.push(row.join(","));
  }
  if (skippedMismatch > 0) {
    console.warn(`  ⚠ writeCardsCsv: skipped ${skippedMismatch} card(s) with leg count ≠ flexType (e.g. 6P with 5 legs)`);
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

// ---- Card volume diagnostics ----

function logCardVolumeDiagnostics(cards: CardEvResult[], cli: CliArgs): void {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  CARD VOLUME DIAGNOSTICS");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Group cards by structure type
  const byStructure = new Map<string, CardEvResult[]>();
  for (const card of cards) {
    const existing = byStructure.get(card.flexType) || [];
    byStructure.set(card.flexType, [...existing, card]);
  }

  // Calculate statistics for each structure
  const stats: Array<{
    structure: string;
    total: number;
    avgEv: number;
    maxEv: number;
    minEv: number;
  }> = [];

  for (const [structure, structureCards] of byStructure.entries()) {
    const evs = structureCards.map(c => c.cardEv);
    stats.push({
      structure,
      total: structureCards.length,
      avgEv: evs.reduce((sum, ev) => sum + ev, 0) / evs.length,
      maxEv: Math.max(...evs),
      minEv: Math.min(...evs),
    });
  }

  // Sort by structure type (Power first, then Flex)
  stats.sort((a, b) => {
    const aIsPower = a.structure.includes('P');
    const bIsPower = b.structure.includes('P');
    if (aIsPower !== bIsPower) return aIsPower ? -1 : 1;
    return a.structure.localeCompare(b.structure);
  });

  console.log("Structure | Cards | Avg EV | Max EV | Min EV");
  console.log("-----------|--------|--------|--------|--------");
  
  for (const stat of stats) {
    const avgEv = (stat.avgEv * 100).toFixed(2) + '%';
    const maxEv = (stat.maxEv * 100).toFixed(2) + '%';
    const minEv = (stat.minEv * 100).toFixed(2) + '%';
    console.log(`${stat.structure.padEnd(9)} | ${stat.total.toString().padStart(6)} | ${avgEv.padStart(6)} | ${maxEv.padStart(6)} | ${minEv.padStart(6)}`);
  }

  // Summary insights
  console.log("\n📊 Volume Control Insights:");
  const totalCards = cards.length;
  const powerCards = stats.filter(s => s.structure.includes('P')).reduce((sum, s) => sum + s.total, 0);
  const flexCards = stats.filter(s => s.structure.includes('F')).reduce((sum, s) => sum + s.total, 0);
  
  console.log(`• Total cards: ${totalCards} (${powerCards} Power, ${flexCards} Flex)`);

  const highEvCards = cards.filter(c => c.cardEv >= 0.05).length;
  console.log(`• High-EV cards (+5%+): ${highEvCards} (${((highEvCards / totalCards) * 100).toFixed(1)}%)`);

  const positiveEvCards = cards.filter(c => c.cardEv > 0).length;
  console.log(`• Positive EV cards: ${positiveEvCards} (${((positiveEvCards / totalCards) * 100).toFixed(1)}%)`);

  console.log("\n💡 Threshold effectiveness:");
  for (const stat of stats) {
    const threshold = getMinEvForFlexType(stat.structure as FlexType, cli);
    const aboveThreshold = byStructure.get(stat.structure)?.filter(c => c.cardEv >= threshold).length || 0;
    const pct = stat.total > 0 ? ((aboveThreshold / stat.total) * 100).toFixed(1) : '0.0';
    console.log(`• ${stat.structure}: ${aboveThreshold}/${stat.total} (${pct}%) above threshold`);
  }
}

// ---- Main runner ----

async function run(): Promise<void> {
  // CLI parsed in optimizer_cli_bootstrap; single resolved snapshot for this run (no Proxy reads in orchestration)
  const args = getCliArgs();

  // Phase 17K/17Y: canonical PP leg policy from explicit run snapshot
  const PP_LEG_POLICY = computePpRunnerLegEligibility(args);
  const MIN_TRUE_PROB = PP_LEG_POLICY.minTrueProb;
  const MAX_LEGS_PER_PLAYER = PP_LEG_POLICY.maxLegsPerPlayerGlobal;
  const ppEngine = createPrizepicksEngine(args);

  if (args.printBestEv) {
    printTopStructuresTable();
    process.exit(0);
  }

  // Build run timestamp — honor --date override so CSV date column is always fresh
  const tsBase = args.date ? new Date(`${args.date}T12:00:00`) : new Date();
  const runTimestamp = toEasternIsoString(tsBase);
  runContextTimestampEt = runTimestamp;
  let sheetsPushExitCode: number | null = null;

  // Show help if requested
  if (args.help) {
    const { showHelp } = await import("./cli_args");
    showHelp();
    return;
  }

  // ---- Sheets only: push using last cached CSVs (no fetch/merge/cards) ----
  if (args.sheetsOnly) {
    let ts = runTimestamp;
    const lastRunPath = path.join(process.cwd(), "artifacts", "last_run.json");
    if (fs.existsSync(lastRunPath)) {
      try {
        const last = JSON.parse(fs.readFileSync(lastRunPath, "utf8"));
        if (last.lastUpdatedET) ts = last.lastUpdatedET;
      } catch (_) { /* use current runTimestamp */ }
    }
    console.log("[Sheets] --sheets-only: pushing from last cached data (no odds fetch or card build).");
    const code = runSheetsPush(ts, args);
    process.exit(code !== 0 ? code : 0);
    return;
  }

  const platform = args.platform;
  console.log(`Bankroll: ${args.bankroll}`);

  // ---- UD-only: run Underdog optimizer and exit ----
  if (platform === "ud") {
    const udResult = await runUnderdogOptimizer(undefined, args);
    try {
      if (udResult && udResult.udCards.length > 0) {
        const { saveCardsToTracker } = await import("./tracking/tracker_schema");
        saveCardsToTracker(
          udResult.udCards.map(({ card }) => card),
          { maxCards: 50 }
        );
      }
    } catch (e) {
      console.warn("[Tracker] UD-only save failed:", (e as Error).message);
    }
    const cwdUd = process.cwd();
    const udCards = udResult?.udCards?.map(({ card }) => card) ?? [];
    const udPicksCount = countCsvDataLines(cwdUd, "underdog-legs.csv");
    const notesUd: string[] = [
      "Telegram high-EV digest is not persisted as a file (chat-only).",
      "PrizePicks optimizer stage was not run (--platform ud).",
    ];
    const degradationReasonsUd: string[] = [];
    if ((udResult?.udCardCount ?? 0) > 0 && udPicksCount == null) {
      notesUd.push("underdog-legs.csv missing or unreadable; UD picks count unavailable.");
      degradationReasonsUd.push("missing_ud_picks_count");
    }
    const optimizerEdgeQualityUd = tryWriteOptimizerEdgeQualityAuditFromRunParts(cwdUd, {
      ppExportCards: [],
      udExportCards: udCards,
      ppCandidatePoolCount: null,
      udCandidatePoolCount: udResult?.survival?.generatedTotal ?? null,
      cardEvFloor: args.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.008),
    });
    finalizeCanonicalRunStatus({
      rootDir: cwdUd,
      generatedAtUtc: new Date().toISOString(),
      runTimestamp,
      success: true,
      outcome: "full_success",
      ppCards: [],
      ppPicksCount: 0,
      udCards,
      udPicksCount,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      liveMergeInput: readLiveMergeInputForRunStatus(cwdUd),
      optimizerEdgeQuality: optimizerEdgeQualityUd ?? undefined,
      notes: notesUd,
      degradationReasons: degradationReasonsUd,
      expectedArtifacts: {
        underdogCards: udCards.length > 0,
        underdogPicks: true,
      },
    });
    try {
      const genAt = new Date().toISOString();
      writePhase17iOperatorArtifacts(cwdUd, {
        runTimestampEt: runTimestamp,
        runMode: "ud",
        platform: "ud",
        ppLegFunnel: null,
        ppThresholds: {
          minEdgePerLeg: MIN_TRUE_PROB,
          minLegEv: 0, // Not used in new trueProb-based pipeline
          evAdjThresh: 0, // Not used in new trueProb-based pipeline
          maxLegsPerPlayer: MAX_LEGS_PER_PLAYER,
          volumeMode: !!args.volume,
        },
        ud: udResult?.survival ?? null,
        operatorNotes: [
          "PrizePicks pipeline was not run (--platform ud).",
          "Compare UD generatedByStructureId vs exported counts when maxCards < generated.",
        ],
      });
      writeEligibilityPolicyContractArtifacts(cwdUd, args, genAt);
    } catch (e17) {
      console.warn("[Phase17I/17J] Failed to write platform survival / eligibility policy:", (e17 as Error).message);
    }
    try {
      const obsAt = new Date().toISOString();
      writeFinalSelectionObservabilityArtifacts(
        cwdUd,
        buildFinalSelectionObservabilityReport({
          generatedAtUtc: obsAt,
          runTimestampEt: runTimestamp,
          pp: null,
          ud: udResult?.finalSelectionObservability ?? null,
        })
      );
    } catch (e17r) {
      console.warn("[Phase17R] Failed to write final selection observability:", (e17r as Error).message);
    }
    try {
      const rsAt = new Date().toISOString();
      writeFinalSelectionReasonsArtifacts(
        cwdUd,
        buildFinalSelectionReasonsReport({
          generatedAtUtc: rsAt,
          runTimestampEt: runTimestamp,
          pp: null,
          ud: udResult?.finalSelectionReasons ?? null,
        })
      );
    } catch (e17s) {
      console.warn("[Phase17S] Failed to write final selection reason attribution:", (e17s as Error).message);
    }
    try {
      writeSiteInvariantRuntimeContractFromRun(cwdUd, runTimestamp);
    } catch (e17t) {
      console.warn("[Phase17T] Failed to write site invariant runtime contract:", (e17t as Error).message);
    }
    try {
      writeRepoHygieneAuditFromRun(cwdUd, runTimestamp);
    } catch (e17u) {
      console.warn("[Phase17U] Failed to write repo hygiene audit:", (e17u as Error).message);
    }
    tryPersistLegsSnapshotFromRootOutputs(cwdUd, runTimestamp);
    return;
  }

  // ---- Both: run PP first, then UD ----
  if (platform === "both") {
    console.log("[Unified] Platform: both — running PrizePicks then Underdog.\n");
  }

  // Reset performance counters for this run
  resetPerformanceCounters();

  // ── Odds Snapshot: single canonical clock for this run ──────────────────
  // Full Odds API props (single canonical odds source).
  const oddsFetchFn = async (_sports: import("./types").Sport[], opts: { forceRefresh: boolean }) => {
    console.log("[FETCH_ODDS] Using The Odds API (fetchOddsAPIProps)");
    return fetchOddsAPIProps({
      apiKey: process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY,
      sport: "basketball_nba",
      markets: DEFAULT_MARKETS,
      forceRefresh: opts.forceRefresh,
    });
  };

  OddsSnapshotManager.configure({
    fetchFn: oddsFetchFn,
    sports: args.sports,
    includeAltLines: args.includeAltLines,
    refreshMode: args.oddsRefresh,
    oddsMaxAgeMin: args.oddsMaxAgeMin,
  });

  let merged: import("./types").MergedPick[] = [];
  let withEv: EvPick[];
  let result: { metadata: { isFromCache: boolean; fetchedAt?: string; originalProvider?: string; providerUsed?: string } };
  let ppStageAccounting: MergeStageAccounting | null = null;
  let oddsSnapshot: OddsSnapshot | null = null;

  /** Phase 17I — PP funnel (filled incrementally; card-stage fields set on full PP success paths). */
  let ppRawScraped: number | null = null;
  let ppMergeMatched: number | null = null;
  let ppCardsBuiltPreTypeEvFilter: number | null = null;
  let ppCardsAfterPerTypeMinEv: number | null = null;
  let ppCardsAfterSelectionEngine: number | null = null;
  let ppCardsExported: number | null = null;
  let ppExportedByFlexType: Record<string, number> = {};

    const PP_SLICE_INGEST_ELIG = EVALUATION_BUCKET_ORDER.slice(0, 4) as readonly EvaluationBucketId[];
  const PP_SLICE_PLATFORM_MATH = [EVALUATION_BUCKET_ORDER[4]] as readonly EvaluationBucketId[];
  const PP_SLICE_STRUCT_RENDER = EVALUATION_BUCKET_ORDER.slice(5) as readonly EvaluationBucketId[];
  const noopAsync = async () => {};
  let ppLiveRaw: import("./types").RawPick[] = [];
  let ppMergeResult: Awaited<ReturnType<typeof mergeWithSnapshot>> | null = null;
  let filtered: EvPick[] = [];
  let ppAfterEvCompute = 0;
  let ppAfterMinEdge = 0;
  let ppAfterMinLegEvBeforeAdjEv = 0;
  let ppAfterAdjEvThreshold = 0;

  if (args.mockLegs != null && args.mockLegs > 0) {
    await runBucketSlice("pp", PP_SLICE_INGEST_ELIG, [
      { id: "ingest", run: noopAsync },
      { id: "normalize", run: noopAsync },
      { id: "match_merge", run: noopAsync },
      { id: "shared_eligibility", run: noopAsync },
    ]);
  } else {
    await runBucketSlice("pp", PP_SLICE_INGEST_ELIG, [
      {
        id: "ingest",
        run: async () => {
          oddsSnapshot = await OddsSnapshotManager.getSnapshot();
          if (oddsSnapshot.rows.length === 0) {
            console.error(
              "[FATAL] No live odds—check ODDSAPI_KEY in .env and API quota. Run: npx ts-node src/fetchOddsApi.ts"
            );
            emitFatalRunStatus(FATAL_REASON.validation_failure);
            process.exit(1);
          }
          ppLiveRaw = await fetchPrizePicksRawProps(args.sports);
          ppRawScraped = ppLiveRaw.length;
          console.log("Raw PrizePicks props:", ppLiveRaw.length);
        },
      },
      {
        id: "normalize",
        run: async () => {
          writePrizePicksImportedCsv(ppLiveRaw);
        },
      },
      {
        id: "match_merge",
        run: async () => {
          const supportedSource: "OddsAPI" | "none" =
            oddsSnapshot!.source === "OddsAPI" ? "OddsAPI" : "none";
          const snapshotMeta: OddsSourceMetadata = {
            isFromCache: oddsSnapshot!.refreshMode === "cache",
            providerUsed: supportedSource,
            fetchedAt: oddsSnapshot!.fetchedAtUtc,
            originalProvider: supportedSource === "OddsAPI" ? "OddsAPI" : undefined,
          };
          const snapshotAudit: SnapshotAudit = {
            oddsSnapshotId: oddsSnapshot!.snapshotId,
            oddsFetchedAtUtc: oddsSnapshot!.fetchedAtUtc,
            oddsAgeMinutes: oddsSnapshot!.ageMinutes,
            oddsRefreshMode: oddsSnapshot!.refreshMode,
            oddsSource: oddsSnapshot!.source,
            oddsIncludesAltLines: oddsSnapshot!.includeAltLines,
          };
          ppMergeResult = await mergeWithSnapshot(
            ppLiveRaw,
            oddsSnapshot!.rows,
            snapshotMeta,
            snapshotAudit,
            args
          );
          merged = ppMergeResult.odds;
          ppMergeMatched = merged.length;
          result = ppMergeResult;
          ppStageAccounting = ppMergeResult.stageAccounting;
          console.log("Merged picks:", merged.length);
          console.log(
            `Odds source: ${oddsSnapshot!.source} (${oddsSnapshot!.refreshMode}), snapshot=${oddsSnapshot!.snapshotId}, age=${oddsSnapshot!.ageMinutes.toFixed(1)}m`
          );
          try {
            upsertMergePlatformQualityByPass(process.cwd(), {
              pass: "prizepicks",
              platformStats: ppMergeResult.platformStats,
              stageAccounting: ppMergeResult.stageAccounting,
              oddsFetchedAtUtc: oddsSnapshot!.fetchedAtUtc,
              oddsSnapshotAgeMinutes: oddsSnapshot!.ageMinutes,
            });
          } catch (e) {
            console.warn("[MergePlatformQuality] prizepicks snapshot failed:", (e as Error).message);
          }
        },
      },
      {
        id: "shared_eligibility",
        run: async () => {
          if (!args.noGuardrails) {
            if (oddsSnapshot!.ageMinutes > GUARDRAIL_ODDS_MAX_AGE_MINUTES) {
              console.error(
                `[GUARDRAIL] FATAL: Odds are ${oddsSnapshot!.ageMinutes.toFixed(0)}m old (max ${GUARDRAIL_ODDS_MAX_AGE_MINUTES}m). Refusing to ship. Use --no-guardrails to override.`
              );
              emitFatalRunStatus(FATAL_REASON.validation_failure);
              process.exit(1);
            }
            const ppStats = ppMergeResult!.platformStats?.prizepicks;
            if (ppStats && ppStats.rawProps > 0) {
              const mergedCount = ppStats.mergedExact + ppStats.mergedNearest;
              const eligible = ppStats.matchEligible;
              const ratioRaw = mergedCount / ppStats.rawProps;
              console.log(
                `[GUARDRAIL] PP merge health: raw=${ppStats.rawProps} preMergeSkipped=${ppStats.rawProps - eligible} ` +
                  `matchEligible=${eligible} merged=${mergedCount} ` +
                  `ratioEligible=${eligible > 0 ? ((mergedCount / eligible) * 100).toFixed(1) : "0.0"}% ` +
                  `ratioRaw=${(ratioRaw * 100).toFixed(1)}% ` +
                  `(threshold ${GUARDRAIL_PP_MERGE_MIN_RATIO * 100}% on match-eligible pool)`
              );
              if (eligible < 1) {
                console.error(
                  `[GUARDRAIL] FATAL: No PrizePicks props reached matching (matchEligible=0). Refusing to ship. Use --no-guardrails to override.`
                );
                emitFatalRunStatus(FATAL_REASON.validation_failure);
                process.exit(1);
              }
              const ratioEligible = mergedCount / eligible;
              if (ratioEligible < GUARDRAIL_PP_MERGE_MIN_RATIO) {
                console.error(
                  `[GUARDRAIL] FATAL: PP merge ratio (match-eligible) ${(ratioEligible * 100).toFixed(1)}% below ${(GUARDRAIL_PP_MERGE_MIN_RATIO * 100)}% ` +
                    `(raw ratio ${(ratioRaw * 100).toFixed(1)}% for diagnostics). Refusing to ship. Use --no-guardrails to override.`
                );
                emitFatalRunStatus(FATAL_REASON.validation_failure);
                process.exit(1);
              }
            }
          }

          try {
            if (oddsSnapshot!.rows.length > 0) {
              const deltaLegs = calculateOversEV(merged, oddsSnapshot!.rows);
              writeOversEVReport(deltaLegs);
            } else {
              console.log("[Overs Delta EV] No odds snapshot rows — skipping delta report.");
            }
          } catch (err) {
            console.warn("[Overs Delta EV] Skipped (error):", (err as Error).message);
          }
        },
      },
    ]);
  }

  await runBucketSlice("pp", PP_SLICE_PLATFORM_MATH, [
    {
      id: "platform_math",
      run: async () => {
        if (args.mockLegs != null && args.mockLegs > 0) {
          console.log(
            `[Mock] Injecting ${args.mockLegs} synthetic legs (trueProb 0.55–0.65, EV 2–6%).`
          );
          merged = [];
          ppRawScraped = null;
          ppMergeMatched = null;
          withEv = createSyntheticEvPicks(args.mockLegs, "prizepicks");
          result = {
            metadata: { isFromCache: true, originalProvider: "mock", providerUsed: "mock" },
          };
          console.log("Ev picks:", withEv.length);
          console.log("Odds source: mock (synthetic legs)");
        } else {
          console.log(`[DEBUG] Merged: ${merged?.length ?? 0}`);
          try {
            withEv = await calculateEvForMergedPicks(merged);
            console.log(`[DEBUG] EV calc: ${withEv?.length ?? 0}`);
          } catch (e) {
            console.error("[CRASH] EV calc failed:", e);
            withEv = [];
          }
          if (withEv.length < 10 && args.volume) {
            console.warn(
              "[LIVE] Volume mode: only " + withEv.length + " legs after EV (no mock inject—live only)."
            );
          }
          console.log("Ev picks:", withEv.length);
        }

        console.log("---- EV-based filtering ----");

        ppAfterEvCompute = withEv.length;

        const legsAfterTrueProb = filterPpLegsByMinTrueProb(withEv, PP_LEG_POLICY.minTrueProb);
        ppAfterMinEdge = legsAfterTrueProb.length;

        let legsAfterEvFilter = legsAfterTrueProb;
        applyPpHistoricalCalibrationPass(legsAfterEvFilter);

        {
          const structureCalibrations = loadStructureCalibrations(100);
          const playerTrends = loadPlayerTrends(10);
          const hasPipeline = structureCalibrations.length > 0 || playerTrends.size > 0;
          if (hasPipeline) {
            const adjustedPlatform: "PP" | "UD" = "PP";
            const pipelineAdjs = applyPipelineToLegs(legsAfterEvFilter, {
              structureCalibrations,
              playerTrends,
              platform: adjustedPlatform as "PP" | "UD",
              minStructureSamples: 100,
              minCalibrationShift: 0.02,
              minTrendSamples: 10,
            });
            mergePipelineAdjustments(legsAfterEvFilter, pipelineAdjs);
          }
        }

        if (args.oppAdjust && !args.noTweaks) {
          let oppAdjCount = 0;
          for (const leg of legsAfterEvFilter) {
            const { adjProb, detail } = applyOppAdjust(leg.trueProb, leg.opponent, leg.stat);
            if (detail) {
              const oldProb = leg.trueProb;
              leg.trueProb = adjProb;
              leg.edge = adjProb - 0.5;
              leg.legEv = leg.edge;
              oppAdjCount++;
              if (args.debug && oppAdjCount <= 5) {
                console.log(
                  `[TWEAK] ${leg.player} ${leg.stat} vs ${detail.opponent} ` +
                    `(def#${detail.defRank}): ${(oldProb * 100).toFixed(1)}% → ${(adjProb * 100).toFixed(1)}% ` +
                    `(${detail.shift > 0 ? "+" : ""}${(detail.shift * 100).toFixed(1)}% opp_adj)`
                );
              }
            }
          }
          if (oppAdjCount > 0) {
            console.log(`  Phase 8 Opp Adjust: ${oppAdjCount} legs shifted by defensive rank`);
          }
        }

        if (args.corrAdjust && !args.noTweaks) {
          const { adjustedCount } = applyCorrelationAdjustments(legsAfterEvFilter, args.debug);
          if (adjustedCount > 0) {
            console.log(
              `  Phase 8 Corr Adjust: ${adjustedCount} combo-stat legs adjusted for component coherence`
            );
          }
        }

        ppAfterMinLegEvBeforeAdjEv = legsAfterEvFilter.length;

        // No effective EV floor filtering in new trueProb-based pipeline
        console.log(
          `Legs after trueProb filter (>= ${MIN_TRUE_PROB}): ${legsAfterTrueProb.length} of ${withEv.length}`
        );

        filtered = filterPpLegsGlobalPlayerCap(
          legsAfterEvFilter,
          PP_LEG_POLICY.maxLegsPerPlayerGlobal
        );

        console.log(
          `Legs after player cap (<= ${MAX_LEGS_PER_PLAYER} per player): ${filtered.length} of ${legsAfterEvFilter.length}`
        );

        // FIXED: Assign legEv to PP legs after filtering is complete
        filtered.forEach(leg => {
          if (leg.legEv === 0 && leg.trueProb > 0) {
            leg.legEv = leg.trueProb - 0.50;  // raw edge as floor
          }
        });

        if (!args.noGuardrails && filtered.length === 0) {
          const ppLegsPath = path.join(process.cwd(), "prizepicks-legs.csv");
          const ppCardsPath = path.join(process.cwd(), "prizepicks-cards.csv");
          writeLegsCsv([], ppLegsPath, runTimestamp);
          writeCardsCsv([], ppCardsPath, runTimestamp);
          console.log("Wrote empty prizepicks-legs.csv and prizepicks-cards.csv");
          console.error("[GUARDRAIL] FATAL: No +EV legs. Refusing to ship. Use --no-guardrails to override.");
          emitFatalRunStatus(FATAL_REASON.no_positive_ev_legs, {
            ppPicksCount: 0,
            notes: ["Guardrail: no +EV legs after filtering."],
          });
          process.exit(1);
        }
      },
    },
  ]);

  const effectiveEv = postEligibilityLegValueMetric;

  /** Phase 17M — PP tail state (buckets 6–8); initialized before branches, filled in structure→render slice. */
  let sortedLegs: EvPick[] = [];
  let sortedCards: CardEvResult[] = [];
  let exportCards: CardEvResult[] = [];
  let noViablePpStructures = false;
  let cardsBeforeEvFilterTail: CardEvResult[] = [];
  let filteredCardsTail: CardEvResult[] = [];
  let selectionCardsTail: CardEvResult[] = [];
  /** Phase 76 — pre-diversification diagnosis (structure builder + SelectionEngine attribution). */
  let ppStructureBuildStats: PpStructureBuildStats[] = [];
  let ppSelectionBatch: ReturnType<typeof attributeFilterAndOptimizeBatch> | null = null;
  let ppViableFlexTypes: string[] = [];
  let ppSkippedFlexTypes: string[] = [];
  let ppMaxLegEvObserved: number | null = null;

  // Engine contract: log PP thresholds for audit
  const ppThresholds = ppEngine.getThresholds();
  console.log(`[PP Engine] ${breakEvenProbLabel("pp")} | minEdge=${ppThresholds.minEdge} minLegEv=${ppThresholds.minLegEv}`);

  // ---- Early exit if too few legs remain (PP only; UD still runs when platform is both or --force-ud) ----
  const minLegsNeeded = 6;
  if (filtered.length < minLegsNeeded) {
    console.log(`❌ Too few PP legs after filtering: ${filtered.length} legs (need at least ${minLegsNeeded})`);
    console.log(`   Consider: --volume (0.4% thresholds) or lower MIN_TRUE_PROB from ${(MIN_TRUE_PROB * 100).toFixed(1)}%`);
    await runBucketSlice("pp", PP_SLICE_STRUCT_RENDER, [
      { id: "structure_evaluation", run: noopAsync },
      {
        id: "selection_export",
        run: async () => {
          const ppLegsPath = path.join(process.cwd(), "prizepicks-legs.csv");
          const ppCardsPath = path.join(process.cwd(), "prizepicks-cards.csv");
          writeLegsCsv(filtered, ppLegsPath, runTimestamp);
          writeCardsCsv([], ppCardsPath, runTimestamp);
          console.log(
            `Wrote prizepicks-legs.csv (${filtered.length} rows) and prizepicks-cards.csv (0 rows)`
          );
          try {
            const maxEv =
              filtered.length > 0
                ? Math.max(...filtered.map((leg) => postEligibilityLegValueMetric(leg)))
                : null;
            updatePreDiversificationCardDiagnosisSection("pp", {
              eligibleLegsAfterRunnerFilters: filtered.length,
              minLegsRequiredForCardBuild: minLegsNeeded,
              earlyExitTooFewLegs: true,
              noViableStructuresAllSkippedByLegEv: false,
              viableStructureFlexTypes: [],
              skippedStructureFlexTypes: [],
              maxEffectiveLegEvObserved: maxEv,
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
              portfolioDiversificationEnabled: args.portfolioDiversification,
              exampleBreakevenDropped: null,
            });
          } catch (e76) {
            console.warn("[Phase76] pre-div diagnosis (PP early exit):", (e76 as Error).message);
          }
        },
      },
      { id: "render_input", run: noopAsync },
    ]);
    let udEarlyExitResult: import("./run_underdog_optimizer").UdRunResult | void = undefined;
    if (platform === "both" || args.forceUd) {
      console.log("\n[Unified] Running Underdog optimizer (PP early exit / --force-ud)...\n");
      udEarlyExitResult = await runUnderdogOptimizer(undefined, args);
      console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
      sheetsPushExitCode = runSheetsPush(runTimestamp, args);
      if (args.telegram) {
        const udCsvPath = path.join(process.cwd(), "underdog-cards.csv");
        await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), args.bankroll, args.telegramDryRun);
      }
    }
    {
      const cwd = process.cwd();
      const udCards = udEarlyExitResult?.udCards?.map(({ card }) => card) ?? [];
      const udRan = platform === "both" || args.forceUd;
      const udPicksCount = udRan ? countCsvDataLines(cwd, "underdog-legs.csv") : 0;
      const notes: string[] = [
        "Telegram high-EV digest is not persisted as a file (chat-only).",
        "PP card generation skipped (insufficient eligible legs).",
      ];
      const degradationReasons: string[] = [];
      if (udRan && (udEarlyExitResult?.udCardCount ?? 0) > 0 && udPicksCount == null) {
        notes.push("underdog-legs.csv missing or unreadable; UD picks count unavailable.");
        degradationReasons.push("missing_ud_picks_count");
      }
      if (udRan && sheetsPushExitCode != null && sheetsPushExitCode !== 0) {
        notes.push(`Sheets push failed after partial run (exit ${sheetsPushExitCode}).`);
        degradationReasons.push(`sheets_push_exit_${sheetsPushExitCode}`);
      }
      const optimizerEdgeQualityEarly = tryWriteOptimizerEdgeQualityAuditFromRunParts(cwd, {
        ppExportCards: [],
        udExportCards: udCards,
        ppCandidatePoolCount: null,
        udCandidatePoolCount: udEarlyExitResult?.survival?.generatedTotal ?? null,
        cardEvFloor: args.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.008),
      });
      finalizeCanonicalRunStatus({
        rootDir: cwd,
        generatedAtUtc: new Date().toISOString(),
        runTimestamp,
        success: true,
        outcome: "early_exit",
        earlyExitReason: EARLY_EXIT_REASON.insufficient_eligible_legs,
        ppCards: [],
        ppPicksCount: filtered.length,
        udCards,
        udPicksCount,
        digest: { generated: false, shownCount: null, dedupedCount: null },
        liveMergeInput: readLiveMergeInputForRunStatus(cwd),
        optimizerEdgeQuality: optimizerEdgeQualityEarly ?? undefined,
        notes,
        degradationReasons,
        expectedArtifacts: {
          prizepicksPicks: true,
          ...(udRan ? { underdogPicks: true, underdogCards: udCards.length > 0 } : {}),
        },
      });
      try {
        const genAt = new Date().toISOString();
        writePhase17iOperatorArtifacts(cwd, {
          runTimestampEt: runTimestamp,
          runMode: "partial",
          platform: platform === "both" ? "both" : "pp",
          ppLegFunnel: {
            rawScrapedProps: ppRawScraped,
            mergeMatchedProps: ppMergeMatched,
            afterEvCompute: ppAfterEvCompute,
            afterMinEdge: ppAfterMinEdge,
            afterMinLegEvBeforeAdjEv: ppAfterMinLegEvBeforeAdjEv,
            afterAdjEvThreshold: ppAfterAdjEvThreshold,
            afterPlayerCap: filtered.length,
            cardsBuiltPreTypeEvFilter: null,
            cardsAfterPerTypeMinEv: null,
            cardsAfterSelectionEngine: null,
            cardsExported: null,
            exportedByFlexType: {},
          },
          ppThresholds: {
            minEdgePerLeg: MIN_TRUE_PROB,
            minLegEv: 0, // Not used in new trueProb-based pipeline
            evAdjThresh: 0, // Not used in new trueProb-based pipeline
            maxLegsPerPlayer: MAX_LEGS_PER_PLAYER,
            volumeMode: !!args.volume,
          },
          ud: udEarlyExitResult?.survival ?? null,
          operatorNotes: [
            `PP: eligible legs after player cap (${filtered.length}) < ${minLegsNeeded} — PP cards skipped.`,
            ...(platform === "both" || args.forceUd ? ["UD may still run when platform=both or --force-ud."] : []),
          ],
        });
        writeEligibilityPolicyContractArtifacts(cwd, args, genAt);
      } catch (e17) {
        console.warn("[Phase17I/17J] Failed to write platform survival / eligibility policy:", (e17 as Error).message);
      }
      try {
        const obsAt = new Date().toISOString();
        writeFinalSelectionObservabilityArtifacts(
          cwd,
          buildFinalSelectionObservabilityReport({
            generatedAtUtc: obsAt,
            runTimestampEt: runTimestamp,
            pp: null,
            ud: udEarlyExitResult?.finalSelectionObservability ?? null,
          })
        );
      } catch (e17r) {
        console.warn("[Phase17R] Failed to write final selection observability:", (e17r as Error).message);
      }
      try {
        const rsAt = new Date().toISOString();
        writeFinalSelectionReasonsArtifacts(
          cwd,
          buildFinalSelectionReasonsReport({
            generatedAtUtc: rsAt,
            runTimestampEt: runTimestamp,
            pp: null,
            ud: udEarlyExitResult?.finalSelectionReasons ?? null,
          })
        );
      } catch (e17s) {
        console.warn("[Phase17S] Failed to write final selection reason attribution:", (e17s as Error).message);
      }
      try {
        writeSiteInvariantRuntimeContractFromRun(cwd, runTimestamp);
      } catch (e17t) {
        console.warn("[Phase17T] Failed to write site invariant runtime contract:", (e17t as Error).message);
      }
      try {
        writeRepoHygieneAuditFromRun(cwd, runTimestamp);
      } catch (e17u) {
        console.warn("[Phase17U] Failed to write repo hygiene audit:", (e17u as Error).message);
      }
    }
    return;
  }

  // Phase 17M — PP buckets 6–8 (structure_evaluation → selection_export → render_input)
  await runBucketSlice("pp", PP_SLICE_STRUCT_RENDER, [
    {
      id: "structure_evaluation",
      run: async () => {
        noViablePpStructures = false;
        cardsBeforeEvFilterTail = [];
        filteredCardsTail = [];
        selectionCardsTail = [];
        ppStructureBuildStats = [];
        ppSelectionBatch = null;

        sortedLegs = sortLegsByPostEligibilityValue(filtered);

        const topLegs = sortedLegs.slice(0, 10);
        console.log("Top EV legs after filtering (effective EV = adjEv ?? legEv):");
        for (const leg of topLegs) {
          const ev = effectiveEv(leg);
          console.log(
            ` player=${leg.player}, stat=${leg.stat}, line=${leg.line}, ` +
              `trueProb=${
                Number.isFinite(leg.trueProb) ? leg.trueProb.toFixed(3) : leg.trueProb
              }, ` +
              `edge=${
                Number.isFinite(leg.edge) ? leg.edge.toFixed(3) : leg.edge
              }, ` +
              `legEv=${
                Number.isFinite(leg.legEv) ? leg.legEv.toFixed(3) : leg.legEv
              }, ` +
              (leg.adjEv != null ? `adjEv=${(leg.adjEv * 100).toFixed(2)}%, ` : "") +
              `effectiveEv=${(ev * 100).toFixed(2)}%, ` +
              `overOdds=${leg.overOdds}, underOdds=${leg.underOdds}, book=${leg.book}, team=${leg.team}, opponent=${leg.opponent}`
          );
        }

        console.log(`\n🔄 Starting card EV evaluation, total legs=${filtered.length}`);

        const SLIP_BUILD_SPEC: { size: number; flexType: FlexType }[] = [
          { size: 5, flexType: "5F" },
          { size: 6, flexType: "6F" },
          { size: 5, flexType: "5P" },
          { size: 6, flexType: "6P" },
          { size: 4, flexType: "4F" },
          { size: 4, flexType: "4P" },
          { size: 3, flexType: "3F" },
          { size: 3, flexType: "3P" },
          { size: 2, flexType: "2P" },
        ];

        const maxLegEv = filtered.length > 0 ? Math.max(...filtered.map((l) => effectiveEv(l))) : 0;
        console.log(
          `📊 Max effective leg EV in this slate: ${maxLegEv >= 0 ? "+" : ""}${(maxLegEv * 100).toFixed(2)}%`
        );

        const MIN_LEG_EV_REQUIREMENTS: Record<string, number> = {
          "2P": 0.010,
          "3P": 0.008,
          "3F": 0.008,
          "4P": 0.007,
          "4F": 0.007,
          "5P": 0.006,
          "5F": 0.005,
          "6P": 0.005,
          "6F": 0.004,
        };

        const viableStructures = SLIP_BUILD_SPEC.filter(({ flexType }: { flexType: FlexType }) => {
          const requiredLegEv = MIN_LEG_EV_REQUIREMENTS[flexType];
          if (maxLegEv < requiredLegEv) {
            console.log(
              `⚠️  Skipping structure ${flexType}: max leg EV = ${(maxLegEv * 100).toFixed(2)}% < required ${(requiredLegEv * 100).toFixed(2)}%`
            );
            return false;
          }
          return true;
        });

        if (viableStructures.length === 0) {
          noViablePpStructures = true;
          ppMaxLegEvObserved = maxLegEv;
          ppViableFlexTypes = [];
          ppSkippedFlexTypes = SLIP_BUILD_SPEC.map((s) => s.flexType);
          ppCardsBuiltPreTypeEvFilter = 0;
          ppCardsAfterPerTypeMinEv = 0;
          ppCardsAfterSelectionEngine = 0;
          ppCardsExported = 0;
          ppExportedByFlexType = {};
          sortedCards = [];
          console.log(
            `❌ No viable structures for this slate - all structures require higher leg EV than available`
          );
          console.log(`   Max leg EV: ${(maxLegEv * 100).toFixed(2)}%`);
          console.log(
            `   Best requirement: ${Math.min(...Object.values(MIN_LEG_EV_REQUIREMENTS)) * 100}%`
          );
          return;
        }

        ppMaxLegEvObserved = maxLegEv;
        ppViableFlexTypes = viableStructures.map((s: { flexType: FlexType }) => s.flexType);
        ppSkippedFlexTypes = SLIP_BUILD_SPEC.filter(
          (s: { size: number; flexType: FlexType }) => !viableStructures.includes(s)
        ).map((s) => s.flexType);

        console.log(
          `✅ Viable structures: [${viableStructures
            .map((s: { size: number; flexType: FlexType }) => s.flexType)
            .join(", ")}]`
        );
        console.log(
          `   Skipped structures: [${SLIP_BUILD_SPEC.filter(
            (s: { size: number; flexType: FlexType }) => !viableStructures.includes(s)
          )
            .map((s) => s.flexType)
            .join(", ")}]`
        );

        const sortedByEdge = [...filtered].sort((a, b) => b.edge - a.edge);
        const feasibilityData = precomputeFlexFeasibilityData(filtered);

        const cardsBeforeEvFilter: CardEvResult[] = [];
        for (const { size, flexType } of viableStructures) {
          if (isEvEngineDegraded()) {
            console.log(
              `🚨 EV engine degraded, skipping remaining structures (${flexType} and beyond)`
            );
            break;
          }

          console.log(`🔄 Building cards for ${flexType} (${size}-leg)...`);
          const { cards, stats } = await buildCardsForSize(
            sortedByEdge,
            size,
            flexType,
            feasibilityData,
            args
          );
          ppStructureBuildStats.push(stats);
          console.log(`✅ ${flexType}: ${cards.length} +EV cards found`);
          cardsBeforeEvFilter.push(...cards);
        }

        cardsBeforeEvFilterTail = cardsBeforeEvFilter;

        console.log(
          `Cards before EV filter: ${cardsBeforeEvFilter.length} (from ${filtered.length} legs)`
        );

        const filteredCards: CardEvResult[] = cardsBeforeEvFilter.filter(
          (card) => card.cardEv >= getMinEvForFlexType(card.flexType, args)
        );
        filteredCardsTail = filteredCards;

        console.log(
          `Cards after EV filter (per-type min): ${filteredCards.length} of ${cardsBeforeEvFilter.length}`
        );

        ppSelectionBatch = attributeFilterAndOptimizeBatch(filteredCards, "PP");
        const selectionCards = ppSelectionBatch.kept;
        selectionCardsTail = selectionCards;

        console.log(
          `Cards after SelectionEngine (breakeven + anti-dilution): ${selectionCards.length} of ${filteredCards.length}`
        );

        sortedCards = sortCardsForExportPrimaryRanking(selectionCards);
      },
    },
    {
      id: "selection_export",
      run: async () => {
        const legsData = sortedLegs.map((leg) => ({
          id: leg.id,
          player: leg.player,
          team: leg.team ?? null,
          opponent: leg.opponent ?? null,
          sport: leg.sport,
          league: leg.league,
          stat: leg.stat,
          line: leg.line,
          trueProb: leg.trueProb,
          rawTrueProb: leg.rawTrueProb ?? leg.trueProb,
          calibratedTrueProb: leg.calibratedTrueProb ?? leg.trueProb,
          probCalibrationApplied: leg.probCalibrationApplied ?? false,
          probCalibrationBucket: leg.probCalibrationBucket ?? null,
          edge: leg.edge,
          legEv: leg.legEv,
          adjEv: leg.adjEv ?? null,
          book: leg.book ?? null,
          overOdds: leg.overOdds ?? null,
          underOdds: leg.underOdds ?? null,
          outcome: leg.outcome,
          gameId: leg.gameId ?? null,
          startTime: leg.startTime ?? null,
          ppNConsensusBooks: leg.ppNConsensusBooks ?? null,
          ppConsensusDevigSpreadOver: leg.ppConsensusDevigSpreadOver ?? null,
        }));
        const legsOutPath = path.join(process.cwd(), "prizepicks-legs.json");
        try {
          JSON.parse(JSON.stringify(legsData));
          fs.writeFileSync(legsOutPath, JSON.stringify(legsData, null, 2), "utf8");
          console.log(`✅ Wrote ${legsData.length} valid legs to prizepicks-legs.json`);
        } catch (e) {
          console.error("❌ JSON validation failed:", e);
          emitFatalRunStatus(FATAL_REASON.json_output_failure);
          process.exit(1);
        }

        const legsCsvPath = path.join(process.cwd(), "prizepicks-legs.csv");
        writeLegsCsv(sortedLegs, legsCsvPath, runTimestamp);
        console.log(`Wrote ${sortedLegs.length} legs to ${legsCsvPath}`);

        if (noViablePpStructures) {
          exportCards = [];
          try {
            updatePreDiversificationCardDiagnosisSection("pp", {
              eligibleLegsAfterRunnerFilters: sortedLegs.length,
              minLegsRequiredForCardBuild: minLegsNeeded,
              earlyExitTooFewLegs: false,
              noViableStructuresAllSkippedByLegEv: true,
              viableStructureFlexTypes: ppViableFlexTypes,
              skippedStructureFlexTypes: ppSkippedFlexTypes,
              maxEffectiveLegEvObserved: ppMaxLegEvObserved,
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
              portfolioDiversificationEnabled: args.portfolioDiversification,
              exampleBreakevenDropped: null,
            });
          } catch (e76) {
            console.warn("[Phase76] pre-div diagnosis (PP no viable structures):", (e76 as Error).message);
          }
          return;
        }

        const maxExport = resolvePrizePicksRunnerExportCardLimit(args, platform === "both");
        if (args.portfolioDiversification && sortedCards.length > 0) {
          const div = selectDiversifiedPortfolioExport(
            sortedCards,
            maxExport,
            DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY
          );
          exportCards = div.exported;
          updatePortfolioDiversificationArtifactSection("pp", div.report, true);
          if (!args.exportUncap && sortedCards.length > maxExport) {
            console.log(
              `Capped export (Phase 77 diversified): ${sortedCards.length} candidates → ${exportCards.length} exported (cap ${maxExport})`
            );
          }
        } else {
          exportCards = applyExportCapSliceRankedCards(sortedCards, maxExport);
          updatePortfolioDiversificationArtifactSection("pp", null, false);
          if (!args.exportUncap && sortedCards.length > maxExport) {
            console.log(
              `Capped export: ${sortedCards.length} total → top ${maxExport} by EV${platform === "both" ? " (--max-cards)" : ""}`
            );
          }
        }

        ppCardsBuiltPreTypeEvFilter = cardsBeforeEvFilterTail.length;
        ppCardsAfterPerTypeMinEv = filteredCardsTail.length;
        ppCardsAfterSelectionEngine = selectionCardsTail.length;
        ppCardsExported = exportCards.length;
        ppExportedByFlexType = countPpCardsByFlexType(exportCards);

        // Phase 95: `CardEvResult` may carry optional `featureSnapshot` / `featureSignals` (set via `attachFeatureContextToCard`); default run leaves them unset — no export change.
        const cardsOutPath = path.join(process.cwd(), "prizepicks-cards.json");
        fs.writeFileSync(
          cardsOutPath,
          JSON.stringify({ runTimestamp, cards: exportCards }, null, 2),
          "utf8"
        );
        console.log(`Wrote ${exportCards.length} cards to ${cardsOutPath}`);

        const cardsCsvPath = path.join(process.cwd(), "prizepicks-cards.csv");
        writeCardsCsv(exportCards, cardsCsvPath, runTimestamp);
        console.log(`Wrote ${exportCards.length} cards to ${cardsCsvPath}`);

        try {
          const aggAttempts = ppStructureBuildStats.reduce((a, s) => a + s.maxAttempts, 0);
          const aggSuccessful = ppStructureBuildStats.reduce((a, s) => a + s.successfulCardBuilds, 0);
          const aggEvCalls = ppStructureBuildStats.reduce((a, s) => a + s.evCallsMade, 0);
          const ex = ppSelectionBatch?.breakevenDropped[0];
          updatePreDiversificationCardDiagnosisSection("pp", {
            eligibleLegsAfterRunnerFilters: sortedLegs.length,
            minLegsRequiredForCardBuild: minLegsNeeded,
            earlyExitTooFewLegs: false,
            noViableStructuresAllSkippedByLegEv: false,
            viableStructureFlexTypes: ppViableFlexTypes,
            skippedStructureFlexTypes: ppSkippedFlexTypes,
            maxEffectiveLegEvObserved: ppMaxLegEvObserved,
            builderAttemptLoopsScheduled: aggAttempts,
            builderSuccessfulFullLegSets: aggSuccessful,
            builderEvEvaluationsReturned: aggEvCalls,
            structureBuildStats: ppStructureBuildStats,
            cardsAfterBuilderPostStructureDedupe: cardsBeforeEvFilterTail.length,
            cardsAfterPerTypeMinEvFilter: filteredCardsTail.length,
            selectionEngineBreakevenDropped: ppSelectionBatch?.breakevenDropped.length ?? 0,
            selectionEngineAntiDilutionAdjustments: ppSelectionBatch?.antiDilutionAdjustments.length ?? 0,
            cardsAfterSelectionEngine: selectionCardsTail.length,
            cardsAfterPrimaryRankSort: sortedCards.length,
            cardsInputToDiversificationLayer: sortedCards.length,
            cardsExportedAfterCapOrDiversification: exportCards.length,
            portfolioDiversificationEnabled: args.portfolioDiversification,
            exampleBreakevenDropped: ex
              ? {
                  flexType: ex.flexType,
                  avgProb: ex.avgProb,
                  requiredBreakeven: getBreakevenThreshold(ex.flexType),
                  legIdsSample: ex.legs.map((l) => l.pick.id).slice(0, 8),
                }
              : null,
          });
        } catch (e76) {
          console.warn("[Phase76] pre-div diagnosis (PP):", (e76 as Error).message);
        }
      },
    },
    {
      id: "render_input",
      run: async () => {
        if (noViablePpStructures) return;

        const top3 = exportCards.slice(0, 3);
        if (top3.length > 0) {
          const { generateClipboardString } = await import("./exporter/clipboard_generator");
          console.log("\n════════════════════════════════════════════════════");
          console.log(" COPY-TO-CLIPBOARD (Top 3 cards)");
          console.log("════════════════════════════════════════════════════\n");
          top3.forEach((card) => {
            console.log(generateClipboardString(card));
            console.log("");
          });
          console.log("════════════════════════════════════════════════════\n");
        }
        if (platform !== "both" && exportCards.length > 0) {
          try {
            const { saveCardsToTracker } = await import("./tracking/tracker_schema");
            saveCardsToTracker(exportCards, { platform: "PP", maxCards: 50 });
          } catch (e) {
            console.warn("[Tracker] PP save failed:", (e as Error).message);
          }
        }

        if (args.innovative) {
          console.log("\n════════════════════════════════════════════════════");
          console.log(" INNOVATIVE CARD BUILDER — EV + Diversity Portfolio");
          if (args.liveLiq) console.log(" + LIVE LIQUIDITY");
          if (args.telegram) console.log(" + TELEGRAM PUSH");
          console.log("════════════════════════════════════════════════════");

          try {
            let liveScores: Map<string, number> | undefined;
            if (args.liveLiq) {
              console.log("\n[Phase5a] Fetching live liquidity...");
              const enriched = await enrichLegsWithLiveLiquidity(
                sortedLegs,
                runTimestamp.slice(0, 10)
              );
              liveScores = new Map(enriched.map((l) => [l.id, l._liveLiquidity ?? 0.70]));
              console.log(`[Phase5a] Live liquidity computed for ${liveScores.size} legs`);
            }

            const { cards: innovCards, clusters } = buildInnovativeCards(sortedLegs, {
              maxCards: 50,
              minCardEV: args.minCardEv ?? 0.01,
              maxPlayerCards: 3,
              globalKellyCap: 0.2,
              liveScores,
              bankroll: args.bankroll,
              kellyMultiplier: args.kellyFraction,
              maxBetPerCard: args.maxBetPerCard,
              cli: args,
            });

            const innovCsvPath = path.join(process.cwd(), "prizepicks-innovative-cards.csv");
            const clusterJsonPath = path.join(process.cwd(), "edge-clusters.json");
            writeInnovativeCardsCsv(innovCards, clusters, innovCsvPath, clusterJsonPath, runTimestamp, "PP");
            writeTieredCsvs(innovCards, process.cwd(), runTimestamp, "PP");

            const radarSvgPath = path.join(process.cwd(), "stat-balance-radar.svg");
            if (innovCards.length > 0) {
              writeRadarChart(innovCards, radarSvgPath, runTimestamp.slice(0, 10));
            }

            if (args.telegram) {
              await pushTop5ToTelegram(innovCards, clusters, runTimestamp.slice(0, 10), {
                bankroll: args.bankroll,
                svgPath: radarSvgPath,
                sendChart: innovCards.length > 0,
                telegramDryRun: args.telegramDryRun,
              });
            }

            const totalKelly = innovCards.reduce((s, c) => s + c.kellyFrac, 0);
            const topPlayer = (() => {
              const pc = new Map<string, number>();
              for (const card of innovCards)
                for (const leg of card.legs) pc.set(leg.player, (pc.get(leg.player) ?? 0) + 1);
              let max = 0;
              let top = "";
              for (const [p, n] of pc)
                if (n > max) {
                  max = n;
                  top = p;
                }
              return top ? `${top} (${max} cards)` : "—";
            })();
            const statDist = (() => {
              const sd = new Map<string, number>();
              for (const card of innovCards)
                for (const [k, v] of Object.entries(card.statBalance))
                  sd.set(k, (sd.get(k) ?? 0) + v);
              return [...sd.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([s, n]) => `${s}=${n}`)
                .join(" ");
            })();

            const tier1 = innovCards.filter((c) => c.tier === 1);
            const tier2 = innovCards.filter((c) => c.tier === 2);
            const fragileN = innovCards.filter((c) => c.fragile).length;
            const totalStake = innovCards.reduce((s, c) => s + c.kellyStake, 0);

            console.log(`\n[Innovative] ── Summary ──────────────────────────────────`);
            console.log(
              `  Cards: ${innovCards.length} | T1: ${tier1.length} | T2: ${tier2.length} | Fragile: ${fragileN}`
            );
            console.log(
              `  Kelly total: ${(totalKelly * 100).toFixed(1)}% | Total stake: $${totalStake.toFixed(0)} / $${args.bankroll}`
            );
            console.log(`  Top player: ${topPlayer}`);
            console.log(`  Stat mix: ${statDist}`);
            console.log(`  Edge clusters: ${clusters.length}`);
            console.log(`  CSV: ${innovCsvPath}`);
            console.log(`  SVG: ${radarSvgPath}`);
            console.log(`──────────────────────────────────────────────────────────\n`);
          } catch (err) {
            console.error("[Innovative] Phase 5 failed:", (err as Error).message);
            console.error((err as Error).stack);
          }
        }
      },
    },
  ]);

  if (noViablePpStructures) {
    let udNoViableResult: import("./run_underdog_optimizer").UdRunResult | void = undefined;
    if (platform === "both") {
      console.log("\n[Unified] Running Underdog optimizer...\n");
      udNoViableResult = await runUnderdogOptimizer(undefined, args);
      console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
      sheetsPushExitCode = runSheetsPush(runTimestamp, args);
      if (args.telegram) {
        const udCsvPath = path.join(process.cwd(), "underdog-cards.csv");
        await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), args.bankroll, args.telegramDryRun);
      }
      tryPersistLegsSnapshotFromRootOutputs(process.cwd(), runTimestamp);
    }
    {
      const cwd = process.cwd();
      const udCards = udNoViableResult?.udCards?.map(({ card }) => card) ?? [];
      const udPicksCount = platform === "both" ? countCsvDataLines(cwd, "underdog-legs.csv") : 0;
      const notes: string[] = [
        "Telegram high-EV digest is not persisted as a file (chat-only).",
        "PP card generation skipped (no viable slip structures for this slate).",
      ];
      const degradationReasons: string[] = [];
      if (platform === "both" && (udNoViableResult?.udCardCount ?? 0) > 0 && udPicksCount == null) {
        notes.push("underdog-legs.csv missing or unreadable; UD picks count unavailable.");
        degradationReasons.push("missing_ud_picks_count");
      }
      if (platform === "both" && sheetsPushExitCode != null && sheetsPushExitCode !== 0) {
        notes.push(`Sheets push failed after partial run (exit ${sheetsPushExitCode}).`);
        degradationReasons.push(`sheets_push_exit_${sheetsPushExitCode}`);
      }
      const optimizerEdgeQualityNoVia = tryWriteOptimizerEdgeQualityAuditFromRunParts(cwd, {
        ppExportCards: [],
        udExportCards: udCards,
        ppCandidatePoolCount: null,
        udCandidatePoolCount: udNoViableResult?.survival?.generatedTotal ?? null,
        cardEvFloor: args.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.008),
      });
      finalizeCanonicalRunStatus({
        rootDir: cwd,
        generatedAtUtc: new Date().toISOString(),
        runTimestamp,
        success: true,
        outcome: "early_exit",
        earlyExitReason: EARLY_EXIT_REASON.no_viable_structures,
        ppCards: [],
        ppPicksCount: filtered.length,
        udCards,
        udPicksCount,
        digest: { generated: false, shownCount: null, dedupedCount: null },
        liveMergeInput: readLiveMergeInputForRunStatus(cwd),
        optimizerEdgeQuality: optimizerEdgeQualityNoVia ?? undefined,
        notes,
        degradationReasons,
        expectedArtifacts: {
          prizepicksPicks: true,
          ...(platform === "both"
            ? { underdogPicks: true, underdogCards: udCards.length > 0 }
            : {}),
        },
      });
      try {
        const genAt = new Date().toISOString();
        writePhase17iOperatorArtifacts(cwd, {
          runTimestampEt: runTimestamp,
          runMode: "partial",
          platform: platform === "both" ? "both" : "pp",
          ppLegFunnel: {
            rawScrapedProps: ppRawScraped,
            mergeMatchedProps: ppMergeMatched,
            afterEvCompute: ppAfterEvCompute,
            afterMinEdge: ppAfterMinEdge,
            afterMinLegEvBeforeAdjEv: ppAfterMinLegEvBeforeAdjEv,
            afterAdjEvThreshold: ppAfterAdjEvThreshold,
            afterPlayerCap: filtered.length,
            cardsBuiltPreTypeEvFilter: 0,
            cardsAfterPerTypeMinEv: 0,
            cardsAfterSelectionEngine: 0,
            cardsExported: 0,
            exportedByFlexType: {},
          },
          ppThresholds: {
            minEdgePerLeg: MIN_TRUE_PROB,
            minLegEv: 0, // Not used in new trueProb-based pipeline
            evAdjThresh: 0, // Not used in new trueProb-based pipeline
            maxLegsPerPlayer: MAX_LEGS_PER_PLAYER,
            volumeMode: !!args.volume,
          },
          ud: udNoViableResult?.survival ?? null,
          operatorNotes: [
            "PP: no slip structures passed MIN_LEG_EV_REQUIREMENTS vs max effective leg EV — 0 cards built.",
          ],
        });
        writeEligibilityPolicyContractArtifacts(cwd, args, genAt);
      } catch (e17) {
        console.warn("[Phase17I/17J] Failed to write platform survival / eligibility policy:", (e17 as Error).message);
      }
      try {
        const obsAt = new Date().toISOString();
        writeFinalSelectionObservabilityArtifacts(
          cwd,
          buildFinalSelectionObservabilityReport({
            generatedAtUtc: obsAt,
            runTimestampEt: runTimestamp,
            pp: null,
            ud: udNoViableResult?.finalSelectionObservability ?? null,
          })
        );
      } catch (e17r) {
        console.warn("[Phase17R] Failed to write final selection observability:", (e17r as Error).message);
      }
      try {
        const rsAt = new Date().toISOString();
        writeFinalSelectionReasonsArtifacts(
          cwd,
          buildFinalSelectionReasonsReport({
            generatedAtUtc: rsAt,
            runTimestampEt: runTimestamp,
            pp: null,
            ud: udNoViableResult?.finalSelectionReasons ?? null,
          })
        );
      } catch (e17s) {
        console.warn("[Phase17S] Failed to write final selection reason attribution:", (e17s as Error).message);
      }
      try {
        writeSiteInvariantRuntimeContractFromRun(cwd, runTimestamp);
      } catch (e17t) {
        console.warn("[Phase17T] Failed to write site invariant runtime contract:", (e17t as Error).message);
      }
      try {
        writeRepoHygieneAuditFromRun(cwd, runTimestamp);
      } catch (e17u) {
        console.warn("[Phase17U] Failed to write repo hygiene audit:", (e17u as Error).message);
      }
    }
    return;
  }

  // ---- Finalize any pending EV requests ----
  
  await finalizePendingEVRequests();

  // ---- Log performance metrics ----
  
  logPerformanceMetrics();

  // ---- Card volume diagnostics ----
  
  logCardVolumeDiagnostics(sortedCards, args);

  // ---- Fantasy analyzer (NBA + NFL fantasy_score props) ----

  const fantasyRows = await runFantasyAnalyzer();
  console.log("Fantasy analyzer total rows:", fantasyRows.length);
  console.log("Top 25 fantasy edges (implied - line):");
  console.table(
    fantasyRows.slice(0, 25).map((r) => ({
      league: r.league,
      player: r.player,
      fantasyLine: r.fantasyLine,
      impliedFantasy: Number(r.impliedFantasy.toFixed(2)),
      diff: Number(r.diff.toFixed(2)), // positive = over lean
    }))
  );

  // ---- Platform both: run Underdog optimizer with its OWN UD API data ----
  // UD fetches its own props from underdogfantasy.com and merges with the
  // OddsSnapshot already cached by PP's run (no second SGO call needed).
  // This ensures UD cards reflect UD-specific lines and pricing (udPickFactor).
  let udRunResult: import("./run_underdog_optimizer").UdRunResult | void = undefined;
  if (platform === "both") {
    console.log("\n[Unified] Running Underdog optimizer (own UD API fetch, shared odds snapshot)...\n");
    udRunResult = await runUnderdogOptimizer(undefined, args);
    try {
      const udCards = udRunResult?.udCards?.map(({ card }) => card) ?? [];
      if (exportCards.length > 0 || udCards.length > 0) {
        const { saveCardsToTracker, mergeTopCardsForTracker } = await import("./tracking/tracker_schema");
        saveCardsToTracker(mergeTopCardsForTracker(exportCards, udCards), { maxCards: 50 });
      }
    } catch (e) {
      console.warn("[Tracker] Combined PP+UD save failed:", (e as Error).message);
    }
    // Phase 5: summary table, monotonic EV check, player exposure, Kelly preview
    printPhase5Summary(exportCards, udRunResult, args.maxPlayerExposure, args.bankroll);
    const snap = OddsSnapshotManager.getCurrentSnapshot();
    const src = snap?.source === "OddsAPI" ? "oddsapi" : (snap?.source ?? "none");
    const oddsRows = snap?.rows.length ?? 0;
    const invalidDropped = snap?.invalidOddsDropped ?? 0;
    console.log(
      `[ODDS_SOURCE] source=${src} oddsRows=${oddsRows} invalidOddsDropped=${invalidDropped} merged=${merged.length} legs=${filtered.length} cardsPP=${exportCards.length} cardsUD=${udRunResult?.udCardCount ?? 0}`
    );
    printLegCountAndBreakevenDiagnostic(filtered, udRunResult);
    tryPersistLegsSnapshotFromRootOutputs(process.cwd(), runTimestamp);
    console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
    sheetsPushExitCode = runSheetsPush(runTimestamp, args);
    if (args.telegram) {
      const totalCards = exportCards.length + (udRunResult?.udCardCount ?? 0);
      if (totalCards < 100) {
        await sendTelegramAlert(`Low cards: ${totalCards} (PP+UD). Expected ≥100 for full slate.`);
      }
      const udCsvPath = path.join(process.cwd(), "underdog-cards.csv");
      await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), args.bankroll, args.telegramDryRun);
    }
  }

  // Phase 16L: high-EV digest — capped, deduped, tier-sorted (no per-card spam / 429 storms)
  const highEvPp = exportCards.filter((c) => c.cardEv > 0.07);
  const highEvUd =
    udRunResult?.udCards?.filter(({ card }) => card.cardEv > 0.07).map(({ card }) => card) ?? [];
  const highEvCombined: CardEvResult[] = [...highEvPp, ...highEvUd];
  const TELEGRAM_HIGH_EV_CAP_PER_PLATFORM = 5;
  const digestCounts =
    highEvCombined.length > 0
      ? summarizeHighEvDigestCounts(highEvCombined, { maxPerPlatform: TELEGRAM_HIGH_EV_CAP_PER_PLATFORM })
      : null;
  let digestGenerated = false;
  if (highEvCombined.length > 0 && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const { generateClipboardString } = await import("./exporter/clipboard_generator");
    const { sendTelegramText } = await import("./notifications/telegram_bot");
    const messages = buildHighEvTelegramMessages(highEvCombined, generateClipboardString, {
      maxPerPlatform: TELEGRAM_HIGH_EV_CAP_PER_PLATFORM,
      runLabel: runTimestamp,
    });
    digestGenerated = messages.length > 0;
    // Pace after UD top-5 / Sheets push to reduce burst rate-limit hits
    if (args.telegram && udRunResult) {
      await new Promise((r) => setTimeout(r, 550));
    }
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 650));
      await sendTelegramText(messages[i]);
    }
    if (messages.length > 0) {
      console.log(
        `[Telegram] High-EV digest: ${messages.length} message(s), ≤${TELEGRAM_HIGH_EV_CAP_PER_PLATFORM}/platform, deduped`
      );
    }
  }

  // Phase 16: Tier 1 scarcity attribution (machine-readable, additive diagnostics)
  try {
    const tier1Scarcity = buildTier1ScarcityAttribution({
      runTimestamp,
      ppCards: exportCards,
      udCards: udRunResult?.udCards?.map(({ card }) => card) ?? [],
      ppFilteredLegs: filtered,
      ppMergeStageAccounting: ppStageAccounting ?? undefined,
    });
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactsDir, "tier1_scarcity_attribution.json"),
      JSON.stringify(tier1Scarcity, null, 2),
      "utf8"
    );
    console.log(
      `[Tier1Scarcity] tier1=${tier1Scarcity.summary.tier1Count}/${tier1Scarcity.summary.totalCards} ` +
      `scarce=${tier1Scarcity.summary.isTier1Scarce} reason=${tier1Scarcity.summary.primaryReasonCode}`
    );
  } catch (e) {
    console.warn("[Tier1Scarcity] Failed to write tier1_scarcity_attribution.json:", (e as Error).message);
  }

  // Phase 117: optimizer edge quality audit (read-only; uses existing exports + pool sizes)
  const cwd117 = process.cwd();
  const cardEvFloor117 = args.minCardEv ?? Number(process.env.MIN_CARD_EV ?? 0.008);
  const optimizerEdgeQualityFull =
    tryWriteOptimizerEdgeQualityAuditFromRunParts(cwd117, {
      ppExportCards: exportCards,
      udExportCards: udRunResult?.udCards?.map(({ card }) => card) ?? [],
      ppCandidatePoolCount:
        sortedCards.length > 0 ? sortedCards.length : exportCards.length > 0 ? exportCards.length : null,
      udCandidatePoolCount: udRunResult?.survival?.generatedTotal ?? null,
      cardEvFloor: cardEvFloor117,
    }) ?? undefined;

  // Phase 17F/17G: canonical run status (operator-facing JSON + markdown; full_success path)
  try {
    const cwd = process.cwd();
    const udCardsForStatus = udRunResult?.udCards?.map(({ card }) => card) ?? [];
    const udPicksCount =
      platform === "both" ? countCsvDataLines(cwd, "underdog-legs.csv") : 0;
    const notes: string[] = ["Telegram high-EV digest is not persisted as a file (chat-only)."];
    const degradationReasons: string[] = [];
    if (platform === "both" && (udRunResult?.udCardCount ?? 0) > 0 && udPicksCount == null) {
      notes.push("underdog-legs.csv missing or unreadable; UD picks count unavailable.");
      degradationReasons.push("missing_ud_picks_count");
    }
    if (platform === "both" && sheetsPushExitCode != null && sheetsPushExitCode !== 0) {
      notes.push(`Sheets push failed after optimizer completed (exit ${sheetsPushExitCode}).`);
      degradationReasons.push(`sheets_push_exit_${sheetsPushExitCode}`);
    }
    finalizeCanonicalRunStatus({
      rootDir: cwd,
      generatedAtUtc: new Date().toISOString(),
      runTimestamp,
      success: true,
      outcome: "full_success",
      ppCards: exportCards,
      ppPicksCount: filtered.length,
      udCards: udCardsForStatus,
      udPicksCount,
      digest: {
        generated: digestGenerated,
        shownCount: digestCounts?.shownCount ?? null,
        dedupedCount: digestCounts?.dedupedCount ?? null,
      },
      liveMergeInput: readLiveMergeInputForRunStatus(cwd),
      optimizerEdgeQuality: optimizerEdgeQualityFull,
      notes,
      degradationReasons,
      expectedArtifacts: {
        prizepicksPicks: true,
        prizepicksCards: exportCards.length > 0,
        ...(platform === "both"
          ? {
              underdogPicks: true,
              underdogCards: (udRunResult?.udCardCount ?? 0) > 0,
            }
          : {}),
      },
    });

    try {
      const genAt = new Date().toISOString();
      writePhase17iOperatorArtifacts(cwd, {
        runTimestampEt: runTimestamp,
        runMode: platform === "both" ? "both" : "pp",
        platform: platform === "both" ? "both" : "pp",
        ppLegFunnel: {
          rawScrapedProps: ppRawScraped,
          mergeMatchedProps: ppMergeMatched,
          afterEvCompute: ppAfterEvCompute,
          afterMinEdge: ppAfterMinEdge,
          afterMinLegEvBeforeAdjEv: ppAfterMinLegEvBeforeAdjEv,
          afterAdjEvThreshold: ppAfterAdjEvThreshold,
          afterPlayerCap: filtered.length,
          cardsBuiltPreTypeEvFilter: ppCardsBuiltPreTypeEvFilter,
          cardsAfterPerTypeMinEv: ppCardsAfterPerTypeMinEv,
          cardsAfterSelectionEngine: ppCardsAfterSelectionEngine,
          cardsExported: ppCardsExported,
          exportedByFlexType: ppExportedByFlexType,
        },
        ppThresholds: {
          minEdgePerLeg: MIN_TRUE_PROB,
          minLegEv: 0, // Not used in new trueProb-based pipeline
          evAdjThresh: 0, // Not used in new trueProb-based pipeline
          maxLegsPerPlayer: MAX_LEGS_PER_PLAYER,
          volumeMode: !!args.volume,
        },
        ud: platform === "both" ? (udRunResult?.survival ?? null) : null,
        operatorNotes: [
          "PP export: sortedCards by cardEv (tie-break winProbCash, leg ids), then slice by --max-export / --max-cards when platform=both.",
          "UD: buildUdCardsFromFiltered sorts ALL structures' cards by cardEv then --max-cards cap — 8F often ranks at top.",
          "Web/telegram visibility may differ from CSV (digest caps, dashboard filters) — compare to data/reports + artifacts.",
        ],
      });
      writeEligibilityPolicyContractArtifacts(cwd, args, genAt);
    } catch (e17) {
      console.warn("[Phase17I/17J] Failed to write platform survival / eligibility policy:", (e17 as Error).message);
    }
    try {
      const obsAt = new Date().toISOString();
      const ppObs = buildPpFinalSelectionObservability({
        cardsBeforeEvFilter: cardsBeforeEvFilterTail,
        filteredCards: filteredCardsTail,
        selectionCards: selectionCardsTail,
        sortedCards,
        exportCards,
      });
      writeFinalSelectionObservabilityArtifacts(
        cwd,
        buildFinalSelectionObservabilityReport({
          generatedAtUtc: obsAt,
          runTimestampEt: runTimestamp,
          pp: ppObs,
          ud: platform === "both" ? (udRunResult?.finalSelectionObservability ?? null) : null,
        })
      );
    } catch (e17r) {
      console.warn("[Phase17R] Failed to write final selection observability:", (e17r as Error).message);
    }
    try {
      const rsAt = new Date().toISOString();
      const ppReasons = buildPpFinalSelectionReasons({
        cardsBeforeEvFilter: cardsBeforeEvFilterTail,
        filteredCards: filteredCardsTail,
        sortedCards,
        exportCards,
      });
      writeFinalSelectionReasonsArtifacts(
        cwd,
        buildFinalSelectionReasonsReport({
          generatedAtUtc: rsAt,
          runTimestampEt: runTimestamp,
          pp: ppReasons,
          ud: platform === "both" ? (udRunResult?.finalSelectionReasons ?? null) : null,
        })
      );
    } catch (e17s) {
      console.warn("[Phase17S] Failed to write final selection reason attribution:", (e17s as Error).message);
    }
    try {
      writeSiteInvariantRuntimeContractFromRun(cwd, runTimestamp);
    } catch (e17t) {
      console.warn("[Phase17T] Failed to write site invariant runtime contract:", (e17t as Error).message);
    }
    try {
      writeRepoHygieneAuditFromRun(cwd, runTimestamp);
    } catch (e17u) {
      console.warn("[Phase17U] Failed to write repo hygiene audit:", (e17u as Error).message);
    }
  } catch (e) {
    console.warn("[RunStatus] Failed to write run status artifacts:", (e as Error).message);
  }
}

/** Diagnostic: leg CSV row counts, breakeven table, sample UD/PP edge calcs */
function printLegCountAndBreakevenDiagnostic(
  ppLegs: EvPick[],
  udResult: { udCardCount: number; udByStructure: Record<string, number> } | void
): void {
  const cwd = process.cwd();
  const ppPath = path.join(cwd, "prizepicks-legs.csv");
  const udPath = path.join(cwd, "underdog-legs.csv");
  let ppCsvRows = 0;
  let udCsvRows = 0;
  try {
    if (fs.existsSync(ppPath)) ppCsvRows = Math.max(0, fs.readFileSync(ppPath, "utf8").split("\n").length - 1);
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(udPath)) udCsvRows = Math.max(0, fs.readFileSync(udPath, "utf8").split("\n").length - 1);
  } catch {
    // ignore
  }
  console.log("\n--- LEG / CARD DIAGNOSTIC ---");
  console.log(`  prizepicks-legs.csv: ${ppCsvRows} rows`);
  console.log(`  underdog-legs.csv:   ${udCsvRows} rows`);
  console.log(`  UD cards generated:  ${udResult?.udCardCount ?? 0}`);
  console.log("--- BREAKEVEN TABLE (binomial-derived, confirm unchanged) ---");
  const keyIds = new Set(["3F", "4F", "5F", "6F", "UD_3P_STD", "UD_5P_STD"]);
  for (const r of BREAKEVEN_TABLE_ROWS) {
    if (keyIds.has(r.structureId))
      console.log(`  ${r.platform} ${r.structureId}: ${(r.breakevenPct / 100).toFixed(3)} (${r.breakevenPct.toFixed(2)}%)`);
  }
  const ud3 = BREAKEVEN_TABLE_ROWS.find((r) => r.structureId === "UD_3P_STD");
  if (ud3) console.log(`  UD Classic3: ${(ud3.breakevenPct / 100).toFixed(3)} ✓`);
  console.log("--- SAMPLE EDGE CALCS (edge = (trueProb - breakeven) / breakeven) ---");
  const bePp = getBreakevenForStructure("5F");
  const beUd = getBreakevenForStructure("UD_3P_STD");
  if (ppLegs.length > 0) {
    const p = ppLegs[0];
    const edgePp = (p.trueProb - bePp) / bePp;
    console.log(`  PP leg: ${p.player} ${p.stat} ${p.line} trueProb=${p.trueProb.toFixed(3)} BE(5F)=${bePp.toFixed(3)} edge=${(edgePp * 100).toFixed(2)}%`);
  }
  if (udResult && udResult.udCardCount > 0 && ppLegs.length > 0) {
    const p = ppLegs[ppLegs.length - 1];
    const edgeUd = (p.trueProb - beUd) / beUd;
    console.log(`  UD leg: ${p.player} ${p.stat} ${p.line} trueProb=${p.trueProb.toFixed(3)} BE(UD_3P)=${beUd.toFixed(3)} edge=${(edgeUd * 100).toFixed(2)}%`);
  }
  console.log("--- END DIAGNOSTIC ---\n");
}

/** Phase 5: Summary table (PP vs UD by structure), monotonic EV check, player exposure, Kelly preview */
function printPhase5Summary(
  ppCards: CardEvResult[],
  udResult: { udCardCount: number; udByStructure: Record<string, number>; udCards: { format: string; card: CardEvResult }[] } | void,
  maxPlayerExposure: number,
  bankroll: number
): void {
  const POWER_ORDER = ["2P", "3P", "4P", "5P", "6P", "7P", "8P"];
  const FLEX_ORDER = ["3F", "4F", "5F", "6F", "7F", "8F"];

  const ppByStruct: Record<string, number> = {};
  for (const c of ppCards) {
    ppByStruct[c.flexType] = (ppByStruct[c.flexType] ?? 0) + 1;
  }
  const udByStruct = udResult?.udByStructure ?? {};
  const totalPp = ppCards.length;
  const totalUd = udResult?.udCardCount ?? 0;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PHASE 5 — CARD GENERATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log("| Site | 2P  | 3P  | 4P  | 5P  | 6P  | 7P  | 8P  | Flex Total | Power Total |");
  console.log("|------|-----|-----|-----|-----|-----|-----|-----|------------|-------------|");
  const ppPower = POWER_ORDER.map((s) => ppByStruct[s] ?? 0);
  const ppFlex = FLEX_ORDER.map((s) => ppByStruct[s] ?? 0);
  const ppPowerTotal = ppPower.reduce((a, b) => a + b, 0);
  const ppFlexTotal = ppFlex.reduce((a, b) => a + b, 0);
  console.log(
    `| PP   | ${ppPower.map((n) => (n ? n.toString() : "—").padStart(3)).join(" | ")} | ${String(ppFlexTotal).padStart(10)} | ${String(ppPowerTotal).padStart(11)} |`
  );
  const udPower = POWER_ORDER.map((s) => udByStruct[s] ?? 0);
  const udFlex = FLEX_ORDER.map((s) => udByStruct[s] ?? 0);
  const udPowerTotal = udPower.reduce((a, b) => a + b, 0);
  const udFlexTotal = udFlex.reduce((a, b) => a + b, 0);
  console.log(
    `| UD   | ${udPower.map((n) => (n ? n.toString() : "—").padStart(3)).join(" | ")} | ${String(udFlexTotal).padStart(10)} | ${String(udPowerTotal).padStart(11)} |`
  );
  console.log(`\nTotal: PP ${totalPp} cards | UD ${totalUd} cards | Combined ${totalPp + totalUd}`);

  // Monotonic EV: average card EV by structure should increase with size (2P < 3P < ... and 3F < 4F < ...)
  const ppEvByStruct: Record<string, number[]> = {};
  for (const c of ppCards) {
    if (!ppEvByStruct[c.flexType]) ppEvByStruct[c.flexType] = [];
    ppEvByStruct[c.flexType].push(c.cardEv);
  }
  const udEvByStruct: Record<string, number[]> = {};
  if (udResult?.udCards) {
    for (const { format, card } of udResult.udCards) {
      const flexType = format.includes("F_FLX")
        ? `${format.match(/(\d)F/)?.[1] ?? ""}F`
        : `${format.match(/(\d)P/)?.[1] ?? ""}P`;
      if (flexType && flexType.length >= 2) {
        if (!udEvByStruct[flexType]) udEvByStruct[flexType] = [];
        udEvByStruct[flexType].push(card.cardEv);
      }
    }
  }
  const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
  let monotonicViolations = 0;
  for (const order of [POWER_ORDER, FLEX_ORDER]) {
    const labels = order.filter((s) => ppEvByStruct[s]?.length || udEvByStruct[s]?.length);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const curr = labels[i];
      const ppPrev = ppEvByStruct[prev]?.length ? avg(ppEvByStruct[prev]) : 0;
      const ppCurr = ppEvByStruct[curr]?.length ? avg(ppEvByStruct[curr]) : 0;
      const udPrev = udEvByStruct[prev]?.length ? avg(udEvByStruct[prev]) : 0;
      const udCurr = udEvByStruct[curr]?.length ? avg(udEvByStruct[curr]) : 0;
      if (ppEvByStruct[prev]?.length && ppEvByStruct[curr]?.length && ppCurr < ppPrev) {
        console.log(`  [Monotonic] PP ${prev} avg EV ${(ppPrev * 100).toFixed(2)}% > ${curr} ${(ppCurr * 100).toFixed(2)}% — violation`);
        monotonicViolations++;
      }
      if (udEvByStruct[prev]?.length && udEvByStruct[curr]?.length && udCurr < udPrev) {
        console.log(`  [Monotonic] UD ${prev} avg EV ${(udPrev * 100).toFixed(2)}% > ${curr} ${(udCurr * 100).toFixed(2)}% — violation`);
        monotonicViolations++;
      }
    }
  }
  if (monotonicViolations === 0) {
    console.log("Monotonic EV: ✓ (no violations)");
  } else {
    console.log(`Monotonic EV: ${monotonicViolations} violation(s) (leg selection bias possible)`);
  }

  // Player exposure: no player in more than maxPlayerExposure of (top) cards
  const allCards = [...ppCards, ...(udResult?.udCards?.map((x) => x.card) ?? [])];
  const totalCards = allCards.length;
  const playerCounts = new Map<string, number>();
  for (const c of allCards) {
    for (const { pick } of c.legs) {
      playerCounts.set(pick.player, (playerCounts.get(pick.player) ?? 0) + 1);
    }
  }
  const cap = maxPlayerExposure * totalCards;
  const overExposed = [...playerCounts.entries()].filter(([, n]) => n > cap);
  if (overExposed.length > 0) {
    console.log(`Player exposure: ⚠ ${overExposed.length} player(s) above ${(maxPlayerExposure * 100).toFixed(0)}% cap (${cap.toFixed(0)} cards):`);
    overExposed.slice(0, 5).forEach(([p, n]) => console.log(`  ${p}: ${n} cards`));
  } else {
    console.log(`Player exposure: ✓ all players ≤ ${(maxPlayerExposure * 100).toFixed(0)}% (${cap.toFixed(0)} cards)`);
  }
  // Kelly preview: stakes ~0.1–0.5% of bankroll per parlay; total bankroll
  const kellyMinPct = 0.001;
  const kellyMaxPct = 0.005;
  const kellyMinStake = bankroll * kellyMinPct;
  const kellyMaxStake = bankroll * kellyMaxPct;
  console.log(`Bankroll: $${bankroll} ✓`);
  console.log(`Kelly preview: stakes ~0.1–0.5% of bankroll ($${kellyMinStake.toFixed(2)}–$${kellyMaxStake.toFixed(2)}/parlay) | Total bankroll: $${bankroll}`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

/** Write artifacts/last_run.json with bankroll + run/odds meta for sheets_push.py (single source + meta block). */
function writeLastRunJson(
  bankroll: number,
  runTimestamp: string,
  snapshot: OddsSnapshot | null
): void {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");
  const runId = runTimestamp + (snapshot ? `-${snapshot.snapshotId.slice(0, 8)}` : "");
  const payload = {
    flow: "nba_optimizer",
    status: "success",
    ts,
    bankroll,
    runId,
    lastUpdatedET: runTimestamp,
    oddsSnapshotId: snapshot?.snapshotId ?? "",
    oddsFetchedAtET: snapshot ? utcIsoToEasternString(snapshot.fetchedAtUtc) : "",
    oddsAgeMinutes: snapshot?.ageMinutes ?? 0,
    oddsRefreshMode: snapshot?.refreshMode ?? "",
    includeAltLines: snapshot?.includeAltLines ?? false,
  };
  fs.writeFileSync(path.join(artifactsDir, "last_run.json"), JSON.stringify(payload, null, 2), "utf8");
  
  // Write to both paths — website reads data/last_fresh_run.json
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "last_fresh_run.json"), JSON.stringify(payload, null, 2), "utf8");
}

/** Pipeline lock: row 1 = headers only, data row 2, no dashboard on Cards, no legacy legs push. */
const DATA_ROW_START = 2;
const SORT_PARLAY_BY = "card_id";

function runSheetsPush(runTimestamp: string, cli: CliArgs): number {
  const bankroll = cli.bankroll;
  const snapshot = OddsSnapshotManager.getCurrentSnapshot();
  writeLastRunJson(bankroll, runTimestamp, snapshot);

  // AUTO vs MANUAL audit (always log)
  console.log("=== RUN MODE COMPARE ===");
  console.log("Trigger:", process.argv.join(" "));
  console.log("Auto env:", !!process.env.AUTO_RUN);

  if (cli.noSheets) {
    console.log("[Sheets] --no-sheets: skipping Sheets push. Import CSVs manually.");
    console.log("Sheets calls:", { setup_9tab: 0, push_cards: 0, legacy_legs: 0, row_start: DATA_ROW_START });
    console.log("Sort key:", SORT_PARLAY_BY);
    return 0;
  }

  const cwd = process.cwd();
  const env = { ...process.env, BANKROLL: String(bankroll), PYTHONIOENCODING: "utf-8" };
  const opts = { cwd, env, stdio: "inherit" as const, shell: true };

  // 1. sheets_setup_9tab.py — Row 1 headers only, Dashboard tab isolated
  const setupResult = spawnSync("python", ["sheets_setup_9tab.py"], opts);
  const setup_called = 1;
  if (setupResult.status !== 0) {
    console.warn("[Sheets] sheets_setup_9tab.py exited with code", setupResult.status);
  }

  // 2. sheets_push_cards.py — A2:W data only (no legacy pushes)
  const cardsResult = spawnSync("python", ["sheets_push_cards.py"], opts);
  const push_cards_called = 1;
  let legacy_legs_called = 0;
  
  if (cardsResult.status !== 0) {
    console.warn("[Sheets] sheets_push_cards.py exited with code", cardsResult.status);
    if (cli.telegram) {
      sendTelegramAlert(`Sheets cards push failed (exit ${cardsResult.status}). Check logs.`).catch(() => {});
    }
    // Still try to push legs even if cards failed
  }

  // 3. sheets_push_legs.py — Legs tab (unconditional push)
  console.log("[Sheets] Pushing legs to Legs tab...");
  const legsResult = spawnSync("python", ["sheets_push_legs.py"], opts);
  legacy_legs_called = 1;
  
  if (legsResult.status !== 0) {
    console.warn("[Sheets] sheets_push_legs.py exited with code", legsResult.status);
    if (cli.telegram) {
      sendTelegramAlert(`Sheets legs push failed (exit ${legsResult.status}). Check logs.`).catch(() => {});
    }
  }

  console.log("Sheets calls:", { setup_9tab: setup_called, push_cards: push_cards_called, legacy_legs: legacy_legs_called, row_start: DATA_ROW_START });
  console.log("Sort key:", SORT_PARLAY_BY);
  console.log("[Sheets] 11-tab system: Cards A2:W (23 cols), CardKelly$ W, DeepLink T=LegID only, Dashboard A11:B14 Edge B., Legs A2:O (unconditional).");
  
  // Return non-zero if either script failed
  if (cardsResult.status !== 0) return cardsResult.status ?? -1;
  if (legsResult.status !== 0) return legsResult.status ?? -1;
  return 0;
}

run().catch((err) => {
  console.error("run_optimizer failed:", err);
  const cwd = process.cwd();
  const cardEvFloor = Number(process.env.MIN_CARD_EV ?? 0.008);
  const optimizerEdgeQuality = tryWriteOptimizerEdgeQualityAuditFromRunParts(cwd, {
    ppExportCards: [],
    udExportCards: [],
    ppCandidatePoolCount: null,
    udCandidatePoolCount: null,
    cardEvFloor,
  });
  finalizeCanonicalRunStatus({
    rootDir: cwd,
    generatedAtUtc: new Date().toISOString(),
    runTimestamp: runContextTimestampEt,
    success: false,
    outcome: "fatal_exit",
    runHealth: "hard_failure",
    fatalReason: FATAL_REASON.uncaught_run_error,
    ppCards: [],
    ppPicksCount: null,
    udCards: [],
    udPicksCount: null,
    digest: { generated: false, shownCount: null, dedupedCount: null },
    liveMergeInput: readLiveMergeInputForRunStatus(cwd),
    optimizerEdgeQuality: optimizerEdgeQuality ?? undefined,
    notes: ["Telegram high-EV digest is not persisted as a file (chat-only)."],
    degradationReasons: [
      "fatal:uncaught_run_error",
      `exception:${err instanceof Error ? err.message : String(err)}`,
    ],
    expectedArtifacts: {},
  });
  process.exit(1);
});
