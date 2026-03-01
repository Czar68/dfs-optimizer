// src/fetch_sgo_odds.ts

import "dotenv/config";
import fs from "fs";
import path from "path";
import SportsGameOdds from "sports-odds-api";
import { SgoPlayerPropOdds, StatCategory, Sport } from "./types";
import { NBA_STAT_CATEGORIES } from "./config/nba_props";
import { cliArgs } from "./cli_args";

// ── Phase 1: SGO Max Harvest constants ───────────────────────────────────────

// SGO quota ceiling for the month (paid plan: 2500 hits/month).
// We track usage in cache/provider-usage.json and warn when approaching limits.
const SGO_MONTHLY_QUOTA = 2500;
const SGO_QUOTA_WARN_THRESHOLD = 100; // warn if < 100 hits remain

// Full-harvest params: alt lines enabled, limit raised for larger response sets.
// includeAltLines=true → SGO returns every alt line per stat per player.
// One call retrieves mains + alts + multi-stat combo lines (PA, PR, RA, PRA).
function getSgoHarvestParams(): {
  finalized: boolean;
  oddsAvailable: boolean;
  includeAltLines: boolean;
  includeOpposingOdds: boolean;
  limit: number;
} {
  return {
    finalized: false,
    oddsAvailable: true,
    includeAltLines: cliArgs.includeAltLines,
    includeOpposingOdds: true,
    limit: 200,
  };
}

// Raw market cache — separate from OddsCache (which caches MergedPick[]).
// This stores SgoPlayerPropOdds[] so downstream runs pay 0 quota hits.
const RAW_CACHE_DIR = path.join(process.cwd(), "cache");
const RAW_CACHE_FILENAME_BASE = "sgo_props_cache";
const RAW_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6-hour TTL (refresh twice per day max)

interface SgoRawCache {
  fetchedAt: string; // ISO timestamp
  leagueID: string;
  totalRows: number;
  mainLineCount: number;
  altLineCount: number;
  includeAltLines: boolean;
  includeOpposingOdds: boolean;
  books: string[];
  data: SgoPlayerPropOdds[];
}

function getRawCachePath(leagueID: string): string {
  if (!fs.existsSync(RAW_CACHE_DIR)) fs.mkdirSync(RAW_CACHE_DIR, { recursive: true });
  const altTag = cliArgs.includeAltLines ? "alt" : "main";
  return path.join(RAW_CACHE_DIR, `${leagueID.toLowerCase()}_${RAW_CACHE_FILENAME_BASE}_${altTag}.json`);
}

