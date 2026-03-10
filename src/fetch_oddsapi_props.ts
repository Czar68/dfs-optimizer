// src/fetch_oddsapi_props.ts — The Odds API player props (no SGO).
// EVENT-LEVEL ONLY: h2h → event IDs → /events/{id}/odds?markets=player_* (no bulk /odds?markets=player_*).

import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";
import { SgoPlayerPropOdds, StatCategory, Sport } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";
const REGIONS = "us,us2,eu"; // Pinnacle (eu) + ESPN Bet/theScore (us2)
const ODDS_FORMAT = "american";
const CACHE_DIR = path.join(process.cwd(), "cache");
const CACHE_FILE = path.join(CACHE_DIR, "oddsapi_props_cache.json");
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h
const EVENT_DELAY_MS = 250;
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export const DEFAULT_MARKETS: { key: string; stat: StatCategory }[] = [
  { key: "player_points", stat: "points" },
  { key: "player_rebounds", stat: "rebounds" },
  { key: "player_assists", stat: "assists" },
  { key: "player_threes", stat: "threes" },
  { key: "player_blocks", stat: "blocks" },
  { key: "player_steals", stat: "steals" },
  { key: "player_points_rebounds_assists", stat: "pra" },
];

const MARKET_KEYS = DEFAULT_MARKETS.map((m) => m.key);
const MARKET_KEY_TO_STAT: Record<string, StatCategory> = Object.fromEntries(
  DEFAULT_MARKETS.map((m) => [m.key, m.stat])
);

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

/** Flatten one event's bookmakers/markets into SgoPlayerPropOdds[] (all player_* markets). */
function normalizeEvent(event: OddsApiEvent): SgoPlayerPropOdds[] {
  const out: SgoPlayerPropOdds[] = [];
  const sport: Sport = "NBA";
  const league = "NBA";
  const eventId = event.id ?? null;

  for (const bookmaker of event.bookmakers ?? []) {
    const book = bookmaker.key ?? bookmaker.title ?? "unknown";
    for (const mkt of bookmaker.markets ?? []) {
      const stat = mkt.key ? MARKET_KEY_TO_STAT[mkt.key] : undefined;
      if (!stat) continue;
      const outcomes = mkt.outcomes ?? [];
      const byKey = new Map<string, { player: string; line: number; over: number; under: number }>();
      for (const outcome of outcomes) {
        const player = (outcome.description ?? outcome.name ?? "").trim();
        const line = Number(outcome.point);
        const price = Number(outcome.price);
        if (!player || !Number.isFinite(line) || !Number.isFinite(price)) continue;
        if (ODDS_FORMAT === "american" && (price === 0 || Math.abs(price) < 100)) continue;
        const key = `${player}\n${line}`;
        const slot = byKey.get(key) ?? { player, line, over: 0, under: 0 };
        const isOver = (outcome.name ?? "").toLowerCase() === "over";
        if (isOver) slot.over = price;
        else slot.under = price;
        byKey.set(key, slot);
      }
      for (const slot of byKey.values()) {
        if (!slot.over || !slot.under) continue;
        if (ODDS_FORMAT === "american" && (Math.abs(slot.over) < 100 || Math.abs(slot.under) < 100)) continue;
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
          eventId,
          marketId: mkt.key ?? null,
          selectionIdOver: null,
          selectionIdUnder: null,
          isMainLine: true,
        });
      }
    }
  }
  return out;
}

/**
 * Fetch NBA player props from The Odds API. EVENT-LEVEL ONLY (no bulk player_*).
 * Flow: GET .../odds?markets=h2h → event IDs → for each GET .../events/{id}/odds?markets=player_*.
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

  const sport = options.sport ?? SPORT;
  const forceRefresh = options.forceRefresh ?? false;

  const cached = loadCache(forceRefresh);
  if (cached) {
    console.log(`[OddsAPI] Using cache (${cached.length} props)`);
    return cached;
  }

  console.log("[OddsAPI] Fetching player props (event-level, no bulk) ...");
  const allProps: SgoPlayerPropOdds[] = [];
  const now = Date.now();

  // 1) Get event IDs (featured endpoint only — no player_* on bulk)
  const eventsUrl = `${BASE_URL}/sports/${sport}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=h2h&oddsFormat=${ODDS_FORMAT}`;
  let eventList: { id: string; commence_time?: string }[] = [];
  try {
    const { data } = await axios.get<OddsApiEvent[]>(eventsUrl, { timeout: 15000 });
    const events = Array.isArray(data) ? data : [];
    const cutoff = now + TODAY_WINDOW_MS;
    eventList = events
      .filter((e) => e.id && e.commence_time && new Date(e.commence_time).getTime() <= cutoff)
      .map((e) => ({ id: e.id!, commence_time: e.commence_time }));
    if (events.length > eventList.length) {
      console.log(`[OddsAPI] ${events.length} games, ${eventList.length} within 24h`);
    } else {
      console.log(`[OddsAPI] ${eventList.length} games today`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[OddsAPI] Events fetch failed:", msg);
    saveCache(allProps);
    return allProps;
  }

  if (eventList.length === 0) {
    console.warn("[OddsAPI] No events; check sport and date.");
    saveCache(allProps);
    return allProps;
  }

  const marketsParam = MARKET_KEYS.join(",");
  for (const ev of eventList) {
    try {
      const url = `${BASE_URL}/sports/${sport}/events/${ev.id}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=${marketsParam}&oddsFormat=${ODDS_FORMAT}`;
      const { data } = await axios.get<OddsApiEvent>(url, { timeout: 20000 });
      const normalized = normalizeEvent(data as OddsApiEvent);
      allProps.push(...normalized);
      await new Promise((r) => setTimeout(r, EVENT_DELAY_MS));
    } catch (err: unknown) {
      const status =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number } }).response?.status
          : null;
      console.warn(`[OddsAPI] Event ${ev.id}: ${status ?? (err instanceof Error ? err.message : String(err))}`);
    }
  }

  const uniquePlayers = new Set(allProps.map((p) => p.player)).size;
  const byBook = allProps.reduce((acc, p) => {
    acc[p.book] = (acc[p.book] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const booksLine = Object.entries(byBook)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");
  console.log(`[OddsAPI] Books: ${booksLine}`);
  const top = allProps[0];
  const topStr = top
    ? `${top.player} ${top.stat} O${top.line} @${top.overOdds} ${top.book}`
    : "n/a";
  console.log(`[OddsAPI] #legs=${allProps.length}, #players=${uniquePlayers}, top: ${topStr}`);
  saveCache(allProps);
  return allProps;
}
