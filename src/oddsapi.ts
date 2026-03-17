/**
 * Odds API V4 — Live NBA player props. No mocks.
 * Flattens events → bookmakers → player_* markets → OddsLeg[] (500+).
 * Cache: data/oddsapi_today.json, TTL 1hr.
 */

import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";
const REGIONS = "us,us2,eu"; // Pinnacle (eu) + ESPN Bet/theScore (us2)
const ODDS_FORMAT = "american";
const CACHE_PATH = path.join(process.cwd(), "data", "oddsapi_today.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1hr
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h — only games commencing within this window

/** Credit usage: 1 market 1 region = 1, 3 markets 1 region = 3, 1 market 3 regions = 3, 3 markets 3 regions = 9 */
function logCredits(label: string, headers: Record<string, unknown> | undefined): void {
  if (!headers) return;
  const get = (k: string) => headers[k] ?? headers[k.toLowerCase()];
  const used = get("x-requests-used");
  const remaining = get("x-requests-remaining");
  const last = get("x-requests-last");
  const parts: string[] = [`Fetching ${label}`];
  if (used != null) parts.push(`Used: ${used}`);
  if (remaining != null) parts.push(`Remaining: ${remaining}`);
  if (last != null) parts.push(`Cost of this call: ${last}`);
  if (parts.length > 1) console.log("[OddsAPI] " + parts.join(" | "));
}

/** Derive a short label from request URL for credit logging */
function creditLabel(url: string): string {
  if (url.includes("/events/") && url.includes("/odds")) return "NBA event odds";
  if (url.includes("/sports/") && url.includes("/odds")) return "NBA events list";
  return "Odds API";
}

const axiosInstance = axios.create({ timeout: 15000 });
axiosInstance.interceptors.response.use(
  (response) => {
    logCredits(creditLabel(response.config.url ?? ""), response.headers as Record<string, unknown>);
    return response;
  },
  (error) => {
    const headers = error.response?.headers as Record<string, unknown> | undefined;
    logCredits(creditLabel(error.config?.url ?? ""), headers);
    return Promise.reject(error);
  }
);

export interface OddsLeg {
  player: string;
  stat: string;
  line: number;
  overPrice: number;
  underPrice: number;
  bookmaker: string;
  eventId?: string;
  commenceTime?: string;
}

const PLAYER_MARKETS = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_steals",
  "player_blocks",
  "player_points_rebounds_assists",
];

interface ApiEvent {
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

const MARKET_TO_STAT: Record<string, string> = {
  player_points: "points",
  player_rebounds: "rebounds",
  player_assists: "assists",
  player_threes: "threes",
  player_steals: "steals",
  player_blocks: "blocks",
  player_points_rebounds_assists: "pra",
};

function loadCache(): OddsLeg[] | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    const age = Date.now() - (raw.fetchedAt ?? 0);
    if (age > CACHE_TTL_MS) return null;
    return raw.legs ?? null;
  } catch {
    return null;
  }
}

function saveCache(legs: OddsLeg[]): void {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      CACHE_PATH,
      JSON.stringify({ fetchedAt: Date.now(), legs }, null, 2),
      "utf8"
    );
  } catch (e) {
    console.warn("[OddsAPI] Cache write failed:", (e as Error).message);
  }
}

/**
 * Fetch live NBA player props from The Odds API. No mocks.
 * Player props require event-level endpoint (not main /odds). Flow: get events → per-event odds.
 * Returns 500+ legs (player, stat, line, over/under price, bookmaker).
 */
