// src/fetch_underdog_props.ts
//
// Fetches NBA player props from the Underdog Fantasy v6 API.
// The v6 response is a flat/relational shape with separate arrays:
//   appearances, games, over_under_lines, players, solo_games
// We join them in-memory to produce RawPick objects.

import fetch from "node-fetch";
import { RawPick, StatCategory, Sport } from "./types";
import { getAllowedUDLeagues } from "./config/leagues";

// ---- API Configuration ----

const UD_API_URL =
  "https://api.underdogfantasy.com/beta/v6/over_under_lines";

const UD_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://app.underdogfantasy.com/",
  "Accept": "application/json",
  "Origin": "https://app.underdogfantasy.com",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

// ---- v6 API Interfaces ----

interface UdV6Response {
  appearances: UdAppearance[];
  games: UdGame[];
  over_under_lines: UdOverUnderLine[];
  players: UdPlayer[];
  solo_games?: unknown[];
}

interface UdAppearance {
  id: string;
  player_id: string;
  match_id: number;
  match_type: string;
  team_id: string;
}

interface UdGame {
  id: number;
  abbreviated_title: string;      // e.g. "DET @ CHA"
  away_team_id: string;
  home_team_id: string;
  scheduled_at: string;           // ISO datetime
  sport_id: string;               // "NBA", "NFL", etc.
  short_title: string;            // "Pistons @ Hornets"
  status: string;
}

interface UdOverUnderLine {
  id: string;
  stat_value: string;             // e.g. "19.5" (string, needs parseFloat)
  status: string;
  over_under: {
    id: string;
    appearance_stat: {
      appearance_id: string;
      stat: string;               // e.g. "points", "rebounds", "assists"
      display_stat: string;
    };
    category: string;             // "player_prop"
    title: string;                // e.g. "LaMelo Ball Points O/U"
  };
  options?: UdOption[];
}

interface UdOption {
  choice: string;                 // "higher" | "lower"
  american_price: string;         // e.g. "-112"
  status: string;
}

interface UdPlayer {
  id: string;
  first_name: string;
  last_name: string;
  sport_id: string;               // "NBA"
  team_id: string;
}

// ---- Stat mapping (multi-sport) ----

function mapStatType(statType: string, sportId: string): StatCategory | null {
  const key = statType.toLowerCase();
  const sport = sportId.toUpperCase();

  // --- NBA stats ---
  if (sport === "NBA") {
    if (key === "points" || key === "pts") return "points";
    if (key === "rebounds" || key === "rebs") return "rebounds";
    if (key === "assists" || key === "asts") return "assists";
    if (key === "points_rebounds_assists" || key === "pra") return "pra";
    if (key === "points_rebounds" || key === "pr") return "points_rebounds";
    if (key === "points_assists" || key === "pa") return "points_assists";
    if (key === "rebounds_assists" || key === "ra") return "rebounds_assists";
    if (key === "three_pointers_made" || key === "three_pointers" || key === "threes") return "threes";
    if (key === "blocks") return "blocks";
    if (key === "steals") return "steals";
    if (key === "blocks_steals" || key === "stocks") return "stocks";
    if (key === "turnovers") return "turnovers";
    if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";
    return "points"; // fallback for NBA
  }

  // --- NFL stats ---
  if (sport === "NFL") {
    if (key === "passing_yards" || key === "pass_yards") return "pass_yards";
    if (key === "passing_attempts" || key === "pass_attempts") return "pass_attempts";
    if (key === "passing_completions" || key === "completions") return "pass_completions";
    if (key === "passing_touchdowns" || key === "pass_tds") return "pass_tds";
    if (key === "interceptions") return "interceptions";
    if (key === "rushing_yards" || key === "rush_yards") return "rush_yards";
    if (key === "rushing_attempts" || key === "rush_attempts") return "rush_attempts";
    if (key === "rushing_receiving_yards" || key === "rush_rec_yards") return "rush_rec_yards";
    if (key === "receiving_yards" || key === "rec_yards") return "rec_yards";
    if (key === "receptions") return "receptions";
    if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";
    return null;
  }

  // --- NHL stats ---
  if (sport === "NHL") {
    if (key === "goals") return "goals";
    if (key === "assists") return "assists";
    if (key === "points") return "points";
    if (key === "shots_on_goal" || key === "shots") return "shots_on_goal";
    if (key === "saves") return "saves";
    if (key === "goals_against") return "goals_against";
    if (key === "blocked_shots" || key === "blocks") return "blocks";
    if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";
    return null;
  }

  // --- MLB stats ---
  if (sport === "MLB") {
    if (key === "hits") return "points"; // mapped to points as generic
    if (key === "strikeouts" || key === "pitcher_strikeouts") return "blocks"; // mapped generically
    if (key === "total_bases") return "rebounds"; // mapped generically
    if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";
    return null;
  }

  return null; // unknown sport
}

