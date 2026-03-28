// src/merge_odds.ts

import {
  RawPick,
  MergedPick,
  InternalPlayerPropOdds,
  StatCategory,
  Sport,
} from "./types";
import { americanToProb, devigTwoWay, probToAmerican } from "./odds_math";
import { fetchPlayerPropOdds } from "./odds/OddsProvider";
import { oddsCache, OddsFetchConfig, OddsCache } from "./odds_cache";
import type { CliArgs } from "./cli_args";
import {
  getBookWeightValue,
  getEffectiveBookWeight,
  computeDynamicBookAccuracy,
  isConsensusEligible,
  PROP_WEIGHTS,
  DynamicBookAccuracy,
} from "./odds/book_ranker";
import { readTrackerRows } from "./perf_tracker_db";
import fs from "fs";
import path from "path";
import { writeOddsImportedCsv, writeMergeReportCsv } from "./export_imported_csv";
import {
  UD_ALT_LINE_MAX_DELTA,
  UD_ALT_MATCH_STATS,
  canonicalMergeDropReason,
  isPrizePicksComboPlayerLabel,
  type MergeDropRecord,
} from "./merge_contract";
import { finalizeMergeAuditArtifacts, type MergeAuditSnapshot } from "./reporting/merge_audit";
import { applyMergeQualityOperatorHooks } from "./reporting/merge_quality_operator";

export type { MergeAuditSnapshot } from "./reporting/merge_audit";

/** Phase O read-only: `oddsMarkets` reference from latest `mergeCore` (post-composite synthesis). */
let lastMergeOddsMarketsForDiagnostics: InternalPlayerPropOdds[] | null = null;

export function getLastMergeOddsMarketsSnapshot(): InternalPlayerPropOdds[] | null {
  return lastMergeOddsMarketsForDiagnostics;
}

// Interface for odds source metadata (OddsAPI or none).
export interface OddsSourceMetadata {
  isFromCache: boolean;
  providerUsed: "OddsAPI" | "none";
  fetchedAt?: string;
  originalProvider?: string;
}

/** Per-platform merge counts for guardrails (PP/UD merge ratio). */
export interface MergePlatformRow {
  rawProps: number;
  /** Rows that passed pre-merge filters and reached `findBestMatch` (excludes promo/special, fantasy, no-odds-stat, etc.). */
  matchEligible: number;
  mergedExact: number;
  mergedNearest: number;
  noCandidate: number;
  lineDiff: number;
  noOddsStat: number;
  juice: number;
}

export interface MergePlatformStats {
  [platform: string]: MergePlatformRow;
}

export interface MergeStageAccounting {
  source: {
    providerUsed: "OddsAPI" | "none";
    originalProvider?: string;
  };
  rawRows: number;
  propsConsideredForMatchingRows: number;
  totalOddsRowsConsidered: number;
  matchedRows: number;
  unmatchedPropRows: number;
  unmatchedOddsRows: number;
  emittedRows: number;
  filteredBeforeMergeRows: number;
  noMatchRows: number;
  skippedByReason: {
    promoOrSpecial: number;
    fantasyExcluded: number;
    /** Phase 60 — PP multi-player labels (`player` contains `" + "`), excluded before matching. */
    comboLabelExcluded: number;
    noOddsStat: number;
    escalatorFiltered: number;
    noCandidate: number;
    lineDiff: number;
    juice: number;
  };
  unmatchedAttribution: {
    propsBySite: Record<string, number>;
    propsByReason: Record<string, number>;
    oddsByBook: Record<string, number>;
  };
  /** PrizePicks merge-health snapshot (primary PP guardrail uses `ratioEligible`). */
  ppMergeHealth?: {
    rawProps: number;
    matchEligible: number;
    preMergeSkipped: number;
    merged: number;
    ratioRaw: number;
    ratioEligible: number;
    /** Documents which ratio the PP merge guardrail enforces. */
    guardrailRatioBasis: "match_eligible";
  };
  /** Phase 115 — `PLAYER_NAME_ALIASES` map hits on match-eligible picks (deterministic; not fuzzy). */
  explicitAliasResolutionHits: number;
  /** Phase 115 — Merged picks where >1 book contributed to sharp-weighted consensus. */
  multiBookConsensusPickCount: number;
  /** Phase P — PP merged legs only: consensus breadth / de-vig dispersion (reporting). */
  ppConsensusDispersion?: PpConsensusDispersionSummary;
}

/** Phase P — operator-facing summary over PP merged rows (same merge pass). */
export interface PpConsensusDispersionSummary {
  nPpMerged: number;
  meanConsensusBookCount: number;
  meanDevigSpreadOver: number;
  p95DevigSpreadOver: number | null;
  /** Share of PP rows with `ppNConsensusBooks > 1`. */
  shareMultiBookConsensus: number;
}

// NOTE: Fantasy support modules (fantasy.ts, fantasy_analyzer.ts) are already
// implemented and can be re‑enabled for EV/fantasy workflows once you have
// independent projections / historical data wired in. For now, fantasy props
// are explicitly excluded from the EV legs/cards flow.

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Normalize stat names from odds/props to canonical StatCategory
const STAT_MAP: Record<string, StatCategory> = {
  points: "points",
  pts: "points",
  player_points: "points",
  rebounds: "rebounds",
  rebs: "rebounds",
  reb: "rebounds",
  player_rebounds: "rebounds",
  assists: "assists",
  asts: "assists",
  ast: "assists",
  player_assists: "assists",
  threes: "threes",
  threes_made: "threes",
  threesMade: "threes",
  "3pm": "threes",
  "3pt_made": "threes",
  threepointersmade: "threes",
  player_threes: "threes",
  three_pointers_made: "threes",
  three_pointers: "threes",
  steals: "steals",
  stl: "steals",
  player_steals: "steals",
  blocks: "blocks",
  blk: "blocks",
  player_blocks: "blocks",
  turnovers: "turnovers",
  to: "turnovers",
  tov: "turnovers",
  player_turnovers: "turnovers",
  stocks: "stocks",
  "steals+blocks": "stocks",
  steals_blocks: "stocks",
  "blks+stls": "stocks",
  pra: "pra",
  points_rebounds_assists: "pra",
  "pts+reb+ast": "pra",
  player_pra: "pra",
  pts_rebs_asts: "pra",
  "pts+rebs+asts": "pra",
  points_rebounds: "points_rebounds",
  "points+rebounds": "points_rebounds",
  "pts+reb": "points_rebounds",
  pts_rebs: "points_rebounds",
  "pts+rebs": "points_rebounds",
  pr: "points_rebounds",
  points_assists: "points_assists",
  "points+assists": "points_assists",
  "pts+ast": "points_assists",
  pts_asts: "points_assists",
  "pts+asts": "points_assists",
  pa: "points_assists",
  /** PrizePicks-style shorthand; explicit token match only (no fuzzy). */
  "p+a": "points_assists",
  rebounds_assists: "rebounds_assists",
  /** PrizePicks-style shorthand; explicit token match only (no fuzzy). */
  "r+a": "rebounds_assists",
  "rebounds+assists": "rebounds_assists",
  "reb+ast": "rebounds_assists",
  rebs_asts: "rebounds_assists",
  "rebs+asts": "rebounds_assists",
  ra: "rebounds_assists",
  fantasy_score: "fantasy_score",
  fantasy: "fantasy_score",
  /** Lowercase alias for camelCase feed keys (STAT_MAP lookup is case-insensitive). */
  threesmade: "threes",
};
/**
 * Map odds/prop stat strings to canonical {@link StatCategory} for merge matching.
 * Phase 45: case-insensitive + trim so feeds/CSVs using PTS, Points, player_points, etc.
 * align with OddsAPI rows without widening line tolerance (reduces spurious no_candidate).
 */
function normalizeStatForMerge(stat: string): string {
  const s = String(stat).trim();
  const mapped = STAT_MAP[s] ?? STAT_MAP[s.toLowerCase()];
  return mapped ?? s;
}

// Strip diacritics so "Nikola Jokić" matches "Nikola Jokic" (from CSV exports)
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Strip common suffixes so "Jaren Jackson Jr" matches "Jaren Jackson" (from CSV exports)
function stripNameSuffix(s: string): string {
  return s
    .replace(/\s+jr\.?$/i, "")
    .replace(/\s+sr\.?$/i, "")
    .replace(/\s+iii$/i, "")
    .replace(/\s+ii$/i, "")
    .replace(/\s+iv$/i, "")
    .trim();
}