export async function fetchNbaProps(opts?: {
  apiKey?: string;
  forceRefresh?: boolean;
}): Promise<OddsLeg[]> {
  const apiKey =
    opts?.apiKey ?? process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("No live odds—check ODDSAPI_KEY in .env");
  }

  if (!opts?.forceRefresh) {
    const cached = loadCache();
    if (cached && cached.length > 0) {
      console.log(`[OddsAPI] Using cache: ${cached.length} legs (data/oddsapi_today.json)`);
      return cached;
    }
  }

  const allLegs: OddsLeg[] = [];
  const now = Date.now();

  // 1) Get event IDs (featured endpoint: h2h or events list)
  const eventsUrl = `${BASE}/sports/${SPORT}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=h2h&oddsFormat=${ODDS_FORMAT}`;
  let eventIds: { id: string; commence_time?: string }[] = [];
  try {
    const { data } = await axiosInstance.get<ApiEvent[]>(eventsUrl, { timeout: 15000 });
    const events = Array.isArray(data) ? data : [];
    const cutoff = now + TODAY_WINDOW_MS;
    eventIds = events
      .filter((e) => e.id && e.commence_time && new Date(e.commence_time).getTime() <= cutoff)
      .map((e) => ({ id: e.id!, commence_time: e.commence_time }));
    console.log(`[OddsAPI] ${eventIds.length} games (within 24h)`);
  } catch (e) {
    console.warn("[OddsAPI] Events fetch failed:", (e as Error).message);
  }

  if (eventIds.length === 0) {
    console.warn("[OddsAPI] No events; check sport key and date.");
    saveCache(allLegs);
    return allLegs;
  }

  const marketsParam = PLAYER_MARKETS.join(",");
  for (const ev of eventIds) {
    if (!ev.id) continue;
    try {
      const url = `${BASE}/sports/${SPORT}/events/${ev.id}/odds/?apiKey=${apiKey}&regions=${REGIONS}&markets=${marketsParam}&oddsFormat=${ODDS_FORMAT}`;
      const { data } = await axiosInstance.get<ApiEvent>(url, { timeout: 20000 });
      const event = data as ApiEvent;
      const commenceTime = event.commence_time ?? ev.commence_time ?? "";

      for (const market of PLAYER_MARKETS) {
        const stat = MARKET_TO_STAT[market] ?? market.replace("player_", "");
        for (const book of event.bookmakers ?? []) {
          const bookmaker = book.key ?? book.title ?? "unknown";
          for (const m of book.markets ?? []) {
            if (m.key !== market) continue;
            const outcomes = m.outcomes ?? [];
            const byKey = new Map<string, { over: number; under: number }>();
            for (const o of outcomes) {
              const player = (o.description ?? o.name ?? "").trim();
              const line = Number(o.point);
              const price = Number(o.price);
              if (!player || !Number.isFinite(line) || !Number.isFinite(price)) continue;
              if (ODDS_FORMAT === "american" && (price === 0 || Math.abs(price) < 100)) continue;
              const key = `${player}\t${line}`;
              const slot = byKey.get(key) ?? { over: 0, under: 0 };
              if ((o.name ?? "").toLowerCase() === "over") slot.over = price;
              else slot.under = price;
              byKey.set(key, slot);
            }
            for (const [key, slot] of byKey) {
              if (ODDS_FORMAT === "american") {
                if (!slot.over || !slot.under || Math.abs(slot.over) < 100 || Math.abs(slot.under) < 100) continue;
              } else if (slot.over < 1.01 || slot.under < 1.01) continue;
              const [player, lineStr] = key.split("\t");
              allLegs.push({
                player,
                stat,
                line: Number(lineStr),
                overPrice: slot.over,
                underPrice: slot.under,
                bookmaker,
                eventId: ev.id,
                commenceTime,
              });
            }
          }
        }
      }
      await new Promise((r) => setTimeout(r, 250)); // rate limit
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { status?: number } }).response?.status ?? String(err)
          : err instanceof Error
            ? err.message
            : String(err);
      console.warn(`[OddsAPI] Event ${ev.id}: ${msg}`);
    }
  }

  if (allLegs.length === 0) {
    throw new Error("No live odds—check ODDSAPI_KEY and API quota (event-odds costs credits)");
  }

  const byBook = allLegs.reduce((acc, l) => {
    acc[l.bookmaker] = (acc[l.bookmaker] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const booksLine = Object.entries(byBook)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");
  console.log(`[OddsAPI] Books: ${booksLine}`);

  saveCache(allLegs);
  console.log(`[OddsAPI] Fetched ${allLegs.length} legs in ${((Date.now() - now) / 1000).toFixed(1)}s`);
  return allLegs;
}

/**
 * Live probe: games, bookmakers, sample props (top 20). Uses event-level odds (one event).
 */
export async function probeLiveNbaOdds(apiKey?: string): Promise<{
  games: number;
  bookmakers: string[];
  uniqueProps: number;
  sampleProps: string[];
}> {
  const key = apiKey ?? process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY ?? "";
  if (!key) throw new Error("ODDSAPI_KEY required");

  const eventsUrl = `${BASE}/sports/${SPORT}/odds/?apiKey=${key}&regions=${REGIONS}&markets=h2h&oddsFormat=${ODDS_FORMAT}`;
  const { data: eventsData } = await axiosInstance.get<ApiEvent[]>(eventsUrl, { timeout: 15000 });
  const events = Array.isArray(eventsData) ? eventsData : [];
  const books = new Set<string>();
  const sampleProps: string[] = [];
  let propCount = 0;

  if (events.length > 0) {
    const firstEventId = events[0].id;
    if (firstEventId) {
      const marketsParam = "player_points,player_rebounds,player_assists";
      const eventUrl = `${BASE}/sports/${SPORT}/events/${firstEventId}/odds/?apiKey=${key}&regions=${REGIONS}&markets=${marketsParam}&oddsFormat=${ODDS_FORMAT}`;
      const { data: eventData } = await axiosInstance.get<ApiEvent>(eventUrl, { timeout: 15000 });
      const ev = eventData as ApiEvent;
      for (const book of ev.bookmakers ?? []) {
        const bk = book.key ?? book.title ?? "";
        if (bk) books.add(bk);
        for (const m of book.markets ?? []) {
          for (const o of m.outcomes ?? []) {
            propCount++;
            const player = (o.description ?? o.name ?? "").trim();
            const line = o.point ?? 0;
            const price = o.price ?? 0;
            const name = (o.name ?? "").toLowerCase();
            if (sampleProps.length < 20 && player)
              sampleProps.push(`${player} ${name} ${line} @${price} ${bk}`);
          }
        }
      }
    }
  }

  return {
    games: events.length,
    bookmakers: [...books].sort(),
    uniqueProps: propCount,
    sampleProps,
  };
}
