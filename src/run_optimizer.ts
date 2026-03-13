// src/run_optimizer.ts

/* eslint-disable no-console */

// Load .env from absolute project root first (before any module that reads process.env).
import "./load_env";
import { ensureEnvLoaded } from "./load_env";

import path from "path";
import {
  getOutputPath,
  getOutputDir,
  getArtifactsPath,
  getDataPath,
  PP_LEGS_CSV,
  PP_CARDS_CSV,
  UD_LEGS_CSV,
  UD_LEGS_JSON,
  UD_CARDS_CSV,
  PP_LEGS_JSON,
  PP_CARDS_JSON,
  PP_INNOVATIVE_CSV,
  EDGE_CLUSTERS_JSON,
  STAT_BALANCE_RADAR_SVG,
  LAST_RUN_JSON,
  TOP_LEGS_JSON,
  PARLAYS_CSV,
  ARTIFACTS_DIR,
  DATA_DIR,
  OUTPUT_DIR,
} from "./constants/paths";

// Path-neutral initialization: use same project root as env loader (works for both src/ and dist/src/).
const _projectRoot = ensureEnvLoaded();
process.chdir(_projectRoot);
console.log("Process working directory set to:", process.cwd());

import fs from "fs";
import { spawnSync } from "child_process";

import { fetchPrizePicksRawProps } from "./fetch_props";
import { mergeOddsWithProps, mergeOddsWithPropsWithMetadata, mergeWithSnapshot, OddsSourceMetadata, SnapshotAudit } from "./merge_odds";
import { OddsSnapshotManager } from "./odds/odds_snapshot_manager";
import { OddsSnapshot, formatSnapshotLogLine } from "./odds/odds_snapshot";
import {
  fetchOddsAPIProps,
  DEFAULT_MARKETS,
  REQUIRED_MARKETS,
  getOddsApiAuditUrl,
  toOddsApiSportKey,
} from "./fetch_oddsapi_props";
import { calculateOversEV, writeOversEVReport } from "./calculate_overs_delta_ev";
import { writePrizePicksImportedCsv } from "./export_imported_csv";
import { calculateEvForMergedPicks } from "./calculate_ev";
import { evaluateFlexCard } from "./card_ev";
import { CardEvResult, EvPick, FlexType } from "./types";
import { runFantasyAnalyzer } from "./fantasy_analyzer";
import { parseArgs, cliArgs } from "./cli_args";
import { runUnderdogOptimizer } from "./run_underdog_optimizer";
import { createSyntheticEvPicks } from "./mock_legs";
import { buildInnovativeCards, writeInnovativeCardsCsv, writeTieredCsvs } from "./build_innovative_cards";
import { buildAndWriteTierOneParlays } from "./services/parlay_service";
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
import {
  computeBucketCalibrations,
  getCalibration,
  adjustedEV,
} from "./calibrate_leg_ev";
import { loadStructureCalibrations } from "./historical/calibration_store";
import { loadPlayerTrends } from "./historical/trend_analyzer";
import {
  applyPipelineToLegs,
  mergePipelineAdjustments,
} from "./ev/leg_ev_pipeline";
import { applyOppAdjust } from "./matchups/opp_adjust";
import { applyCorrelationAdjustments } from "./stats/correlation_matrix";
import { ppEngine } from "./pp_engine";
import { udEngine } from "./ud_engine";
import { breakEvenProbLabel } from "./engine_contracts";
import { isFeatureEnabled } from "./constants/featureFlags";
import { getBreakevenForStructure, BREAKEVEN_TABLE_ROWS } from "./config/binomial_breakeven";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";
import { computeBestBetScore } from "./best_bets_score";
import { printTopStructuresTable } from "./best_ev_engine";

type CrashStats = {
  oddsRows: number;
  mergedLegs: number;
  evLegs: number;
  ppRawProps: number;
};

const crashStats: CrashStats = {
  oddsRows: 0,
  mergedLegs: 0,
  evLegs: 0,
  ppRawProps: 0,
};

// --------- [CONFIG CHECK] Pre-flight diagnostic (run early) ---------
function getEffectiveOddsApiKey(): string {
  return (cliArgs.apiKey ?? process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY ?? "").trim();
}

function logConfigCheck(): void {
  const rawKey = getEffectiveOddsApiKey();
  const keyLen = typeof rawKey === "string" ? rawKey.trim().length : 0;
  const keyMask = keyLen >= 4
    ? `${String(rawKey).trim().slice(0, 2)}${"*".repeat(Math.min(keyLen - 4, 20))}${String(rawKey).trim().slice(-2)}`
    : keyLen > 0 ? "(invalid/too short)" : "(empty)";
  const useMockEnv = process.env.USE_MOCK_ODDS === "1" || process.env.USE_MOCK_ODDS === "true";
  const outDir = path.join(process.cwd(), OUTPUT_DIR);
  const primarySport = cliArgs.sports?.[0] ?? "NBA";
  const oddsApiSport = toOddsApiSportKey(primarySport);
  const marketCount = cliArgs.includeAltLines ? REQUIRED_MARKETS.length * 2 : REQUIRED_MARKETS.length;
  console.log("[CONFIG CHECK]");
  console.log(`  ODDSAPI_KEY: length=${keyLen} mask=${keyMask}`);
  console.log(`  USE_MOCK_ODDS: ${useMockEnv ? "1 (mock/dry-run)" : "unset (live)"}`);
  console.log(`  OUTPUT_DIR: ${outDir}`);
  console.log(`  Sports requested: ${cliArgs.sports.join(",")}`);
  console.log(`  Markets requested: ${marketCount} (${REQUIRED_MARKETS.map((m) => m.key).join(",")}${cliArgs.includeAltLines ? " + alternates" : ""})`);
  console.log(`  Odds API endpoint (masked): ${getOddsApiAuditUrl(keyMask, oddsApiSport, cliArgs.includeAltLines)}`);
  console.log("[CONFIG CHECK] end");
}

/** Cooldown: if last run was < 45 min ago and had 0 tier1 + 0 tier2, skip fetch to save tokens. */
function checkRecentRunStatus(): { shouldSkip: boolean } {
  const lastRunPath = getArtifactsPath(LAST_RUN_JSON);
  try {
    if (!fs.existsSync(lastRunPath)) return { shouldSkip: false };
    const raw = fs.readFileSync(lastRunPath, "utf8");
    const data = JSON.parse(raw) as { ts?: string; status?: string; metrics?: { tier1?: number; tier2?: number } };
    const ts = data?.ts;
    const metrics = data?.metrics;
    const tier1 = metrics?.tier1 ?? 0;
    const tier2 = metrics?.tier2 ?? 0;
    if (!ts || (tier1 + tier2) > 0) return { shouldSkip: false };
    const match = ts.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (!match) return { shouldSkip: false };
    const [, y, mo, d, h, mi, s] = match;
    const lastRunTime = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
    const ageMs = Date.now() - lastRunTime;
    const cooldownMs = 45 * 60 * 1000;
    if (ageMs < cooldownMs) return { shouldSkip: true };
    return { shouldSkip: false };
  } catch {
    return { shouldSkip: false };
  }
}