// Normalize benign punctuation drift across providers:
// - "T.J. McConnell" vs "TJ McConnell"
// - "Day'Ron Sharpe" vs "Dayron Sharpe"
// - "Nickeil Alexander-Walker" vs "Nickeil Alexander Walker"
// This is deliberately narrow and deterministic (no fuzzy distance matching).
function stripNamePunctuation(s: string): string {
  return s
    .replace(/[.'’-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Full normalization for name comparison: lower, accents off, suffixes off
function normalizeForMatch(name: string): string {
  return stripNamePunctuation(stripNameSuffix(stripAccents(normalizeName(name))));
}

// Map PP/UD normalized names that don't match OddsAPI format (e.g. "J. Brunson" → "jalen brunson")
// Add entries when imported CSVs show same player with different spelling; key = PP/UD player_lower
const PLAYER_NAME_ALIASES: Record<string, string> = {
  "j. brunson": "jalen brunson",
  "m. bridges": "mikal bridges",
  "c. anthony": "cole anthony",
  "j. green": "jalen green",
  "j. jackson": "jaren jackson jr",
  "j. murray": "jamal murray",
  "k. murray": "keegan murray",
  "n. jokic": "nikola jokic",
  "nikola jokić": "nikola jokic",
  // Underdog-specific name variants observed in merge_report_underdog.csv
  "t.j. mcconnell": "tj mcconnell",
  "kel'el ware": "kelel ware",
  "day'ron sharpe": "dayron sharpe",
  "derrick jones jr.": "derrick jones",
  "jaime jaquez jr.": "jaime jaquez",
  "tim hardaway jr.": "tim hardaway",
  "p.j. washington": "pj washington",
  "a.j. green": "aj green",
  "nickeil alexander-walker": "nickeil alexander walker",
  // Phase 64 — evidence: `prizepicks_imported.csv` display name vs `oddsapi_imported.csv` (same run, NBA).
  // PP "Herbert Jones" → OddsAPI "Herb Jones" (e.g. FanDuel description).
  "herbert jones": "herb jones",
  // PP "Tristan Silva" → OddsAPI "Tristan da Silva" (legal/registered name in books).
  "tristan silva": "tristan da silva",
};

// Stats that the odds feed does not carry for NBA.
// Fallback set is empty; dynamic detection catches any stat gaps per run.
const UD_STATS_NOT_IN_ODDS_FALLBACK = new Set<string>();

// Underdog "points escalator" alternate lines: very low (≤2.5) lines for
// points that are never matchable because odds only exist near the main line.
// Skip them to avoid line_diff noise and reduce merge overhead.
const UD_ESCALATOR_STATS = new Set(["points"]);
const UD_ESCALATOR_MAX_LINE = 2.5;

// Site-specific juice thresholds (derived per-merge from threaded CliArgs — Phase 17Y).
// PP: max absolute value of under odds we accept (default 180). UD default 200.

// Build the set of Underdog stats to skip dynamically from the odds feed each
// run. Any stat offered by Underdog but absent from the odds data is silently
// pre-filtered (avoids no_candidate noise). We union with the fallback set so
// new stats not yet observed in the feed are also skipped.
function buildUdStatsNotInOdds(
  oddsMarkets: InternalPlayerPropOdds[],
  udStatCandidates: Set<string>
): Set<string> {
  const oddsStatSet = new Set<string>(
    oddsMarkets.map((o) => normalizeStatForMerge(String(o.stat)))
  );
  const absent = new Set<string>(UD_STATS_NOT_IN_ODDS_FALLBACK);
  for (const stat of udStatCandidates) {
    const norm = normalizeStatForMerge(String(stat));
    if (!oddsStatSet.has(norm)) absent.add(stat);
  }
  return absent;
}

// PP v4: dynamic detection of stats not in the odds feed for PrizePicks.
// PP fallback is empty — PP covers the same core stats as OddsAPI. Dynamic
// detection still catches any new PP-only props (e.g. "fantasy_score" variants)
// that might appear without a corresponding odds market.
const PP_STATS_NOT_IN_ODDS_FALLBACK = new Set<string>(["fantasy_score", "fantasy"]);

function buildPpStatsNotInOdds(
  oddsMarkets: InternalPlayerPropOdds[],
  ppStatCandidates: Set<string>
): Set<string> {
  const oddsStatSet = new Set<string>(
    oddsMarkets.map((o) => normalizeStatForMerge(String(o.stat)))
  );
  const absent = new Set<string>(PP_STATS_NOT_IN_ODDS_FALLBACK);
  for (const stat of ppStatCandidates) {
    const norm = normalizeStatForMerge(String(stat));
    if (!oddsStatSet.has(norm)) absent.add(stat);
  }
  return absent;
}

function resolvePlayerNameForMatch(normalizedFromPick: string): string {
  return PLAYER_NAME_ALIASES[normalizedFromPick] ?? normalizedFromPick;
}

/**
 * Phase 53 — Read-only diagnostics key: same pick-side pipeline as merge matching
 * (`normalizeName` → `resolvePlayerNameForMatch` → `normalizeForMatch`). Does not affect matching.
 */
export function normalizePickPlayerKeyForDiagnostics(player: string): string {
  return normalizeForMatch(resolvePlayerNameForMatch(normalizeName(player)));
}

// Normalize OddsAPI player names (handles IDs like "KEVIN_DURANT_1_NBA")
function normalizeOddsPlayerName(id: string): string {
  const parts = id.split("_");
  if (parts.length <= 2) {
    return normalizeName(id);
  }
  // Drop number + league suffix
  const nameParts = parts.slice(0, -2);
  return normalizeName(nameParts.join(" "));
}

/**
 * Phase O read-only: same book pool as merge Phase 7.3 consensus (exact-first + PP Phase K filter).
 */
export function buildPpConsensusBookMatchesForDiagnostics(
  pick: RawPick,
  oddsMarkets: InternalPlayerPropOdds[],
  maxLineDiff: number
): InternalPlayerPropOdds[] {
  const site = (pick as { site?: string }).site ?? "prizepicks";
  const targetNameForMulti = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
  const pickStatNormForMulti = normalizeStatForMerge(pick.stat);
  const allBookCandidates = oddsMarkets.filter((o) => {
    const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
    return (
      oddsName === targetNameForMulti &&
      normalizeStatForMerge(o.stat) === pickStatNormForMulti &&
      o.sport === pick.sport &&
      o.league.toUpperCase() === pick.league.toUpperCase() &&
      Math.abs(o.line - pick.line) <= maxLineDiff
    );
  });
  const exactBookMatches = allBookCandidates.filter((o) => o.line === pick.line);
  const allBookMatches = exactBookMatches.length > 0 ? exactBookMatches : allBookCandidates;
  const consensusBookMatches =
    site === "prizepicks"
      ? (() => {
          const nonPp = allBookMatches.filter(
            (o) => String(o.book ?? "").trim().toLowerCase() !== "prizepicks"
          );
          return nonPp.length > 0 ? nonPp : allBookMatches;
        })()
      : allBookMatches;
  return consensusBookMatches;
}

// Phase 2: Alt-line match tolerance — SSOT `src/merge_contract.ts` (`UD_ALT_LINE_MAX_DELTA`).
// When the main pass fails (delta > maxLineDiff) we try a second pass against
// confirmed alt lines (isMainLine === false) within this wider window.
// Cap at 2.5 → we accept alt line at delta 0–2.5. Tighter deltas prefer the
// closest alt; the probability estimate for the nearest alt line is used, which
// is a bounded approximation acceptable for card-level EV DP.
export { UD_ALT_LINE_MAX_DELTA, UD_ALT_MATCH_STATS } from "./merge_contract";

function isJuiceTooExtreme(american: number, maxJuice: number): boolean {
  return american <= -maxJuice;
}

function isRejectedByJuiceForPick(
  pick: RawPick,
  oddsRow: InternalPlayerPropOdds,
  maxJuice: number
): boolean {
  const outcome = (pick as { outcome?: unknown }).outcome;
  if (outcome === "over") {
    return typeof oddsRow.overOdds === "number" && isJuiceTooExtreme(oddsRow.overOdds, maxJuice);
  }
  if (outcome === "under") {
    return typeof oddsRow.underOdds === "number" && isJuiceTooExtreme(oddsRow.underOdds, maxJuice);
  }
  // Backward-compatible fail-closed default for rows without explicit side.
  return typeof oddsRow.underOdds === "number" && isJuiceTooExtreme(oddsRow.underOdds, maxJuice);
}

type MatchResult =
  | { match: InternalPlayerPropOdds; matchType: "main" | "alt"; delta: number }
  | { reason: "no_candidate" }
  | { reason: "line_diff"; bestLine: number; bestPlayerNorm: string }
  | { reason: "juice"; bestLine: number; bestPlayerNorm: string };

/**
 * Find the best odds candidate for a pick.
 * Strategy: exact-first — if any candidate has line === pick.line, use it
 * and never fall through to nearest. Nearest-within-tolerance is only used
 * when NO exact match exists among candidates.
 */
function findBestMatchForPickWithReason(
  pick: RawPick,
  oddsMarkets: InternalPlayerPropOdds[],
  maxJuice: number,
  maxLineDiff: number
): MatchResult {
  const targetName = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));

  const pickStatNorm = normalizeStatForMerge(pick.stat);
  const candidates = oddsMarkets.filter((o) => {
    const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
    return (
      oddsName === targetName &&
      normalizeStatForMerge(o.stat) === pickStatNorm &&
      o.sport === pick.sport &&
      o.league.toUpperCase() === pick.league.toUpperCase()
    );
  });

  if (!candidates.length) return { reason: "no_candidate" };

  // Exact-first: prefer line === pick.line, avoiding nearest when exact exists
  const exactMatches = candidates.filter((c) => c.line === pick.line);
  if (exactMatches.length > 0) {
    const best = exactMatches[0];
    if (isRejectedByJuiceForPick(pick, best, maxJuice)) {
      const bestPlayerNorm = normalizeForMatch(normalizeOddsPlayerName(best.player));
      return { reason: "juice", bestLine: best.line, bestPlayerNorm };
    }
    const matchType: "main" | "alt" = best.isMainLine === false ? "alt" : "main";
    return { match: best, matchType, delta: 0 };
  }

  // No exact → nearest within tolerance
  let best = candidates[0];
  let bestDiff = Math.abs(best.line - pick.line);
  for (const c of candidates.slice(1)) {
    const diff = Math.abs(c.line - pick.line);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  }

  const bestPlayerNorm = normalizeForMatch(normalizeOddsPlayerName(best.player));

  if (bestDiff > maxLineDiff) return { reason: "line_diff", bestLine: best.line, bestPlayerNorm };
  if (isRejectedByJuiceForPick(pick, best, maxJuice))
    return { reason: "juice", bestLine: best.line, bestPlayerNorm };

  const matchType: "main" | "alt" = best.isMainLine === false ? "alt" : "main";
  return { match: best, matchType, delta: bestDiff };
}

/**
 * Phase 2: Alt-line second-pass match for Underdog picks.
 *
 * Called only when the main pass returns line_diff. Searches the OddsAPI alt-line
 * pool (isMainLine === false) within UD_ALT_LINE_MAX_DELTA.
 *
 * Logs every rescue: "PTS_alt delta=0.5 fanduel -110 [Jokic 29.5→29.0]"
 *
 * EV accuracy note: the odds from the nearest alt line are used to estimate
 * true probability. For delta ≤ 1.5 this is a close approximation; at delta
 * 2.0–2.5 it slightly underestimates difficulty. Acceptable for card-level DP
 * but flagged via matchType="alt" and altMatchDelta in MergedPick.
 */
function findBestAltMatch(
  pick: RawPick,
  oddsMarkets: InternalPlayerPropOdds[],
  maxJuice: number
): (MatchResult & { match: InternalPlayerPropOdds }) | null {
  if (!UD_ALT_MATCH_STATS.has(pick.stat)) return null;

  const targetName = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));

  const pickStatNorm = normalizeStatForMerge(pick.stat);
  // Only consider confirmed alt lines from the Phase 1 harvest
  const altCandidates = oddsMarkets.filter((o) => {
    if (o.isMainLine !== false) return false; // must be an alt line
    const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
    return (
      oddsName === targetName &&
      normalizeStatForMerge(o.stat) === pickStatNorm &&
      o.sport === pick.sport &&
      o.league.toUpperCase() === pick.league.toUpperCase() &&
      Math.abs(o.line - pick.line) <= UD_ALT_LINE_MAX_DELTA
    );
  });

  if (!altCandidates.length) return null;

  // Pick the closest alt line by delta; break ties by best over odds
  altCandidates.sort((a, b) => {
    const da = Math.abs(a.line - pick.line);
    const db = Math.abs(b.line - pick.line);
    if (Math.abs(da - db) > 0.01) return da - db;
    return (b.overOdds ?? -999) - (a.overOdds ?? -999); // better over odds wins
  });

  const best = altCandidates[0];
  const delta = Math.abs(best.line - pick.line);

  if (typeof best.overOdds === "number" && isJuiceTooExtreme(best.overOdds, maxJuice)) return null;
  if (typeof best.underOdds === "number" && isJuiceTooExtreme(best.underOdds, maxJuice)) return null;

  console.log(
    `  [alt_match] ${pick.stat.toUpperCase()}_alt delta=${delta.toFixed(1)} ` +
    `${best.book} over=${best.overOdds} [${pick.player} ` +
    `${pick.line}→${best.line}]`
  );

  return { match: best, matchType: "alt" as const, delta };
}

