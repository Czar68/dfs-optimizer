// src/fetch_oddsapi_props.ts — The Odds API player props (no SGO).
// Full pipeline odds: ODDSAPI_KEY, basketball_nba, player_* markets → SgoPlayerPropOdds[].

import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";
import { SgoPlayerPropOdds, StatCategory, Sport } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";
const REGIONS = "us";
const CACHE_DIR = path.join(process.cwd(), "cache");
const CACHE_FILE = path.join(CACHE_DIR, "oddsapi_props_cache.json");
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export const DEFAULT_MARKETS: { key: string; stat: StatCategory }[] = [
  { key: "player_points", stat: "points" },
  { key: "player_rebounds", stat: "rebounds" },
  { key: "player_assists", stat: "assists" },
  { key: "player_threes", stat: "threes" },
  { key: "player_blocks", stat: "blocks" },
  { key: "player_steals", stat: "steals" },
  { key: "player_points_rebounds_assists", stat: "pra" },
];

export interface FetchOddsAPIPropsOptions {
  apiKey?: string;
  sport?: string;
  markets?: { key: string; stat: StatCategory }[];
  forceRefresh?: boolean;
}

interface OddsApiEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: {
    key?: string;
    title?: string;
    markets?: {
      key?: string;
      outcomes?: Array<{
        name?: string;
        description?: string;
        point?: number;
        price?: number;
      }>;
    }[];
  }[];
}

function loadCache(forceRefresh: boolean): SgoPlayerPropOdds[] | null {
  if (forceRefresh) return null;
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (Date.now() - (raw.fetchedAt ?? 0) > CACHE_MAX_AGE_MS) return null;
    return raw.data ?? null;
  } catch {
    return null;
  }
}

function saveCache(data: SgoPlayerPropOdds[]): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), data }, null, 2),
      "utf8"
    );
    console.log(`[OddsAPI] Cached ${data.length} props -> ${CACHE_FILE}`);
  } catch (err) {
    console.warn("[OddsAPI] Cache write failed:", err);
  }
}

function normalizeMarket(events: OddsApiEvent[], stat: StatCategory): SgoPlayerPropOdds[] {
  const out: SgoPlayerPropOdds[] = [];
  const sport: Sport = "NBA";
  const league = "NBA";

  for (const game of events) {
    for (const bookmaker of game.bookmakers ?? []) {
      const book = bookmaker.key ?? bookmaker.title ?? "unknown";
      for (const mkt of bookmaker.markets ?? []) {
        const outcomes = mkt.outcomes ?? [];
        const byKey = new Map<string, { player: string; line: number; over: number; under: number }>();
        for (const outcome of outcomes) {
          const player = (outcome.description ?? outcome.name ?? "").trim();
          const line = Number(outcome.point);
          const price = Number(outcome.price);
          if (!player || !Number.isFinite(line) || !Number.isFinite(price)) continue;
          const key = `${player}\n${line}`;
          const slot = byKey.get(key) ?? { player, line, over: 0, under: 0 };
          const isOver = (outcome.name ?? "").toLowerCase() === "over";
          if (isOver) slot.over = price;
          else slot.under = price;
          byKey.set(key, slot);
        }
        for (const slot of byKey.values()) {
          if (!slot.over || !slot.under) continue;
          out.push({
            sport,
            league,
            player: slot.player,
            team: null,
            opponent: null,
            stat,
            line: slot.line,
            overOdds: slot.over,
            underOdds: slot.under,
            book,
            eventId: game.id ?? null,
            marketId: mkt.key ?? null,
            selectionIdOver: null,
            selectionIdUnder: null,
            isMainLine: true,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Fetch NBA player props from The Odds API. No SGO.
 * Used by run_optimizer / fresh_data_run pipeline.
 */
export async function fetchOddsAPIProps(
  options: FetchOddsAPIPropsOptions = {}
): Promise<SgoPlayerPropOdds[]> {
  const apiKey =
    options.apiKey ??
    process.env.ODDSAPI_KEY ??
    process.env.ODDS_API_KEY ??
    "";
  if (!apiKey) {
    console.warn("[OddsAPI] Missing ODDSAPI_KEY; returning []");
    return [];
  }

  const sport = options.sport ?? "basketball_nba";
  const markets = options.markets ?? DEFAULT_MARKETS;
  const forceRefresh = options.forceRefresh ?? false;

  const cached = loadCache(forceRefresh);
  if (cached) {
    console.log(`[OddsAPI] Using cache (${cached.length} props)`);
    return cached;
  }

  console.log("[OddsAPI] Fetching player props from api.the-odds-api.com ...");
  const allProps: SgoPlayerPropOdds[] = [];

  for (const { key: market, stat } of markets) {
    try {
      const url = `${BASE_URL}/sports/${sport}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=${market}&oddsFormat=american`;
      const resp = await axios.get<OddsApiEvent[]>(url, {
        timeout: 20000,
        headers: { Accept: "application/json" },
      });
      const events = Array.isArray(resp.data) ? resp.data : [];
      const normalized = normalizeMarket(events, stat);
      allProps.push(...normalized);
      console.log(`[OddsAPI] ${market}: ${normalized.length} props`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number } }).response?.status ?? String(err)
          : err instanceof Error
            ? err.message
            : String(err);
      console.warn(`[OddsAPI] ${market}: ${msg}`);
    }
  }

  saveCache(allProps);
  console.log(`[OddsAPI] Total: ${allProps.length} props`);
  return allProps;
}
