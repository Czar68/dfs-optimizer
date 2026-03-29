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
  american_price: string;         // e.g. "-112" — USE THIS ONLY for betting odds
  status: string;
  /** API may return; NEVER use for odds (boost multiplier, not betting price) */
  payout_multiplier?: string;
  decimal_price?: string;
}

interface UdPlayer {
  id: string;
  first_name: string;
  last_name: string;
  sport_id: string;               // "NBA"
  team_id: string;
}

// ---- UD odds: american_price ONLY (never payout_multiplier) ----
/** Parse betting odds from UD. Use american_price ONLY. Returns null if invalid. */
function parseAmericanPriceOnly(americanPrice: string): number | null {
  const bettingOdds = parseInt(americanPrice, 10);
  if (!Number.isNaN(bettingOdds)) return bettingOdds;
  return null;
}

let _warnedPayoutMultiplierBlocked = false;
/** Get betting odds from option. BLOCKS payout_multiplier (boost); uses american_price only. */
function getBettingOddsFromOption(opt: UdOption): number | null {
  if (opt.payout_multiplier != null && !_warnedPayoutMultiplierBlocked) {
    _warnedPayoutMultiplierBlocked = true;
    // stdout: policy notice only (american_price is authoritative). stderr here was mistaken for fatal by PowerShell $ErrorActionPreference Stop + 2>&1.
    console.log("[UD policy] BLOCKED boost: payout_multiplier not used for odds parsing (american_price only)");
  }
  return parseAmericanPriceOnly(opt.american_price);
}

/** Even-odds range: accept only |american| in [105, 150] for standard vig. */
const EVEN_ODDS_MIN = 105;
const EVEN_ODDS_MAX = 150;
function isInEvenOddsRange(american: number): boolean {
  const abs = Math.abs(american);
  return abs >= EVEN_ODDS_MIN && abs <= EVEN_ODDS_MAX;
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
    if (key === "points_rebounds_assists" || key === "pra" || key === "pts_rebs_asts") return "pra";
    if (key === "points_rebounds" || key === "pr") return "points_rebounds";
    if (key === "points_assists" || key === "pa") return "points_assists";
    if (key === "rebounds_assists" || key === "ra" || key === "rebs_asts") return "rebounds_assists";
    if (key === "three_pointers_made" || key === "three_pointers" || key === "threes" || key === "three_points_made") return "threes";
    if (key === "blocks") return "blocks";
    if (key === "steals") return "steals";
    if (key === "blocks_steals" || key === "stocks") return "stocks";
    if (key === "turnovers") return "turnovers";
    if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";
    // Skip period-specific and other unsupported stats
    if (key.startsWith("period_") || key === "double_doubles" || key === "field_goals_att") return null;
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

  // ---- STEP 1A: Raw UD market sample (debug) ----
  const firstLine = data.over_under_lines?.[0];
  if (firstLine) {
    console.log("=== RAW UD MARKET (first line) ===");
    console.log(JSON.stringify(firstLine, null, 2));
  }

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
    const rawStat = ou.appearance_stat.stat;
    const stat = mapStatType(rawStat, sportId);
    if (!stat) continue; // skip unmapped stats
    const lineValue = parseFloat(line.stat_value);
    if (!Number.isFinite(lineValue)) continue;

    // ---- PHASE 2: Westbrook — dump ALL price fields (american_price ONLY used for odds) ----
    const isWestbrookAssists = playerName.toLowerCase().includes("westbrook") && (stat === "assists" || ou.appearance_stat.stat?.toLowerCase().includes("assist"));
    if (isWestbrookAssists && line.options?.length) {
      const higherOpt = line.options.find(o => o.choice.toLowerCase() === "higher") ?? line.options[0];
      const raw = higherOpt as UdOption & { vig_free_price?: unknown };
      console.log("ALL PRICE FIELDS:", {
        american_price: higherOpt.american_price,
        payout_multiplier: raw.payout_multiplier,
        decimal_price: raw.decimal_price,
        vig_free_price: raw.vig_free_price,
      });
      const parsedAmerican = getBettingOddsFromOption(higherOpt);
      const impliedPct = parsedAmerican !== null
        ? (parsedAmerican < 0 ? Math.abs(parsedAmerican) / (Math.abs(parsedAmerican) + 100) : 100 / (parsedAmerican + 100)) * 100
        : NaN;
      console.log(`Westbrook AST: american_price="${higherOpt.american_price}" → PARSED: ${parsedAmerican ?? "null"} ${parsedAmerican !== null ? "✓" : ""}`);
      console.log("IMPLIED PROB:", Number.isFinite(impliedPct) ? `${impliedPct.toFixed(2)}%` : "N/A");
    }

    // Team / opponent from team_id mappings
    const playerTeamAbbr = teamAbbr.get(player.team_id) || "";
    let opponentAbbr = "";
    if (game) {
      const isHome = player.team_id === game.home_team_id;
      const oppTeamId = isHome ? game.away_team_id : game.home_team_id;
      opponentAbbr = teamAbbr.get(oppTeamId) || "";
    }

    // Per-pick payout factor: UD scales card payouts by this multiplier.
    //   < 1.0  → discounted (favored line, e.g. -184 → 0.77) — MUST DECLINE
    //   = 1.0  → standard (no adjustment)
    //   > 1.0  → boosted (underdog line, higher payout)
    //
    // Primary source: payout_multiplier from UD API (the actual factor UD applies).
    // Fallback: derived from american_price for ALL ranges (no isInEvenOddsRange gate).
    let isNonStandardOdds = false;
    let udPickFactor: number | null = null;

    if (line.options && line.options.length >= 2) {
      const prices = line.options
        .map(o => parseAmericanPriceOnly(o.american_price))
        .filter((p): p is number => p !== null);
      if (prices.length >= 2) {
        const allSame = prices.every(p => p === prices[0]);
        if (!allSame) {
          isNonStandardOdds = true;
        }
      }
      const higherOption = line.options.find(o => o.choice.toLowerCase() === "higher")
        ?? (prices.length >= 2 && !prices.every(p => p === prices[0])
          ? line.options.reduce((a, b) => {
              const pa = parseAmericanPriceOnly(a.american_price);
              const pb = parseAmericanPriceOnly(b.american_price);
              return (pa !== null && pb !== null && pa < pb) ? a : b;
            })
          : undefined);
      if (higherOption) {
        // Primary: use payout_multiplier directly (the actual UD card payout factor)
        const pmRaw = higherOption.payout_multiplier;
        const pmVal = pmRaw != null ? parseFloat(pmRaw) : NaN;
        if (Number.isFinite(pmVal) && pmVal > 0) {
          udPickFactor = pmVal;
          if (pmVal !== 1.0) isNonStandardOdds = true;
        } else {
          // Fallback: compute from american_price (ALL ranges, no gate)
          const american = getBettingOddsFromOption(higherOption);
          if (american !== null && american !== 0) {
            const decimal = american < 0
              ? 1 + 100 / Math.abs(american)
              : 1 + american / 100;
            udPickFactor = decimal / 2;
            if (!isInEvenOddsRange(american)) isNonStandardOdds = true;
          } else if (american === 0) {
            udPickFactor = 1.0;
          }
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