function findBestMatchForPick(
  pick: RawPick,
  oddsMarkets: InternalPlayerPropOdds[],
  maxJuice: number,
  maxLineDiff: number
): InternalPlayerPropOdds | null {
  const result = findBestMatchForPickWithReason(pick, oddsMarkets, maxJuice, maxLineDiff);
  return "match" in result ? result.match : null;
}

// ── Phase 8: Composite stat fallback ─────────────────────────────────────────
//
// When OddsAPI doesn't carry a combo stat (PRA, PA, 3PTM) for a player but does
// carry its components, synthesize a fallback odds entry so the pick isn't
// dropped as no_candidate.
//
// Synthesis rules:
//   PRA missing → combine PA + REB (or PTS + AST + REB); corr weight 0.6
//   PA  missing → PRA − REB (if both present)
//   3PTM missing → estimate from points line * league-avg fg3_pct (~0.36)
//
// The synthesized odds are approximate — the correlation weight damps the
// confidence (widens the implied vig) to reflect estimation uncertainty.

const COMPOSITE_CORR_WEIGHT = 0.6;
const AVG_NBA_FG3_PCT = 0.36;

interface PlayerOddsIndex {
  get(player: string, stat: string): InternalPlayerPropOdds | undefined;
}

function buildPlayerOddsIndex(oddsMarkets: InternalPlayerPropOdds[]): PlayerOddsIndex {
  const map = new Map<string, InternalPlayerPropOdds>();
  for (const m of oddsMarkets) {
    if (m.isMainLine === false) continue;
    const key = `${normalizeForMatch(normalizeOddsPlayerName(m.player))}::${normalizeStatForMerge(m.stat)}`;
    if (!map.has(key)) map.set(key, m);
  }
  return {
    get(player: string, stat: string) {
      return map.get(`${normalizeForMatch(player)}::${stat}`);
    },
  };
}

function synthesizeCompositeOdds(
  oddsMarkets: InternalPlayerPropOdds[],
  rawPicks: RawPick[],
  debug: boolean
): number {
  const index = buildPlayerOddsIndex(oddsMarkets);

  const existingKeys = new Set(
    oddsMarkets.map((m) => {
      const n = normalizeForMatch(normalizeOddsPlayerName(m.player));
      return `${n}::${normalizeStatForMerge(m.stat)}`;
    })
  );

  const neededPlayers = new Set<string>();
  const neededStats = new Map<string, Set<string>>();
  for (const pick of rawPicks) {
    const normName = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
    const normStat = normalizeStatForMerge(pick.stat);
    if (!["pra", "points_assists", "pa", "threes"].includes(normStat)) continue;
    const key = `${normName}::${normStat}`;
    if (existingKeys.has(key)) continue;
    neededPlayers.add(normName);
    if (!neededStats.has(normName)) neededStats.set(normName, new Set());
    neededStats.get(normName)!.add(normStat);
  }

  let synthCount = 0;

  for (const [playerNorm, stats] of neededStats) {
    for (const stat of stats) {
      const synth = tryComposite(playerNorm, stat, index, oddsMarkets, debug);
      if (synth) {
        oddsMarkets.push(synth);
        existingKeys.add(`${playerNorm}::${stat}`);
        synthCount++;
      }
    }
  }

  return synthCount;
}

function tryComposite(
  playerNorm: string,
  stat: string,
  index: PlayerOddsIndex,
  allMarkets: InternalPlayerPropOdds[],
  debug: boolean
): InternalPlayerPropOdds | null {
  if (stat === "pra") return synthPRA(playerNorm, index, allMarkets, debug);
  if (stat === "points_assists" || stat === "pa") return synthPA(playerNorm, index, allMarkets, debug);
  if (stat === "threes") return synthThrees(playerNorm, index, allMarkets, debug);
  return null;
}

function findMarketForPlayer(
  playerNorm: string,
  stat: string,
  index: PlayerOddsIndex,
  allMarkets: InternalPlayerPropOdds[]
): InternalPlayerPropOdds | undefined {
  const quick = index.get(playerNorm, stat);
  if (quick) return quick;
  return allMarkets.find((m) => {
    const n = normalizeForMatch(normalizeOddsPlayerName(m.player));
    return n === playerNorm && normalizeStatForMerge(m.stat) === stat;
  });
}

function makeSynthetic(
  template: InternalPlayerPropOdds,
  stat: StatCategory,
  line: number,
  overOdds: number,
  underOdds: number
): InternalPlayerPropOdds {
  return {
    sport: template.sport,
    player: template.player,
    team: template.team,
    opponent: template.opponent,
    league: template.league,
    stat,
    line,
    overOdds,
    underOdds,
    book: `${template.book}_synth`,
    eventId: template.eventId,
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
    isMainLine: true,
  };
}

