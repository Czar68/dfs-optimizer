// src/fetch_props.ts

import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { RawPick, StatCategory, Sport } from "./types";
import { getAllowedPPLeagues, PP_LEAGUE_IDS } from "./config/leagues";

const PRIZEPICKS_PROJECTIONS_BASE_URL = "https://api.prizepicks.com/projections";

const PRIZEPICKS_COMMON_QUERY =
  "per_page=250&single_stat=true&in_game=true&state_code=KY&game_mode=prizepools";

interface PrizePicksProjectionAttributes {
  line_score: string;
  /** String label, or JSON:API relationship object when sparse; use {@link resolvePrizePicksStatTypeRaw}. */
  stat_type?: string | { data?: { type?: string; id?: string } | null } | null;
  stat_display_name?: string | null;
  projection_type: string;
  description: string | null;
  league_id: number;
  created_at: string;
  updated_at: string;
  start_time: string | null;
  game_id: string | null;

  // Actual promo / oddstype fields in your JSON
  odds_type?: string | null; // "goblin", "demon", "standard"
  is_promo?: boolean;

  // Keep older names too, in case PrizePicks uses both
  oddstype?: string | null;
  ispromo?: boolean;
  promotion_id?: number | null;
  promotion_type?: string | null;

  [key: string]: unknown;
}

interface PrizePicksProjection {
  id: string;
  type: "projection";
  attributes: PrizePicksProjectionAttributes;
  relationships: {
    new_player?: {
      data: { id: string; type: "new_player" } | null;
    };
    league?: {
      data: { id: string; type: "league" } | null;
    };
    game?: {
      data: { id: string; type: "game" } | null;
    };
    stat_type?: {
      data: { id: string; type: "stat_type" } | null;
    };
  };
}

interface PrizePicksIncludedItemAttributes {
  name?: string;
  first_name?: string;
  last_name?: string;
  league_id?: number;
  team?: string | null;
  opponent?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  [key: string]: unknown;
}

interface PrizePicksIncludedItem {
  id: string;
  type: "new_player" | "league" | "game" | "stat_type";
  attributes: PrizePicksIncludedItemAttributes;
}

export interface PrizePicksProjectionsResponse {
  data: PrizePicksProjection[];
  included: PrizePicksIncludedItem[];
}