function readRawCache(leagueID: string): SgoRawCache | null {
  try {
    const p = getRawCachePath(leagueID);
    if (!fs.existsSync(p)) return null;
    const entry: SgoRawCache = JSON.parse(fs.readFileSync(p, "utf8"));
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age > RAW_CACHE_TTL_MS) {
      console.log(`[SGO Cache] ${leagueID} cache expired (${(age / 60000).toFixed(0)}m old, TTL=${RAW_CACHE_TTL_MS / 60000}m)`);
      return null;
    }
    // Reject cache if alt-line params changed since it was written
    if (entry.includeAltLines !== undefined && entry.includeAltLines !== cliArgs.includeAltLines) {
      console.log(`[SGO Cache] ${leagueID} cache param mismatch (cached includeAltLines=${entry.includeAltLines}, current=${cliArgs.includeAltLines})`);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeRawCache(leagueID: string, data: SgoPlayerPropOdds[], mainLineCount: number, altLineCount: number): void {
  try {
    const entry: SgoRawCache = {
      fetchedAt: new Date().toISOString(),
      leagueID,
      totalRows: data.length,
      mainLineCount,
      altLineCount,
      includeAltLines: cliArgs.includeAltLines,
      includeOpposingOdds: true,
      books: PREFERRED_BOOKS,
      data,
    };
    fs.writeFileSync(getRawCachePath(leagueID), JSON.stringify(entry, null, 2), "utf8");
    // Also write a dated snapshot for audit trail
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const snapshotPath = path.join(RAW_CACHE_DIR, `sgo_full_cache_${dateTag}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(entry, null, 2), "utf8");
    console.log(`[SGO Cache] Wrote ${data.length} rows → ${getRawCachePath(leagueID)}`);
    console.log(`[SGO Cache] Daily snapshot → ${snapshotPath}`);
  } catch (err) {
    console.error("[SGO Cache] Failed to write raw cache:", err);
  }
}

// Quota guard: read current SGO hit count from provider-usage.json and warn.
function logQuotaGuard(phase: "before" | "after", leagueID: string, extra?: Record<string, unknown>): void {
  const usagePath = path.join(RAW_CACHE_DIR, "provider-usage.json");
  let sgoCallCount = 0;
  try {
    if (fs.existsSync(usagePath)) {
      const u = JSON.parse(fs.readFileSync(usagePath, "utf8"));
      sgoCallCount = u.sgoCallCount ?? 0;
    }
  } catch { /* ignore */ }

  if (phase === "before") {
    const estimatedAfter = sgoCallCount + 1;
    console.log(
      `🔄 SGO quota: ${leagueID} harvest (+1 hit expected, estimated ~${estimatedAfter}/${SGO_MONTHLY_QUOTA} today)`
    );
    if (SGO_MONTHLY_QUOTA - sgoCallCount <= SGO_QUOTA_WARN_THRESHOLD) {
      console.warn(`⚠️  SGO QUOTA WARNING: only ${SGO_MONTHLY_QUOTA - sgoCallCount} hits remaining this month!`);
    }
  } else {
    const altCount = (extra?.altLineCount as number) ?? 0;
    const mainCount = (extra?.mainLineCount as number) ?? 0;
    const totalRows = (extra?.totalRows as number) ?? 0;
    const sample = extra?.sample as string ?? "";
    console.log(
      `✅ SGO HARVEST COMPLETE:\n` +
      `   📊 Hits: +1 (validate at dashboard)\n` +
      `   📈 PTS alts: ${altCount} alt lines | ${mainCount} main lines | ${totalRows} total rows\n` +
      `   🎯 Sample: ${sample}\n` +
      `   💾 Cache: sgo_full_cache_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json (${totalRows} rows)\n` +
      `   ⚠️  PAUSE: Validate quota in dashboard before Phase 2`
    );
    appendQuotaLog(leagueID, sgoCallCount + 1, altCount, totalRows);
  }
}

// Append a line to quota_log.txt for audit trail
function appendQuotaLog(leagueID: string, callCount: number, altLines: number, totalRows: number): void {
  const logPath = path.join(process.cwd(), "quota_log.txt");
  const line = `${new Date().toISOString()} | SGO HARVEST | league=${leagueID} | call#=${callCount}/${SGO_MONTHLY_QUOTA} | alts=${altLines} | total_rows=${totalRows} | includeAltLines=true\n`;
  try {
    fs.appendFileSync(logPath, line, "utf8");
    console.log(`[SGO] Quota entry appended → quota_log.txt`);
  } catch { /* non-fatal */ }
}

// Fail-fast if we expected alt lines but got none (data quality guard).
function throwIfNoAlts(
  altLineCount: number,
  leagueID: string,
  harvestParams: ReturnType<typeof getSgoHarvestParams>,
  mainLineCount: number,
  totalRows: number,
): void {
  if (!cliArgs.includeAltLines || altLineCount > 0) return;

  const msg =
    `[SGO] 0 alt lines returned for ${leagueID}.\n` +
    `  Request params: includeAltLines=${harvestParams.includeAltLines} ` +
    `includeOpposingOdds=${harvestParams.includeOpposingOdds} limit=${harvestParams.limit}\n` +
    `  Book filters: ${PREFERRED_BOOKS.join(", ")}\n` +
    `  Counts: mainLines=${mainLineCount} altLines=0 totalRows=${totalRows}`;

  if (cliArgs.requireAltLines && leagueID === "NBA") {
    throw new Error(
      `REQUIRE_ALT_LINES FAILED — aborting run.\n${msg}\n` +
      `Use --no-require-alt-lines to downgrade to a warning.`
    );
  }

  console.warn(`[SGO Phase 1] WARNING: ${msg}\n  Proceeding with main lines only.`);
}

const PREFERRED_BOOKS = [
  "fanduel",
  "draftkings",
  "caesars",
  "betmgm",
  "espn_bet",
  "pointsbet",
];

// Same stats as TheRundown (see config/nba_props.ts). Includes points/rebounds/assists/threes + steals/blocks/turnovers for revenue. Override with SGO_NBA_STATS env if needed.
function getSgoNbaStatAllowlist(): StatCategory[] {
  const env = process.env.SGO_NBA_STATS;
  if (!env || env.trim() === "") return [...NBA_STAT_CATEGORIES];
  return env.split(",").map((s) => s.trim()) as StatCategory[];
}
const SGO_NBA_STAT_ALLOWLIST: StatCategory[] = getSgoNbaStatAllowlist();

type BookmakerRecord = Record<string, any> | undefined;

// Map league IDs to Sport types
function mapLeagueToSport(leagueID: string): Sport {
  const leagueUpper = leagueID.toUpperCase();
  
  // NBA leagues
  if (leagueUpper === 'NBA' || leagueUpper.includes('BASKETBALL')) {
    return 'NBA';
  }
  
  // NFL leagues
  if (leagueUpper === 'NFL' || leagueUpper.includes('FOOTBALL')) {
    return 'NFL';
  }
  
  // MLB leagues
  if (leagueUpper === 'MLB' || leagueUpper.includes('BASEBALL')) {
    return 'MLB';
  }
  
  // NHL leagues
  if (leagueUpper === 'NHL' || leagueUpper.includes('HOCKEY')) {
    return 'NHL';
  }
  
  // College leagues
  if (leagueUpper === 'NCAAB' || leagueUpper.includes('COLLEGE BASKETBALL')) {
    return 'NCAAB';
  }
  
  if (leagueUpper === 'NCAAF' || leagueUpper.includes('COLLEGE FOOTBALL')) {
    return 'NCAAF';
  }
  
  // Default to NBA for unknown leagues
  return 'NBA';
}

// Legacy wrapper kept for any callers that don't need isMainLine
function pickBestBookmaker(
  byBookmaker: BookmakerRecord
): { bookmakerID: string; data: any } | null {
  const result = pickBestBookmmakerWithAlt(byBookmaker);
  return result ? { bookmakerID: result.bookmakerID, data: result.data } : null;
}

// Map SGO statID → internal StatCategory for NBA + NFL
function mapSgoStatIdToCategory(
  statID: string,
  leagueID: string
): StatCategory | null {
  const key = statID.toLowerCase();
  const league = leagueID.toUpperCase();

  // NBA stats (points etc. per SGO NBA props docs)[web:6]
  if (league === "NBA") {
    if (key === "points") return "points";
    if (key === "rebounds") return "rebounds";
    if (key === "assists") return "assists";
    if (key === "pra" || key === "points_rebounds_assists") return "pra";
    if (key === "points_rebounds" || key === "points+rebounds" || key === "pr") {
      return "points_rebounds";
    }
    if (key === "points_assists" || key === "points+assists" || key === "pa") {
      return "points_assists";
    }
    if (
      key === "rebounds_assists" ||
      key === "rebounds+assists" ||
      key === "ra"
    ) {
      return "rebounds_assists";
    }
    if (
      key === "threepointersmade" ||
      key === "3pt_made" ||
      key === "3pm" ||
      key === "threes"
    ) {
      return "threes";
    }
    if (key === "blocks" || key === "blk") return "blocks";
    if (key === "steals" || key === "stl") return "steals";
    if (key === "stocks" || key === "steals+blocks") return "stocks";
    if (key === "turnovers" || key === "to") return "turnovers";
    if (
      key === "fantasyscore" ||
      key === "fantasy_score" ||
      key === "fantasy_points"
    ) {
      return "fantasy_score";
    }
  }

  // NFL stats (receiving_yards, rushing_attempts, passing_yards, etc.)[web:1]
  if (league === "NFL") {
    if (key === "passing_yards") return "pass_yards";
    if (key === "passing_attempts") return "pass_attempts";
    if (key === "passing_completions") return "pass_completions";
    if (key === "passing_touchdowns") return "pass_tds";
    if (key === "passing_interceptions") return "interceptions";
    if (key === "rushing_yards") return "rush_yards";
    if (key === "rushing_attempts") return "rush_attempts";
    if (key === "rushing+receiving_yards") return "rush_rec_yards";
    if (key === "receiving_yards") return "rec_yards";
    if (key === "receiving_receptions") return "receptions";
  }

  // NHL stats
  if (league === "NHL") {
    if (key === "points") return "points";
    if (key === "goals") return "goals";
    if (key === "assists") return "assists";
    if (key === "shots_on_goal" || key === "shots" || key === "sog") return "shots_on_goal";
    if (key === "saves") return "saves";
    if (key === "goals_against" || key === "goalsagainst") return "goals_against";
    if (key === "blocked_shots" || key === "blocks") return "blocks";
  }

  // MLB stats
  if (league === "MLB") {
    if (key === "hits") return "points";
    if (key === "strikeouts" || key === "pitcher_strikeouts") return "blocks";
    if (key === "total_bases") return "rebounds";
  }

  return null;
}

async function fetchLeaguePlayerPropsFromApi(
  client: any,
  leagueID: "NBA" | "NFL" | "NHL" | "MLB"
): Promise<{ markets: SgoPlayerPropOdds[]; mainLineCount: number; altLineCount: number }> {

  // ── Phase 1 Quota Guard: log BEFORE hitting the API ──────────────────────
  logQuotaGuard("before", leagueID);

  const harvestParams = getSgoHarvestParams();
  const page = await client.events.get({
    leagueID,
    ...harvestParams,
  });

  const events = (page as any).data ?? [];
  console.log(
    `[SGO] ${leagueID} events returned: ${events.length} ` +
    `(includeAltLines=${harvestParams.includeAltLines}, includeOpposingOdds=${harvestParams.includeOpposingOdds}, limit=${harvestParams.limit})`
  );

  // Accumulator keyed by player+stat+line+book to avoid cross-book collapse.
  type Acc = Map<string, SgoPlayerPropOdds & { overOdds: number; underOdds: number; isMainLine: boolean }>;
  const byKey: Acc = new Map();
  let mainLineCount = 0;
  let altLineCount = 0;

  for (const event of events) {
    const odds = (event as any).odds as Record<string, any> | undefined;
    if (!odds) continue;

    const league: string = (event as any).leagueID ?? leagueID;
    const eventId: string | null = (event as any).eventID ?? null;
    const homeTeam: string | null = (event as any).homeTeamID ?? null;
    const awayTeam: string | null = (event as any).awayTeamID ?? null;

    for (const odd of Object.values(odds)) {
      if (!odd) continue;

      const statEntityID: string | undefined = (odd as any).statEntityID;
      if (!statEntityID) continue;

      if (statEntityID === "all" || statEntityID === "home" || statEntityID === "away") continue;

      const statID: string | undefined = (odd as any).statID;
      const betTypeID: string | undefined = (odd as any).betTypeID;
      const periodID: string | undefined = (odd as any).periodID;
      const sideID: string | undefined = (odd as any).sideID;

      if (betTypeID !== "ou") continue;
      if (periodID !== "game") continue;
      if (sideID !== "over" && sideID !== "under") continue;
      if (!statID) continue;

      const statCategory = mapSgoStatIdToCategory(statID, league);
      if (!statCategory) continue;
      if (league === "NBA" && !SGO_NBA_STAT_ALLOWLIST.includes(statCategory)) continue;

      const best = pickBestBookmmakerWithAlt(
        (odd as any).byBookmaker as Record<string, any> | undefined
      );
      if (!best) continue;
      const { bookmakerID, data, isMainLine } = best;

      const lineRaw = (data as any).overUnder;
      const oddsRaw = (data as any).odds;
      const line = Number(lineRaw);
      const price = Number(oddsRaw);
      if (!Number.isFinite(line) || !Number.isFinite(price)) continue;

      // Uniqueness key: player + stat + line + book — preserves distinct alt lines
      // and prevents cross-book collapse at the same line value.
      const key = `${statEntityID}::${statCategory}::${line}::${bookmakerID}`;
      let existing = byKey.get(key);

      if (!existing) {
        existing = {
          sport: mapLeagueToSport(league),
          player: statEntityID,
          team: null,
          opponent: null,
          league,
          stat: statCategory,
          line,
          overOdds: Number.NaN,
          underOdds: Number.NaN,
          book: bookmakerID,
          eventId,
          marketId: null,
          selectionIdOver: null,
          selectionIdUnder: null,
          isMainLine,
        } as any;
        byKey.set(key, existing!);

        if (isMainLine) mainLineCount++;
        else altLineCount++;
      }

      if (sideID === "over") existing!.overOdds = price;
      else if (sideID === "under") existing!.underOdds = price;

      if (!existing!.team && homeTeam && awayTeam) {
        existing!.team = homeTeam;
        existing!.opponent = awayTeam;
      }
    }
  }

  const markets: SgoPlayerPropOdds[] = Array.from(byKey.values()).filter(
    (p) => Number.isFinite(p.line) && Number.isFinite(p.overOdds) && Number.isFinite(p.underOdds)
  );

  // ── Diagnostics ─────────────────────────────────────────────────────────
  const uniquePlayers = new Set(markets.map((m) => m.player)).size;
  const uniqueStats = new Set(markets.map((m) => m.stat)).size;
  console.log(
    `[SGO DIAG] ${leagueID}: marketsTotal=${markets.length} mainLines=${mainLineCount} ` +
    `altLines=${altLineCount} uniquePlayers=${uniquePlayers} uniqueStats=${uniqueStats}`
  );

  // Build a sample for the quota log (e.g. Jokic PTS lines)
  const jokicPts = markets
    .filter((m) => m.player.toLowerCase().includes("jokic") && m.stat === "points")
    .map((m) => `${m.line}(${(m as any).isMainLine ? "main" : "alt"} ${m.book} ${m.overOdds})`)
    .slice(0, 5)
    .join(", ");
  const sample = jokicPts ? `Jokic PTS [${jokicPts}]` : `${markets[0]?.player ?? "?"} ${markets[0]?.stat ?? ""} ${markets[0]?.line ?? ""}`;

  // ── Phase 1 Quota Guard: log AFTER API call ───────────────────────────────
  logQuotaGuard("after", leagueID, { altLineCount, mainLineCount, totalRows: markets.length, sample });

  // Guard: fail-fast if we expected alts but got none (API/param issue)
  throwIfNoAlts(altLineCount, leagueID, harvestParams, mainLineCount, markets.length);

  // Write to raw market cache (future runs pay 0 quota hits)
  writeRawCache(leagueID, markets, mainLineCount, altLineCount);

  console.log(
    `[SGO] ${leagueID} harvest complete: ${markets.length} markets (${mainLineCount} main + ${altLineCount} alt lines)`
  );

  return { markets, mainLineCount, altLineCount };
}

// Enhanced bookmaker picker: extracts isMainLine flag alongside odds/line
function pickBestBookmmakerWithAlt(
  byBookmaker: BookmakerRecord
): { bookmakerID: string; data: any; isMainLine: boolean } | null {
  if (!byBookmaker) return null;

  for (const book of PREFERRED_BOOKS) {
    const data = (byBookmaker as any)[book];
    if (data && data.available !== false && data.odds != null) {
      return { bookmakerID: book, data, isMainLine: data.isMainLine !== false };
    }
  }

  let best: { bookmakerID: string; data: any; isMainLine: boolean } | null = null;
  let bestVal = -Infinity;
  for (const [bookmakerID, data] of Object.entries(byBookmaker)) {
    if (!data || (data as any).available === false || (data as any).odds == null) continue;
    const val = Number((data as any).odds);
    if (Number.isNaN(val)) continue;
    if (val > bestVal) {
      bestVal = val;
      best = { bookmakerID, data, isMainLine: (data as any).isMainLine !== false };
    }
  }
  return best;
}

async function fetchLeaguePlayerProps(
  client: any,
  leagueID: "NBA" | "NFL" | "NHL" | "MLB",
  forceRefresh = false,
): Promise<SgoPlayerPropOdds[]> {
  // ── Phase 1: Serve from raw cache when fresh (0 quota hits) ──────────────
  if (!forceRefresh) {
    const cached = readRawCache(leagueID);
    if (cached) {
      console.log(
        `[SGO Cache] Serving ${leagueID} from raw cache (${cached.totalRows} rows, ` +
        `${cached.mainLineCount} main + ${cached.altLineCount} alt, fetched ${cached.fetchedAt})`
      );
      return cached.data;
    }
  } else {
    // Delete stale cache so the fresh fetch rewrites it (belt-and-suspenders)
    const stalePath = getRawCachePath(leagueID);
    if (fs.existsSync(stalePath)) {
      fs.unlinkSync(stalePath);
      console.log(`[SGO Cache] --fresh: deleted stale raw cache → ${stalePath}`);
    }
  }

  // Cache miss (or bypassed) → hit the API (costs 1 quota hit)
  const { markets } = await fetchLeaguePlayerPropsFromApi(client, leagueID);
  return markets;
}

export async function fetchSgoPlayerPropOdds(
  sports: Sport[] = ['NBA'],
  opts: { forceRefresh?: boolean } = {},
): Promise<SgoPlayerPropOdds[]> {
  const apiKey = process.env.SGO_API_KEY ?? process.env.SGOAPIKEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn("fetchSgoPlayerPropOdds: missing SGOAPIKEY, returning []");
    return [];
  }

  const client = new SportsGameOdds({ apiKeyParam: apiKey });

  const results: SgoPlayerPropOdds[] = [];

  // Map sports to SGO league IDs
  const sportToLeagueMap: Record<Sport, string> = {
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NHL': 'NHL',
    'MLB': 'MLB',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF'
  };

  // Filter to supported leagues for the requested sports
  const leagues = sports
    .map(sport => sportToLeagueMap[sport])
    .filter((league): league is "NBA" | "NFL" | "NHL" | "MLB" => 
      ["NBA", "NFL", "NHL", "MLB"].includes(league)
    );

  console.log(`fetchSgoPlayerPropOdds: fetching leagues [${leagues.join(', ')}] for sports [${sports.join(', ')}]`);

  const { forceRefresh = false } = opts;
  if (forceRefresh) {
    console.log(`[SGO] --fresh flag active: bypassing raw cache for [${leagues.join(', ')}]`);
  }

  for (const league of leagues) {
    try {
      const leagueResults = await fetchLeaguePlayerProps(client, league, forceRefresh);
      results.push(...leagueResults);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`fetchSgoPlayerPropOdds: error calling SGO SDK for ${league}`, err);
    }
  }

  return results;
}

// Test-visible exports for unit tests
export {
  mapSgoStatIdToCategory as _mapSgoStatIdToCategory,
  pickBestBookmmakerWithAlt as _pickBestBookmakerWithAlt,
  throwIfNoAlts as _throwIfNoAlts,
  getSgoHarvestParams as _getSgoHarvestParams,
  PREFERRED_BOOKS as _PREFERRED_BOOKS,
  mapLeagueToSport as _mapLeagueToSport,
};