function synthPRA(
  playerNorm: string,
  index: PlayerOddsIndex,
  allMarkets: InternalPlayerPropOdds[],
  debug: boolean
): InternalPlayerPropOdds | null {
  const reb = findMarketForPlayer(playerNorm, "rebounds", index, allMarkets);
  if (!reb) return null;

  const pa = findMarketForPlayer(playerNorm, "points_assists", index, allMarkets);
  if (pa) {
    const line = pa.line + reb.line;
    const probPA = americanToProb(pa.overOdds);
    const probREB = americanToProb(reb.overOdds);
    const combinedProb = (probPA + probREB) / 2 * COMPOSITE_CORR_WEIGHT + (1 - COMPOSITE_CORR_WEIGHT) * 0.5;
    const synthOver = probToAmerican(Math.max(0.05, Math.min(0.95, combinedProb)));
    const synthUnder = probToAmerican(Math.max(0.05, Math.min(0.95, 1 - combinedProb)));
    if (debug) {
      console.log(`  [SYNTH] PRA for ${playerNorm}: PA(${pa.line})+REB(${reb.line})=${line} ` +
        `overProb=${(combinedProb * 100).toFixed(1)}% (corr=${COMPOSITE_CORR_WEIGHT})`);
    }
    return makeSynthetic(pa, "pra", line, synthOver, synthUnder);
  }

  const pts = findMarketForPlayer(playerNorm, "points", index, allMarkets);
  const ast = findMarketForPlayer(playerNorm, "assists", index, allMarkets);
  if (pts && ast) {
    const line = pts.line + reb.line + ast.line;
    const probPTS = americanToProb(pts.overOdds);
    const probREB = americanToProb(reb.overOdds);
    const probAST = americanToProb(ast.overOdds);
    const combinedProb = (probPTS + probREB + probAST) / 3 * COMPOSITE_CORR_WEIGHT + (1 - COMPOSITE_CORR_WEIGHT) * 0.5;
    const synthOver = probToAmerican(Math.max(0.05, Math.min(0.95, combinedProb)));
    const synthUnder = probToAmerican(Math.max(0.05, Math.min(0.95, 1 - combinedProb)));
    if (debug) {
      console.log(`  [SYNTH] PRA for ${playerNorm}: PTS(${pts.line})+REB(${reb.line})+AST(${ast.line})=${line} ` +
        `overProb=${(combinedProb * 100).toFixed(1)}% (corr=${COMPOSITE_CORR_WEIGHT})`);
    }
    return makeSynthetic(pts, "pra", line, synthOver, synthUnder);
  }

  return null;
}

function synthPA(
  playerNorm: string,
  index: PlayerOddsIndex,
  allMarkets: InternalPlayerPropOdds[],
  debug: boolean
): InternalPlayerPropOdds | null {
  // Path 1: PRA − REB → PA (when PRA exists but PA doesn't)
  const pra = findMarketForPlayer(playerNorm, "pra", index, allMarkets);
  const reb = findMarketForPlayer(playerNorm, "rebounds", index, allMarkets);
  if (pra && reb) {
    const line = Math.max(0.5, pra.line - reb.line);
    const probPRA = americanToProb(pra.overOdds);
    const combinedProb = probPRA * COMPOSITE_CORR_WEIGHT + (1 - COMPOSITE_CORR_WEIGHT) * 0.5;
    const clamped = Math.max(0.05, Math.min(0.95, combinedProb));
    const synthOver = probToAmerican(clamped);
    const synthUnder = probToAmerican(1 - clamped);
    if (debug) {
      console.log(`  [SYNTH] PA for ${playerNorm}: PRA(${pra.line})-REB(${reb.line})=${line} ` +
        `overProb=${(clamped * 100).toFixed(1)}% (derived from PRA)`);
    }
    return makeSynthetic(pra, "points_assists", line, synthOver, synthUnder);
  }

  // Path 2: PTS + AST → PA
  const pts = findMarketForPlayer(playerNorm, "points", index, allMarkets);
  const ast = findMarketForPlayer(playerNorm, "assists", index, allMarkets);
  if (pts && ast) {
    const line = pts.line + ast.line;
    const probPTS = americanToProb(pts.overOdds);
    const probAST = americanToProb(ast.overOdds);
    const combinedProb = (probPTS + probAST) / 2 * COMPOSITE_CORR_WEIGHT + (1 - COMPOSITE_CORR_WEIGHT) * 0.5;
    const clamped = Math.max(0.05, Math.min(0.95, combinedProb));
    const synthOver = probToAmerican(clamped);
    const synthUnder = probToAmerican(1 - clamped);
    if (debug) {
      console.log(`  [SYNTH] PA for ${playerNorm}: PTS(${pts.line})+AST(${ast.line})=${line} ` +
        `overProb=${(combinedProb * 100).toFixed(1)}% (corr=${COMPOSITE_CORR_WEIGHT})`);
    }
    return makeSynthetic(pts, "points_assists", line, synthOver, synthUnder);
  }

  return null;
}

function synthThrees(
  playerNorm: string,
  index: PlayerOddsIndex,
  allMarkets: InternalPlayerPropOdds[],
  debug: boolean
): InternalPlayerPropOdds | null {
  const pts = findMarketForPlayer(playerNorm, "points", index, allMarkets);
  if (!pts) return null;

  const estThrees = pts.line * AVG_NBA_FG3_PCT;
  const line = Math.round(estThrees * 2) / 2;
  if (line < 0.5) return null;

  const probPTS = americanToProb(pts.overOdds);
  const combinedProb = probPTS * COMPOSITE_CORR_WEIGHT + (1 - COMPOSITE_CORR_WEIGHT) * 0.5;
  const synthOver = probToAmerican(Math.max(0.05, Math.min(0.95, combinedProb)));
  const synthUnder = probToAmerican(Math.max(0.05, Math.min(0.95, 1 - combinedProb)));
  if (debug) {
    console.log(`  [SYNTH] 3PTM for ${playerNorm}: PTS(${pts.line})*fg3_pct(${AVG_NBA_FG3_PCT})≈${line} ` +
      `overProb=${(combinedProb * 100).toFixed(1)}%`);
  }
  return makeSynthetic(pts, "threes", line, synthOver, synthUnder);
}

export async function mergeOddsWithProps(
  rawPicks: RawPick[],
  cli: CliArgs
): Promise<MergedPick[]> {
  const result = await mergeOddsWithPropsWithMetadata(rawPicks, cli);
  return result.odds;
}

export interface SnapshotAudit {
  oddsSnapshotId: string;
  oddsFetchedAtUtc: string;
  oddsAgeMinutes: number;
  oddsRefreshMode: string;
  oddsSource: string;
  oddsIncludesAltLines: boolean;
}

/**
 * Snapshot-aware merge: accepts pre-resolved internal odds rows from
 * OddsSnapshotManager so both PP and UD use the same odds data.
 */
export async function mergeWithSnapshot(
  rawPicks: RawPick[],
  oddsMarketsFromSnapshot: InternalPlayerPropOdds[],
  snapshotMeta: OddsSourceMetadata,
  audit: SnapshotAudit | undefined,
  cli: CliArgs
): Promise<{
  odds: MergedPick[];
  metadata: OddsSourceMetadata;
  platformStats: MergePlatformStats;
  stageAccounting: MergeStageAccounting;
  mergeAuditSnapshot: MergeAuditSnapshot;
}> {
  const oddsMarkets = [...oddsMarketsFromSnapshot];
  const metadata = { ...snapshotMeta };

  if (oddsMarkets.length > 0 && metadata.providerUsed === "OddsAPI") {
    writeOddsImportedCsv(oddsMarkets, "OddsAPI", normalizeOddsPlayerName);
  }

  const result = await mergeCore(rawPicks, oddsMarkets, metadata, cli, audit);
  if (audit) {
    for (const pick of result.odds) {
      pick.oddsSnapshotId = audit.oddsSnapshotId;
      pick.oddsFetchedAtUtc = audit.oddsFetchedAtUtc;
      pick.oddsAgeMinutes = audit.oddsAgeMinutes;
      pick.oddsRefreshMode = audit.oddsRefreshMode;
      pick.oddsSource = audit.oddsSource;
      pick.oddsIncludesAltLines = audit.oddsIncludesAltLines;
    }
  }
  return result;
}

