// src/run_underdog_optimizer.ts
// Underdog optimizer models only Standard and Flex entries — the two modes
// exposed in the Underdog Pick'em UI.  There is no separate "Insured" mode;
// the insurance-like behaviour is the reduced-payout tiers within Flex ladders.

import "./optimizer_cli_bootstrap";
import fs from "fs";
import path from "path";
import { getOutputPath, getOutputDir, getDataPath, UD_LEGS_JSON, UD_LEGS_CSV, UD_CARDS_JSON, UD_CARDS_CSV, DATA_DIR, TOP_LEGS_JSON } from "./constants/paths";
import {
  mergeOddsWithProps,
  mergeOddsWithPropsWithMetadata,
  mergeWithSnapshot,
  OddsSourceMetadata,
  SnapshotAudit,
} from "./merge_odds";
import { OddsSnapshotManager } from "./odds/odds_snapshot_manager";
import { upsertMergePlatformQualityByPass } from "./reporting/merge_platform_quality_by_pass";
import type { OddsSnapshot } from "./odds/odds_snapshot";
import { writeUnderdogImportedCsv } from "./export_imported_csv";
import { calculateEvForMergedPicks } from "./calculate_ev";
import {
  EvPick,
  MergedPick,
  RawPick,
  CardLegInput,
  CardEvResult,
  FlexType,
  Sport,
} from "./types";
import { evaluateUdStandardCard, evaluateUdFlexCard } from "./underdog_card_ev";
import { fetchUnderdogRawProps } from "./fetch_underdog_props";
import { loadRawPicksJsonSnapshot, loadUnderdogPropsFromFile } from "./load_underdog_props";
import { calculateKellyStake, getKellyFraction } from "./kelly_staking";
import { computeBestBetScore } from "./best_bets_score";
import { logBankrollUsage, logProductionRun } from "./bankroll_tracker";
import type { CliArgs } from "./cli_args";
import { getCliArgs } from "./cli_args";
import { getBreakevenForStructure } from "./config/binomial_breakeven";
import {
  UNDERDOG_TARGET_ACCEPTED_CARDS,
  UNDERDOG_BASE_ATTEMPTS_PER_CARD,
  UNDERDOG_MAX_ATTEMPTS_FRACTION_OF_GLOBAL,
  UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION,
  UNDERDOG_FLEX_STRUCTURES,
  getUnderdogStructureThreshold,
  meetsUnderdogStructureThreshold,
  getUnderdogStructureId,
  getUnderdogStructureById,
  canLegsMeetStructureThreshold,
  getUnderdogMaxAttemptsForStructure,
  createUnderdogStructureMetrics,
  logUnderdogStructureMetrics,
  UnderdogStructureId,
  UnderdogStructureMetrics,
} from "./config/underdog_structures";
import { createSyntheticEvPicks } from "./mock_legs";
import type { UdSurvivalSnapshot } from "./reporting/platform_survival_summary";
import {
  buildUdFinalSelectionObservability,
  type UdFinalSelectionObservability,
} from "./reporting/final_selection_observability";
import {
  buildUdFinalSelectionReasons,
  type UdFinalSelectionReasons,
} from "./reporting/final_selection_reason_attribution";
import { resolveUdFactor, udAdjustedLegEv } from "./policy/ud_pick_factor";
import { computeUdRunnerLegEligibility, passesUdBuilderViableLegEvFloor } from "./policy/eligibility_policy";
import { filterUdEvPicksCanonical } from "./policy/runtime_decision_pipeline";
import { resolveUnderdogRunnerExportCardCap } from "./policy/shared_leg_eligibility";
import {
  CARD_GATE_PASS,
  dedupeFormatCardEntriesByLegSetBestCardEv,
  firstCardConstructionGateFailure,
} from "./policy/shared_card_construction_gates";
import {
  applyPostEvaluatorDuplicatePlayerLegPenalty,
  postEligibilityLegValueMetric,
  sortFormatCardEntriesForExportPrimaryRanking,
  sortLegsByPostEligibilityValue,
} from "./policy/shared_post_eligibility_optimization";
import {
  applyExportCapSliceFormatEntries,
  attributeFinalSelectionUdFormatEntries,
} from "./policy/shared_final_selection_policy";
import {
  selectDiversifiedPortfolioFormatEntries,
  DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY,
} from "./policy/portfolio_diversification";
import { updatePortfolioDiversificationArtifactSection } from "./reporting/portfolio_diversification_artifacts";
import { updatePreDiversificationCardDiagnosisSection } from "./reporting/pre_diversification_card_diagnosis";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";
import {
  EVALUATION_BUCKET_ORDER,
  runBucketSlice,
  type EvaluationBucketId,
} from "./pipeline/evaluation_buckets";

const GUARDRAIL_UD_MERGE_MIN_RATIO = 0.10;