// ---- Team abbreviation helpers ----

/** Parse "DET @ CHA" → { away: "DET", home: "CHA" } */
function parseAbbreviatedTitle(title: string): { away: string; home: string } | null {
  const parts = title.split(" @ ");
  if (parts.length !== 2) return null;
  return { away: parts[0].trim(), home: parts[1].trim() };
}

// ---- Main fetch function ----

export async function fetchUnderdogRawProps(sports: Sport[]): Promise<RawPick[]> {
  console.log(`[UD] Fetching from: ${UD_API_URL}`);

  // Compute effective sports as intersection of requested sports and allowed leagues
  const allowedLeagues = getAllowedUDLeagues(); // e.g. ["NBA","NFL","NHL","MLB"]
  const requested = new Set<Sport>(sports);

  const effectiveSports = [...allowedLeagues].filter((lg) =>
    requested.has(lg as Sport)
  ) as Sport[];

  if (effectiveSports.length === 0) {
    console.log(`[UD] No effective sports after filtering requested [${sports.join(',')}] against allowed [${[...allowedLeagues].join(',')}]`);
    return [];
  }

  console.log(`[UD] Effective sports: [${effectiveSports.join(',')}] (requested: [${sports.join(',')}], allowed: [${[...allowedLeagues].join(',')}]`);

  const res = await fetch(UD_API_URL, {
    method: "GET",
    headers: UD_HEADERS,
  });

  if (!res.ok) {
    let errorDetails = "";
    try {
      const text = await res.text();
      errorDetails = text.slice(0, 500);
      console.error(`[UD] API error ${res.status} ${res.statusText}: ${errorDetails}`);
    } catch {
      console.error(`[UD] API error ${res.status} ${res.statusText}: Unable to read response body`);
    }
    throw new Error(`Underdog API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as UdV6Response;

  console.log(
    `[UD] v6 response: ${data.over_under_lines?.length ?? 0} lines, ` +
    `${data.players?.length ?? 0} players, ` +
    `${data.appearances?.length ?? 0} appearances, ` +
    `${data.games?.length ?? 0} games`
  );

  // ---- Build lookup maps ----

  const playerById = new Map<string, UdPlayer>();
  for (const p of data.players || []) {
    playerById.set(p.id, p);
  }

  const appearanceById = new Map<string, UdAppearance>();
  for (const a of data.appearances || []) {
    appearanceById.set(a.id, a);
  }

  const gameById = new Map<number, UdGame>();
  for (const g of data.games || []) {
    gameById.set(g.id, g);
  }

  // Build team_id → abbreviation map from games
  const teamAbbr = new Map<string, string>();
  for (const g of data.games || []) {
    const parsed = parseAbbreviatedTitle(g.abbreviated_title);
    if (!parsed) continue;
    if (g.home_team_id) teamAbbr.set(g.home_team_id, parsed.home);
    if (g.away_team_id) teamAbbr.set(g.away_team_id, parsed.away);
  }

  // ---- Filter lines by effective sports and build RawPick objects ----

  // Pre-filter: set of allowed player IDs for fast lookup
  const allowedPlayerIds = new Set<string>();
  for (const p of data.players || []) {
    if (effectiveSports.includes(p.sport_id.toUpperCase() as Sport)) allowedPlayerIds.add(p.id);
  }

  const picks: RawPick[] = [];
  let skippedNonAllowed = 0;
  let skippedInactive = 0;
  let skippedMissingData = 0;

  for (const line of data.over_under_lines || []) {
    // Skip inactive/suspended lines
    if (line.status !== "active") {
      skippedInactive++;
      continue;
    }

    const ou = line.over_under;
    if (!ou?.appearance_stat?.appearance_id) {
      skippedMissingData++;
      continue;
    }

    // Resolve appearance → player → check effective sports
    const appearance = appearanceById.get(ou.appearance_stat.appearance_id);
    if (!appearance) {
      skippedMissingData++;
      continue;
    }

    const player = playerById.get(appearance.player_id);
    if (!player) {
      skippedMissingData++;
      continue;
    }

    if (!allowedPlayerIds.has(player.id)) {
      skippedNonAllowed++;
      continue;
    }

    // Resolve game
    const game = gameById.get(appearance.match_id);

    // Build player name
    const playerName = `${player.first_name} ${player.last_name}`.trim();
    if (!playerName) continue;

    // Resolve sport from player record
    const sportId = player.sport_id.toUpperCase();

    // Stat + line
    const stat = mapStatType(ou.appearance_stat.stat, sportId);
    if (!stat) continue; // skip unmapped stats
    const lineValue = parseFloat(line.stat_value);
    if (!Number.isFinite(lineValue)) continue;

    // Team / opponent from team_id mappings
    const playerTeamAbbr = teamAbbr.get(player.team_id) || "";
    let opponentAbbr = "";
    if (game) {
      const isHome = player.team_id === game.home_team_id;
      const oppTeamId = isHome ? game.away_team_id : game.home_team_id;
      opponentAbbr = teamAbbr.get(oppTeamId) || "";
    }

    // Detect non-standard (varied-multiplier) legs and compute the per-pick
    // payout factor for the "higher" (over) direction.
    //
    // UD's factor formula (derived from their american_price):
    //   american < 0: factor = (1 + 100/|american|) / 2
    //   american > 0: factor = (1 + american/100)  / 2
    //   american = 0: factor = 1.0 (even money, no discount/boost)
    //
    // Examples:
    //   -184 → factor 0.77  (easy pick, UD discounts payout)
    //   -100 → factor 1.00  (even money, no adjustment)
    //   +130 → factor 1.15  (underdog pick, UD boosts payout)
    let isNonStandardOdds = false;
    let udPickFactor: number | null = null;

    if (line.options && line.options.length >= 2) {
      const prices = line.options
        .map(o => parseInt(o.american_price, 10))
        .filter(p => Number.isFinite(p));
      if (prices.length >= 2) {
        const allSame = prices.every(p => p === prices[0]);
        if (!allSame) {
          isNonStandardOdds = true;
        }
      }
      // Extract the "higher" option's american_price to compute udPickFactor.
      // Case-insensitive match handles UD API variations ("higher", "Higher", "HIGHER").
      const higherOption = line.options.find(o => o.choice.toLowerCase() === "higher")
        // Fallback: when allSame=false and higher not found by name, take the
        // option with the lowest (most negative) price — that is always the
        // favoured/discounted side on Underdog.
        ?? (prices.length >= 2 && !prices.every(p => p === prices[0])
          ? line.options.reduce((a, b) => {
              const pa = parseInt(a.american_price, 10);
              const pb = parseInt(b.american_price, 10);
              return (Number.isFinite(pa) && Number.isFinite(pb) && pa < pb) ? a : b;
            })
          : undefined);
      if (higherOption) {
        const american = parseInt(higherOption.american_price, 10);
        if (Number.isFinite(american) && american !== 0) {
          const decimal = american < 0
            ? 1 + 100 / Math.abs(american)
            : 1 + american / 100;
          udPickFactor = decimal / 2;
        } else if (american === 0) {
          udPickFactor = 1.0;
        }
      }
    }

    const rawPick: RawPick = {
      sport: sportId as Sport,
      site: "underdog",
      league: sportId,
      player: playerName,
      team: playerTeamAbbr,
      opponent: opponentAbbr,
      stat,
      line: lineValue,
      projectionId: String(ou.id),
      gameId: game ? String(game.id) : null,
      startTime: game?.scheduled_at ?? null,
      isDemon: false,
      isGoblin: false,
      isPromo: false,
      isNonStandardOdds,
      udPickFactor,
    };

    picks.push(rawPick);
  }

  console.log(
    `[UD] Parsed ${picks.length} props for [${effectiveSports.join(',')}] ` +
    `(skipped: ${skippedNonAllowed} other sports, ${skippedInactive} inactive, ${skippedMissingData} missing data)`
  );

  return picks;
}