export async function mergeOddsWithPropsWithMetadata(
  rawPicks: RawPick[],
  cli: CliArgs
): Promise<{
  odds: MergedPick[];
  metadata: OddsSourceMetadata;
  platformStats: MergePlatformStats;
  stageAccounting: MergeStageAccounting;
  mergeAuditSnapshot: MergeAuditSnapshot;
}> {
  // Extract unique sports from rawPicks
  const uniqueSports = [...new Set(rawPicks.map(pick => pick.sport))];
  console.log(`mergeOddsWithProps: processing sports [${uniqueSports.join(', ')}] from ${rawPicks.length} raw picks`);
  
  // Debug: show per-sport counts
  const debug = process.env.DEBUG_MERGE === "1";
  if (debug) {
    const sportCounts = uniqueSports.reduce((acc, sport) => {
      acc[sport] = rawPicks.filter(pick => pick.sport === sport).length;
      return acc;
    }, {} as Record<Sport, number>);
    
    console.log(`mergeOddsWithProps: per-sport raw pick counts:`, 
      Object.entries(sportCounts).map(([sport, count]) => `${sport}=${count}`).join(', ')
    );
  }
  
  // Build fetch configuration from CLI args
  const config: OddsFetchConfig = {
    noFetch: cli.noFetchOdds,
    forceRefresh: cli.forceRefreshOdds,
    refreshIntervalMinutes: cli.refreshIntervalMinutes,
  };

  // Get odds (from cache or fresh fetch)
  let oddsMarkets: InternalPlayerPropOdds[] = [];
  let metadata: OddsSourceMetadata = {
    isFromCache: false,
    providerUsed: "none"
  };
  
  // Check cache first (unless force refresh)
  if (!config.forceRefresh) {
    const cachedEntry = oddsCache.getCachedOddsEntry(config);
    if (cachedEntry) {
      console.log(`mergeOddsWithProps: Using ${cachedEntry.data.length} cached odds`);
      metadata = {
        isFromCache: true,
        providerUsed: cachedEntry.data.length > 0 ? "OddsAPI" : "none",
        fetchedAt: cachedEntry.fetchedAt,
        originalProvider: cachedEntry.source
      };
      oddsMarkets = cachedEntry.data.map(m => ({
        sport: "NBA" as const,
        player: m.player,
        team: m.team,
        opponent: m.opponent,
        league: m.league,
        stat: m.stat,
        line: m.line,
        overOdds: m.overOdds,
        underOdds: m.underOdds,
        book: m.book,
        eventId: m.gameId,
        marketId: null,
        selectionIdOver: null,
        selectionIdUnder: null,
      }));
    }
  }

  if (config.noFetch && oddsMarkets.length === 0) {
    console.log("mergeOddsWithProps: --no-fetch-odds specified and no valid cache available");
    const pickSiteEarly = (p: RawPick) => (p as { site?: string }).site ?? "prizepicks";
    const dropsNoOdds: MergeDropRecord[] = rawPicks.map((pick) => ({
      site: pickSiteEarly(pick),
      sport: pick.sport,
      player: pick.player,
      stat: String(pick.stat),
      line: pick.line,
      internalReason: "no_candidate",
      canonicalReason: canonicalMergeDropReason("no_candidate"),
    }));
    const stageAccountingEarly: MergeStageAccounting = {
      source: {
        providerUsed: metadata.providerUsed,
        originalProvider: metadata.originalProvider,
      },
      rawRows: rawPicks.length,
      propsConsideredForMatchingRows: rawPicks.length,
      totalOddsRowsConsidered: 0,
      matchedRows: 0,
      unmatchedPropRows: rawPicks.length,
      unmatchedOddsRows: 0,
      emittedRows: 0,
      filteredBeforeMergeRows: 0,
      noMatchRows: rawPicks.length,
      skippedByReason: {
        promoOrSpecial: 0,
        fantasyExcluded: 0,
        comboLabelExcluded: 0,
        noOddsStat: 0,
        escalatorFiltered: 0,
        noCandidate: rawPicks.length,
        lineDiff: 0,
        juice: 0,
      },
      unmatchedAttribution: {
        propsBySite: {},
        propsByReason: { no_candidate: rawPicks.length },
        oddsByBook: {},
      },
      explicitAliasResolutionHits: 0,
      multiBookConsensusPickCount: 0,
    };
    const mergeAuditSnapshot = finalizeMergeAuditArtifacts({
      cwd: process.cwd(),
      generatedAtUtc: new Date().toISOString(),
      stageAccounting: stageAccountingEarly,
      platformStats: {},
      dropRecords: dropsNoOdds,
      merged: [],
      altLineFallbackCount: 0,
      cli,
      normalizePickPlayerKeyForDiagnostics,
      freshness: undefined,
    });
    applyMergeQualityOperatorHooks(cli, mergeAuditSnapshot);
    return {
      odds: [],
      metadata,
      platformStats: {},
      stageAccounting: stageAccountingEarly,
      mergeAuditSnapshot,
    };
  }

  if (oddsMarkets.length === 0) {
    console.log("mergeOddsWithProps: Fetching fresh odds from APIs...");
    const freshResult = await fetchFreshOdds(uniqueSports, cli);
    
    if (freshResult.odds.length === 0) {
      console.log("mergeOddsWithProps: No fresh odds available, returning empty result");
      const pickSiteEarly = (p: RawPick) => (p as { site?: string }).site ?? "prizepicks";
      const dropsNoOdds: MergeDropRecord[] = rawPicks.map((pick) => ({
        site: pickSiteEarly(pick),
        sport: pick.sport,
        player: pick.player,
        stat: String(pick.stat),
        line: pick.line,
        internalReason: "no_candidate",
        canonicalReason: canonicalMergeDropReason("no_candidate"),
      }));
      const stageAccountingEarly: MergeStageAccounting = {
        source: {
          providerUsed: metadata.providerUsed,
          originalProvider: metadata.originalProvider,
        },
        rawRows: rawPicks.length,
        propsConsideredForMatchingRows: rawPicks.length,
        totalOddsRowsConsidered: 0,
        matchedRows: 0,
        unmatchedPropRows: rawPicks.length,
        unmatchedOddsRows: 0,
        emittedRows: 0,
        filteredBeforeMergeRows: 0,
        noMatchRows: rawPicks.length,
        skippedByReason: {
          promoOrSpecial: 0,
          fantasyExcluded: 0,
          comboLabelExcluded: 0,
          noOddsStat: 0,
          escalatorFiltered: 0,
          noCandidate: rawPicks.length,
          lineDiff: 0,
          juice: 0,
        },
        unmatchedAttribution: {
          propsBySite: {},
          propsByReason: { no_candidate: rawPicks.length },
          oddsByBook: {},
        },
        explicitAliasResolutionHits: 0,
        multiBookConsensusPickCount: 0,
      };
      const mergeAuditSnapshot = finalizeMergeAuditArtifacts({
        cwd: process.cwd(),
        generatedAtUtc: new Date().toISOString(),
        stageAccounting: stageAccountingEarly,
        platformStats: {},
        dropRecords: dropsNoOdds,
        merged: [],
        altLineFallbackCount: 0,
        cli,
        normalizePickPlayerKeyForDiagnostics,
        freshness: undefined,
      });
      applyMergeQualityOperatorHooks(cli, mergeAuditSnapshot);
      return {
        odds: [],
        metadata,
        platformStats: {},
        stageAccounting: stageAccountingEarly,
        mergeAuditSnapshot,
      };
    }

    metadata = {
      isFromCache: false,
      providerUsed: freshResult.providerUsed,
      fetchedAt: new Date().toISOString()
    };

    oddsMarkets = freshResult.odds.map(m => ({
      sport: "NBA" as const,
      player: m.player,
      team: m.team,
      opponent: m.opponent,
      league: m.league,
      stat: m.stat,
      line: m.line,
      overOdds: m.overOdds,
      underOdds: m.underOdds,
      book: m.book,
      eventId: m.gameId,
      marketId: null,
      selectionIdOver: null,
      selectionIdUnder: null,
    }));
  }

  if (oddsMarkets.length > 0 && metadata.providerUsed === "OddsAPI") {
    writeOddsImportedCsv(oddsMarkets, "OddsAPI", normalizeOddsPlayerName);
  }

  return mergeCore(rawPicks, oddsMarkets, metadata, cli, undefined);
}

