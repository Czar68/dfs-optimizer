// src/fetch_odds_api.ts
// Scaffold for The Odds API (the-odds-api.com) — NBA player props.
//
// ENV: ODDS_API_KEY        – API key from the-odds-api.com
//      USE_ODDS_API=false  – feature toggle (default off)
//
// When enabled, fetches NBA player-prop odds and normalizes them into
// SgoPlayerPropOdds[] for the merge pipeline (OddsAPI only).

import "dotenv/config";
import fs from "fs";
import path from "path";
import { SgoPlayerPropOdds, StatCategory, Sport } from "./types";

const API_KEY = process.env.ODDS_API_KEY ?? "";
const ENABLED = (process.env.USE_ODDS_API ?? "false").toLowerCase() === "true";
const BASE_URL = "https://api.the-odds-api.com/v4";
const CACHE_DIR = path.join(process.cwd(), "cache");
const CACHE_FILE = path.join(CACHE_DIR, "odds_api_props_cache.json");
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 min

const SPORT_KEY = "basketball_nba";
const REGIONS = "us";
const MARKETS = [
  "player_points", "player_rebounds", "player_assists",
  "player_threes", "player_blocks", "player_steals",
  "player_points_rebounds_assists",
];

const MARKET_TO_STAT: Record<string, StatCategory> = {
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "threes",
  player_blocks: "blocks",
  player_steals: "steals",
  player_points_rebounds_assists: "pra",
};

// ── Public API ──────────────────────────────────────────────────────────────

export function isOddsApiEnabled(): boolean {
  return ENABLED && !!API_KEY;
}

/**
 * Fetch NBA player-prop odds from The Odds API.
 * Returns normalized SgoPlayerPropOdds[] or empty array if disabled / error.
 */
export async function fetchOddsApiPlayerProps(): Promise<SgoPlayerPropOdds[]> {
  if (!isOddsApiEnabled()) {
    console.log("[OddsAPI] Disabled (USE_ODDS_API=false or no ODDS_API_KEY)");
    return [];
  }

  // Try cache first
  const cached = loadCache();
  if (cached) {
    console.log(`[OddsAPI] Using cache (${cached.length} props, <30 min old)`);
    return cached;
  }

  console.log("[OddsAPI] Fetching NBA player props from the-odds-api.com ...");
  const allProps: SgoPlayerPropOdds[] = [];

  for (const market of MARKETS) {
    try {
      const url = `${BASE_URL}/sports/${SPORT_KEY}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${market}&oddsFormat=american`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`[OddsAPI] ${market}: HTTP ${resp.status}`);
        continue;
      }
      const json = (await resp.json()) as any[];
      const normalized = normalizeResponse(json, market);
      allProps.push(...normalized);
      console.log(`[OddsAPI] ${market}: ${normalized.length} props`);
    } catch (err) {
      console.warn(`[OddsAPI] ${market}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Save raw to artifacts
  saveArtifact(allProps);
  saveCache(allProps);

  console.log(`[OddsAPI] Total: ${allProps.length} props`);
  return allProps;
}

// ── Normalize response → SgoPlayerPropOdds[] ────────────────────────────────

function normalizeResponse(games: any[], market: string): SgoPlayerPropOdds[] {
  const stat = MARKET_TO_STAT[market];
  if (!stat) return [];

  const out: SgoPlayerPropOdds[] = [];
  for (const game of games) {
    const sport: Sport = "NBA";
    const league = "NBA";

    for (const bookmaker of game.bookmakers ?? []) {
      const book = bookmaker.key ?? bookmaker.title ?? "unknown";
      for (const mkt of bookmaker.markets ?? []) {
        if (mkt.key !== market) continue;
        for (const outcome of mkt.outcomes ?? []) {
          const player = outcome.description ?? outcome.name ?? "";
          const line = Number(outcome.point);
          const odds = Number(outcome.price);
          if (!player || !Number.isFinite(line) || !Number.isFinite(odds)) continue;

          const isOver = (outcome.name ?? "").toLowerCase() === "over";
          out.push({
            player,
            stat,
            line,
            overOdds: isOver ? odds : 0,
            underOdds: isOver ? 0 : odds,
            book,
            sport,
            league,
            team: null,
            opponent: null,
            eventId: game.id ?? null,
            marketId: null,
            selectionIdOver: null,
            selectionIdUnder: null,
          });
        }
      }
    }
  }
  return out;
}

// ── Cache ────────────────────────────────────────────────────────────────────

function loadCache(): SgoPlayerPropOdds[] | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (Date.now() - (raw.timestamp ?? 0) > CACHE_MAX_AGE_MS) return null;
    return raw.data ?? null;
  } catch { return null; }
}

function saveCache(data: SgoPlayerPropOdds[]): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ timestamp: Date.now(), data }), "utf8");
  } catch (err) {
    console.warn("[OddsAPI] Cache write failed:", err);
  }
}

function saveArtifact(data: SgoPlayerPropOdds[]): void {
  try {
    const dir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(dir, `odds_api_raw_${ts}.json`), JSON.stringify(data, null, 2), "utf8");
  } catch { /* non-critical */ }
}