// Fail-fast: require .env at project root and ODDSAPI_KEY before any business logic. No silent mock default.
const _envPath = path.join(_projectRoot, ".env");
if (!fs.existsSync(_envPath)) {
  console.error(`[CONFIG] .env file not found at ${_envPath}. Create .env at project root with ODDSAPI_KEY=...`);
  process.exit(1);
}

// CLI --api-key overrides env so one source is used everywhere.
if (cliArgs.apiKey) {
  process.env.ODDSAPI_KEY = cliArgs.apiKey;
}

const _effectiveKey = getEffectiveOddsApiKey();
if (!_effectiveKey || _effectiveKey.length === 0) {
  console.error("[CONFIG] ODDSAPI_KEY is missing or empty. Set ODDSAPI_KEY in .env at project root or pass --api-key. Pipeline will not run without live odds.");
  process.exit(1);
}
if (_effectiveKey.length < 8) {
  console.error("[CONFIG] ODDSAPI_KEY is too short or invalid. Use a valid key from the-odds-api.com.");
  process.exit(1);
}

logConfigCheck();

// TEMPORARY: Clear cache to debug EV engine issues
resetPerformanceCounters();
console.log(" Cache cleared - starting fresh");

// --------- Tuning knobs ---------
// Defaults can be overridden at runtime via --min-edge / --min-ev CLI flags.

// Minimum edge per leg (fraction, e.g. 0.015 = +1.5% edge)
const MIN_EDGE_PER_LEG = cliArgs.minEdge ?? (cliArgs.volume ? 0.004 : 0.015);

// Minimum leg EV filter (aggressive performance optimization)
const MIN_LEG_EV = cliArgs.minEv ?? (cliArgs.volume ? 0.004 : 0.020);