async function mergeCore(
  rawPicks: RawPick[],
  oddsMarkets: InternalPlayerPropOdds[],
  metadata: OddsSourceMetadata,
  cli: CliArgs,
  snapshotAudit: SnapshotAudit | undefined
): Promise<{
  odds: MergedPick[];
  metadata: OddsSourceMetadata;
  platformStats: MergePlatformStats;
  stageAccounting: MergeStageAccounting;
  mergeAuditSnapshot: MergeAuditSnapshot;
}> {
  const ppMaxJuice = cli.maxJuice ?? 180;
  const udMaxJuice = cli.maxJuice ?? 200;
  const maxLineDiff = cli.exactLine ? 0 : 0.5;
  const debug = process.env.DEBUG_MERGE === "1";

  // Phase 8: Composite stat fallback — synthesize PRA/PA/3PTM odds from
  // component stats when the combo stat itself is absent from the odds feed.
  const compositeSynthCount = synthesizeCompositeOdds(oddsMarkets, rawPicks, cli.debug);
  if (compositeSynthCount > 0) {
    console.log(`[Composite] Synthesized ${compositeSynthCount} fallback odds entries (PRA/PA/3PTM from components)`);
  }

  lastMergeOddsMarketsForDiagnostics = oddsMarkets;

  // Unique (player, stat, line) in odds: limits how many PP picks can match (each odds line can match many PP picks in theory, but we match 1:1 per pick)
  const oddsKeys = new Set(
    oddsMarkets.map((o) => {
      const name = normalizeOddsPlayerName(o.player);
      return `${name}|${o.stat}|${o.league}|${o.line}`;
    })
  );
  console.log(
    `mergeOddsWithProps: Merging ${rawPicks.length} raw picks with ${oddsMarkets.length} odds rows (${oddsKeys.size} unique player/stat/league/line)`
  );

  // Build the dynamic set of stats to skip per-site from the live odds feed.
  // This auto-extends whenever the odds feed gains or loses stat coverage.
  const pickSite = (p: RawPick) => (p as { site?: string }).site ?? "prizepicks";

  const mergeDropRecords: MergeDropRecord[] = [];
  const pushMergeDrop = (pick: RawPick, internalReason: string) => {
    mergeDropRecords.push({
      site: pickSite(pick),
      sport: pick.sport,
      player: pick.player,
      stat: String(pick.stat),
      line: pick.line,
      internalReason,
      canonicalReason: canonicalMergeDropReason(internalReason),
    });
  };

  const udStatCandidates = new Set<string>(
    rawPicks.filter((p) => pickSite(p) === "underdog").map((p) => p.stat)
  );
  const udStatsNotInOdds = buildUdStatsNotInOdds(oddsMarkets, udStatCandidates);
  if (udStatCandidates.size > 0) {
    const dynamicAbsent = [...udStatsNotInOdds].filter((s) => !UD_STATS_NOT_IN_ODDS_FALLBACK.has(s));
    if (dynamicAbsent.length > 0) {
      console.log(`[Underdog] Dynamic stat filter added: ${dynamicAbsent.join(", ")} (not in odds feed today)`);
    }
    console.log(`[Underdog] Pre-filtering stats absent from odds feed: ${[...udStatsNotInOdds].join(", ")}`);
  }

  // PP v4: dynamic detection of PP stats absent from odds feed
  const ppStatCandidates = new Set<string>(
    rawPicks.filter((p) => pickSite(p) === "prizepicks").map((p) => p.stat)
  );
  const ppStatsNotInOdds = buildPpStatsNotInOdds(oddsMarkets, ppStatCandidates);
  if (ppStatCandidates.size > 0) {
    const ppDynamicAbsent = [...ppStatsNotInOdds].filter((s) => !PP_STATS_NOT_IN_ODDS_FALLBACK.has(s));
    if (ppDynamicAbsent.length > 0) {
      console.log(`[PrizePicks] Dynamic stat filter added: ${ppDynamicAbsent.join(", ")} (not in odds feed today)`);
    }
  }

  // Phase 7: debug matching — log every no_candidate failure
  const debugMatching = process.env.DEBUG_MATCHING === "1" || cli.debug;

  // Phase 7.1: load dynamic book accuracy from perf_tracker (30d rolling)
  let dynamicBookAccuracy: DynamicBookAccuracy[] = [];
  try {
    const trackerRows = readTrackerRows();
    if (trackerRows.length >= 10) {
      dynamicBookAccuracy = computeDynamicBookAccuracy(trackerRows, 30);
      if (dynamicBookAccuracy.length > 0 && debugMatching) {
        console.log(`[BookRanker] Dynamic accuracy from ${trackerRows.length} tracker rows (30d):`);
        for (const d of dynamicBookAccuracy.slice(0, 5)) {
          console.log(`  ${d.book}: hit=${(d.hitRate * 100).toFixed(1)}% impl=${(d.avgImpliedProb * 100).toFixed(1)}% dynMult=${d.dynamicMult.toFixed(2)}x (n=${d.resolvedLegs})`);
        }
      }
    }
  } catch { /* perf_tracker not available yet — use static weights only */ }

  const merged: MergedPick[] = [];
  const usedOddsRowKeys = new Set<string>();
  const unmatchedPropSiteCounts = new Map<string, number>();
  const unmatchedPropReasonCounts = new Map<string, number>();
  const diag = {
    skippedPromo: 0, skippedFantasy: 0,
    skippedPpComboLabel: 0,
    skippedUdNoOdds: 0, skippedUdEscalator: 0,
    noCandidate: 0, lineDiff: 0, juice: 0,
    matched: 0, altMatched: 0,
    mergedExact: 0, mergedNearest: 0,
    multiBookMatches: 0,
    trackedPromo: 0, // Track demon/goblin lines processed
    aliasResolutionHits: 0,
  };
  // Per-platform merge stats
  const platformStats: Record<string, MergePlatformRow> = {};
  const exportMergeReport = process.env.EXPORT_MERGE_REPORT === "1";
  const mergeReportRows: {
    site: string; player: string; stat: string; line: number; sport: string;
    matched: string; reason: string; bestOddsLine: string; bestOddsPlayerNorm: string;
    matchType: string; altDelta: string;
  }[] = [];

  for (const pick of rawPicks) {
    const anyPick = pick as any;
    const site = pickSite(pick);
    // Init per-platform stats
    if (!platformStats[site]) {
      platformStats[site] = {
        rawProps: 0,
        matchEligible: 0,
        mergedExact: 0,
        mergedNearest: 0,
        noCandidate: 0,
        lineDiff: 0,
        noOddsStat: 0,
        juice: 0,
      };
    }
    platformStats[site].rawProps++;

    // Demon/goblin lines now flow through normal merge pipeline
    // Only track for logging, do not skip
    if (anyPick.isDemon || anyPick.isGoblin) {
      diag.trackedPromo++; // Track for logging transparency
    }
    if (pick.stat === "fantasy_score") {
      diag.skippedFantasy++;
      unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
      unmatchedPropReasonCounts.set("fantasy_excluded", (unmatchedPropReasonCounts.get("fantasy_excluded") ?? 0) + 1);
      pushMergeDrop(pick, "fantasy_excluded");
      continue;
    }

    if (site === "prizepicks" && isPrizePicksComboPlayerLabel(pick.player)) {
      diag.skippedPpComboLabel++;
      unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
      unmatchedPropReasonCounts.set(
        "combo_label_excluded",
        (unmatchedPropReasonCounts.get("combo_label_excluded") ?? 0) + 1,
      );
      pushMergeDrop(pick, "combo_label_excluded");
      continue;
    }

    if (site === "underdog") {
      if (udStatsNotInOdds.has(pick.stat)) {
        diag.skippedUdNoOdds++;
        platformStats[site].noOddsStat++;
        unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
        unmatchedPropReasonCounts.set("no_odds_stat", (unmatchedPropReasonCounts.get("no_odds_stat") ?? 0) + 1);
        pushMergeDrop(pick, "no_odds_stat");
        continue;
      }
      if (UD_ESCALATOR_STATS.has(pick.stat) && pick.line <= UD_ESCALATOR_MAX_LINE) {
        diag.skippedUdEscalator++;
        unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
        unmatchedPropReasonCounts.set("escalator_filtered", (unmatchedPropReasonCounts.get("escalator_filtered") ?? 0) + 1);
        pushMergeDrop(pick, "escalator_filtered");
        continue;
      }
    }

    if (site === "prizepicks" && ppStatsNotInOdds.has(pick.stat)) {
      diag.skippedUdNoOdds++;
      platformStats[site].noOddsStat++;
      unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
      unmatchedPropReasonCounts.set("no_odds_stat", (unmatchedPropReasonCounts.get("no_odds_stat") ?? 0) + 1);
      pushMergeDrop(pick, "no_odds_stat");
      continue;
    }

    platformStats[site].matchEligible++;

    const normalizedPickLower = normalizeName(pick.player);
    if (resolvePlayerNameForMatch(normalizedPickLower) !== normalizedPickLower) {
      diag.aliasResolutionHits++;
    }

    // Use site-specific juice threshold: Underdog's tiered payouts make mildly
    // juiced lines (≤ -200) still viable; PrizePicks uses fixed pricing.
    const maxJuice = site === "underdog" ? udMaxJuice : ppMaxJuice;
    let result = findBestMatchForPickWithReason(pick, oddsMarkets, maxJuice, maxLineDiff);

    // Phase 2: Alt-line second pass for both PP and UD when main pass fails with line_diff.
    // Only runs when OddsAPI was fetched with includeAltLines=true (isMainLine is set on entries).
    // For demon/goblin lines, also attempt rescue on no_candidate to improve match rates.
    let altResult: ReturnType<typeof findBestAltMatch> = null;
    const isPromo = (anyPick as any).isDemon || (anyPick as any).isGoblin;
    if ("reason" in result && (result.reason === "line_diff" || (result.reason === "no_candidate" && isPromo))) {
      altResult = findBestAltMatch(pick, oddsMarkets, maxJuice);
      if (altResult) result = altResult; // promote alt match to primary result
    }

    if ("reason" in result) {
      unmatchedPropSiteCounts.set(site, (unmatchedPropSiteCounts.get(site) ?? 0) + 1);
      unmatchedPropReasonCounts.set(result.reason, (unmatchedPropReasonCounts.get(result.reason) ?? 0) + 1);
      if (result.reason === "no_candidate") {
        diag.noCandidate++;
        platformStats[site].noCandidate++;
        if (debugMatching) {
          const normPick = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
          console.log(`  [MATCH_FAIL] no_candidate: ${pick.player} (${normPick}) ${pick.stat} ${pick.line} [${site}]`);
        }
      } else if (result.reason === "line_diff") {
        diag.lineDiff++;
        platformStats[site].lineDiff++;
        if (debugMatching) {
          console.log(`  [MATCH_FAIL] line_diff: ${pick.player} ${pick.stat} pick=${pick.line} best=${"bestLine" in result ? result.bestLine : "?"} [${site}]`);
        }
      } else {
        diag.juice++;
        platformStats[site].juice++;
      }
      if (exportMergeReport) {
        mergeReportRows.push({
          site,
          player: pick.player,
          stat: pick.stat,
          line: pick.line,
          sport: pick.sport,
          matched: "N",
          reason: result.reason,
          bestOddsLine: "bestLine" in result ? String(result.bestLine) : "",
          bestOddsPlayerNorm: "bestPlayerNorm" in result ? result.bestPlayerNorm : "",
          matchType: "",
          altDelta: "",
        });
      }
      pushMergeDrop(pick, result.reason);
      continue;
    }

    const match = result.match;
    const matchType = result.matchType;
    const matchDelta = result.delta;
    if (matchType === "alt") diag.altMatched++;
    usedOddsRowKeys.add(getOddsRowKey(match));
    diag.matched++;
    if (matchDelta === 0) {
      diag.mergedExact++;
      platformStats[site].mergedExact++;
    } else {
      diag.mergedNearest++;
      platformStats[site].mergedNearest++;
    }

    if (exportMergeReport) {
      mergeReportRows.push({
        site,
        player: pick.player,
        stat: pick.stat,
        line: pick.line,
        sport: pick.sport,
        matched: "Y",
        reason: matchType === "alt" ? "ok_alt" : "ok",
        bestOddsLine: String(match.line),
        bestOddsPlayerNorm: normalizeForMatch(normalizeOddsPlayerName(match.player)),
        matchType,
        altDelta: matchType === "alt" ? matchDelta.toFixed(2) : "0.00",
      });
    }

    // Phase 7.3: sharp-weighted de-vig across all matching books for this player/stat/line.
    // Exact-first: prefer books at the exact pick line; only widen to maxLineDiff
    // if no exact-line books exist.
    const targetNameForMulti = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
    const pickStatNormForMulti = normalizeStatForMerge(pick.stat);
    const allBookCandidates = oddsMarkets.filter((o) => {
      const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
      return (
        oddsName === targetNameForMulti &&
        normalizeStatForMerge(o.stat) === pickStatNormForMulti &&
        o.sport === pick.sport &&
        o.league.toUpperCase() === pick.league.toUpperCase() &&
        Math.abs(o.line - pick.line) <= maxLineDiff
      );
    });
    const exactBookMatches = allBookCandidates.filter((o) => o.line === pick.line);
    const allBookMatches = exactBookMatches.length > 0 ? exactBookMatches : allBookCandidates;
    // Full consensus exclusion: only books with explicit weights participate
    const eligibleBooks = allBookMatches.filter((bm) => {
      const bookName = String(bm.book ?? "").trim().toLowerCase();
      return isConsensusEligible(bookName);
    });

    const consensusBookMatches =
      site === "prizepicks"
        ? (() => {
            const nonPp = eligibleBooks.filter(
              (o) => String(o.book ?? "").trim().toLowerCase() !== "prizepicks"
            );
            return nonPp.length > 0 ? nonPp : eligibleBooks;
          })()
        : eligibleBooks;

    const devigPairs = consensusBookMatches.map((bm) =>
      devigTwoWay(americanToProb(bm.overOdds), americanToProb(bm.underOdds))
    );
    const ppNConsensusBooks = site === "prizepicks" ? consensusBookMatches.length : undefined;
    const ppConsensusDevigSpreadOver =
      site === "prizepicks" && devigPairs.length > 0
        ? devigPairs.length > 1
          ? Math.max(...devigPairs.map((p) => p[0])) - Math.min(...devigPairs.map((p) => p[0]))
          : 0
        : undefined;

    let trueOverProb: number;
    let trueUnderProb: number;

    if (consensusBookMatches.length > 1) {
      diag.multiBookMatches++;
      let sumW = 0;
      let sumWOver = 0;
      let sumWUnder = 0;
      const bookDetails: string[] = [];
      for (let i = 0; i < consensusBookMatches.length; i++) {
        const bm = consensusBookMatches[i]!;
        const w = getEffectiveBookWeight(bm.book, dynamicBookAccuracy);
        const [devOver, devUnder] = devigPairs[i]!;
        sumW += w;
        sumWOver += w * devOver;
        sumWUnder += w * devUnder;
        if (debugMatching) {
          bookDetails.push(`${bm.book} ${bm.overOdds >= 0 ? "+" : ""}${bm.overOdds} (${w.toFixed(1)}x)`);
        }
      }
      trueOverProb = sumW > 0 ? sumWOver / sumW : 0.5;
      trueUnderProb = sumW > 0 ? sumWUnder / sumW : 0.5;
      if (debugMatching && diag.multiBookMatches <= 5) {
        console.log(
          `  [PROP] ${pick.player} ${pick.stat} ${pick.line}: ` +
          `${bookDetails.join(", ")} → consensus ${(trueOverProb * 100).toFixed(1)}%`
        );
      }
    } else if (consensusBookMatches.length === 1) {
      [trueOverProb, trueUnderProb] = devigPairs[0]!;
    } else {
      const overProbVigged = americanToProb(match.overOdds);
      const underProbVigged = americanToProb(match.underOdds);
      [trueOverProb, trueUnderProb] = devigTwoWay(overProbVigged, underProbVigged);
    }

    const fairOverOdds = probToAmerican(trueOverProb);
    const fairUnderOdds = probToAmerican(trueUnderProb);

    // Canonical merge key + display label (Prompt 3)
    const playerIdForKey = normalizeForMatch(normalizeName(pick.player));
    const legKey = `${site}:${playerIdForKey}:${pick.stat}:${pick.line}:over:game`;
    const statTitle = pick.stat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const legLabel = `${pick.player} - ${statTitle} - ${pick.line}`;

    merged.push({
      ...pick,
      book: match.book,
      overOdds: match.overOdds,
      underOdds: match.underOdds,
      trueProb: trueOverProb,
      fairOverOdds,
      fairUnderOdds,
      matchType,
      altMatchDelta: matchDelta,
      legKey,
      legLabel,
      isPromoLine: anyPick.isDemon || anyPick.isGoblin, // Tracking only
      ...(site === "prizepicks"
        ? { ppNConsensusBooks, ppConsensusDevigSpreadOver }
        : {}),
    });
  }

  if (exportMergeReport && mergeReportRows.length > 0) {
    writeMergeReportCsv(mergeReportRows);
    const reportSite = rawPicks.length > 0 ? pickSite(rawPicks[0]) : "unknown";
    // Timestamped file for triple A/B audit
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    writeMergeReportCsv(mergeReportRows, path.join(process.cwd(), `merge_report_${reportSite}.csv`));
    writeMergeReportCsv(mergeReportRows, path.join(process.cwd(), `merge_report_${reportSite}_${ts}.csv`));
  }

  const logPrefix = rawPicks.length > 0 ? ` [${pickSite(rawPicks[0]) === "underdog" ? "Underdog" : "PrizePicks"}]` : "";
  const udSkipMsg = diag.skippedUdNoOdds > 0 || diag.skippedUdEscalator > 0
    ? `; ud_skipped: no_odds_stat=${diag.skippedUdNoOdds}, escalator=${diag.skippedUdEscalator}`
    : "";
  const ppComboMsg =
    diag.skippedPpComboLabel > 0 ? `; combo_label_excluded=${diag.skippedPpComboLabel}` : "";
  const altMsg = diag.altMatched > 0 ? `; alt_rescued=${diag.altMatched}` : "";

  // Exact match ratio: picks where odds.line == pick.line exactly (delta=0)
  const exactMatches = merged.filter(m => m.altMatchDelta === 0).length;
  const exactRatio = merged.length > 0 ? exactMatches / merged.length : 0;

  console.log(
    `mergeOddsWithProps${logPrefix}: Produced ${merged.length} merged picks` +
    ` (matched: main=${diag.matched - diag.altMatched}, alt=${diag.altMatched}${altMsg}` +
    `; tracked_as_promo=${diag.trackedPromo}, skipped: fantasy=${diag.skippedFantasy}${ppComboMsg}${udSkipMsg}` +
    `; no match: no_candidate=${diag.noCandidate}, line_diff=${diag.lineDiff}, juice=${diag.juice})`
  );
  console.log(
    `mergeOddsWithProps${logPrefix}: exact_match_ratio=${(exactRatio * 100).toFixed(1)}% ` +
    `(${exactMatches}/${merged.length}) | maxLineDiff=${maxLineDiff} | ppMaxJuice=${ppMaxJuice} | udMaxJuice=${udMaxJuice}`
  );
  if (diag.multiBookMatches > 0) {
    console.log(
      `mergeOddsWithProps${logPrefix}: multi_book_consensus=${diag.multiBookMatches} props sharp-weighted ` +
      `(${PROP_WEIGHTS.map(w => `${w.book} ${w.weight}x`).join(', ')})`
    );
  }

  // Per-platform merge stats summary
  for (const [plat, ps] of Object.entries(platformStats)) {
    console.log(
      `[MergeStats] ${plat}: rawProps=${ps.rawProps} matchEligible=${ps.matchEligible} mergedExact=${ps.mergedExact} ` +
      `mergedNearest=${ps.mergedNearest} noCandidate=${ps.noCandidate} ` +
      `lineDiff=${ps.lineDiff} noOddsStat=${ps.noOddsStat} juice=${ps.juice}`
    );
  }

  // Stat balance breakdown across merged picks
  if (merged.length > 0) {
    const statCounts = new Map<string, number>();
    for (const m of merged) statCounts.set(m.stat, (statCounts.get(m.stat) ?? 0) + 1);
    const statEntries = [...statCounts.entries()].sort((a, b) => b[1] - a[1]);
    const statLine = statEntries
      .map(([s, n]) => `${s}=${n}(${Math.round((n / merged.length) * 100)}%)`)
      .join(" ");
    console.log(`mergeOddsWithProps${logPrefix}: stat_balance: ${statLine}`);
  }
  
  // Debug: show per-sport merged counts
  if (debug && merged.length > 0) {
    const mergedSportCounts = merged.reduce((acc, pick) => {
      acc[pick.sport] = (acc[pick.sport] || 0) + 1;
      return acc;
    }, {} as Record<Sport, number>);
    
    console.log(`mergeOddsWithProps: per-sport merged pick counts:`, 
      Object.entries(mergedSportCounts).map(([sport, count]) => `${sport}=${count}`).join(', ')
    );
  }

  const pp = platformStats.prizepicks;
  const ppMerged = pp ? pp.mergedExact + pp.mergedNearest : 0;
  const ppMergeHealth =
    pp && pp.rawProps > 0
      ? {
          rawProps: pp.rawProps,
          matchEligible: pp.matchEligible,
          preMergeSkipped: pp.rawProps - pp.matchEligible,
          merged: ppMerged,
          ratioRaw: ppMerged / pp.rawProps,
          ratioEligible: pp.matchEligible > 0 ? ppMerged / pp.matchEligible : 0,
          guardrailRatioBasis: "match_eligible" as const,
        }
      : undefined;

  const ppMergedRows = merged.filter((m) => m.site === "prizepicks");
  let ppConsensusDispersion: PpConsensusDispersionSummary | undefined;
  if (ppMergedRows.length > 0) {
    const bookCounts = ppMergedRows.map((m) => m.ppNConsensusBooks ?? 0);
    const spreads = ppMergedRows.map((m) => m.ppConsensusDevigSpreadOver ?? 0);
    const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const sortedSp = [...spreads].sort((a, b) => a - b);
    const p95Idx = sortedSp.length
      ? Math.min(sortedSp.length - 1, Math.floor(0.95 * (sortedSp.length - 1)))
      : 0;
    const p95 = sortedSp.length ? sortedSp[p95Idx]! : null;
    const multiN = bookCounts.filter((n) => n > 1).length;
    ppConsensusDispersion = {
      nPpMerged: ppMergedRows.length,
      meanConsensusBookCount: avg(bookCounts),
      meanDevigSpreadOver: avg(spreads),
      p95DevigSpreadOver: p95,
      shareMultiBookConsensus: bookCounts.length > 0 ? multiN / bookCounts.length : 0,
    };
  }

  const stageAccounting: MergeStageAccounting = {
    source: {
      providerUsed: metadata.providerUsed,
      originalProvider: metadata.originalProvider,
    },
    rawRows: rawPicks.length,
    propsConsideredForMatchingRows:
      rawPicks.length -
      (diag.skippedPromo +
        diag.skippedFantasy +
        diag.skippedPpComboLabel +
        diag.skippedUdNoOdds +
        diag.skippedUdEscalator),
    totalOddsRowsConsidered: oddsMarkets.length,
    matchedRows: diag.matched,
    unmatchedPropRows: diag.noCandidate + diag.lineDiff + diag.juice,
    unmatchedOddsRows: Math.max(0, oddsMarkets.length - usedOddsRowKeys.size),
    emittedRows: merged.length,
    filteredBeforeMergeRows:
      diag.skippedPromo +
      diag.skippedFantasy +
      diag.skippedPpComboLabel +
      diag.skippedUdNoOdds +
      diag.skippedUdEscalator,
    noMatchRows: diag.noCandidate + diag.lineDiff + diag.juice,
    skippedByReason: {
      promoOrSpecial: diag.skippedPromo,
      fantasyExcluded: diag.skippedFantasy,
      comboLabelExcluded: diag.skippedPpComboLabel,
      noOddsStat: diag.skippedUdNoOdds,
      escalatorFiltered: diag.skippedUdEscalator,
      noCandidate: diag.noCandidate,
      lineDiff: diag.lineDiff,
      juice: diag.juice,
    },
    unmatchedAttribution: {
      propsBySite: Object.fromEntries(unmatchedPropSiteCounts),
      propsByReason: Object.fromEntries(unmatchedPropReasonCounts),
      oddsByBook: Object.fromEntries(
        oddsMarkets
          .filter((row) => !usedOddsRowKeys.has(getOddsRowKey(row)))
          .reduce((acc, row) => {
            acc.set(row.book, (acc.get(row.book) ?? 0) + 1);
            return acc;
          }, new Map<string, number>())
      ),
    },
    ppMergeHealth,
    explicitAliasResolutionHits: diag.aliasResolutionHits,
    multiBookConsensusPickCount: diag.multiBookMatches,
    ppConsensusDispersion,
  };
  try {
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactsDir, "merge_stage_accounting.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          ...stageAccounting,
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(artifactsDir, "merge_match_gap_attribution.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: stageAccounting.source,
          unmatchedAttribution: stageAccounting.unmatchedAttribution,
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (e) {
    console.warn("[merge_odds] Failed to write merge_stage_accounting.json:", (e as Error).message);
  }

  const finalizeUtc = new Date().toISOString();
  const mergeAuditSnapshot = finalizeMergeAuditArtifacts({
    cwd: process.cwd(),
    generatedAtUtc: finalizeUtc,
    stageAccounting,
    platformStats,
    dropRecords: mergeDropRecords,
    merged,
    altLineFallbackCount: diag.altMatched,
    cli,
    normalizePickPlayerKeyForDiagnostics,
    freshness: {
      oddsFetchedAtUtc: metadata.fetchedAt ?? snapshotAudit?.oddsFetchedAtUtc,
      oddsSnapshotAgeMinutes: snapshotAudit?.oddsAgeMinutes ?? null,
      mergeWallClockUtc: finalizeUtc,
      oddsIsFromCache: metadata.isFromCache,
    },
  });
  applyMergeQualityOperatorHooks(cli, mergeAuditSnapshot);

  return { odds: merged, metadata, platformStats, stageAccounting, mergeAuditSnapshot };
}

function getOddsRowKey(row: InternalPlayerPropOdds): string {
  return [
    row.sport,
    row.league,
    normalizeForMatch(normalizeOddsPlayerName(row.player)),
    normalizeStatForMerge(row.stat),
    row.line,
    row.book,
    row.overOdds,
    row.underOdds,
    row.eventId ?? "",
    row.marketId ?? "",
    row.isMainLine === false ? "alt" : "main",
  ].join("|");
}

/**
 * Fetch fresh odds from The Odds API only (unified OddsProvider).
 */
async function fetchFreshOdds(
  sports: Sport[],
  cli: CliArgs
): Promise<{ odds: MergedPick[]; providerUsed: "OddsAPI" | "none" }> {
  const reason = cli.forceRefreshOdds ? "force-refresh" : "scheduled";
  OddsCache.logApiCall("OddsAPI", reason);
  const apiCalls = [{ endpoint: "OddsAPI", timestamp: new Date().toISOString(), reason: "scheduled" as const }];

  const marketsLive = await fetchPlayerPropOdds(sports, {
    forceRefresh: cli.forceRefreshOdds ?? false,
  });

  if (marketsLive.length === 0) {
    console.log("mergeOddsWithProps: OddsAPI returned no markets");
    return { odds: [], providerUsed: "none" };
  }

  console.log(`mergeOddsWithProps: Using ${marketsLive.length} markets from OddsAPI`);

  const merged: MergedPick[] = [];
  for (const market of marketsLive) {
    const syntheticPick: RawPick = {
      sport: "NBA",
      site: "prizepicks",
      league: market.league,
      player: market.player,
      team: market.team,
      opponent: market.opponent,
      stat: market.stat,
      line: market.line,
      projectionId: "",
      gameId: market.eventId,
      startTime: null,
      isPromo: false,
      isDemon: false,
      isGoblin: false,
      isNonStandardOdds: false,
    };
    const overProbVigged = americanToProb(market.overOdds);
    const underProbVigged = americanToProb(market.underOdds);
    const [trueOverProb, trueUnderProb] = devigTwoWay(overProbVigged, underProbVigged);
    const fairOverOdds = probToAmerican(trueOverProb);
    const fairUnderOdds = probToAmerican(trueUnderProb);
    merged.push({
      ...syntheticPick,
      book: market.book,
      overOdds: market.overOdds,
      underOdds: market.underOdds,
      trueProb: trueOverProb,
      fairOverOdds,
      fairUnderOdds,
    });
  }

  oddsCache.cacheOdds(merged, "OddsAPI", "fresh", apiCalls);
  return { odds: merged, providerUsed: "OddsAPI" };
}