// Map league names to Sport types
function mapLeagueToSport(league: string): Sport {
  const leagueUpper = league.toUpperCase();
  
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

/** Match NBA combo stat tokens where PrizePicks may insert spaces around "+". */
function nbaComboTokenMatch(
  s: string,
  patterns: string[],
  collapseComboSpacing: boolean
): boolean {
  if (!collapseComboSpacing) {
    return patterns.some((p) => s === p);
  }
  const sc = s.replace(/\s+/g, "");
  return patterns.some((p) => s === p || sc === p);
}

export type MapPrizePicksStatOptions = {
  /** When true (default), "Pts + Rebs + Asts" matches pts+rebs+asts-style combos. Phase 74 behavior was false. */
  collapseComboSpacing?: boolean;
};

/**
 * Map PrizePicks stat_type / stat_display_name strings into our StatCategory.
 * Exported for merge-breadth tests and diagnostics (Phase 75).
 */
export function mapPrizePicksStatType(
  statTypeRaw: string,
  options?: MapPrizePicksStatOptions
): StatCategory | null {
  const collapseComboSpacing = options?.collapseComboSpacing !== false;
  const s = statTypeRaw.toLowerCase().replace(/\s*\(combo\)\s*/g, "").trim();

  // NBA stats
  if (s === "points" || s === "pts") return "points";
  if (s === "rebounds" || s === "rebs") return "rebounds";
  if (s === "assists" || s === "asts") return "assists";
  if (s === "threes" || s === "three_pointers_made" || s === "3pt_made" ||
    s === "3-pt made" || s === "3-pt made (combo)")
    return "threes";
  if (s === "blocks" || s === "blk") return "blocks";
  if (s === "steals" || s === "stl") return "steals";
  if (s === "turnovers") return "turnovers";
  if (s === "fantasy_score" || s === "fantasy") return "fantasy_score";
  if (
    nbaComboTokenMatch(
      s,
      ["pts_rebs_asts", "pra", "points_rebounds_assists", "pts+rebs+asts"],
      collapseComboSpacing
    )
  )
    return "pra";
  if (
    nbaComboTokenMatch(
      s,
      ["pts_rebs", "pr", "points_rebounds", "pts+rebs"],
      collapseComboSpacing
    )
  )
    return "points_rebounds";
  if (
    nbaComboTokenMatch(
      s,
      ["pts_asts", "pa", "points_assists", "pts+asts", "p+a"],
      collapseComboSpacing
    )
  )
    return "points_assists";
  if (
    nbaComboTokenMatch(
      s,
      ["rebs_asts", "ra", "rebounds_assists", "rebs+asts", "r+a"],
      collapseComboSpacing
    )
  )
    return "rebounds_assists";
  if (nbaComboTokenMatch(s, ["stocks", "blks+stls"], collapseComboSpacing))
    return "stocks";

  // NFL stats
  if (s === "passing_yards" || s === "pass_yards" || s === "passing yards")
    return "pass_yards";
  if (s === "pass_attempts" || s === "pass attempts") return "pass_attempts";
  if (
    s === "pass_completions" ||
    s === "completions" ||
    s === "pass completions"
  )
    return "pass_completions";
  if (s === "pass_tds" || s === "passing_tds" || s === "pass tds")
    return "pass_tds";
  if (s === "interceptions" || s === "int" || s === "ints")
    return "interceptions";

  if (s === "rushing_yards" || s === "rush_yards" || s === "rush yards")
    return "rush_yards";
  if (
    s === "rushing_attempts" ||
    s === "rush_attempts" ||
    s === "rush attempts"
  )
    return "rush_attempts";

  if (
    s === "rushrec_yds" ||
    s === "rushrec yds" ||
    s === "rush+rec yards" ||
    s === "rush_rec_yards"
  )
    return "rush_rec_yards";

  if (s === "receiving_yards" || s === "rec_yards" || s === "receiving yards")
    return "rec_yards";
  if (s === "receptions" || s === "catches") return "receptions";

  if (s === "fantasy score") return "fantasy_score";

  // NHL stats
  if (s === "goals" || s === "goal") return "goals";
  if (s === "assists" || s === "ast") return "assists";
  if (s === "points" || s === "pts") return "points";
  if (s === "shots_on_goal" || s === "shots" || s === "sog") return "shots_on_goal";
  if (s === "saves" || s === "save") return "saves";
  if (s === "goals_against" || s === "ga") return "goals_against";
  if (s === "plus_minus" || s === "plusminus" || s === "+/-") return "plus_minus";
  if (s === "penalty_minutes" || s === "pim") return "penalty_minutes";
  if (s === "power_play_goals" || s === "ppg") return "power_play_goals";
  if (s === "short_handed_goals" || s === "shg") return "short_handed_goals";
  if (s === "time_on_ice" || s === "toi") return "time_on_ice";

  return null;
}

/** Included `stat_type` resources: id → display/name string for relationship-only projections. */
function buildStatTypeMap(
  json: PrizePicksProjectionsResponse
): Map<string, string> {
  const statTypeById = new Map<string, string>();
  for (const item of json.included || []) {
    if (item.type !== "stat_type") continue;
    const attrs = item.attributes as Record<string, unknown>;
    const cand = [attrs.name, attrs.display_name, attrs.stat_display_name].find(
      (x) => typeof x === "string" && x.trim().length > 0
    ) as string | undefined;
    if (cand) statTypeById.set(item.id, cand.trim());
  }
  return statTypeById;
}

/**
 * Resolve the PrizePicks stat label used for {@link mapPrizePicksStatType}.
 * Handles string attributes, {@link PrizePicksProjectionAttributes.stat_display_name},
 * and JSON:API `relationships.stat_type` + included `stat_type` resources.
 */
export function resolvePrizePicksStatTypeRaw(
  attr: PrizePicksProjectionAttributes,
  proj: PrizePicksProjection,
  statTypeById: Map<string, string>
): string | null {
  const st = attr.stat_type;
  if (typeof st === "string" && st.trim()) return st.trim();
  const disp = attr.stat_display_name;
  if (typeof disp === "string" && disp.trim()) return disp.trim();
  const rel = proj.relationships.stat_type?.data;
  if (rel && rel.type === "stat_type" && rel.id) {
    const fromIncluded = statTypeById.get(rel.id);
    if (fromIncluded) return fromIncluded;
  }
  return null;
}

function buildPlayerMaps(
  json: PrizePicksProjectionsResponse
): {
  playerMap: Map<string, { name: string; team: string | null; opponent: string | null }>;
  leagueMap: Map<string, string>;
  gameMap: Map<string, { home_team: string | null; away_team: string | null }>;
} {
  const playerMap = new Map<
    string,
    { name: string; team: string | null; opponent: string | null }
  >();
  const leagueMap = new Map<string, string>();
  const gameMap = new Map<
    string,
    { home_team: string | null; away_team: string | null }
  >();

  for (const item of json.included || []) {
    if (item.type === "new_player") {
      const first = (item.attributes.first_name || "").toString().trim();
      const last = (item.attributes.last_name || "").toString().trim();
      const nameAttr = (item.attributes.name || "").toString().trim();
      const name =
        nameAttr || [first, last].filter((x) => x.length > 0).join(" ");
      const team = (item.attributes.team as string | null | undefined) ?? null;
      const opponent =
        (item.attributes.opponent as string | null | undefined) ?? null;
      playerMap.set(item.id, { name, team, opponent });
    } else if (item.type === "league") {
      const leagueName = (item.attributes.name || "").toString().trim();
      leagueMap.set(item.id, leagueName);
    } else if (item.type === "game") {
      const home_team =
        (item.attributes.home_team as string | null | undefined) ?? null;
      const away_team =
        (item.attributes.away_team as string | null | undefined) ?? null;
      gameMap.set(item.id, { home_team, away_team });
    }
  }

  return { playerMap, leagueMap, gameMap };
}

export function mapJsonToRawPicks(json: PrizePicksProjectionsResponse): RawPick[] {
  const picks: RawPick[] = [];
  const { playerMap, leagueMap, gameMap } = buildPlayerMaps(json);
  const statTypeById = buildStatTypeMap(json);

  for (const proj of json.data) {
    const attr = proj.attributes;

    const rawStat = resolvePrizePicksStatTypeRaw(attr, proj, statTypeById);
    const stat = rawStat ? mapPrizePicksStatType(rawStat) : null;
    if (!stat) continue;

    const line = parseFloat(attr.line_score);
    if (!Number.isFinite(line)) continue;

    // League: default to "NBA", but use the league relationship when present
    let league = "NBA";
    const leagueRel = proj.relationships.league?.data;
    if (leagueRel && leagueMap.has(leagueRel.id)) {
      league = leagueMap.get(leagueRel.id)!; // e.g. "NBA", "NFL"
    }

    let player = "Unknown Player";
    let team: string | null = null;
    let opponent: string | null = null;

    const playerRel = proj.relationships.new_player?.data;
    if (playerRel && playerMap.has(playerRel.id)) {
      const p = playerMap.get(playerRel.id)!;
      player = p.name || player;
      team = p.team;
      opponent = p.opponent;
    }

    let gameId: string | null = null;
    let startTime: string | null = null;
    const gameRel = proj.relationships.game?.data;
    if (gameRel && gameMap.has(gameRel.id)) {
      gameId = gameRel.id;
    }

    if (attr.start_time) {
      startTime = attr.start_time;
    }

    // Use real odds_type field, fall back to oddstype if present
    const oddsTypeRaw = (
      attr.odds_type ?? attr.oddstype ?? ""
    ).toString().toLowerCase();
    const isGoblin = oddsTypeRaw === "goblin";
    const isDemon = oddsTypeRaw === "demon";

    const hasExplicitPromoFlag =
      attr.is_promo === true ||
      attr.ispromo === true ||
      !!attr.promotion_id ||
      (typeof attr.promotion_type === "string" &&
        attr.promotion_type.trim().length > 0);

    const isPromo = hasExplicitPromoFlag || isGoblin || isDemon;

    const pick: RawPick = {
      sport: mapLeagueToSport(league),
      site: "prizepicks",
      league,
      player,
      team,
      opponent,
      stat,
      line,
      projectionId: proj.id,
      gameId,
      startTime,
      isDemon,
      isGoblin,
      isPromo,
      isNonStandardOdds: false,
    };

    picks.push(pick);
  }

  return picks;
}

function loadFromDiskFallback(): RawPick[] {
  const filePath = path.join(process.cwd(), "pp_projections_sample.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw) as PrizePicksProjectionsResponse;
    const picks = mapJsonToRawPicks(json);
    console.log(
      `fetchPrizePicksRawProps: loaded ${picks.length} RawPick rows from pp_projections_sample.json fallback`
    );
    return picks;
  } catch (err) {
    console.error(
      "fetchPrizePicksRawProps: failed to load pp_projections_sample.json fallback",
      err
    );
    return [];
  }
}

async function fetchLeagueProjections(
  leagueId: number
): Promise<PrizePicksProjectionsResponse | null> {
  const url = `${PRIZEPICKS_PROJECTIONS_BASE_URL}?league_id=${leagueId}&${PRIZEPICKS_COMMON_QUERY}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        origin: "https://app.prizepicks.com",
        referer: "https://app.prizepicks.com/",
        "sec-ch-ua":
          '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
        "x-device-id": "fdd10fa5-892f-4c4d-b140-d5e8cead14ba",
        "x-device-info":
          "anonymousId=,name=,os=windows,osVersion=Windows NT 10.0; Win64; x64,platform=web,appVersion=,gameMode=prizepools,stateCode=KY,fbp=fb.1.1768940483859.648114649408665373",
      },
    });

    if (!res.ok) {
      console.error(
        `fetchLeagueProjections: HTTP ${res.status} from PrizePicks for league_id=${leagueId}`
      );
      return null;
    }

    const json = (await res.json()) as PrizePicksProjectionsResponse;
    return json;
  } catch (err) {
    console.error(
      `fetchLeagueProjections: error fetching PrizePicks for league_id=${leagueId}`,
      err
    );
    return null;
  }
}

export async function fetchPrizePicksRawProps(sports: Sport[] = ['NBA']): Promise<RawPick[]> {
  // Convert sports to league keys
  const sportToLeagueMap: Record<Sport, string> = {
    'NBA': 'NBA',
    'NFL': 'NFL', 
    'NHL': 'NHL',
    'MLB': 'MLB',
    'NCAAB': 'NCAAB', // PrizePicks may not support this
    'NCAAF': 'NCAAF', // PrizePicks may not support this
  };
  
  const allowedLeagues = new Set(sports.map(sport => sportToLeagueMap[sport]).filter(Boolean));
  console.log(`fetchPrizePicksRawProps: allowed leagues = [${[...allowedLeagues].join(', ')}]`);

  // Build fetch promises only for allowed leagues
  const ALL_LEAGUES: { key: string; id: number }[] = [
    { key: "NBA", id: PP_LEAGUE_IDS.NBA },
    { key: "NFL", id: PP_LEAGUE_IDS.NFL },
    { key: "NHL", id: PP_LEAGUE_IDS.NHL },
    { key: "MLB", id: PP_LEAGUE_IDS.MLB },
  ];

  const leaguesToFetch = ALL_LEAGUES.filter((l) => allowedLeagues.has(l.key));
  const results = await Promise.all(
    leaguesToFetch.map((l) => fetchLeagueProjections(l.id).then((json) => ({ key: l.key, json })))
  );

  const anySuccess = results.some((r) => r.json !== null);
  if (!anySuccess) {
    console.error(
      "fetchPrizePicksRawProps: no data for any allowed league; using fallback if available"
    );
    return loadFromDiskFallback();
  }

  const picksByLeague: Record<string, RawPick[]> = {};
  for (const { key, json } of results) {
    picksByLeague[key] = json ? mapJsonToRawPicks(json) : [];
  }

  const summary = Object.entries(picksByLeague)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(", ");
  console.log(`fetchPrizePicksRawProps: ${summary}`);

  const picks = Object.values(picksByLeague).flat();

  // Validation: Check that requested sports are present in fetched data
  const fetchedSports = [...new Set(picks.map(p => p.league))];
  const missingSports = sports.filter(sport => !fetchedSports.includes(sport));
  
  if (missingSports.length > 0 && picks.length > 0) {
    console.warn(`⚠️  Requested sport(s) ${missingSports.join(',')} not found in PrizePicks data. Available: ${fetchedSports.join(',')}`);
  }
  
  if (missingSports.length === sports.length && sports.length > 0) {
    console.error(`❌ None of the requested sports found. Requested: ${sports.join(',')}. Available: ${fetchedSports.join(',') || 'none'}`);
    // Return empty array instead of fallback to avoid silent NBA fallback
    return [];
  }

  try {
    const samplePayload = results.find((r) => r.json !== null)?.json;
    if (samplePayload) {
      fs.writeFileSync(
        "pp_projections_sample.json",
        JSON.stringify(samplePayload, null, 2),
        "utf8"
      );
      console.log(
        "fetchPrizePicksRawProps: wrote pp_projections_sample.json to project root"
      );
    }
  } catch (err) {
    console.error(
      "fetchPrizePicksRawProps: failed to write sample JSON",
      err
    );
  }

  console.log(
    `fetchPrizePicksRawProps: built ${picks.length} RawPick rows from live PrizePicks (${[...allowedLeagues].join('+')})`
  );
  return picks;
}
