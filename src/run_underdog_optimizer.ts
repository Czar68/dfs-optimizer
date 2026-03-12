// src/run_underdog_optimizer.ts
// Underdog optimizer models only Standard and Flex entries — the two modes
// exposed in the Underdog Pick'em UI.  There is no separate "Insured" mode;
// the insurance-like behaviour is the reduced-payout tiers within Flex ladders.

import "./load_env";
import fs from "fs";
import path from "path";
import { getOutputPath, getOutputDir, getDataPath, UD_LEGS_JSON, UD_LEGS_CSV, UD_CARDS_JSON, UD_CARDS_CSV, DATA_DIR, TOP_LEGS_JSON } from "./constants/paths";
import { mergeOddsWithProps, mergeOddsWithPropsWithMetadata, mergeWithSnapshot, OddsSourceMetadata, SnapshotAudit, MergePlatformStats } from "./merge_odds";
import { OddsSnapshotManager } from "./odds/odds_snapshot_manager";
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
import { loadUnderdogPropsFromFile } from "./load_underdog_props";
import { calculateKellyStake, getKellyFraction } from "./kelly_staking";
import { computeBestBetScore } from "./best_bets_score";
import { logBankrollUsage, logProductionRun } from "./bankroll_tracker";
import { cliArgs } from "./cli_args";
import { getBreakevenForStructure } from "./config/binomial_breakeven";
import {
  UNDERDOG_GLOBAL_LEG_EV_FLOOR,
  UNDERDOG_TARGET_ACCEPTED_CARDS,
  UNDERDOG_BASE_ATTEMPTS_PER_CARD,
  UNDERDOG_MAX_ATTEMPTS_FRACTION_OF_GLOBAL,
  UNDERDOG_STANDARD_STRUCTURES,
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

// Use shared cliArgs for all flags: --sports, --fresh, --no-cache, --min-ev, --min-edge, --date
// This means UD optimizer inherits the same CLI surface as the PP optimizer.
const sports: Sport[] = cliArgs.sports;
const udVolume = !!(cliArgs.udVolume || cliArgs.volume);
const GUARDRAIL_UD_MERGE_MIN_RATIO = 0.10;
const udMinLegEv   = udVolume ? 0.004 : (cliArgs.udMinEv ?? cliArgs.minEv ?? 0.012);
const udMinEdge    = cliArgs.minEdge ?? (udVolume ? 0.004 : 0.008);

console.log(`[UD] CLI sports: [${sports.join(',')}] | minLegEv=${(udMinLegEv * 100).toFixed(1)}% | minEdge=${(udMinEdge * 100).toFixed(1)}%${udVolume ? " | ud-volume=on" : ""}`);
console.log(`[UD] Note: edge vs 0.50 shown for PP convention; UD pricing handled by udAdjustedLegEv() (breakeven ~53.45%)`);

// Enhanced Underdog props fetch with priority order: scraped → API → manual
// Expected return shape: RawPick[] with fields for site, league, player, team, opponent, 
// stat, line, projectionId, gameId, startTime, and promo flags
async function fetchUnderdogRawPropsWithLogging(sports: Sport[]): Promise<RawPick[]> {
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

// ---------------------------------------------------------------------------
// UD per-pick payout factor resolution
// ---------------------------------------------------------------------------
// UD applies a multiplier to each selected pick that scales the entire card payout:
//   factor = decimal(higher_price) / 2.0
//   < 1.0  → UD discounts card payout (easy/favoured line, e.g. -184 → 0.77)
//   = 1.0  → neutral (even money, no adjustment)
//   > 1.0  → UD boosts payout (underdog/hard line)
//
// Resolution priority:
//   1. udPickFactor from the UD API options (set in fetch_underdog_props)
//   2. overOdds fallback when UD options had unrecognised choice naming
//   3. null  → treat as 1.0 (truly standard pick: no options, full structure payout)
function resolveUdFactor(p: EvPick): number | null {
  if (p.udPickFactor !== null && p.udPickFactor !== undefined) return p.udPickFactor;
  return null;
}

// ---------------------------------------------------------------------------
// UD factor-adjusted per-leg breakeven
// ---------------------------------------------------------------------------
// The correct per-leg EV filter for UD must account for the factor.
// For a 2P standard card (the smallest / lowest breakeven structure):
//   base_breakeven_per_leg = (1/3.5)^(1/2) = 53.45%
// With a per-leg factor f, the breakeven shifts to 0.5345 / f.
//
//   factor < 1.0 (discounted):  0.5345/f > 0.5345  → need even higher trueProb
//   factor = 1.0 (standard):    0.5345/f = 0.5345   → standard 53.45% threshold
//   factor > 1.0 (boosted):     0.5345/f < 0.5345   → easier to beat (lower trueProb ok)
//
// adjLegEv = trueProb - baseBE/factor. Only used for picks we analyze (factor >= 1 or null).
// Discounted picks (factor < 1, e.g. 0.82, 0.9) are declined before this is called.
function udAdjustedLegEv(p: EvPick): number {
  const factor = resolveUdFactor(p) ?? 1.0;
  const baseBE = getBreakevenForStructure("UD_2P_STD");
  return p.trueProb - baseBE / factor;
}

function filterEvPicks(evPicks: EvPick[], overrides?: { udMinLegEv?: number }): EvPick[] {
  // STRICT: decline ALL picks where UD payout factor < 1.0 (favorites).
  // Factor source: payout_multiplier from UD API, or derived from american_price.
  const minLegEvForFilter = overrides?.udMinLegEv ?? udMinLegEv;
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
    declined.slice(0, 5).forEach(s => console.log(`  ✗ ${s}`));
    if (declined.length > 5) console.log(`  … and ${declined.length - 5} more`);
  }
  if (nonStdBoosted.length > 0) {
    console.log(`[UD] ${nonStdBoosted.length} boosted picks (factor>1.0) will be analyzed`);
  }

  // STRICT filter: factor < 1.0 → DECLINE. factor === 1.0 or null → standard. factor > 1.0 → boosted.
  const isVolumeFilter = udVolume;
  const filteredByEv = evPicks.filter((p) => {
    const f = resolveUdFactor(p);
    if (f !== null && f < 1.0) return false;
    if (f === null || f === 1.0) {
      return p.legEv >= (isVolumeFilter ? 0.004 : 0.005);
    }
    const floor = isVolumeFilter ? -0.01 : 0;
    return udAdjustedLegEv(p) >= floor;
  });

  // Belt-and-suspenders: verify ZERO factor<1.0 picks leaked through
  const leakedCount = filteredByEv.filter(p => {
    const f = resolveUdFactor(p);
    return f !== null && f < 1.0;
  }).length;
  if (leakedCount > 0) {
    console.error(`[UD] CRITICAL: ${leakedCount} picks with factor<1.0 leaked through filter — removing`);
  }
  const safeFiltered = leakedCount > 0
    ? filteredByEv.filter(p => { const f = resolveUdFactor(p); return f === null || f >= 1.0; })
    : filteredByEv;

  const stdCount = safeFiltered.filter(p => resolveUdFactor(p) === null || resolveUdFactor(p) === 1.0).length;
  const boostCount = safeFiltered.filter(p => { const f = resolveUdFactor(p); return f !== null && f > 1.0; }).length;
  console.log(`[UD] Leg filter: ${safeFiltered.length} of ${evPicks.length} (${stdCount} std, ${boostCount} boost; declined ${declined.length} with factor<1.0)`);
  if (safeFiltered.length > 0) {
    console.log(`[UD]   adj-EV range: ${(Math.min(...safeFiltered.map(udAdjustedLegEv))*100).toFixed(1)}% – ${(Math.max(...safeFiltered.map(udAdjustedLegEv))*100).toFixed(1)}%`);
  }

  // Max 1 leg per player per stat
  const playerCounts = new Map<string, number>();
  const result: EvPick[] = [];

  for (const p of safeFiltered) {
    const key = `${p.site}:${p.player}:${p.stat}`;
    const count = playerCounts.get(key) ?? 0;
    if (count >= MAX_LEGS_PER_PLAYER) continue;
    playerCounts.set(key, count + 1);
    result.push(p);
  }

  return result;
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
  structureId?: string
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

function meetsUdStructureThresholdWithVolume(structureId: UnderdogStructureId, cardEv: number, volumeMode?: boolean): boolean {
  const threshold = getUnderdogStructureThreshold(structureId);
  const useVolume = volumeMode ?? udVolume;
  if (useVolume) {
    return cardEv >= -0.03;
  }
  return cardEv >= threshold.minCardEv;
}

/** Build UD cards from filtered legs with given volume mode and min leg EV (for auto-boost second pass). */
function buildUdCardsFromFiltered(
  filteredEv: EvPick[],
  volumeMode: boolean,
  minLegEv: number
): { format: string; card: CardEvResult }[] {
  const sortedEv = [...filteredEv].sort((a, b) => udAdjustedLegEv(b) - udAdjustedLegEv(a));
  const standardStructureIds: UnderdogStructureId[] = UNDERDOG_STANDARD_STRUCTURES.map((s) => s.id as UnderdogStructureId);
  const flexStructureIds: UnderdogStructureId[] = UNDERDOG_FLEX_STRUCTURES.map((s) => s.id as UnderdogStructureId);
  const allCards: { format: string; card: CardEvResult }[] = [];
  const GLOBAL_MAX_ATTEMPTS = 10000;

  const edgeFloor = cliArgs.minEdge ?? 0.008;
  const viableLegs = (sorted: EvPick[]) => sorted.filter(leg => leg.legEv >= minLegEv);
  const legsForStructure = (sorted: EvPick[], structureId: string) => {
    if (volumeMode) {
      return viableLegs(sorted);
    }
    const be = getBreakevenForStructure(structureId);
    return viableLegs(sorted).filter(leg => leg.trueProb >= be + edgeFloor);
  };

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
      const players = new Set(combo.map(l => l.player));
      if (players.size < combo.length) continue;
      const card = makeCardResultFromUd(combo, "power", structure.size, structureId);
      if (!meetsUdStructureThresholdWithVolume(structureId, card.cardEv, volumeMode)) continue;
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
      const players = new Set(combo.map(l => l.player));
      if (players.size < combo.length) continue;
      const card = makeCardResultFromUd(combo, "flex", structure.size, structureId);
      if (!meetsUdStructureThresholdWithVolume(structureId, card.cardEv, volumeMode)) continue;
      allCards.push({ format: structureId, card });
    }
  }

  allCards.sort((a, b) => b.card.cardEv - a.card.cardEv);
  return allCards;
}