// At most N legs per player per card
const MAX_LEGS_PER_PLAYER = cliArgs.volume ? 2 : 1;

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
 * Data-driven thresholds from scripts/analyze_thresholds.ts (OddsAPI legs, 2026-02-07):
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
function getMinEvForFlexType(_flexType: FlexType): number {
  return cliArgs.minCardEv ?? (cliArgs.volume ? 0.005 : 0.015);
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

// ---- Correlation helpers for card construction ----

// Correlation caps per card
const MAX_LEGS_PER_TEAM_PER_CARD = 3;
const MAX_LEGS_PER_GAME_PER_CARD = 4;

function getGameKey(leg: EvPick): string {
  const t = leg.team ?? "";
  const o = leg.opponent ?? "";
  return [t, o].sort().join("_vs_");
}

function isCardWithinCorrelationLimits(window: EvPick[]): boolean {
  const teamCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();

  for (const leg of window) {
    const team = leg.team ?? "";
    const gameKey = getGameKey(leg);

    if (team) {
      const c = teamCounts.get(team) ?? 0;
      if (c + 1 > MAX_LEGS_PER_TEAM_PER_CARD) return false;
      teamCounts.set(team, c + 1);
    }

    if (gameKey) {
      const g = gameCounts.get(gameKey) ?? 0;
      if (g + 1 > MAX_LEGS_PER_GAME_PER_CARD) return false;
      gameCounts.set(gameKey, g + 1);
    }
  }

  return true;
}

// Correlation penalty: same player on multiple legs reduces effective EV
const CORRELATION_PENALTY_PER_DUPLICATE = 0.95;

function applyCorrelationPenalty(result: CardEvResult): CardEvResult {
  const playerCounts = new Map<string, number>();
  for (const { pick } of result.legs) {
    playerCounts.set(pick.player, (playerCounts.get(pick.player) ?? 0) + 1);
  }
  let extraLegsFromSamePlayer = 0;
  for (const count of playerCounts.values()) {
    if (count > 1) extraLegsFromSamePlayer += count - 1;
  }
  const factor =
    extraLegsFromSamePlayer === 0
      ? 1
      : Math.pow(CORRELATION_PENALTY_PER_DUPLICATE, extraLegsFromSamePlayer);

  const cardEvAdjusted = result.cardEv * factor;
  const totalReturnAdjusted = (cardEvAdjusted + 1) * result.stake;

  return {
    ...result,
    cardEv: cardEvAdjusted,
    expectedValue: cardEvAdjusted,
    totalReturn: totalReturnAdjusted,
  };
}

// ---- EV-based card construction ----

const MAX_LEGS_POOL = 30; // how many top legs to consider
const MAX_CARD_BUILD_TRIES = 3000; // how many attempts per size

async function buildCardsForSize(
  legs: EvPick[],
  size: number,
  flexType: FlexType,
  feasibilityData?: FlexFeasibilityData
): Promise<CardEvResult[]> {
  const structureBE = getBreakevenThreshold(flexType);
  const minEdge = cliArgs.minEdge ?? 0.015;
  const volumeMode = !!cliArgs.volume;
  const pool = [...legs]
    .filter((leg) => volumeMode
      ? leg.trueProb > 0.50   // volume: any edge > 0; card-level EV check handles the rest
      : leg.trueProb >= structureBE + minEdge)
    .sort((a, b) => b.edge - a.edge)
    .slice(0, MAX_LEGS_POOL);

  let maxAttempts = MAX_CARD_BUILD_TRIES;
  const targetCards = TARGET_ACCEPTED_CARDS[flexType] || 3;
  maxAttempts = getMaxAttemptsForStructure({
    structureSize: size as 2 | 3 | 4 | 5 | 6,
    viableLegCount: pool.length,
    targetAcceptedCards: targetCards,
    globalMaxAttempts: MAX_CARD_BUILD_TRIES
  });

  if (maxAttempts === 0) return [];

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
      if (!isCardWithinCorrelationLimits(prospective)) continue;
      chosen.push(leg);
      usedPlayers.add(leg.player);
    }

    if (chosen.length !== size) { failedCardBuilds++; continue; }
    successfulCardBuilds++;

    const playerIds = chosen.map((p) => p.player);
    if (new Set(playerIds).size !== playerIds.length) continue;

    const cardLegs = chosen.map((pick) => ({ pick, side: "over" as const }));

    // Feasibility pruning
    if (feasibilityData) {
      const threshold = getMinEvForFlexType(flexType);
      const currentLegEvs = chosen.map(leg => leg.legEv);
      const upperBound = getBestCaseFlexEvUpperBound({
        structureSize: size as 5 | 6,
        currentLegEvs,
        allLegEvsSortedDesc: feasibilityData.allLegEvsSortedDesc,
        structureThresholdEv: threshold
      });
      if (upperBound < threshold) { prunedCandidates++; feasibilityPruned++; continue; }
    }

    const rawResult = await evaluateFlexCard(flexType, cardLegs, 1);
    evCallsMade++;
    if (!rawResult) { evRejected++; continue; }
    const result = applyCorrelationPenalty(rawResult);

    if (!Number.isFinite(result.cardEv)) continue;
    if (result.cardEv < getMinEvForFlexType(flexType)) continue;

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

  // Deduplicate by leg IDs (unordered)
  const bestByKey = new Map<string, CardEvResult>();
  for (const c of candidates) {
    const key = c.legs
      .map((l) => l.pick.id)
      .slice()
      .sort()
      .join("|");
    const existing = bestByKey.get(key);
    if (!existing || c.cardEv > existing.cardEv) {
      bestByKey.set(key, c);
    }
  }

  const finalCards = [...bestByKey.values()].sort((a, b) => b.cardEv - a.cardEv);
  
  // Compact summary: one line per structure
  console.log(
    `  ${flexType}: ${finalCards.length} cards | ` +
    `${maxAttempts} attempts ${elapsedMs}ms | ` +
    `evCalls=${evCallsMade} accept=${cardsAccepted} prune=${prunedCandidates} evReject=${evRejected}`
  );

  return finalCards;
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
    "edge",
    "legEv",
    "runTimestamp",
    "gameTime",
    "IsWithin24h",
    "leg_key",
    "leg_label",
    "confidenceDelta",
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
      leg.edge,
      leg.legEv,
      runTimestamp,
      gameTime,
      isWithin24h,
      leg.legKey ?? "",
      leg.legLabel ?? "",
      leg.confidenceDelta != null && Number.isFinite(leg.confidenceDelta) ? leg.confidenceDelta : "",
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

/** Writes cards CSV; columns match what sheets_push_cards.py reads by name (site, flexType, cardEv, leg1Id.., kellyStake, runTimestamp, etc.). Python maps these to the 23-column (A–W) Sheet schema. */
function writeCardsCsv(
  cards: CardEvResult[],
  outPath: string,
  runTimestamp: string
): void {
  // Headers: include Site-Leg, Player-Prop-Line for dashboard + Sheets; confidenceDelta maps to 23-col V/W index
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
    "confidenceDelta",
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

    const cardConfidenceDelta =
      card.legs.length > 0
        ? (() => {
            const deltas = card.legs
              .map((l) => l.pick.confidenceDelta)
              .filter((d): d is number => d != null && Number.isFinite(d));
            if (deltas.length === 0) return "";
            return deltas.reduce((a, b) => a + b, 0) / deltas.length;
          })()
        : "";

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
      cardConfidenceDelta,
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

function logCardVolumeDiagnostics(cards: CardEvResult[]): void {
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
    const threshold = getMinEvForFlexType(stat.structure as FlexType);
    const aboveThreshold = byStructure.get(stat.structure)?.filter(c => c.cardEv >= threshold).length || 0;
    const pct = stat.total > 0 ? ((aboveThreshold / stat.total) * 100).toFixed(1) : '0.0';
    console.log(`• ${stat.structure}: ${aboveThreshold}/${stat.total} (${pct}%) above threshold`);
  }
}

// ---- Main runner ----

async function run(): Promise<void> {
  // Parse CLI arguments (cliArgs is already parsed at module load time)
  const args = parseArgs();

  if (args.printBestEv) {
    printTopStructuresTable();
    process.exit(0);
  }

  // Build run timestamp — honor --date override so CSV date column is always fresh
  const tsBase = args.date ? new Date(`${args.date}T12:00:00`) : new Date();
  const runTimestamp = toEasternIsoString(tsBase);
  
  // Show help if requested
  if (args.help) {
    const { showHelp } = await import("./cli_args");
    showHelp();
    return;
  }

  // ---- Sheets only: push using last cached CSVs (no fetch/merge/cards) ----
  if (args.sheetsOnly) {
    let ts = runTimestamp;
    const lastRunPath = getArtifactsPath(LAST_RUN_JSON);
    if (fs.existsSync(lastRunPath)) {
      try {
        const last = JSON.parse(fs.readFileSync(lastRunPath, "utf8"));
        if (last.lastUpdatedET) ts = last.lastUpdatedET;
      } catch (_) { /* use current runTimestamp */ }
    }
    console.log("[Sheets] --sheets-only: pushing from last cached data (no odds fetch or card build).");
    const code = runSheetsPush(ts);
    process.exit(code !== 0 ? code : 0);
    return;
  }

  const platform = args.platform;
  console.log(`Bankroll: ${cliArgs.bankroll}`);

  // ---- UD-only: run Underdog optimizer and exit ----
  if (platform === "ud") {
    await runUnderdogOptimizer();
    return;
  }

  // ---- Both: run PP first, then UD ----
  if (platform === "both") {
    console.log("[Unified] Platform: both — running PrizePicks then Underdog.\n");
  }

  // Ensure pipeline output directory exists (centralized paths)
  const outDir = getOutputDir();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Reset performance counters for this run
  resetPerformanceCounters();

  // Diagnostic: log optimizer block entry (helps diagnose "optimizer" failure in PROJECT_STATE)
  const hasOddsKey = !!(process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY);
  const useMockOddsEnv = process.env.USE_MOCK_ODDS === "1" || process.env.USE_MOCK_ODDS === "true";
  const effectiveMockLegs = args.mockLegs ?? (useMockOddsEnv ? 50 : null);
  console.log(
    "[OPTIMIZER] Block start: platform=%s, mockLegs=%s, USE_MOCK_ODDS=%s, ODDSAPI_KEY set=%s",
    platform,
    effectiveMockLegs ?? "none",
    process.env.USE_MOCK_ODDS ?? "unset",
    hasOddsKey
  );

  // ── Pre-run: slate-dead cooldown (skip fetch if recent run had 0 tier1/tier2) ──────────────────
  if (!args.sheetsOnly && (effectiveMockLegs == null || effectiveMockLegs === 0)) {
    const cooldown = checkRecentRunStatus();
    if (cooldown.shouldSkip && !args.forceFetch) {
      console.warn("[SLATE DEAD] Skipping fetch to save tokens. Last run was < 45 min ago with zero Tier 1 or Tier 2 picks. Try again later, or use --force-fetch to override.");
      process.exit(0);
    }
  }

  // ── Odds Snapshot: single canonical clock for this run ──────────────────
  // Full Odds API props (single canonical odds source).
  const oddsFetchFn = async (sportsForFetch: import("./types").Sport[], opts: { forceRefresh: boolean }) => {
    console.log("[FETCH_ODDS] Using The Odds API (fetchOddsAPIProps)");
    const uniqueSports = [...new Set((sportsForFetch.length > 0 ? sportsForFetch : ["NBA"]).map((s) => String(s).toUpperCase()))];
    const allRows: import("./types").PlayerPropOdds[] = [];
    for (const sportCode of uniqueSports) {
      const sportKey = toOddsApiSportKey(sportCode);
      console.log(`[FETCH_ODDS] sport=${sportCode} -> ${sportKey}`);
      const rows = await fetchOddsAPIProps({
        apiKey: process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY,
        sport: sportKey,
        markets: DEFAULT_MARKETS,
        includeAlternativeLines: args.includeAltLines,
        forceRefresh: opts.forceRefresh,
      });
      allRows.push(...rows);
    }
    return allRows;
  };

  OddsSnapshotManager.configure({
    fetchFn: oddsFetchFn,
    sports: args.sports,
    includeAltLines: args.includeAltLines,
    refreshMode: args.oddsRefresh,
    oddsMaxAgeMin: args.oddsMaxAgeMin,
  });

  let merged: import("./types").MergedPick[];
  let withEv: EvPick[];
  let result: { metadata: { isFromCache: boolean; fetchedAt?: string; originalProvider?: string; providerUsed?: string } };
  let oddsSnapshot: OddsSnapshot | null = null;

  if (effectiveMockLegs != null && effectiveMockLegs > 0) {
    console.log(`[Mock] Injecting ${effectiveMockLegs} synthetic legs (trueProb 0.55–0.65, EV 2–6%). Use --mock-legs N or USE_MOCK_ODDS=1 for dry-test without live API.`);
    merged = [];
    withEv = createSyntheticEvPicks(effectiveMockLegs, "prizepicks");
    result = {
      metadata: { isFromCache: true, originalProvider: "mock", providerUsed: "mock" },
    };
    crashStats.oddsRows = 0;
    crashStats.ppRawProps = 0;
    crashStats.mergedLegs = withEv.length;
    crashStats.evLegs = withEv.length;
    console.log("Ev picks:", withEv.length);
    console.log("Odds source: mock (synthetic legs)");
  } else {
    // Resolve snapshot ONCE — both PP and UD will use this same instance. LIVE ONLY — no mocks.
    oddsSnapshot = await OddsSnapshotManager.getSnapshot();
    crashStats.oddsRows = oddsSnapshot.rows.length;
    if (oddsSnapshot.rows.length === 0) {
      console.error("[FATAL] No live odds—check ODDSAPI_KEY in .env and API quota. Run: npx ts-node src/fetchOddsApi.ts");
      process.exit(1);
    }
    // Normalize to supported union: only "OddsAPI" | "none"
    const supportedSource: "OddsAPI" | "none" = oddsSnapshot.source === "OddsAPI" ? "OddsAPI" : "none";
    const snapshotMeta: OddsSourceMetadata = {
      isFromCache: oddsSnapshot.refreshMode === "cache",
      providerUsed: supportedSource,
      fetchedAt: oddsSnapshot.fetchedAtUtc,
      originalProvider: supportedSource === "OddsAPI" ? "OddsAPI" : undefined,
    };

    const raw = await fetchPrizePicksRawProps(args.sports);
    console.log("Raw PrizePicks props:", raw.length);
    crashStats.ppRawProps = raw.length;
    writePrizePicksImportedCsv(raw);

    const snapshotAudit: SnapshotAudit = {
      oddsSnapshotId: oddsSnapshot.snapshotId,
      oddsFetchedAtUtc: oddsSnapshot.fetchedAtUtc,
      oddsAgeMinutes: oddsSnapshot.ageMinutes,
      oddsRefreshMode: oddsSnapshot.refreshMode,
      oddsSource: oddsSnapshot.source,
      oddsIncludesAltLines: oddsSnapshot.includeAltLines,
    };
    const mergeResult = await mergeWithSnapshot(raw, oddsSnapshot.rows, snapshotMeta, snapshotAudit);
    merged = mergeResult.odds;
    result = mergeResult;
    crashStats.mergedLegs = merged.length;
    console.log("Merged picks:", merged.length);
    console.log(`Odds source: ${oddsSnapshot.source} (${oddsSnapshot.refreshMode}), snapshot=${oddsSnapshot.snapshotId}, age=${oddsSnapshot.ageMinutes.toFixed(1)}m`);

    if (!cliArgs.noGuardrails) {
      if (oddsSnapshot.ageMinutes > GUARDRAIL_ODDS_MAX_AGE_MINUTES) {
        console.error(`[GUARDRAIL] FATAL: Odds are ${oddsSnapshot.ageMinutes.toFixed(0)}m old (max ${GUARDRAIL_ODDS_MAX_AGE_MINUTES}m). Refusing to ship. Use --no-guardrails to override.`);
        process.exit(1);
      }
      const ppStats = mergeResult.platformStats?.prizepicks;
      if (ppStats && ppStats.rawProps > 0) {
        const mergedCount = ppStats.mergedExact + ppStats.mergedNearest;
        const ratio = mergedCount / ppStats.rawProps;
        if (ratio < GUARDRAIL_PP_MERGE_MIN_RATIO) {
          console.error(`[GUARDRAIL] FATAL: PP merge ratio ${(ratio * 100).toFixed(1)}% below ${(GUARDRAIL_PP_MERGE_MIN_RATIO * 100)}%. Refusing to ship. Use --no-guardrails to override.`);
          process.exit(1);
        }
      }
    }

    try {
      if (oddsSnapshot.rows.length > 0) {
        const deltaLegs = calculateOversEV(merged, oddsSnapshot.rows);
        writeOversEVReport(deltaLegs);
      } else {
        console.log("[Overs Delta EV] No odds snapshot rows — skipping delta report.");
      }
    } catch (err) {
      console.warn("[Overs Delta EV] Skipped (error):", (err as Error).message);
    }

    console.log(`[DEBUG] Merged: ${merged?.length ?? 0}`);
    try {
      withEv = await calculateEvForMergedPicks(merged);
      crashStats.evLegs = withEv.length;
      console.log(`[DEBUG] EV calc: ${withEv?.length ?? 0}`);
    } catch (e) {
      console.error("[CRASH] EV calc failed:", e);
      withEv = [];
      crashStats.evLegs = 0;
    }
    if (withEv.length < 10 && cliArgs.volume) {
      console.warn("[LIVE] Volume mode: only " + withEv.length + " legs after EV (no mock inject—live only).");
    }
    console.log("Ev picks:", withEv.length);
  }

  console.log("---- EV-based filtering ----");

  // 1) Filter by minimum edge per leg
  const legsAfterEdge = withEv.filter((leg) => leg.edge >= MIN_EDGE_PER_LEG);

  // 2) Filter by minimum leg EV (aggressive performance optimization)
  let legsAfterEvFilter = legsAfterEdge.filter((leg) => leg.legEv >= MIN_LEG_EV);

  // 2b) Calibration: apply hist mult + under bias; set adjEv when bucket has min legs
  const EV_ADJ_THRESH = cliArgs.volume ? 0.004 : 0.03;
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
    console.log(`  Calibration: ${legsWithCalibration} legs with hist bucket (${calibrations.length} buckets)`);
  }

  // 2c) Phase 6: structure-level calibration + player trend pipeline
  //     Runs silently when no data; enriches adjEv when structure data exists.
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

  // 2d) Phase 8: opponent defensive adjustment
  if (cliArgs.oppAdjust && !cliArgs.noTweaks) {
    let oppAdjCount = 0;
    for (const leg of legsAfterEvFilter) {
      const { adjProb, detail } = applyOppAdjust(leg.trueProb, leg.opponent, leg.stat);
      if (detail) {
        const oldProb = leg.trueProb;
        leg.trueProb = adjProb;
        leg.edge = adjProb - 0.5;
        leg.legEv = leg.edge;
        oppAdjCount++;
        if (cliArgs.debug && oppAdjCount <= 5) {
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

  // 2e) Phase 8: stat correlation coherence (combo stats vs components)
  if (cliArgs.corrAdjust && !cliArgs.noTweaks) {
    const { adjustedCount, adjustments } = applyCorrelationAdjustments(
      legsAfterEvFilter,
      cliArgs.debug
    );
    if (adjustedCount > 0) {
      console.log(`  Phase 8 Corr Adjust: ${adjustedCount} combo-stat legs adjusted for component coherence`);
    }
  }

  const effectiveEv = (l: EvPick) => l.adjEv ?? l.legEv;
  legsAfterEvFilter = legsAfterEvFilter.filter((l) => effectiveEv(l) >= EV_ADJ_THRESH);
  console.log(
    `Legs after edge filter (>= ${MIN_EDGE_PER_LEG}): ${legsAfterEdge.length} of ${withEv.length}`
  );
  console.log(
    `Legs after EV filter (>= ${(MIN_LEG_EV * 100).toFixed(1)}% raw, then adjEV >= ${(EV_ADJ_THRESH * 100).toFixed(0)}%): ${legsAfterEvFilter.length} of ${legsAfterEdge.length}`
  );

  // 3) Enforce max legs per player global across all cards
  const counts = new Map<string, number>();
  const filtered: EvPick[] = legsAfterEvFilter.filter((leg) => {
    const key = leg.player;
    const count = counts.get(key) ?? 0;
    if (count + 1 > MAX_LEGS_PER_PLAYER) return false;
    counts.set(key, count + 1);
    return true;
  });

  console.log(
    `Legs after player cap (<= ${MAX_LEGS_PER_PLAYER} per player): ${filtered.length} of ${legsAfterEvFilter.length}`
  );

  if (!cliArgs.noGuardrails && filtered.length === 0) {
    const ppLegsPath = getOutputPath(PP_LEGS_CSV);
    const ppCardsPath = getOutputPath(PP_CARDS_CSV);
    writeLegsCsv([], ppLegsPath, runTimestamp);
    writeCardsCsv([], ppCardsPath, runTimestamp);
    console.log("Wrote empty prizepicks-legs.csv and prizepicks-cards.csv");
    writeTopLegsJson([], getOutputPath(UD_LEGS_JSON));
    console.error("[GUARDRAIL] FATAL: No +EV legs. Refusing to ship. Use --no-guardrails to override.");
    process.exit(1);
  }

  // Engine contract: log PP thresholds for audit
  const ppThresholds = ppEngine.getThresholds();
  console.log(`[PP Engine] ${breakEvenProbLabel("pp")} | minEdge=${ppThresholds.minEdge} minLegEv=${ppThresholds.minLegEv}`);

  // ---- Early exit if too few legs remain (PP only; UD still runs when platform is both or --force-ud) ----
  const minLegsNeeded = 6;
  if (filtered.length < minLegsNeeded) {
    console.log(`❌ Too few PP legs after filtering: ${filtered.length} legs (need at least ${minLegsNeeded})`);
    console.log(`   Consider: --volume (0.4% thresholds) or lower MIN_LEG_EV from ${(MIN_LEG_EV * 100).toFixed(1)}%`);
    const ppLegsPath = getOutputPath(PP_LEGS_CSV);
    const ppCardsPath = getOutputPath(PP_CARDS_CSV);
    writeLegsCsv(filtered, ppLegsPath, runTimestamp);
    writeCardsCsv([], ppCardsPath, runTimestamp);
    console.log(`Wrote prizepicks-legs.csv (${filtered.length} rows) and prizepicks-cards.csv (0 rows)`);
    const earlySorted = [...filtered].sort((a, b) => (b.adjEv ?? b.legEv) - (a.adjEv ?? a.legEv));
    writeTopLegsJson(earlySorted, getOutputPath(UD_LEGS_JSON));
    if (platform === "both" || cliArgs.forceUd) {
      console.log("\n[Unified] Running Underdog optimizer (PP early exit / --force-ud)...\n");
      await runUnderdogOptimizer();
      console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
      runSheetsPush(runTimestamp);
      if (cliArgs.telegram) {
        const udCsvPath = getOutputPath(UD_CARDS_CSV);
        await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), cliArgs.bankroll);
      }
    }
    return;
  }

  // ---- Persist filtered legs to JSON ----

  // Sort legs by effective EV (adjEv ?? legEv) descending for consistent ordering
  const sortedLegs = [...filtered].sort((a, b) => {
    const evA = effectiveEv(a);
    const evB = effectiveEv(b);
    if (evB !== evA) return evB - evA;
    return a.id.localeCompare(b.id);
  });

  // Build a plain JSON-serializable array (no undefined/circular refs) so output parses reliably
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
    edge: leg.edge,
    legEv: leg.legEv,
    adjEv: leg.adjEv ?? null,
    book: leg.book ?? null,
    overOdds: leg.overOdds ?? null,
    underOdds: leg.underOdds ?? null,
    outcome: leg.outcome,
    gameId: leg.gameId ?? null,
    startTime: leg.startTime ?? null,
  }));
  const legsOutPath = getOutputPath(PP_LEGS_JSON);
  try {
    JSON.parse(JSON.stringify(legsData)); // validate serializable
    fs.writeFileSync(legsOutPath, JSON.stringify(legsData, null, 2), "utf8");
    console.log(`✅ Wrote ${legsData.length} valid legs to prizepicks-legs.json`);
  } catch (e) {
    console.error("❌ JSON validation failed:", e);
    process.exit(1);
  }

  // ---- Also write CSV for Google Sheets ----

  const legsCsvPath = getOutputPath(PP_LEGS_CSV);
  writeLegsCsv(sortedLegs, legsCsvPath, runTimestamp);
  console.log(`Wrote ${sortedLegs.length} legs to ${legsCsvPath}`);

  // ---- Log top EV legs for quick sanity check ----

  const topLegs = sortedLegs.slice(0, 10); // Already sorted by effective EV descending
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

  // ---- Card construction uses filtered legs (EV-based) ----
  // All available PrizePicks slip types (2P–6P Power, 3F–6F Flex). 7F/8F are Underdog-only (run_underdog_optimizer).
  console.log(`\n🔄 Starting card EV evaluation, total legs=${filtered.length}`);

  // Platform-specific prioritization: 5/6-leg Flex first for PP, then Power, then 3/4
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

  // ---- PREFILTER: Check which structures can meet thresholds ----
  const maxLegEv = filtered.length > 0 ? Math.max(...filtered.map(l => effectiveEv(l))) : 0;
  console.log(`📊 Max effective leg EV in this slate: ${maxLegEv >= 0 ? '+' : ''}${(maxLegEv * 100).toFixed(2)}%`);

  // Minimum leg EV requirements relaxed for better slate coverage
  // Per-leg math: 2P needs 2×legEV ≥ 3.5% → legEV ≥ 1.75%, 3P needs 3×legEV ≥ 3.5% → legEV ≥ 1.17%
  // Still maintains quality while allowing more cards on thin slates
  const MIN_LEG_EV_REQUIREMENTS: Record<string, number> = {
    '2P': 0.020, // +2.0% leg EV needed for 2P cards (down from 3.0%)
    '3P': 0.017, // +1.7% leg EV needed for 3P cards (down from 2.5%)
    '3F': 0.017, // +1.7% leg EV needed for 3F cards (down from 2.5%)
    '4P': 0.015, // +1.5% leg EV needed for 4P cards (down from 2.0%)
    '4F': 0.015, // +1.5% leg EV needed for 4F cards (down from 2.0%)
    '5P': 0.013, // +1.3% leg EV needed for 5P cards (down from 1.8%)
    '5F': 0.013, // +1.3% leg EV needed for 5F cards (down from 1.8%)
    '6P': 0.012, // +1.2% leg EV needed for 6P cards (down from 1.5%)
    '6F': 0.012, // +1.2% leg EV needed for 6F cards (down from 1.5%)
  };

  // Only run structures where max leg EV meets the structure's minimum requirement
  const viableStructures = SLIP_BUILD_SPEC.filter(({ flexType }: { flexType: FlexType }) => {
    const requiredLegEv = MIN_LEG_EV_REQUIREMENTS[flexType];
    if (maxLegEv < requiredLegEv) {
      console.log(`⚠️  Skipping structure ${flexType}: max leg EV = ${(maxLegEv * 100).toFixed(2)}% < required ${(requiredLegEv * 100).toFixed(2)}%`);
      return false;
    }
    return true;
  });

  if (viableStructures.length === 0) {
    console.log(`❌ No viable structures for this slate - all structures require higher leg EV than available`);
    console.log(`   Max leg EV: ${(maxLegEv * 100).toFixed(2)}%`);
    console.log(`   Best requirement: ${Math.min(...Object.values(MIN_LEG_EV_REQUIREMENTS)) * 100}%`);
    writeTopLegsJson(sortedLegs, getOutputPath(UD_LEGS_JSON));
    if (platform === "both") {
      console.log("\n[Unified] Running Underdog optimizer...\n");
      await runUnderdogOptimizer();
      console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
      runSheetsPush(runTimestamp);
      if (cliArgs.telegram) {
        const udCsvPath = getOutputPath(UD_CARDS_CSV);
        await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), cliArgs.bankroll);
      }
    }
    return;
  }

  console.log(`✅ Viable structures: [${viableStructures.map((s: { size: number; flexType: FlexType }) => s.flexType).join(', ')}]`);
  console.log(`   Skipped structures: [${SLIP_BUILD_SPEC.filter((s: { size: number; flexType: FlexType }) => !viableStructures.includes(s)).map(s => s.flexType).join(', ')}]`);

  const sortedByEdge = [...filtered].sort((a, b) => b.edge - a.edge);

  // ---- Precompute Flex Feasibility Data ----
  // This data is used to prune unlikely flex cards before expensive EV evaluation
  const feasibilityData = precomputeFlexFeasibilityData(filtered);

  const cardsBeforeEvFilter: CardEvResult[] = [];
  for (const { size, flexType } of viableStructures) {
    // ABORT: Check if EV engine is degraded before starting each structure
    if (isEvEngineDegraded()) {
      console.log(`🚨 EV engine degraded, skipping remaining structures (${flexType} and beyond)`);
      break;
    }
    
    console.log(`🔄 Building cards for ${flexType} (${size}-leg)...`);
    const cards = await buildCardsForSize(sortedByEdge, size, flexType, feasibilityData);
    console.log(`✅ ${flexType}: ${cards.length} +EV cards found`);
    cardsBeforeEvFilter.push(...cards);
  }

  console.log(
    `Cards before EV filter: ${cardsBeforeEvFilter.length} (from ${filtered.length} legs)`
  );

  // ---- Apply per-slip-type EV floors and sort cards ----
  
  // Filter cards using minimum EV thresholds for each slip type
  // This ensures only cards meeting the quality standard for their type are exported
  const filteredCards: CardEvResult[] = cardsBeforeEvFilter.filter(
    (card) => card.cardEv >= getMinEvForFlexType(card.flexType)
  );

  console.log(
    `Cards after EV filter (per-type min): ${filteredCards.length} of ${cardsBeforeEvFilter.length}`
  );

  // ---- SelectionEngine: breakeven filter + anti-dilution (math_models only) ----
  const { filterAndOptimize } = await import("./SelectionEngine");
  const selectionCards = filterAndOptimize(filteredCards, "PP");
  console.log(
    `Cards after SelectionEngine (breakeven + anti-dilution): ${selectionCards.length} of ${filteredCards.length}`
  );

  // Sort filtered cards by EV with WinProbCash as secondary tie-breaker
  // Primary: cardEv descending (highest expected profit per unit staked)
  // Secondary: winProbCash descending (higher win probability for equal EV)
  // Tertiary: deterministic ID-based ordering for consistency
  const sortedCards = [...selectionCards].sort((a, b) => {
    // Primary sort: cardEv descending
    if (b.cardEv !== a.cardEv) {
      return b.cardEv - a.cardEv;
    }
    
    // Secondary sort: winProbCash descending (higher win probability first)
    if (b.winProbCash !== a.winProbCash) {
      return b.winProbCash - a.winProbCash;
    }
    
    // Tertiary sort: deterministic ordering for consistent results
    // Create a stable key from leg IDs for tie-breaking
    const aKey = a.legs.map(l => l.pick.id).sort().join('|');
    const bKey = b.legs.map(l => l.pick.id).sort().join('|');
    return aKey.localeCompare(bKey);
  });

  // ---- Export top cards (capped by --max-export / --max-cards unless --export-uncap; tier1/tier2 always full) ----
  const maxExport = cliArgs.exportUncap
    ? Number.MAX_SAFE_INTEGER
    : (platform === "both" ? cliArgs.maxCards : cliArgs.maxExport);
  const exportCards = sortedCards.slice(0, maxExport);
  if (!cliArgs.exportUncap && sortedCards.length > maxExport) {
    console.log(`Capped export: ${sortedCards.length} total → top ${maxExport} by EV${platform === "both" ? " (--max-cards)" : ""}`);
  }

  const cardsOutPath = getOutputPath(PP_CARDS_JSON);
  fs.writeFileSync(
    cardsOutPath,
    JSON.stringify({ runTimestamp, cards: exportCards }, null, 2),
    "utf8"
  );
  console.log(`Wrote ${exportCards.length} cards to ${cardsOutPath}`);

  const cardsCsvPath = getOutputPath(PP_CARDS_CSV);
  writeCardsCsv(exportCards, cardsCsvPath, runTimestamp);
  console.log(`Wrote ${exportCards.length} cards to ${cardsCsvPath}`);

  // ── Clipboard exporter + Tracker (copy-to-clipboard & pending_cards.json) ─────
  const top3 = exportCards.slice(0, 3);
  if (top3.length > 0) {
    const { generateClipboardString } = await import("./exporter/clipboard_generator");
    const { saveCardsToTracker } = await import("./tracking/tracker_schema");
    console.log("\n════════════════════════════════════════════════════");
    console.log(" COPY-TO-CLIPBOARD (Top 3 cards)");
    console.log("════════════════════════════════════════════════════\n");
    top3.forEach((card) => {
      console.log(generateClipboardString(card));
      console.log("");
    });
    console.log("════════════════════════════════════════════════════\n");
    saveCardsToTracker(exportCards, { platform: "PP", maxCards: 50 });
  }

  // ── Phase 5: Innovative Card Builder + Live Liquidity + Telegram Push ─────
  const useInnovative = isFeatureEnabled("ENABLE_INNOVATIVE_PARLAY") || cliArgs.innovative;
  if (useInnovative) {
    console.log("\n════════════════════════════════════════════════════");
    console.log(" INNOVATIVE CARD BUILDER — EV + Diversity Portfolio");
    if (cliArgs.liveLiq)  console.log(" + LIVE LIQUIDITY");
    if (cliArgs.telegram) console.log(" + TELEGRAM PUSH");
    console.log("════════════════════════════════════════════════════");

    try {
      // --- Phase 5a: Live Liquidity Enrichment ---
      let liveScores: Map<string, number> | undefined;
      if (cliArgs.liveLiq) {
        console.log("\n[Phase5a] Fetching live liquidity...");
        const enriched = await enrichLegsWithLiveLiquidity(
          sortedLegs,
          runTimestamp.slice(0, 10)   // YYYY-MM-DD
        );
        liveScores = new Map(enriched.map(l => [l.id, l._liveLiquidity ?? 0.70]));
        console.log(`[Phase5a] Live liquidity computed for ${liveScores.size} legs`);
      }

      // --- Phase 5b: Build Innovative Portfolio ---
      const { cards: innovCards, clusters } = buildInnovativeCards(sortedLegs, {
        maxCards:        50,
        minCardEV:       cliArgs.minCardEv ?? 0.01,
        maxPlayerCards:  3,
        globalKellyCap:  0.20,
        liveScores,
        bankroll:        cliArgs.bankroll,
        kellyMultiplier: cliArgs.kellyFraction,
        maxBetPerCard:   cliArgs.maxBetPerCard,
      });

      // --- Phase 5c: Write CSV + Edge Clusters + Tiered CSVs ---
      const innovCsvPath    = getOutputPath(PP_INNOVATIVE_CSV);
      const clusterJsonPath = getOutputPath(EDGE_CLUSTERS_JSON);
      writeInnovativeCardsCsv(innovCards, clusters, innovCsvPath, clusterJsonPath, runTimestamp, "PP");
      writeTieredCsvs(innovCards, getOutputDir(), runTimestamp, "PP");

      // --- Phase 5d: Radar Chart SVG ---
      const radarSvgPath = getOutputPath(STAT_BALANCE_RADAR_SVG);
      if (innovCards.length > 0) {
        writeRadarChart(innovCards, radarSvgPath, runTimestamp.slice(0, 10));
      }

      // --- Phase 5e: Telegram Push ---
      if (cliArgs.telegram) {
        await pushTop5ToTelegram(innovCards, clusters, runTimestamp.slice(0, 10), {
          bankroll: cliArgs.bankroll,
          svgPath:   radarSvgPath,
          sendChart: innovCards.length > 0,
        });
      }

      // Summary log
      const totalKelly = innovCards.reduce((s, c) => s + c.kellyFrac, 0);
      const topPlayer = (() => {
        const pc = new Map<string, number>();
        for (const card of innovCards)
          for (const leg of card.legs)
            pc.set(leg.player, (pc.get(leg.player) ?? 0) + 1);
        let max = 0; let top = "";
        for (const [p, n] of pc) if (n > max) { max = n; top = p; }
        return top ? `${top} (${max} cards)` : "—";
      })();
      const statDist = (() => {
        const sd = new Map<string, number>();
        for (const card of innovCards)
          for (const [k, v] of Object.entries(card.statBalance))
            sd.set(k, (sd.get(k) ?? 0) + v);
        return [...sd.entries()].sort((a, b) => b[1] - a[1])
          .map(([s, n]) => `${s}=${n}`).join(" ");
      })();

      const tier1 = innovCards.filter(c => c.tier === 1);
      const tier2 = innovCards.filter(c => c.tier === 2);
      const fragileN = innovCards.filter(c => c.fragile).length;
      const totalStake = innovCards.reduce((s, c) => s + c.kellyStake, 0);
      const tier1LegsUnique = (() => {
        const byId = new Map<string, EvPick>();
        for (const card of tier1) {
          for (const leg of card.legs) {
            if (!byId.has(leg.id)) byId.set(leg.id, leg);
          }
        }
        return [...byId.values()];
      })();
      const parlaysPath = getOutputPath(PARLAYS_CSV);
      const parlayRows = buildAndWriteTierOneParlays(tier1LegsUnique, parlaysPath, runTimestamp);

      console.log(`\n[Innovative] ── Summary ──────────────────────────────────`);
      console.log(`  Cards: ${innovCards.length} | T1: ${tier1.length} | T2: ${tier2.length} | Fragile: ${fragileN}`);
      console.log(`  Kelly total: ${(totalKelly*100).toFixed(1)}% | Total stake: $${totalStake.toFixed(0)} / $${cliArgs.bankroll}`);
      console.log(`  Top player: ${topPlayer}`);
      console.log(`  Stat mix: ${statDist}`);
      console.log(`  Edge clusters: ${clusters.length}`);
      console.log(`  Parlays: ${parlayRows.length} (${parlaysPath})`);
      console.log(`  CSV: ${innovCsvPath}`);
      console.log(`  SVG: ${radarSvgPath}`);
      console.log(`──────────────────────────────────────────────────────────\n`);

    } catch (err) {
      console.error("[Innovative] Phase 5 failed:", (err as Error).message);
      console.error((err as Error).stack);
    }
  }

  // ---- Finalize any pending EV requests ----
  
  await finalizePendingEVRequests();

  // ---- Log performance metrics ----
  
  logPerformanceMetrics();

  // ---- Card volume diagnostics ----
  
  logCardVolumeDiagnostics(sortedCards);

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
  // OddsSnapshot already cached by PP's run (no second API call needed).
  // This ensures UD cards reflect UD-specific lines and pricing (udPickFactor).
  let udRunResult: import("./run_underdog_optimizer").UdRunResult | void = undefined;
  if (platform === "both") {
    console.log("\n[Unified] Running Underdog optimizer (own UD API fetch, shared odds snapshot)...\n");
    udRunResult = await runUnderdogOptimizer();
    // Phase 5: summary table, monotonic EV check, player exposure, Kelly preview
    printPhase5Summary(exportCards, udRunResult, cliArgs.maxPlayerExposure, cliArgs.bankroll);
    const snap = OddsSnapshotManager.getCurrentSnapshot();
    const src = snap?.source === "OddsAPI" ? "oddsapi" : (snap?.source ?? "none");
    const oddsRows = snap?.rows.length ?? 0;
    const invalidDropped = snap?.invalidOddsDropped ?? 0;
    console.log(
      `[ODDS_SOURCE] source=${src} oddsRows=${oddsRows} invalidOddsDropped=${invalidDropped} merged=${merged.length} legs=${filtered.length} cardsPP=${exportCards.length} cardsUD=${udRunResult?.udCardCount ?? 0}`
    );
    printLegCountAndBreakevenDiagnostic(filtered, udRunResult);
    console.log("\n[Unified] Pushing legs/cards/tiers to Sheets...\n");
    const sheetsExit = runSheetsPush(runTimestamp);
    if (cliArgs.telegram) {
      const totalCards = exportCards.length + (udRunResult?.udCardCount ?? 0);
      if (totalCards < 100) {
        await sendTelegramAlert(`Low cards: ${totalCards} (PP+UD). Expected ≥100 for full slate.`);
      }
      const udCsvPath = getOutputPath(UD_CARDS_CSV);
      await pushUdTop5FromCsv(udCsvPath, runTimestamp.slice(0, 10), cliArgs.bankroll);
    }
  }

  // One-click entry: send any card with EV > 7% to Telegram (if env set)
  const highEvCards: CardEvResult[] = exportCards.filter((c) => c.cardEv > 0.07);
  if (udRunResult?.udCards) {
    for (const { card } of udRunResult.udCards) if (card.cardEv > 0.07) highEvCards.push(card);
  }
  if (highEvCards.length > 0 && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const { generateClipboardString } = await import("./exporter/clipboard_generator");
    const { sendTelegramText } = await import("./notifications/telegram_bot");
    // Strict gate: only send cards that explicitly carry tier=1.
    const tierOneOnly = highEvCards.filter((c) => (c as unknown as { tier?: number }).tier === 1);
    for (const card of tierOneOnly) {
      await sendTelegramText(generateClipboardString(card), { tier: 1 });
    }
  }

  // Bench: top 10 legs per site by value_metric (effective EV) for dashboard replacement picks
  writeTopLegsJson(sortedLegs, getOutputPath(UD_LEGS_JSON));

  // Fail-fast: validate output data before reporting complete
  const { validateOutputData } = await import("./utils/data_validator");
  const validation = validateOutputData();
  if (!validation.ok) {
    throw new Error("[Data validation] " + validation.errors.join("; "));
  }
}

