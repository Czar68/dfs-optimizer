// src/merge_odds.ts

import {
  RawPick,
  MergedPick,
  SgoPlayerPropOdds,
  StatCategory,
  Sport,
} from "./types";
import { americanToProb, devigTwoWay, probToAmerican } from "./odds_math";
import { fetchPlayerPropOdds } from "./odds/OddsProvider";
import { oddsCache, OddsFetchConfig, OddsCache } from "./odds_cache";
import { cliArgs } from "./cli_args";
import {
  getBookWeightValue,
  getEffectiveBookWeight,
  computeDynamicBookAccuracy,
  DynamicBookAccuracy,
} from "./odds/book_ranker";
import { readTrackerRows } from "./perf_tracker_db";
import path from "path";
import { getOutputPath } from "./constants/paths";
import { writeOddsImportedCsv, writeMergeReportCsv } from "./export_imported_csv";

// Interface for odds source metadata (OddsAPI or none).
export interface OddsSourceMetadata {
  isFromCache: boolean;
  providerUsed: "OddsAPI" | "none";
  fetchedAt?: string;
  originalProvider?: string;
}

/** Per-platform merge counts for guardrails (PP/UD merge ratio). */
export interface MergePlatformStats {
  [platform: string]: {
    rawProps: number;
    mergedExact: number;
    mergedNearest: number;
    noCandidate: number;
    lineDiff: number;
    noOddsStat: number;
    juice: number;
  };
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
  pra: "pra",
  points_rebounds_assists: "pra",
  "pts+reb+ast": "pra",
  player_pra: "pra",
  points_rebounds: "points_rebounds",
  "points+rebounds": "points_rebounds",
  "pts+reb": "points_rebounds",
  pr: "points_rebounds",
  points_assists: "points_assists",
  "points+assists": "points_assists",
  "pts+ast": "points_assists",
  pa: "points_assists",
  rebounds_assists: "rebounds_assists",
  "rebounds+assists": "rebounds_assists",
  "reb+ast": "rebounds_assists",
  ra: "rebounds_assists",
  fantasy_score: "fantasy_score",
  fantasy: "fantasy_score",
};
function normalizeStatForMerge(stat: string): string {
  return STAT_MAP[stat] ?? stat;
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

// Full normalization for name comparison: lower, accents off, apostrophes stripped, suffixes off
// Apostrophe strip so "Kel'el Ware" (OddsAPI) matches "Kelel Ware" (alias from pick)
function normalizeForMatch(name: string): string {
  const withAccents = stripAccents(normalizeName(name));
  const noApostrophe = withAccents.replace(/'/g, "");
  return stripNameSuffix(noApostrophe);
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
  // UD may send "Nickeil Alexander Walker" (space); OddsAPI uses "Nickeil Alexander-Walker" (hyphen)
  "nickeil alexander walker": "nickeil alexander-walker",
};

// Stats that the odds feed does not carry for NBA.
// Fallback set is empty; dynamic detection catches any stat gaps per run.
const UD_STATS_NOT_IN_ODDS_FALLBACK = new Set<string>();

// Underdog "points escalator" alternate lines: very low (≤2.5) lines for
// points that are never matchable because odds only exist near the main line.
// Skip them to avoid line_diff noise and reduce merge overhead.
const UD_ESCALATOR_STATS = new Set(["points"]);
const UD_ESCALATOR_MAX_LINE = 2.5;

// Site-specific juice thresholds.
//
// PP_MAX_JUICE: max absolute value of under odds we accept. 180 means
// we reject when the UNDER is more favored than -180 (i.e. the over is a
// longshot). 180 strikes a balance: -160 under (over ~38% trueProb) passes,
// -190 under (over ~34% trueProb) does not.
//
// CLI override: --max-juice <num> sets PP_MAX_JUICE at runtime.
export const PP_MAX_JUICE = cliArgs.maxJuice ?? 180;
export const UD_MAX_JUICE = cliArgs.maxJuice ?? 200;

// Build the set of Underdog stats to skip dynamically from the odds feed each
// run. Any stat offered by Underdog but absent from the odds data is silently
// pre-filtered (avoids no_candidate noise). We union with the fallback set so
// new stats not yet observed in the feed are also skipped.
function buildUdStatsNotInOdds(
  oddsMarkets: SgoPlayerPropOdds[],
  udStatCandidates: Set<string>
): Set<string> {
  const oddsStatSet = new Set<string>(oddsMarkets.map((o) => o.stat));
  const absent = new Set<string>(UD_STATS_NOT_IN_ODDS_FALLBACK);
  for (const stat of udStatCandidates) {
    if (!oddsStatSet.has(stat)) absent.add(stat);
  }
  return absent;
}

// PP v4: dynamic detection of stats not in the odds feed for PrizePicks.
// PP fallback is empty — PP covers the same core stats as OddsAPI. Dynamic
// detection still catches any new PP-only props (e.g. "fantasy_score" variants)
// that might appear without a corresponding odds market.
const PP_STATS_NOT_IN_ODDS_FALLBACK = new Set<string>(["fantasy_score", "fantasy"]);

function buildPpStatsNotInOdds(
  oddsMarkets: SgoPlayerPropOdds[],
  ppStatCandidates: Set<string>
): Set<string> {
  const oddsStatSet = new Set<string>(oddsMarkets.map((o) => o.stat));
  const absent = new Set<string>(PP_STATS_NOT_IN_ODDS_FALLBACK);
  for (const stat of ppStatCandidates) {
    if (!oddsStatSet.has(stat)) absent.add(stat);
  }
  return absent;
}

function resolvePlayerNameForMatch(normalizedFromPick: string): string {
  return PLAYER_NAME_ALIASES[normalizedFromPick] ?? normalizedFromPick;
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

// Max allowed difference between odds line and pick line for a main-line match.
// --exact-line forces 0 (pick.line must == odds.line exactly).
const MAX_LINE_DIFF = cliArgs.exactLine ? 0 : 0.5;

// Phase 2: Alt-line match tolerance for Underdog points.
// When the main pass fails (delta > MAX_LINE_DIFF) we try a second pass against
// confirmed alt lines (isMainLine === false) within this wider window.
// Cap at 2.5 → we accept alt line at delta 0–2.5. Tighter deltas prefer the
// closest alt; the probability estimate for the nearest alt line is used, which
// is a bounded approximation acceptable for card-level EV DP.
export const UD_ALT_LINE_MAX_DELTA = 2.5;

// Stats eligible for the alt-match second pass (stats where OddsAPI carries alt lines)
const UD_ALT_MATCH_STATS = new Set<string>([
  "points", "rebounds", "assists", "threes",
  "steals", "blocks", "turnovers",
  "pra", "points_rebounds", "points_assists", "rebounds_assists",
]);

function isJuiceTooExtreme(american: number, maxJuice: number): boolean {
  return american <= -maxJuice;
}

type MatchResult =
  | { match: SgoPlayerPropOdds; matchType: "main" | "alt" | "alt_juice_rescue"; delta: number }
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
  oddsMarkets: SgoPlayerPropOdds[],
  maxJuice: number = PP_MAX_JUICE
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
    if (typeof best.underOdds === "number" && isJuiceTooExtreme(best.underOdds, maxJuice)) {
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

  if (bestDiff > MAX_LINE_DIFF) return { reason: "line_diff", bestLine: best.line, bestPlayerNorm };
  if (typeof best.underOdds === "number" && isJuiceTooExtreme(best.underOdds, maxJuice))
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
  oddsMarkets: SgoPlayerPropOdds[],
  maxJuice: number = UD_MAX_JUICE
): (MatchResult & { match: SgoPlayerPropOdds }) | null {
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
  oddsMarkets: SgoPlayerPropOdds[],
  maxJuice: number = PP_MAX_JUICE
): SgoPlayerPropOdds | null {
  const result = findBestMatchForPickWithReason(pick, oddsMarkets, maxJuice);
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
  get(player: string, stat: string): SgoPlayerPropOdds | undefined;
}

function buildPlayerOddsIndex(oddsMarkets: SgoPlayerPropOdds[]): PlayerOddsIndex {
  const map = new Map<string, SgoPlayerPropOdds>();
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
  oddsMarkets: SgoPlayerPropOdds[],
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
  allMarkets: SgoPlayerPropOdds[],
  debug: boolean
): SgoPlayerPropOdds | null {
  if (stat === "pra") return synthPRA(playerNorm, index, allMarkets, debug);
  if (stat === "points_assists" || stat === "pa") return synthPA(playerNorm, index, allMarkets, debug);
  if (stat === "threes") return synthThrees(playerNorm, index, allMarkets, debug);
  return null;
}

function findMarketForPlayer(
  playerNorm: string,
  stat: string,
  index: PlayerOddsIndex,
  allMarkets: SgoPlayerPropOdds[]
): SgoPlayerPropOdds | undefined {
  const quick = index.get(playerNorm, stat);
  if (quick) return quick;
  return allMarkets.find((m) => {
    const n = normalizeForMatch(normalizeOddsPlayerName(m.player));
    return n === playerNorm && normalizeStatForMerge(m.stat) === stat;
  });
}

function makeSynthetic(
  template: SgoPlayerPropOdds,
  stat: StatCategory,
  line: number,
  overOdds: number,
  underOdds: number
): SgoPlayerPropOdds {
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
  allMarkets: SgoPlayerPropOdds[],
  debug: boolean
): SgoPlayerPropOdds | null {
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
  allMarkets: SgoPlayerPropOdds[],
  debug: boolean
): SgoPlayerPropOdds | null {
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
  allMarkets: SgoPlayerPropOdds[],
  debug: boolean
): SgoPlayerPropOdds | null {
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
  rawPicks: RawPick[]
): Promise<MergedPick[]> {
  const result = await mergeOddsWithPropsWithMetadata(rawPicks);
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
 * Snapshot-aware merge: accepts pre-resolved SgoPlayerPropOdds[] from
 * OddsSnapshotManager so both PP and UD use the same odds data.
 */
export async function mergeWithSnapshot(
  rawPicks: RawPick[],
  oddsMarketsFromSnapshot: SgoPlayerPropOdds[],
  snapshotMeta: OddsSourceMetadata,
  audit?: SnapshotAudit,
): Promise<{ odds: MergedPick[]; metadata: OddsSourceMetadata; platformStats: MergePlatformStats }> {
  const oddsMarkets = [...oddsMarketsFromSnapshot];
  const metadata = { ...snapshotMeta };

  if (oddsMarkets.length > 0 && metadata.providerUsed === "OddsAPI") {
    writeOddsImportedCsv(oddsMarkets, "OddsAPI", normalizeOddsPlayerName);
  }

  const result = await mergeCore(rawPicks, oddsMarkets, metadata);
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
  rawPicks: RawPick[]
): Promise<{ odds: MergedPick[]; metadata: OddsSourceMetadata; platformStats: MergePlatformStats }> {
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
    noFetch: cliArgs.noFetchOdds,
    forceRefresh: cliArgs.forceRefreshOdds,
    refreshIntervalMinutes: cliArgs.refreshIntervalMinutes,
  };

  // Get odds (from cache or fresh fetch)
  let oddsMarkets: SgoPlayerPropOdds[] = [];
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
    return { odds: [], metadata, platformStats: {} };
  }

  if (oddsMarkets.length === 0) {
    console.log("mergeOddsWithProps: Fetching fresh odds from APIs...");
    const freshResult = await fetchFreshOdds(uniqueSports);
    
    if (freshResult.odds.length === 0) {
      console.log("mergeOddsWithProps: No fresh odds available, returning empty result");
      return { odds: [], metadata, platformStats: {} };
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

  return mergeCore(rawPicks, oddsMarkets, metadata);
}

async function mergeCore(
  rawPicks: RawPick[],
  oddsMarkets: SgoPlayerPropOdds[],
  metadata: OddsSourceMetadata
): Promise<{ odds: MergedPick[]; metadata: OddsSourceMetadata; platformStats: MergePlatformStats }> {
  const debug = process.env.DEBUG_MERGE === "1";

  // Phase 8: Composite stat fallback — synthesize PRA/PA/3PTM odds from
  // component stats when the combo stat itself is absent from the odds feed.
  const compositeSynthCount = synthesizeCompositeOdds(oddsMarkets, rawPicks, cliArgs.debug);
  if (compositeSynthCount > 0) {
    console.log(`[Composite] Synthesized ${compositeSynthCount} fallback odds entries (PRA/PA/3PTM from components)`);
  }

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
  const debugMatching = process.env.DEBUG_MATCHING === "1" || cliArgs.debug;

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
  const diag = {
    skippedPromo: 0, skippedFantasy: 0,
    skippedUdNoOdds: 0, skippedUdEscalator: 0,
    noCandidate: 0, lineDiff: 0, juice: 0,
    matched: 0, altMatched: 0,
    mergedExact: 0, mergedNearest: 0,
    multiBookMatches: 0,
  };
  // Per-platform merge stats
  const platformStats: Record<string, {
    rawProps: number; mergedExact: number; mergedNearest: number;
    noCandidate: number; lineDiff: number; noOddsStat: number; juice: number;
  }> = {};
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
      platformStats[site] = { rawProps: 0, mergedExact: 0, mergedNearest: 0, noCandidate: 0, lineDiff: 0, noOddsStat: 0, juice: 0 };
    }
    platformStats[site].rawProps++;

    if (anyPick.isDemon || anyPick.isGoblin) {
      diag.skippedPromo++;
      continue;
    }
    if (pick.stat === "fantasy_score") {
      diag.skippedFantasy++;
      continue;
    }

    if (site === "underdog") {
      if (udStatsNotInOdds.has(pick.stat)) {
        diag.skippedUdNoOdds++;
        platformStats[site].noOddsStat++;
        continue;
      }
      if (UD_ESCALATOR_STATS.has(pick.stat) && pick.line <= UD_ESCALATOR_MAX_LINE) {
        diag.skippedUdEscalator++;
        continue;
      }
    }

    if (site === "prizepicks" && ppStatsNotInOdds.has(pick.stat)) {
      diag.skippedUdNoOdds++;
      platformStats[site].noOddsStat++;
      continue;
    }

    // Use site-specific juice threshold: Underdog's tiered payouts make mildly
    // juiced lines (≤ -200) still viable; PrizePicks uses fixed pricing.
    const maxJuice = site === "underdog" ? UD_MAX_JUICE : PP_MAX_JUICE;
    let result = findBestMatchForPickWithReason(pick, oddsMarkets, maxJuice);

    // Phase 2: Alt-line second pass for both PP and UD when main pass fails with line_diff or juice.
    // Only runs when OddsAPI was fetched with includeAltLines=true (isMainLine is set on entries).
    let altResult: ReturnType<typeof findBestAltMatch> = null;
    if ("reason" in result && result.reason === "line_diff") {
      altResult = findBestAltMatch(pick, oddsMarkets, maxJuice);
      if (altResult) result = altResult; // promote alt match to primary result
    } else if ("reason" in result && result.reason === "juice") {
      altResult = findBestAltMatch(pick, oddsMarkets, maxJuice);
      if (altResult) {
        result = { ...altResult, matchType: "alt_juice_rescue" as const };
        console.log(`  [MERGE] juice-rescue via alt for ${pick.player} ${pick.stat} ${pick.line}`);
      }
    }

    if ("reason" in result) {
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
      continue;
    }

    const match = result.match;
    const matchType = result.matchType;
    const matchDelta = result.delta;
    if (matchType === "alt" || matchType === "alt_juice_rescue") diag.altMatched++;
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
        reason: matchType === "alt" || matchType === "alt_juice_rescue" ? "ok_alt" : "ok",
        bestOddsLine: String(match.line),
        bestOddsPlayerNorm: normalizeForMatch(normalizeOddsPlayerName(match.player)),
        matchType,
        altDelta: matchType === "alt" || matchType === "alt_juice_rescue" ? matchDelta.toFixed(2) : "0.00",
      });
    }

    // Phase 7.3: sharp-weighted de-vig across all matching books for this player/stat/line.
    // Exact-first: prefer books at the exact pick line; only widen to MAX_LINE_DIFF
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
        Math.abs(o.line - pick.line) <= MAX_LINE_DIFF
      );
    });
    const exactBookMatches = allBookCandidates.filter((o) => o.line === pick.line);
    const allBookMatches = exactBookMatches.length > 0 ? exactBookMatches : allBookCandidates;

    let trueOverProb: number;
    let trueUnderProb: number;

    if (allBookMatches.length > 1) {
      diag.multiBookMatches++;
      let sumW = 0;
      let sumWOver = 0;
      let sumWUnder = 0;
      const bookDetails: string[] = [];
      for (const bm of allBookMatches) {
        const w = getEffectiveBookWeight(bm.book, dynamicBookAccuracy);
        const op = americanToProb(bm.overOdds);
        const up = americanToProb(bm.underOdds);
        const [devOver, devUnder] = devigTwoWay(op, up);
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
    });
  }

  if (exportMergeReport && mergeReportRows.length > 0) {
    writeMergeReportCsv(mergeReportRows);
    const reportSite = rawPicks.length > 0 ? pickSite(rawPicks[0]) : "unknown";
    // Timestamped file for triple A/B audit
    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    writeMergeReportCsv(mergeReportRows, getOutputPath(`merge_report_${reportSite}.csv`));
    writeMergeReportCsv(mergeReportRows, getOutputPath(`merge_report_${reportSite}_${ts}.csv`));
  }

  const logPrefix = rawPicks.length > 0 ? ` [${pickSite(rawPicks[0]) === "underdog" ? "Underdog" : "PrizePicks"}]` : "";
  const udSkipMsg = diag.skippedUdNoOdds > 0 || diag.skippedUdEscalator > 0
    ? `; ud_skipped: no_odds_stat=${diag.skippedUdNoOdds}, escalator=${diag.skippedUdEscalator}`
    : "";
  const altMsg = diag.altMatched > 0 ? `; alt_rescued=${diag.altMatched}` : "";

  // Exact match ratio: picks where odds.line == pick.line exactly (delta=0)
  const exactMatches = merged.filter(m => m.altMatchDelta === 0).length;
  const exactRatio = merged.length > 0 ? exactMatches / merged.length : 0;

  console.log(
    `mergeOddsWithProps${logPrefix}: Produced ${merged.length} merged picks` +
    ` (matched: main=${diag.matched - diag.altMatched}, alt=${diag.altMatched}${altMsg}` +
    `; skipped: promo=${diag.skippedPromo}, fantasy=${diag.skippedFantasy}${udSkipMsg}` +
    `; no match: no_candidate=${diag.noCandidate}, line_diff=${diag.lineDiff}, juice=${diag.juice})`
  );
  console.log(
    `mergeOddsWithProps${logPrefix}: exact_match_ratio=${(exactRatio * 100).toFixed(1)}% ` +
    `(${exactMatches}/${merged.length}) | MAX_LINE_DIFF=${MAX_LINE_DIFF} | PP_MAX_JUICE=${PP_MAX_JUICE}`
  );
  if (diag.multiBookMatches > 0) {
    console.log(
      `mergeOddsWithProps${logPrefix}: multi_book_consensus=${diag.multiBookMatches} props sharp-weighted ` +
      `(DK 3.0x, Pinnacle 2.8x, FanDuel 2.2x)`
    );
  }

  // Per-platform merge stats summary
  for (const [plat, ps] of Object.entries(platformStats)) {
    console.log(
      `[MergeStats] ${plat}: rawProps=${ps.rawProps} mergedExact=${ps.mergedExact} ` +
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
  
  return { odds: merged, metadata, platformStats };
}

/**
 * Fetch fresh odds from The Odds API only (unified OddsProvider).
 */
async function fetchFreshOdds(sports: Sport[]): Promise<{ odds: MergedPick[]; providerUsed: "OddsAPI" | "none" }> {
  const reason = cliArgs.forceRefreshOdds ? "force-refresh" : "scheduled";
  OddsCache.logApiCall("OddsAPI", reason);
  const apiCalls = [{ endpoint: "OddsAPI", timestamp: new Date().toISOString(), reason: "scheduled" as const }];

  const marketsLive = await fetchPlayerPropOdds(sports, {
    forceRefresh: cliArgs.forceRefreshOdds ?? false,
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