// Enhanced Underdog props fetch with priority order: scraped → API → manual
// Expected return shape: RawPick[] with fields for site, league, player, team, opponent, 
// stat, line, projectionId, gameId, startTime, and promo flags
async function fetchUnderdogRawPropsWithLogging(sports: Sport[], cli: CliArgs): Promise<RawPick[]> {
  if (cli.udRawPicksJsonPath) {
    const picks = loadRawPicksJsonSnapshot(cli.udRawPicksJsonPath);
    console.log(`[UD] Pinned replay: ${picks.length} raw picks from ${cli.udRawPicksJsonPath}`);
    return picks;
  }

  const scrapedFilePath = path.join(process.cwd(), "underdog_props_scraped.json");
  const manualFilePath = path.join(process.cwd(), "underdog_manual_props.json");
  
  // Priority 1: Try scraped file first
  console.log('[UD] Checking for scraped props file...');
  const scrapedProps = await loadUnderdogPropsFromFile(scrapedFilePath, "scraped");
  if (scrapedProps.length > 0) {
    console.log(`[UD] Using ${scrapedProps.length} props from scraped file`);
    return scrapedProps;
  }
  
  // Priority 2: Try API
  console.log('[UD] No scraped file found, trying Underdog API...');
  try {
    const apiProps = await fetchUnderdogRawProps(sports);
    
    // Count props by league for logging
    const leagueCounts = apiProps.reduce((acc, pick) => {
      acc[pick.league] = (acc[pick.league] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const leagueSummary = Object.entries(leagueCounts)
      .map(([league, count]) => `${league}: ${count}`)
      .join(', ');
    
    if (apiProps.length > 0) {
      console.log(`[UD] Loaded ${apiProps.length} props from Underdog API (${leagueSummary})`);
      return apiProps;
    } else {
      console.log('[UD] API returned 0 props, falling back to manual file...');
    }
  } catch (error) {
    console.error('[UD] ERROR: Failed to fetch Underdog props from API:', error);
    console.log('[UD] Falling back to manual props file...');
  }
  
  // Priority 3: Fall back to manual file
  const manualProps = await loadUnderdogPropsFromFile(manualFilePath, "manual");
  if (manualProps.length > 0) {
    console.log(`[UD] Using ${manualProps.length} props from manual file`);
    return manualProps;
  }
  
  // All sources failed
  console.log('[UD] WARNING: No props available from any source (scraped, API, or manual)');
  console.log('[UD] WARNING: Using empty props list; optimizer will produce 0 legs/cards');
  return [];
}

// Legacy constants - replaced by Underdog-specific thresholds
const MAX_LEGS_PER_PLAYER = 1;

/**
 * Adapter: Map Underdog structure IDs to PrizePicks-compatible FlexType codes
 *
 * This adapter exists solely for CSV/Sheets compatibility with the existing
 * PrizePicks schema. Underdog has two modes — Standard and Flex — which map
 * cleanly to the PrizePicks "XP" (power) and "XF" (flex) naming convention.
 *
 * Mapping:
 *   UD_XP_STD  → "XP" (Standard = all-or-nothing, like PP power)
 *   UD_XF_FLX  → "XF" (Flex = tiered ladder, like PP flex)
 */
const STAT_ABBREV: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", threes: "3PM",
  steals: "STL", blocks: "BLK", fantasy_points: "FP", pra: "PRA",
  "pts+reb+ast": "PRA", points_rebounds_assists: "PRA",
  "pts+ast": "PA", "pts+reb": "PR", "reb+ast": "RA",
  turnovers: "TO", stocks: "STK",
};

function statAbbrev(stat: string): string {
  return STAT_ABBREV[stat?.toLowerCase() ?? ""] ?? stat?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? "";
}

/** Format one leg as "Player STAT o line" for Player-Prop-Line column */
function formatLegForPlayerPropLine(leg: { pick: EvPick }): string {
  const p = leg.pick;
  const abbr = statAbbrev(p.stat);
  return `${p.player} ${abbr} o${p.line}`;
}

function mapUnderdogStructureToFlexType(structureId: string): FlexType {
  if (structureId.includes('F_FLX')) {
    // Flex structures → XF codes
    const size = structureId.match(/(\d)F/)?.[1];
    return `${size}F` as FlexType;
  } else {
    // Standard structures → XP codes
    const size = structureId.match(/(\d)P/)?.[1];
    return `${size}P` as FlexType;
  }
}

/** UD leg filter — canonical implementation in runtime_decision_pipeline (Phase 17K). */
function filterEvPicks(evPicks: EvPick[], cli: CliArgs, overrides?: { standardPickMinTrueProb?: number }): EvPick[] {
  return filterUdEvPicksCanonical(evPicks, cli, {
    overrides,
    maxLegsPerPlayerPerStat: MAX_LEGS_PER_PLAYER,
  });
}

function buildCardLegInputs(legs: EvPick[]): CardLegInput[] {
  return legs.map((p) => {
    const factor = resolveUdFactor(p);
    return {
      sport: p.sport,
      player: p.player,
      team: p.team,
      opponent: p.opponent,
      league: p.league,
      stat: p.stat,
      line: p.line,
      outcome: p.outcome,
      trueProb: p.trueProb,
      projectionId: p.projectionId,
      gameId: p.gameId,
      startTime: p.startTime,
      udPickFactor: factor ?? 1.0,
    };
  });
}

function buildSlidingWindows<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i + size <= arr.length; i++) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Generate real k-combinations (not just sliding windows) from an array.
 * Yields subsets in descending-EV order since the input should be sorted.
 * Capped at maxCombos to avoid explosion.
 */
function* kCombinationsUd<T>(arr: T[], k: number, maxCombos: number): Generator<T[]> {
  const n = arr.length;
  if (k === 0 || k > n) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  let count = 0;
  while (true) {
    if (count >= maxCombos) return;
    yield indices.map(i => arr[i]);
    count++;
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

function toUdFlexType(size: number): FlexType {
  const flex: FlexType[] = ["3F", "4F", "5F", "6F", "7F", "8F"];
  if (size >= 3 && size <= 8) return flex[size - 3];
  throw new Error(`Unsupported UD flex size: ${size}`);
}

function makeCardResultFromUd(
  legs: EvPick[],
  mode: "flex" | "power",
  size: number,
  structureId: string
): CardEvResult {
  const cardLegInputs = buildCardLegInputs(legs);

  const evalResult =
    mode === "power"
      ? evaluateUdStandardCard(cardLegInputs, structureId)
      : evaluateUdFlexCard(cardLegInputs, structureId);

  const flexType: FlexType =
    mode === "power"
      ? (`${size}P` as FlexType)
      : toUdFlexType(size);

  const { expectedValue, winProbability, hitDistribution, stake, totalReturn } =
    evalResult;

  return {
    flexType,
    site: "underdog",
    structureId,
    legs: legs.map((pick) => ({
      pick,
      side: pick.outcome,
    })),
    stake,
    totalReturn,
    expectedValue,
    winProbability,
    cardEv: expectedValue,
    winProbCash: winProbability,
    winProbAny: winProbability,
    avgProb: legs.reduce((sum, leg) => sum + leg.trueProb, 0) / legs.length,
    avgEdgePct: legs.reduce((sum, leg) => sum + (leg.trueProb - 0.5), 0) / legs.length * 100,
    hitDistribution,
  };
}

function writeCsv(filePath: string, rows: string[][]) {
  const csv = rows.map((r) => r.join(",")).join("\n");
  fs.writeFileSync(filePath, csv, "utf8");
}

/**
 * Format a Date as Eastern-time ISO string: "YYYY-MM-DDTHH:MM:SS ET"
 * Matches the format used by PrizePicks optimizer for unified Sheets display.
 */
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

  return `${parts.year ?? "0000"}-${parts.month ?? "01"}-${parts.day ?? "01"}T${parts.hour ?? "00"}:${parts.minute ?? "00"}:${parts.second ?? "00"} ET`;
}

function meetsUdStructureThresholdWithVolume(
  structureId: UnderdogStructureId,
  cardEv: number,
  volumeMode: boolean | undefined,
  udVolumePolicy: boolean
): boolean {
  const threshold = getUnderdogStructureThreshold(structureId);
  const useVolume = volumeMode ?? udVolumePolicy;
  if (useVolume) {
    return cardEv >= -0.03;
  }
  return cardEv >= threshold.minCardEv;
}

export type UdBuildFromFilteredStats = {
  /**
   * Flex structures only — incremented inside the flex `kCombinationsUd` loop.
   * Standard structures also enumerate k-combos but use {@link standardKCombinationsEnumerated}.
   */
  combosEnumeratedFromKCombinations: number;
  /** Standard (power) structures: k-combination iterations (Phase AN observability). */
  standardKCombinationsEnumerated: number;
  /** Flex enumeration only — standard power loop does not increment this counter. */
  combosPassedConstructionGate: number;
  /** Flex enumeration only — standard power loop does not increment this counter. */
  combosPassedStructureThreshold: number;
  /** All structure paths before dedupe (standard + flex). */
  cardsPreDedupe: number;
  cardsPostDedupe: number;
  /** Legs with `legEv >= standardPickMinTrueProb` before per-structure `trueProb` filters. */
  builderLegsAfterLegEvFloor: number;
  /** Phase AN: legs after `legsForStructure` for `UD_3F_FLX` (smallest flex). */
  flex3fLegsAfterStructureFilters: number;
  /** Phase AN: `maxAttempts` for `UD_3F_FLX` — 0 means no flex k-combos run. */
  flex3fMaxAttempts: number;
};

/** Build UD cards from filtered legs with given volume mode and min leg EV (for auto-boost second pass). */
function buildUdCardsFromFiltered(
  filteredEv: EvPick[],
  volumeMode: boolean,
  standardPickMinTrueProb: number,
  udMinEdge: number,
  udVolumePolicy: boolean,
  cli: CliArgs
): { entries: { format: string; card: CardEvResult }[]; stats: UdBuildFromFilteredStats } {
  const sortedEv = [...filteredEv].sort((a, b) => udAdjustedLegEv(b) - udAdjustedLegEv(a));
  const standardStructureIds: UnderdogStructureId[] = [...UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION];
  const flexStructureIds: UnderdogStructureId[] = UNDERDOG_FLEX_STRUCTURES.map((s) => s.id as UnderdogStructureId);
  const allCards: { format: string; card: CardEvResult }[] = [];
  const GLOBAL_MAX_ATTEMPTS = 10000;
  let combosEnumeratedFromKCombinations = 0;
  let standardKCombinationsEnumerated = 0;
  let combosPassedConstructionGate = 0;
  let combosPassedStructureThreshold = 0;

  const edgeFloor = udMinEdge;
  const viableLegs = (sorted: EvPick[]) =>
    sorted.filter((leg) =>
      passesUdBuilderViableLegEvFloor(leg, standardPickMinTrueProb, udVolumePolicy, cli.udBoostedBuilderViableLegsExperiment)
    );
  const legsForStructure = (sorted: EvPick[], structureId: string) => {
    if (volumeMode) {
      return viableLegs(sorted);
    }
    const be = getBreakevenForStructure(structureId);
    return viableLegs(sorted).filter(leg => leg.trueProb >= be + edgeFloor);
  };

  const viableLegsPool = viableLegs(sortedEv);
  const builderLegsAfterLegEvFloor = viableLegsPool.length;
  const boostedLegsInBuilderInput = filteredEv.filter((p) => {
    const f = resolveUdFactor(p);
    return f !== null && f > 1.0;
  }).length;
  const boostedLegsPassedViable = viableLegsPool.filter((p) => {
    const f = resolveUdFactor(p);
    return f !== null && f > 1.0;
  }).length;
  const flex3fId = "UD_3F_FLX" as UnderdogStructureId;
  const structure3f = getUnderdogStructureById(flex3fId);
  const legs3f = structure3f ? legsForStructure(sortedEv, flex3fId) : [];
  const legEvs3f = legs3f.map((leg) => leg.legEv);
  const flex3fLegsAfterStructureFilters = legs3f.length;
  const flex3fCanLegs =
    structure3f != null &&
    canLegsMeetStructureThreshold(flex3fId, legEvs3f, structure3f, volumeMode);
  let flex3fMaxAttempts = 0;
  if (structure3f && flex3fCanLegs) {
    flex3fMaxAttempts = getUnderdogMaxAttemptsForStructure({
      structure: structure3f,
      viableLegCount: legs3f.length,
      targetAcceptedCards: UNDERDOG_TARGET_ACCEPTED_CARDS.flex,
      globalMaxAttempts: GLOBAL_MAX_ATTEMPTS,
    });
  }

  for (const structureId of standardStructureIds) {
    const structure = getUnderdogStructureById(structureId);
    if (!structure) continue;
    const legs = legsForStructure(sortedEv, structureId);
    const legEvs = legs.map(leg => leg.legEv);
    if (!canLegsMeetStructureThreshold(structureId, legEvs, structure, volumeMode)) continue;
    const maxAttempts = getUnderdogMaxAttemptsForStructure({
      structure,
      viableLegCount: legs.length,
      targetAcceptedCards: UNDERDOG_TARGET_ACCEPTED_CARDS.standard,
      globalMaxAttempts: GLOBAL_MAX_ATTEMPTS,
    });
    if (maxAttempts === 0) continue;
    for (const combo of kCombinationsUd(legs, structure.size, maxAttempts)) {
      standardKCombinationsEnumerated++;
      if (firstCardConstructionGateFailure(combo) !== CARD_GATE_PASS) continue;
      const card = applyPostEvaluatorDuplicatePlayerLegPenalty(
        makeCardResultFromUd(combo, "power", structure.size, structureId)
      );
      if (!meetsUdStructureThresholdWithVolume(structureId, card.cardEv, volumeMode, udVolumePolicy)) continue;
      allCards.push({ format: structureId, card });
    }
  }

  for (const structureId of flexStructureIds) {
    const structure = getUnderdogStructureById(structureId);
    if (!structure) continue;
    const legs = legsForStructure(sortedEv, structureId);
    const legEvs = legs.map(leg => leg.legEv);
    if (!canLegsMeetStructureThreshold(structureId, legEvs, structure, volumeMode)) continue;
    const maxAttempts = getUnderdogMaxAttemptsForStructure({
      structure,
      viableLegCount: legs.length,
      targetAcceptedCards: UNDERDOG_TARGET_ACCEPTED_CARDS.flex,
      globalMaxAttempts: GLOBAL_MAX_ATTEMPTS,
    });
    if (maxAttempts === 0) continue;
    for (const combo of kCombinationsUd(legs, structure.size, maxAttempts)) {
      combosEnumeratedFromKCombinations++;
      if (firstCardConstructionGateFailure(combo) !== CARD_GATE_PASS) continue;
      combosPassedConstructionGate++;
      const card = applyPostEvaluatorDuplicatePlayerLegPenalty(
        makeCardResultFromUd(combo, "flex", structure.size, structureId)
      );
      if (!meetsUdStructureThresholdWithVolume(structureId, card.cardEv, volumeMode, udVolumePolicy)) continue;
      combosPassedStructureThreshold++;
      allCards.push({ format: structureId, card });
    }
  }

  const cardsPreDedupe = allCards.length;
  const deduped = dedupeFormatCardEntriesByLegSetBestCardEv(allCards);
  const cardsPostDedupe = deduped.length;

  let flex3fZeroEnumReason: string | null = null;
  if (combosEnumeratedFromKCombinations === 0) {
    if (builderLegsAfterLegEvFloor === 0) {
      flex3fZeroEnumReason = cli.udBoostedBuilderViableLegsExperiment
        ? "zero_legs_pass_builder_viable_admission"
        : "zero_legs_pass_legEv_vs_standardPickMinTrueProb_builder_pool_empty";
    } else if (builderLegsAfterLegEvFloor < 3) {
      flex3fZeroEnumReason = "fewer_than_3_legs_after_legEv_floor";
    } else if (flex3fLegsAfterStructureFilters < 3) {
      flex3fZeroEnumReason = "fewer_than_3_legs_after_trueProb_filter_for_UD_3F_FLX";
    } else if (!flex3fCanLegs) {
      flex3fZeroEnumReason = "canLegsMeetStructureThreshold_false_for_UD_3F_FLX";
    } else if (flex3fMaxAttempts === 0) {
      flex3fZeroEnumReason = "flex3f_maxAttempts_zero";
    } else {
      flex3fZeroEnumReason = "flex_loop_never_incremented";
    }
  }

  console.log(
    `[UD] Builder observability: eligibleInput=${filteredEv.length} viableLegs_pool=${builderLegsAfterLegEvFloor} standardPickMinTrueProb_floor=${standardPickMinTrueProb} ` +
      `UD_3F_FLX_legs=${flex3fLegsAfterStructureFilters} flex3f_maxAttempts=${flex3fMaxAttempts} ` +
      `flexKCombosEnum=${combosEnumeratedFromKCombinations} standardKCombosEnum=${standardKCombinationsEnumerated} ` +
      `cardsPreDedupe=${cardsPreDedupe} combosPassedConstructionGate=${combosPassedConstructionGate} combosPassedStructureThreshold=${combosPassedStructureThreshold} ` +
      `(legacy field combosEnumeratedFromKCombinations is flex-only; constr/thresh pass counts are flex-loop tallies)` +
      (flex3fZeroEnumReason ? ` | flexZeroReason=${flex3fZeroEnumReason}` : "")
  );
  if (cli.udBoostedBuilderViableLegsExperiment) {
    console.log(
      `[UD] Builder boosted viableLegs (aligned, default on-path): boosted_in_input=${boostedLegsInBuilderInput} boosted_passed_viable=${boostedLegsPassedViable} total_viable=${builderLegsAfterLegEvFloor}`
    );
  }

  return {
    entries: sortFormatCardEntriesForExportPrimaryRanking(deduped),
    stats: {
      combosEnumeratedFromKCombinations,
      standardKCombinationsEnumerated,
      combosPassedConstructionGate,
      combosPassedStructureThreshold,
      cardsPreDedupe,
      cardsPostDedupe,
      builderLegsAfterLegEvFloor,
      flex3fLegsAfterStructureFilters,
      flex3fMaxAttempts,
    },
  };
}

export interface UdRunResult {
  udCardCount: number;
  udByStructure: Record<string, number>;
  udCards: { format: string; card: CardEvResult }[];
  /** Phase 17I — deterministic funnel + structure counts (additive). */
  survival?: UdSurvivalSnapshot;
  /** Phase 17R — post-selection structure distributions from shared final-selection pipeline (additive). */
  finalSelectionObservability?: UdFinalSelectionObservability;
  /** Phase 17S — removal/adjustment reason attribution (additive). */
  finalSelectionReasons?: UdFinalSelectionReasons;
}

async function main(sharedLegs?: EvPick[], cli?: CliArgs): Promise<UdRunResult | void> {
  const args = cli ?? getCliArgs();
  const sports: Sport[] = args.sports;
  const UD_RUNNER_LEG_POLICY = computeUdRunnerLegEligibility(args);
  const udVolume = UD_RUNNER_LEG_POLICY.udVolume;
  const udMinLegEv = UD_RUNNER_LEG_POLICY.udMinLegEv;
  const udMinEdge = UD_RUNNER_LEG_POLICY.udMinEdge;

  console.log(
    `[UD] CLI sports: [${sports.join(",")}] | standardPickMinTrueProb=${(udMinLegEv * 100).toFixed(1)}% | minEdge=${(udMinEdge * 100).toFixed(1)}%${udVolume ? " | ud-volume=on" : ""}`
  );
  console.log(`[UD] Note: edge vs 0.50 shown for PP convention; UD pricing handled by udAdjustedLegEv() (breakeven ~53.45%)`);

  const tsBase = args.date ? new Date(`${args.date}T12:00:00`) : new Date();
  const runTimestamp = toEasternIsoString(tsBase);
  const useSharedLegs = sharedLegs != null && sharedLegs.length > 0;

  const UD_SLICE_INGEST_ELIG = EVALUATION_BUCKET_ORDER.slice(0, 4) as readonly EvaluationBucketId[];
  const UD_SLICE_PLATFORM_MATH = [EVALUATION_BUCKET_ORDER[4]] as readonly EvaluationBucketId[];
  const UD_SLICE_STRUCT_RENDER = EVALUATION_BUCKET_ORDER.slice(5) as readonly EvaluationBucketId[];
  const noopAsync = async () => {};

  let rawPropsCount: number | null = null;
  let mergedPropsCount: number | null = null;
  let evPicks: EvPick[] = [];
  let oddsProvider = "";
  let afterFilter: EvPick[] = [];
  let filteredEv: EvPick[] = [];
  let rawProps: RawPick[] = [];
  let merged: MergedPick[] = [];
  let result: Awaited<ReturnType<typeof mergeWithSnapshot>> | undefined;

  if (useSharedLegs) {
    await runBucketSlice("ud", UD_SLICE_INGEST_ELIG, [
      { id: "ingest", run: noopAsync },
      { id: "normalize", run: noopAsync },
      { id: "match_merge", run: noopAsync },
      { id: "shared_eligibility", run: noopAsync },
    ]);
    await runBucketSlice("ud", UD_SLICE_PLATFORM_MATH, [
      {
        id: "platform_math",
        run: async () => {
          evPicks = sharedLegs!;
          oddsProvider = "shared (PP legs)";
          console.log(
            `[UD] Using ${evPicks.length} shared legs from PrizePicks pipeline (PP.model === UD.model)`
          );
          if (args.debug) {
            console.log(
              `[UD] [debug] Shared leg sample: ${evPicks
                .slice(0, 3)
                .map((p) => `${p.player} ${p.stat} ${p.line}`)
                .join(" | ")}`
            );
          }
          afterFilter = filterEvPicks(evPicks, args);
          filteredEv = afterFilter;
        },
      },
    ]);
  } else if (args.mockLegs != null && args.mockLegs > 0) {
    await runBucketSlice("ud", UD_SLICE_INGEST_ELIG, [
      { id: "ingest", run: noopAsync },
      { id: "normalize", run: noopAsync },
      { id: "match_merge", run: noopAsync },
      { id: "shared_eligibility", run: noopAsync },
    ]);
    await runBucketSlice("ud", UD_SLICE_PLATFORM_MATH, [
      {
        id: "platform_math",
        run: async () => {
          const mockN = args.mockLegs!;
          console.log(`[UD] [Mock] Injecting ${mockN} synthetic legs.`);
          evPicks = createSyntheticEvPicks(mockN, "underdog");
          oddsProvider = "mock";
          rawPropsCount = null;
          mergedPropsCount = null;
          console.log(`[UD] Pick funnel: mock=${evPicks.length} (no merge)`);
          console.log("Odds source: mock (synthetic legs)");
          afterFilter = filterEvPicks(evPicks, args);
          filteredEv = afterFilter.filter((p) => p.site === "underdog");
        },
      },
    ]);
  } else {
    await runBucketSlice("ud", UD_SLICE_INGEST_ELIG, [
      {
        id: "ingest",
        run: async () => {
          rawProps = await fetchUnderdogRawPropsWithLogging(sports, args);
          rawPropsCount = rawProps.length;
        },
      },
      {
        id: "normalize",
        run: async () => {
          writeUnderdogImportedCsv(rawProps);
        },
      },
      {
        id: "match_merge",
        run: async () => {
          const existingSnapshot = OddsSnapshotManager.getCurrentSnapshot();
          if (existingSnapshot) {
            const snapshotMeta: OddsSourceMetadata = {
              isFromCache: existingSnapshot.refreshMode === "cache",
              providerUsed: existingSnapshot.source === "OddsAPI" ? "OddsAPI" : "none",
              fetchedAt: existingSnapshot.fetchedAtUtc,
              originalProvider: existingSnapshot.source === "OddsAPI" ? "OddsAPI" : undefined,
            };
            const snapshotAudit: SnapshotAudit = {
              oddsSnapshotId: existingSnapshot.snapshotId,
              oddsFetchedAtUtc: existingSnapshot.fetchedAtUtc,
              oddsAgeMinutes: existingSnapshot.ageMinutes,
              oddsRefreshMode: existingSnapshot.refreshMode,
              oddsSource: existingSnapshot.source,
              oddsIncludesAltLines: existingSnapshot.includeAltLines,
            };
            result = await mergeWithSnapshot(rawProps, existingSnapshot.rows, snapshotMeta, snapshotAudit, args);
            console.log(
              `Odds source: ${existingSnapshot.source} (${existingSnapshot.refreshMode}), snapshot=${existingSnapshot.snapshotId}, age=${existingSnapshot.ageMinutes.toFixed(1)}m [shared with PP]`
            );
          } else {
            result = await mergeOddsWithPropsWithMetadata(rawProps, args);
            if (result.metadata.isFromCache) {
              const fetchedAt = result.metadata.fetchedAt
                ? new Date(result.metadata.fetchedAt).toLocaleString()
                : "unknown";
              console.log(
                `Odds source: cache (from ${result.metadata.originalProvider || "unknown"}, fetched at ${fetchedAt})`
              );
            } else {
              const provider = result.metadata.providerUsed;
              const timestamp = result.metadata.fetchedAt
                ? new Date(result.metadata.fetchedAt).toLocaleString()
                : new Date().toLocaleString();
              console.log(`Odds source: ${provider ?? "none"} (fresh), fetched at ${timestamp}`);
            }
          }
          merged = result.odds;
          mergedPropsCount = merged.length;
          console.log(`[UD DEBUG] Input merged: ${merged?.length ?? 0}`);
          try {
            const snap = OddsSnapshotManager.getCurrentSnapshot();
            upsertMergePlatformQualityByPass(process.cwd(), {
              pass: "underdog",
              platformStats: result.platformStats,
              stageAccounting: result.stageAccounting,
              oddsFetchedAtUtc: snap?.fetchedAtUtc ?? result.metadata.fetchedAt ?? null,
              oddsSnapshotAgeMinutes: snap?.ageMinutes ?? null,
            });
          } catch (e) {
            console.warn("[MergePlatformQuality] underdog snapshot failed:", (e as Error).message);
          }
        },
      },
      {
        id: "shared_eligibility",
        run: async () => {
          console.log(
            `[UD] Pick funnel: raw=${rawProps.length} → merged=${merged.length} (merge rate: ${
              rawProps.length ? ((100 * merged.length) / rawProps.length).toFixed(1) : 0
            }%)`
          );
          if (!args.noGuardrails) {
            const udStats = result?.platformStats?.underdog;
            if (udStats && udStats.rawProps > 0) {
              const mergedCount = udStats.mergedExact + udStats.mergedNearest;
              const ratio = mergedCount / udStats.rawProps;
              if (ratio < GUARDRAIL_UD_MERGE_MIN_RATIO) {
                console.error(
                  `[GUARDRAIL] FATAL: UD merge ratio ${(ratio * 100).toFixed(1)}% below ${GUARDRAIL_UD_MERGE_MIN_RATIO * 100}%. Refusing to ship. Use --no-guardrails to override.`
                );
                throw new Error("UD guardrail validation failure: merge ratio below threshold");
              }
            }
          }
        },
      },
    ]);
    await runBucketSlice("ud", UD_SLICE_PLATFORM_MATH, [
      {
        id: "platform_math",
        run: async () => {
          try {
            evPicks = calculateEvForMergedPicks(merged);
            console.log(`[UD DEBUG] EV calc: ${evPicks?.length ?? 0}`);
          } catch (e) {
            console.error("[UD CRASH] EV calc failed:", e);
            evPicks = [];
          }
          if (evPicks.length < 10 && (args.volume || args.udVolume)) {
            console.log("[UD DEBUG] Volume mode: <10 legs → injecting 30 mock UD legs");
            evPicks = createSyntheticEvPicks(30, "underdog");
          }
          oddsProvider = result?.metadata.providerUsed ?? "none";
          afterFilter = filterEvPicks(evPicks, args);
          filteredEv = afterFilter.filter((p) => p.site === "underdog");
        },
      },
    ]);
  }

  const udEvPicks = evPicks.filter((p) => p.site === "underdog");
  if (useSharedLegs) {
    console.log(
      `[UD] Leg funnel: shared=${evPicks.length} → after filterEvPicks=${afterFilter.length} → final legs=${filteredEv.length}`
    );
  } else {
    console.log(
      `[UD] Leg funnel: merged UD=${udEvPicks.length} → after filterEvPicks=${afterFilter.length} → final legs=${filteredEv.length}`
    );
  }

  // FIXED: Assign legEv to UD legs after filtering (raw edge for card building, not factor-adjusted)
  filteredEv.forEach(leg => {
    if (leg.trueProb > 0) {
      const rawEdge = leg.trueProb - 0.5345;
      leg.legEv = Math.max(0, rawEdge);  // raw edge (trueProb - UD breakeven) for card building
    }
  });
  if (args.debug && filteredEv.length > 0) {
    console.log(
      `[UD] [debug] adj-EV range: ${(Math.min(...filteredEv.map(udAdjustedLegEv)) * 100).toFixed(2)}% – ${(
        Math.max(...filteredEv.map(udAdjustedLegEv)) * 100
      ).toFixed(2)}%`
    );
  }

  let allCards: { format: string; card: CardEvResult }[] = [];
  let udBuiltPreFinal: { format: string; card: CardEvResult }[] = [];
  let udBuilderStats: UdBuildFromFilteredStats | null = null;
  let udSelectionBatch: ReturnType<typeof attributeFinalSelectionUdFormatEntries> | null = null;
  let cappedCards: { format: string; card: CardEvResult }[] = [];
  let autoBoostSecondPass = false;
  let byStructPreCap: Record<string, number> = {};
  let maxCardsCap = resolveUnderdogRunnerExportCardCap(args);

  await runBucketSlice("ud", UD_SLICE_STRUCT_RENDER, [
    {
      id: "structure_evaluation",
      run: async () => {
        const builtFirst = buildUdCardsFromFiltered(filteredEv, udVolume, udMinLegEv, udMinEdge, udVolume, args);
        udBuiltPreFinal = builtFirst.entries;
        udBuilderStats = builtFirst.stats;
        udSelectionBatch = attributeFinalSelectionUdFormatEntries(builtFirst.entries, "UD");
        allCards = udSelectionBatch.keptEntries;
        autoBoostSecondPass = false;
        byStructPreCap = {};
        for (const { format } of allCards) {
          const ft = mapUnderdogStructureToFlexType(format);
          byStructPreCap[ft] = (byStructPreCap[ft] ?? 0) + 1;
        }
        console.log(
          `[UD] Cards generated: ${allCards.length} (before cap) | legs: ${filteredEv.length} raw → ${Object.entries(
            byStructPreCap
          )
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`
        );
        const isRealSlate = args.mockLegs == null;
        if (allCards.length < 20 && isRealSlate && !udVolume) {
          console.log("[UD] Auto boost: <20 cards on real slate, retrying with ud_volume + standardPickMinTrueProb 0.8%");
          const filteredEvBoost = filterEvPicks(evPicks, args, { standardPickMinTrueProb: 0.008 });
          const builtBoost = buildUdCardsFromFiltered(filteredEvBoost, true, 0.008, udMinEdge, udVolume, args);
          udBuiltPreFinal = builtBoost.entries;
          udBuilderStats = builtBoost.stats;
          udSelectionBatch = attributeFinalSelectionUdFormatEntries(builtBoost.entries, "UD");
          allCards = udSelectionBatch.keptEntries;
          autoBoostSecondPass = true;
        }

        if (allCards.length === 0 && filteredEv.length > 0) {
          console.log(`\n[UD] ⚠ 0 cards from ${filteredEv.length} legs — all combos rejected by structure EV thresholds.`);
          console.log(`[UD]   This means Underdog has priced today's slate accurately — no exploitable edge found.`);
          console.log(`[UD]   Discounted picks (factor<1) reduce payouts too much; standard/boosted picks lack raw edge.`);
        } else if (allCards.length === 0 && filteredEv.length === 0) {
          console.log(`\n[UD] ⚠ 0 legs passed factor-aware filter — no UD edge on this slate.`);
          console.log(
            `[UD]   ${evPicks.filter((p) => p.site === "underdog").length} merged picks, but all have trueProb too close to breakeven.`
          );
        }
      },
    },
    {
      id: "selection_export",
      run: async () => {
        const outDir = getOutputDir();
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const legsJsonPath = getOutputPath(UD_LEGS_JSON);
        fs.writeFileSync(
          legsJsonPath,
          JSON.stringify(
            filteredEv.map((p) => ({ ...p, runTimestamp })),
            null,
            2
          ),
          "utf8"
        );

        const topLegsPath = getDataPath(TOP_LEGS_JSON);
        const udTop10 = sortLegsByPostEligibilityValue(filteredEv)
          .slice(0, 10)
          .map((leg) => ({
            id: leg.id,
            player: leg.player,
            team: leg.team ?? null,
            stat: leg.stat,
            line: leg.line,
            edge: leg.edge,
            legEv: leg.legEv,
            value_metric: postEligibilityLegValueMetric(leg),
          }));
        let existing: { prizePicks?: unknown[]; underdog?: unknown[] } = { prizePicks: [], underdog: [] };
        if (fs.existsSync(topLegsPath)) {
          try {
            const rawTop = fs.readFileSync(topLegsPath, "utf8");
            existing = JSON.parse(rawTop) as { prizePicks?: unknown[]; underdog?: unknown[] };
          } catch {
            // keep default
          }
        }
        const dataDir = path.join(process.cwd(), DATA_DIR);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(
          topLegsPath,
          JSON.stringify({ prizePicks: existing.prizePicks ?? [], underdog: udTop10 }, null, 2),
          "utf8"
        );
        console.log(`✅ Wrote top ${udTop10.length} UD legs to data/top_legs.json (bench)`);

        const legsCsvPath = getOutputPath(UD_LEGS_CSV);
        const legsHeader = [
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
          "legacyNaiveLegMetric",
          "fairProbChosenSide",
          "runTimestamp",
          "gameTime",
          "IsWithin24h",
          "IsNonStandardOdds",
          "leg_key",
          "leg_label",
        ];
        const legsRows = [
          legsHeader,
          ...filteredEv.map((p) => {
            let isWithin24h = "TRUE";
            if (p.startTime) {
              try {
                const gameDate = new Date(p.startTime);
                const now = new Date();
                const diffMs = gameDate.getTime() - now.getTime();
                isWithin24h = diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000 ? "TRUE" : "FALSE";
              } catch {
                isWithin24h = "TRUE";
              }
            }
            return [
              p.sport,
              p.id,
              p.player,
              p.team ?? "",
              p.stat,
              p.line.toString(),
              p.league,
              p.book ?? "",
              p.overOdds?.toString() ?? "",
              p.underOdds?.toString() ?? "",
              p.trueProb.toString(),
              p.edge.toString(),
              p.legEv.toString(),
              p.legacyNaiveLegMetric?.toString() ?? "",
              p.fairProbChosenSide?.toString() ?? "",
              runTimestamp,
              p.startTime ?? "",
              isWithin24h,
              p.isNonStandardOdds ? "TRUE" : "FALSE",
              p.legKey ?? "",
              p.legLabel ?? "",
            ];
          }),
        ];
        writeCsv(legsCsvPath, legsRows);

        maxCardsCap = resolveUnderdogRunnerExportCardCap(args);
        if (args.portfolioDiversification && allCards.length > 0) {
          const div = selectDiversifiedPortfolioFormatEntries(
            allCards,
            maxCardsCap,
            DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY
          );
          cappedCards = div.exported;
          updatePortfolioDiversificationArtifactSection("ud", div.report, true);
          if (allCards.length > maxCardsCap) {
            console.log(
              `[UD] Capped export (Phase 77 diversified): ${allCards.length} candidates → ${cappedCards.length} exported (cap ${maxCardsCap})`
            );
          }
        } else {
          cappedCards = applyExportCapSliceFormatEntries(allCards, maxCardsCap);
          updatePortfolioDiversificationArtifactSection("ud", null, false);
          if (allCards.length > maxCardsCap) {
            console.log(`[UD] Capped export: ${allCards.length} cards → top ${maxCardsCap} by EV (--max-cards ${maxCardsCap})`);
          }
        }
        console.log(`[UD] UD legs: ${filteredEv.length} → ${cappedCards.length} cards exported`);

        writeUnderdogCardsToFile(cappedCards, runTimestamp, oddsProvider, args);

        try {
          const ex = udSelectionBatch?.breakevenDropped[0];
          updatePreDiversificationCardDiagnosisSection("ud", {
            eligibleLegsAfterRunnerFilters: filteredEv.length,
            combosEnumeratedFromKCombinations: udBuilderStats?.combosEnumeratedFromKCombinations ?? 0,
            combosPassedConstructionGate: udBuilderStats?.combosPassedConstructionGate ?? 0,
            combosPassedStructureThreshold: udBuilderStats?.combosPassedStructureThreshold ?? 0,
            cardsPreDedupe: udBuilderStats?.cardsPreDedupe ?? 0,
            cardsPostDedupe: udBuilderStats?.cardsPostDedupe ?? 0,
            cardsAfterSelectionEngine: allCards.length,
            selectionEngineBreakevenDropped: udSelectionBatch?.breakevenDropped.length ?? 0,
            selectionEngineAntiDilutionAdjustments: udSelectionBatch?.antiDilutionAdjustments.length ?? 0,
            cardsInputToDiversificationLayer: allCards.length,
            cardsExportedAfterCapOrDiversification: cappedCards.length,
            portfolioDiversificationEnabled: args.portfolioDiversification,
            exampleBreakevenDropped: ex
              ? {
                  format: ex.format,
                  avgProb: ex.card.avgProb,
                  requiredBreakeven: getBreakevenThreshold(ex.card.flexType),
                  legIdsSample: ex.card.legs.map((l) => l.pick.id).slice(0, 8),
                }
              : null,
          });
        } catch (e76) {
          console.warn("[Phase76] pre-div diagnosis (UD):", (e76 as Error).message);
        }
      },
    },
    {
      id: "render_input",
      run: async () => {
        /* UD CSV row shaping + production logging: writeUnderdogCardsToFile (Phase 17L render contract). */
      },
    },
  ]);

  const finalSelectionObservability = buildUdFinalSelectionObservability({
    builtPreFinalSelection: udBuiltPreFinal,
    postFinalSelection: allCards,
    postExportCap: cappedCards,
  });

  const finalSelectionReasons = buildUdFinalSelectionReasons({
    builtPreFinalSelection: udBuiltPreFinal,
    postFinalSelectionRanked: allCards,
    postExportCap: cappedCards,
  });

  // Return summary for unified run_optimizer summary table (when shared legs used or always for API)
  const byStructure: Record<string, number> = {};
  for (const { format } of cappedCards) {
    const flexType = mapUnderdogStructureToFlexType(format);
    byStructure[flexType] = (byStructure[flexType] ?? 0) + 1;
  }

  const generatedByStructureId: Record<string, number> = {};
  for (const { format } of allCards) {
    generatedByStructureId[format] = (generatedByStructureId[format] ?? 0) + 1;
  }
  const exportedByStructureId: Record<string, number> = {};
  for (const { format } of cappedCards) {
    exportedByStructureId[format] = (exportedByStructureId[format] ?? 0) + 1;
  }
  const generatedByFlexTypePreCap: Record<string, number> = { ...byStructPreCap };
  const exportedByFlexType: Record<string, number> = { ...byStructure };

  const survival: UdSurvivalSnapshot = {
    rawScrapedProps: useSharedLegs ? null : rawPropsCount,
    mergedProps: useSharedLegs ? null : mergedPropsCount,
    evComputed: evPicks.length,
    afterFilterEvPicks: afterFilter.length,
    afterSiteFilter: filteredEv.length,
    finalLegPoolForCards: filteredEv.length,
    generatedTotal: allCards.length,
    generatedByStructureId,
    generatedByFlexTypePreCap,
    exportedTotal: cappedCards.length,
    exportedByStructureId,
    exportedByFlexType,
    maxCardsCap,
    autoBoostSecondPass,
    usedSharedLegs: useSharedLegs,
    udMinLegEv,
    udMinEdge,
    udVolume,
    allowedStandardStructureIds: [...UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION],
    allowedFlexStructureIds: UNDERDOG_FLEX_STRUCTURES.map((s) => s.id),
    notes: [
      "Opposite-side exclusion: k-combos require unique players per card (buildUdCardsFromFiltered); filterEvPicks applies udMinEdge then shared FCFS cap (1 leg per site+player+stat via shared_leg_eligibility).",
      "8F-heavy visible export when cap<generated: cards sorted by shared post-opt primary ranking (cardEv, winProbCash, leg ids) then slice — larger flex cards often rank higher.",
      "Standard UD generation uses UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION (≤6 legs); 7–8P standard IDs are registry-only per product rule.",
    ],
  };

  return {
    udCardCount: cappedCards.length,
    udByStructure: byStructure,
    udCards: cappedCards,
    survival,
    finalSelectionObservability,
    finalSelectionReasons,
  };
}

/**
 * Write Underdog cards to file using unified schema compatible with PrizePicks
 * This allows sheets_push_cards.py to be extended to handle both platforms
 */
function writeUnderdogCardsToFile(
  cards: { format: string; card: CardEvResult }[],
  runTimestamp: string,
  oddsProvider: string,
  cli: CliArgs
): void {
  // Transform Underdog cards to unified schema matching PrizePicks format
  const unifiedCards = cards.map(({ format, card }) => {
    // Calculate average probability and edge percentage (same as PrizePicks)
    const avgProb = card.legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / card.legs.length;
    const avgEdgePct = card.legs.reduce((sum, leg) => sum + (leg.pick.edge * 100), 0) / card.legs.length;
    
    // Extract leg IDs for CSV columns
    const legIds = card.legs.map(leg => leg.pick.id);
    
    // Use the adapter function for clear, type-safe mapping
    const flexType = mapUnderdogStructureToFlexType(format);

    return {
      site: 'UD',
      flexType,
      structureId: card.structureId ?? format,
      legs: card.legs,
      stake: card.stake || 1,
      totalReturn: card.totalReturn || 0,
      expectedValue: card.expectedValue || 0,
      winProbability: card.winProbability || 0,
      cardEv: card.cardEv,
      winProbCash: card.winProbCash,
      winProbAny: card.winProbAny,
      avgProb,
      avgEdgePct,
      hitDistribution: card.hitDistribution || {},
      legIds,
      kellyResult: card.kellyResult, // Proper mean-variance Kelly with caps
      rawCardEv: card.rawCardEv ?? card.cardEv,
      diversificationAdjustedScore: card.diversificationAdjustedScore,
      portfolioDiversification: card.portfolioDiversification,
      // Phase 95: pass through optional feature attachment (same as PP JSON)
      featureSnapshot: card.featureSnapshot,
      featureSignals: card.featureSignals,
    };
  });

  // Write JSON output (unified schema) — centralized output dir
  const cardsJsonPath = getOutputPath(UD_CARDS_JSON);
  fs.writeFileSync(
    cardsJsonPath,
    JSON.stringify({ runTimestamp, cards: unifiedCards }, null, 2),
    "utf8"
  );

  // Write CSV output (exact same column order as PrizePicks + site column)
  const cardsCsvPath = getOutputPath(UD_CARDS_CSV);
  const headers = [
    "Sport",
    "site",
    "flexType",
    "structureId",
    "Site-Leg",       // e.g. ud-6p, ud-7f (dashboard + Sheets)
    "Player-Prop-Line", // e.g. "LeBron PTS o24.5 | ..."
    "cardEv",
    "winProbCash",
    "winProbAny",
    "avgProb",
    "avgEdgePct",
    "leg1Id",
    "leg2Id",
    "leg3Id",
    "leg4Id",
    "leg5Id",
    "leg6Id",
    "leg7Id",
    "leg8Id",
    "runTimestamp",
    "kellyStake",
    "kellyFrac",
    "bestBetScore",
    "bestBetTier",
    "rawCardEv",
    "divAdjustedScore",
    "divPenaltyTotal",
  ];

  const rows: string[][] = [headers];
  
  for (const card of unifiedCards) {
    const uc = card as typeof card & {
      rawCardEv?: number;
      diversificationAdjustedScore?: number;
      portfolioDiversification?: { penaltyTotal: number };
    };
    const sport = card.legs.length > 0 ? card.legs[0].pick.sport : "NBA";
    
    const bankroll = cli.bankroll ?? 600;
    const kellyFrac = getKellyFraction(sport);
    const kellyStake = card.kellyResult?.recommendedStake
      ?? calculateKellyStake(card.cardEv, bankroll, sport);

    const bb = computeBestBetScore({
      cardEv: card.cardEv,
      avgEdgePct: card.avgEdgePct,
      winProbCash: card.winProbCash,
      legCount: card.legs.length,
      sport,
    });
    
    const siteLeg = `${card.site.toLowerCase()}-${card.flexType.toLowerCase()}`;
    const playerPropLine = card.legs.map(formatLegForPlayerPropLine).join(" | ");
    const row = [
      sport,
      card.site,
      card.flexType,
      card.structureId,
      siteLeg,
      playerPropLine,
      card.cardEv.toString(),
      card.winProbCash.toString(),
      card.winProbAny.toString(),
      card.avgProb.toString(),
      card.avgEdgePct.toString(),
      card.legIds[0] ?? "",
      card.legIds[1] ?? "",
      card.legIds[2] ?? "",
      card.legIds[3] ?? "",
      card.legIds[4] ?? "",
      card.legIds[5] ?? "",
      card.legIds[6] ?? "",
      card.legIds[7] ?? "",
      runTimestamp,
      kellyStake.toString(),
      kellyFrac.toString(),
      bb.score.toString(),
      bb.tier,
      uc.rawCardEv != null ? String(uc.rawCardEv) : "",
      uc.diversificationAdjustedScore != null ? String(uc.diversificationAdjustedScore) : "",
      uc.portfolioDiversification?.penaltyTotal != null
        ? String(uc.portfolioDiversification.penaltyTotal)
        : "",
    ].map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
    });

    rows.push(row);
  }

  const csvContent = rows.map(row => row.join(",")).join("\n");
  fs.writeFileSync(cardsCsvPath, csvContent, "utf8");

  console.log(
    `[UD] Wrote ${cards.length} cards to unified schema at ${runTimestamp}`
  );
  console.log(`[UD] JSON: ${cardsJsonPath}`);
  console.log(`[UD] CSV: ${cardsCsvPath}`);
  
  // Log bankroll usage for production tracking with detected odds provider
  const sportsProcessed = [...new Set(unifiedCards.flatMap(card => 
    card.legs.map((leg: any) => leg.pick.sport)
  ))];
  
  // Odds source for production logging (OddsAPI is the only live source; SGO/TRD removed)
  const provider = oddsProvider === "OddsAPI" ? "oddsapi_live" : "underdog_optimizer";
  logProductionRun(provider, sportsProcessed, cli.bankroll ?? 600);
}

/** Entry point for unified run (platform=both): pass PP-filtered legs for UD card parity. Returns summary when shared legs used. */
export async function runUnderdogOptimizer(
  sharedLegs?: EvPick[],
  cli?: CliArgs
): Promise<UdRunResult | void> {
  return main(sharedLegs, cli);
}

export { main };

/** Step 2 engine contract: expose filterEvPicks for ud_engine.ts wrapper (engine passes explicit CliArgs). */
export function filterEvPicksForEngine(evPicks: EvPick[], cli: CliArgs): EvPick[] {
  return filterEvPicks(evPicks, cli);
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