/** Diagnostic: leg CSV row counts, breakeven table, sample UD/PP edge calcs */
function printLegCountAndBreakevenDiagnostic(
  ppLegs: EvPick[],
  udResult: { udCardCount: number; udByStructure: Record<string, number> } | void
): void {
  const ppPath = getOutputPath(PP_LEGS_CSV);
  const udPath = getOutputPath(UD_LEGS_CSV);
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

/** Serializable leg entry for top_legs.json (value_metric = effective EV for sorting). */
interface TopLegEntry {
  id: string;
  player: string;
  team: string | null;
  stat: string;
  line: number;
  edge: number;
  legEv: number;
  value_metric: number; // effective EV (adjEv ?? legEv) for display/sorting
}

/** Write data/top_legs.json: top 10 legs per site by value_metric (effective EV). Runs every optimizer run so bench is fresh. */
function writeTopLegsJson(ppLegs: EvPick[], udLegsPath: string): void {
  const dataDir = path.join(process.cwd(), DATA_DIR);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const outPath = getDataPath(TOP_LEGS_JSON);

  const effectiveEv = (l: EvPick) => l.adjEv ?? l.legEv;
  const toEntry = (leg: EvPick): TopLegEntry => ({
    id: leg.id,
    player: leg.player,
    team: leg.team ?? null,
    stat: leg.stat,
    line: leg.line,
    edge: leg.edge,
    legEv: leg.legEv,
    value_metric: effectiveEv(leg),
  });

  const prizePicks = [...ppLegs]
    .sort((a, b) => effectiveEv(b) - effectiveEv(a))
    .slice(0, 10)
    .map(toEntry);

  let underdog: TopLegEntry[] = [];
  if (fs.existsSync(udLegsPath)) {
    try {
      const raw = fs.readFileSync(udLegsPath, "utf8");
      const udLegs = JSON.parse(raw) as Array<{ id?: string; player?: string; team?: string | null; stat?: string; line?: number; edge?: number; legEv?: number; adjEv?: number }>;
      if (Array.isArray(udLegs)) {
        underdog = udLegs
          .map((leg) => ({
            id: leg.id ?? "",
            player: leg.player ?? "",
            team: leg.team ?? null,
            stat: leg.stat ?? "",
            line: Number(leg.line) || 0,
            edge: Number(leg.edge) || 0,
            legEv: Number(leg.legEv) || 0,
            value_metric: Number(leg.adjEv ?? leg.legEv ?? 0),
          }))
          .sort((a, b) => b.value_metric - a.value_metric)
          .slice(0, 10);
      }
    } catch (e) {
      console.warn("[top_legs] Could not read underdog-legs.json:", (e as Error).message);
    }
  }

  const payload = { prizePicks, underdog };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ Wrote top 10 PP + ${underdog.length} UD legs to data/top_legs.json`);
}

/** Write artifacts/last_run.json with bankroll + run/odds meta for sheets_push.py (single source + meta block). */
function writeLastRunJson(
  bankroll: number,
  runTimestamp: string,
  snapshot: OddsSnapshot | null
): void {
  const artifactsDir = path.join(process.cwd(), ARTIFACTS_DIR);
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
  fs.writeFileSync(getArtifactsPath(LAST_RUN_JSON), JSON.stringify(payload, null, 2), "utf8");
}

/** Pipeline lock: row 1 = headers only, data row 2, no dashboard on Cards, no legacy legs push. */
const DATA_ROW_START = 2;
const SORT_PARLAY_BY = "card_id";

function runSheetsPush(runTimestamp: string): number {
  const bankroll = cliArgs.bankroll;
  const snapshot = OddsSnapshotManager.getCurrentSnapshot();
  writeLastRunJson(bankroll, runTimestamp, snapshot);

  // AUTO vs MANUAL audit (always log)
  console.log("=== RUN MODE COMPARE ===");
  console.log("Trigger:", process.argv.join(" "));
  console.log("Auto env:", !!process.env.AUTO_RUN);

  if (cliArgs.noSheets) {
    console.log("[Sheets] --no-sheets: skipping Sheets push. Import CSVs manually.");
    console.log("Sheets calls:", { setup_9tab: 0, push_cards: 0, legacy_legs: 0, row_start: DATA_ROW_START });
    console.log("Sort key:", SORT_PARLAY_BY);
    return 0;
  }

  const cwd = process.cwd();
  const env = { ...process.env, BANKROLL: String(bankroll), PYTHONIOENCODING: "utf-8", OUTPUT_DIR };
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
  const legacy_legs_called = 0;
  if (cardsResult.status !== 0) {
    console.warn("[Sheets] sheets_push_cards.py exited with code", cardsResult.status);
    if (cliArgs.telegram) {
      sendTelegramAlert(`Sheets cards push failed (exit ${cardsResult.status}). Check logs.`).catch(() => {});
    }
    console.log("Sheets calls:", { setup_9tab: setup_called, push_cards: push_cards_called, legacy_legs: legacy_legs_called, row_start: DATA_ROW_START });
    console.log("Sort key:", SORT_PARLAY_BY);
    return cardsResult.status ?? -1;
  }

  console.log("Sheets calls:", { setup_9tab: setup_called, push_cards: push_cards_called, legacy_legs: legacy_legs_called, row_start: DATA_ROW_START });
  console.log("Sort key:", SORT_PARLAY_BY);
  console.log("[Sheets] 11-tab system: Cards A2:W (23 cols), CardKelly$ W, DeepLink T=LegID only, Dashboard A11:B14 Edge B.");
  return 0;
}

run().catch((err) => {
  const crashPath = getArtifactsPath("crash_log.json");
  const asError = err instanceof Error ? err : new Error(String(err));
  const payload = {
    flow: "nba_optimizer",
    ts: new Date().toISOString(),
    message: asError.message,
    stack: asError.stack,
    stats: {
      oddsRows: crashStats.oddsRows,
      ppRawProps: crashStats.ppRawProps,
      mergedLegs: crashStats.mergedLegs,
      evLegs: crashStats.evLegs,
    },
  };
  try {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    fs.writeFileSync(crashPath, JSON.stringify(payload, null, 2), "utf8");
    console.error(`[CRASH] Wrote diagnostic to ${crashPath}`);
  } catch (writeErr) {
    console.error("[CRASH] Failed to write crash_log.json:", writeErr);
  }
  console.error("run_optimizer failed:", asError);
  process.exit(1);
});