export interface UdRunResult {
  udCardCount: number;
  udByStructure: Record<string, number>;
  udCards: { format: string; card: CardEvResult }[];
}

async function main(sharedLegs?: EvPick[]): Promise<UdRunResult | void> {
  const tsBase = cliArgs.date ? new Date(`${cliArgs.date}T12:00:00`) : new Date();
  const runTimestamp = toEasternIsoString(tsBase);
  const useSharedLegs = sharedLegs != null && sharedLegs.length > 0;

  let evPicks: EvPick[];
  let oddsProvider: string;

  if (useSharedLegs) {
    // Phase 5: identical legs — use PP-filtered legs from unified run (platform=both)
    evPicks = sharedLegs!;
    oddsProvider = "shared (PP legs)";
    console.log(`[UD] Using ${evPicks.length} shared legs from PrizePicks pipeline (PP.model === UD.model)`);
    if (cliArgs.debug) {
      console.log(`[UD] [debug] Shared leg sample: ${evPicks.slice(0, 3).map(p => `${p.player} ${p.stat} ${p.line}`).join(" | ")}`);
    }
  } else if (cliArgs.mockLegs != null && cliArgs.mockLegs > 0) {
    console.log(`[UD] [Mock] Injecting ${cliArgs.mockLegs} synthetic legs.`);
    evPicks = createSyntheticEvPicks(cliArgs.mockLegs, "underdog");
    oddsProvider = "mock";
    console.log(`[UD] Pick funnel: mock=${evPicks.length} (no merge)`);
    console.log(`Odds source: mock (synthetic legs)`);
  } else {
    const rawProps: RawPick[] = await fetchUnderdogRawPropsWithLogging(sports);
    writeUnderdogImportedCsv(rawProps);

    // Use OddsSnapshotManager when configured (PP already fetched snapshot)
    const existingSnapshot = OddsSnapshotManager.getCurrentSnapshot();
    let result: { odds: MergedPick[]; metadata: OddsSourceMetadata; platformStats?: MergePlatformStats };
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
      result = await mergeWithSnapshot(rawProps, existingSnapshot.rows, snapshotMeta, snapshotAudit);
      console.log(`Odds source: ${existingSnapshot.source} (${existingSnapshot.refreshMode}), snapshot=${existingSnapshot.snapshotId}, age=${existingSnapshot.ageMinutes.toFixed(1)}m [shared with PP]`);
    } else {
      result = await mergeOddsWithPropsWithMetadata(rawProps);
      if (result.metadata.isFromCache) {
        const fetchedAt = result.metadata.fetchedAt ? new Date(result.metadata.fetchedAt).toLocaleString() : "unknown";
        console.log(`Odds source: cache (from ${result.metadata.originalProvider || "unknown"}, fetched at ${fetchedAt})`);
      } else {
        const provider = result.metadata.providerUsed;
        const timestamp = result.metadata.fetchedAt ? new Date(result.metadata.fetchedAt).toLocaleString() : new Date().toLocaleString();
        console.log(`Odds source: ${provider ?? "none"} (fresh), fetched at ${timestamp}`);
      }
    }

    const merged: MergedPick[] = result.odds;
    console.log(`[UD DEBUG] Input merged: ${merged?.length ?? 0}`);
    try {
      evPicks = calculateEvForMergedPicks(merged);
      console.log(`[UD DEBUG] EV calc: ${evPicks?.length ?? 0}`);
    } catch (e) {
      console.error("[UD CRASH] EV calc failed:", e);
      evPicks = [];
    }
    if (evPicks.length < 10 && (cliArgs.volume || cliArgs.udVolume)) {
      console.log("[UD DEBUG] Volume mode: <10 legs → injecting 30 mock UD legs");
      evPicks = createSyntheticEvPicks(30, "underdog");
    }
    oddsProvider = result.metadata.providerUsed;

    console.log(`[UD] Pick funnel: raw=${rawProps.length} → merged=${merged.length} (merge rate: ${rawProps.length ? ((100 * merged.length) / rawProps.length).toFixed(1) : 0}%)`);

    if (!cliArgs.noGuardrails) {
      const udStats = result.platformStats?.underdog;
      if (udStats && udStats.rawProps > 0) {
        const mergedCount = udStats.mergedExact + udStats.mergedNearest;
        const ratio = mergedCount / udStats.rawProps;
        if (ratio < GUARDRAIL_UD_MERGE_MIN_RATIO) {
          console.error(`[GUARDRAIL] FATAL: UD merge ratio ${(ratio * 100).toFixed(1)}% below ${(GUARDRAIL_UD_MERGE_MIN_RATIO * 100)}%. Refusing to ship. Use --no-guardrails to override.`);
          process.exit(1);
        }
      }
    }
  }

  const afterFilter = filterEvPicks(evPicks);
  // When using shared legs (platform=both), keep all legs that pass EV filter; otherwise restrict to site=underdog
  const filteredEv = useSharedLegs ? afterFilter : afterFilter.filter((p) => p.site === "underdog");
  const udEvPicks = evPicks.filter((p) => p.site === "underdog");

  // Diagnostic: where legs are lost (compare to PrizePicks raw/merged/filtered in run_optimizer logs)
  if (useSharedLegs) {
    console.log(`[UD] Leg funnel: shared=${evPicks.length} → after filterEvPicks=${afterFilter.length} → final legs=${filteredEv.length}`);
  } else {
    console.log(`[UD] Leg funnel: merged UD=${udEvPicks.length} → after filterEvPicks=${afterFilter.length} → final legs=${filteredEv.length}`);
  }
  if (cliArgs.debug && filteredEv.length > 0) {
    console.log(`[UD] [debug] adj-EV range: ${(Math.min(...filteredEv.map(udAdjustedLegEv)) * 100).toFixed(2)}% – ${(Math.max(...filteredEv.map(udAdjustedLegEv)) * 100).toFixed(2)}%`);
  }

  // Ensure pipeline output directory exists
  const outDir = getOutputDir();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Write underdog-legs.json / .csv (centralized output dir)
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

  // Update data/top_legs.json so dashboard bench has fresh UD top 10 when UD runs standalone
  const topLegsPath = getDataPath(TOP_LEGS_JSON);
  const udValueMetric = (p: EvPick) => p.adjEv ?? p.legEv;
  const udTop10 = [...filteredEv]
    .sort((a, b) => udValueMetric(b) - udValueMetric(a))
    .slice(0, 10)
    .map((leg) => ({
      id: leg.id,
      player: leg.player,
      team: leg.team ?? null,
      stat: leg.stat,
      line: leg.line,
      edge: leg.edge,
      legEv: leg.legEv,
      value_metric: udValueMetric(leg),
    }));
  let existing: { prizePicks?: unknown[]; underdog?: unknown[] } = { prizePicks: [], underdog: [] };
  if (fs.existsSync(topLegsPath)) {
    try {
      const raw = fs.readFileSync(topLegsPath, "utf8");
      existing = JSON.parse(raw) as { prizePicks?: unknown[]; underdog?: unknown[] };
    } catch {
      // keep default
    }
  }
  const dataDir = path.join(process.cwd(), DATA_DIR);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    topLegsPath,
    JSON.stringify(
      { prizePicks: existing.prizePicks ?? [], underdog: udTop10 },
      null,
      2
    ),
    "utf8"
  );
  console.log(`✅ Wrote top ${udTop10.length} UD legs to data/top_legs.json (bench)`);

  const legsCsvPath = getOutputPath(UD_LEGS_CSV);
  // Match PrizePicks Legs sheet schema: Sport,id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime,IsWithin24h,IsNonStandardOdds
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
          isWithin24h = (diffMs >= 0 && diffMs <= 24 * 60 * 60 * 1000) ? "TRUE" : "FALSE";
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

  // 2) Build UD cards from filteredEv; auto-boost: if real slate and <20 cards, retry with ud_volume + minLegEv 0.8%
  let allCards = buildUdCardsFromFiltered(filteredEv, udVolume, udMinLegEv);
  const byStructPreCap: Record<string, number> = {};
  for (const { format } of allCards) {
    const ft = mapUnderdogStructureToFlexType(format);
    byStructPreCap[ft] = (byStructPreCap[ft] ?? 0) + 1;
  }
  console.log(`[UD] Cards generated: ${allCards.length} (before cap) | legs: ${filteredEv.length} raw → ${Object.entries(byStructPreCap).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  const isRealSlate = cliArgs.mockLegs == null;
  if (allCards.length < 20 && isRealSlate && !udVolume) {
    console.log("[UD] Auto boost: <20 cards on real slate, retrying with ud_volume + minLegEv 0.8%");
    const filteredEvBoost = filterEvPicks(evPicks, { udMinLegEv: 0.008 });
    allCards = buildUdCardsFromFiltered(filteredEvBoost, true, 0.008);
  }

  if (allCards.length === 0 && filteredEv.length > 0) {
    console.log(`\n[UD] ⚠ 0 cards from ${filteredEv.length} legs — all combos rejected by structure EV thresholds.`);
    console.log(`[UD]   This means Underdog has priced today's slate accurately — no exploitable edge found.`);
    console.log(`[UD]   Discounted picks (factor<1) reduce payouts too much; standard/boosted picks lack raw edge.`);
  } else if (allCards.length === 0 && filteredEv.length === 0) {
    console.log(`\n[UD] ⚠ 0 legs passed factor-aware filter — no UD edge on this slate.`);
    console.log(`[UD]   ${evPicks.filter(p => p.site === "underdog").length} merged picks, but all have trueProb too close to breakeven.`);
  }

  // Phase 5: post-EV cap per site (--max-cards)
  const maxCardsCap = cliArgs.maxCards ?? 800;
  const cappedCards = allCards.slice(0, maxCardsCap);
  if (allCards.length > maxCardsCap) {
    console.log(`[UD] Capped export: ${allCards.length} cards → top ${maxCardsCap} by EV (--max-cards ${maxCardsCap})`);
  }
  console.log(`[UD] UD legs: ${filteredEv.length} → ${cappedCards.length} cards exported`);

  // Write Underdog cards using unified schema (compatible with PrizePicks)
  writeUnderdogCardsToFile(cappedCards, runTimestamp, oddsProvider);

  // Return summary for unified run_optimizer summary table (when shared legs used or always for API)
  const byStructure: Record<string, number> = {};
  for (const { format } of cappedCards) {
    const flexType = mapUnderdogStructureToFlexType(format);
    byStructure[flexType] = (byStructure[flexType] ?? 0) + 1;
  }
  return {
    udCardCount: cappedCards.length,
    udByStructure: byStructure,
    udCards: cappedCards,
  };
}

/**
 * Write Underdog cards to file using unified schema compatible with PrizePicks
 * This allows sheets_push_cards.py to be extended to handle both platforms
 */
function writeUnderdogCardsToFile(
  cards: { format: string; card: CardEvResult }[],
  runTimestamp: string,
  oddsProvider: string
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
      structureId: format,
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
  ];

  const rows: string[][] = [headers];
  
  for (const card of unifiedCards) {
    const sport = card.legs.length > 0 ? card.legs[0].pick.sport : "NBA";
    
    const bankroll = cliArgs.bankroll ?? 600;
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
  logProductionRun(provider, sportsProcessed, cliArgs.bankroll ?? 600);
}

/** Entry point for unified run (platform=both): pass PP-filtered legs for UD card parity. Returns summary when shared legs used. */
async function runUnderdogOptimizer(sharedLegs?: EvPick[]): Promise<UdRunResult | void> {
  return main(sharedLegs);
}

export { runUnderdogOptimizer, main };

// Step 2 engine contract: expose filterEvPicks for ud_engine.ts wrapper
export { filterEvPicks as filterEvPicksForEngine };

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
