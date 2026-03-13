// src/fetch_oddsapi_props.ts — The Odds API player props (OddsAPI only).
// EVENT-LEVEL ONLY: h2h → event IDs → /events/{id}/odds?markets=player_* (no bulk /odds?markets=player_*).
// Uses fetch() so MSW can intercept in tests; remains compatible with Node 18+ and browser.

import "./load_env";
import fs from "fs";
import path from "path";
import { PlayerPropOdds, StatCategory, Sport } from "./types";

const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";
const ODDS_FORMAT = "american";
const CACHE_DIR = path.join(process.cwd(), "cache");
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h (legacy cache only)
const ODDS_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h quota cache TTL
const QUOTA_GUARD_THRESHOLD = 500; // skip live fetch if remaining < this
const EVENT_DELAY_MS = 250;
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const COST_REPORT_PATH = path.join(process.cwd(), "cost_report.json");
const ODDS_CACHE_PATH = path.join(DATA_DIR, "odds_cache.json");

// Legacy baseline for token-efficiency comparison (pre-optimization)
const LEGACY_BASELINE_REGIONS = 3; // us, us2, eu
const LEGACY_BASELINE_MARKETS = 14; // 7 main + 7 alternate

/** Final 10-book list: player props only; no regions param (explicit bookmakers override). */
const DEFAULT_SELECTED_BOOKMAKERS = [
  "draftkings", "fanduel", "pinnacle", "lowvig", "betmgm",
  "espnbet", "prizepicks", "underdog", "pick6", "betr_us_dfs",
];

const SPORT_KEY_BY_CODE: Record<string, string> = {
  NBA: "basketball_nba",
  NHL: "icehockey_nhl",
  MLB: "baseball_mlb",
};

/** Standard player prop markets (10). No h2h, spreads, totals, outrights. */
export const REQUIRED_MARKETS: { key: string; stat: StatCategory }[] = [
  { key: "player_points", stat: "points" },
  { key: "player_rebounds", stat: "rebounds" },
  { key: "player_assists", stat: "assists" },
  { key: "player_threes", stat: "threes" },
  { key: "player_blocks", stat: "blocks" },
  { key: "player_steals", stat: "steals" },
  { key: "player_points_rebounds_assists", stat: "pra" },
  { key: "player_points_rebounds", stat: "points_rebounds" },
  { key: "player_points_assists", stat: "points_assists" },
  { key: "player_rebounds_assists", stat: "rebounds_assists" },
];

/** Full (primary) player prop markets. */
export const DEFAULT_MARKETS: { key: string; stat: StatCategory }[] = [
  ...REQUIRED_MARKETS,
];

/** Alternate-line markets (4): demons/goblins for PP/UD, non-default multipliers for Pick6/Betr. */
export const DEFAULT_MARKETS_ALTERNATE: { key: string; stat: StatCategory }[] = [
  { key: "player_points_alternate", stat: "points" },
  { key: "player_rebounds_alternate", stat: "rebounds" },
  { key: "player_assists_alternate", stat: "assists" },
  { key: "player_threes_alternate", stat: "threes" },
];

/** Market keys we request from the API: 10 standard + 4 alternate = 14 total. */
const REQUIRED_MARKET_KEYS = REQUIRED_MARKETS.map((m) => m.key);
const REQUEST_MARKET_KEYS = [
  ...REQUIRED_MARKET_KEYS,
  ...DEFAULT_MARKETS_ALTERNATE.map((m) => m.key),
];

/** All market keys (main + alternate) for normalization mapping only. */
const MARKET_KEYS = [
  ...DEFAULT_MARKETS.map((m) => m.key),
  ...DEFAULT_MARKETS_ALTERNATE.map((m) => m.key),
];

/** Map market key → stat; alternate keys map to same stat as main. */
const MARKET_KEY_TO_STAT: Record<string, StatCategory> = {
  ...Object.fromEntries(DEFAULT_MARKETS.map((m) => [m.key, m.stat])),
  ...Object.fromEntries(DEFAULT_MARKETS_ALTERNATE.map((m) => [m.key, m.stat])),
};

/** True if the market key is an alternate-lines market (isMainLine = false for those). */
function isAlternateMarketKey(key: string): boolean {
  return key.endsWith("_alternate");
}

export interface FetchOddsAPIPropsOptions {
  apiKey?: string;
  sport?: string;
  markets?: { key: string; stat: StatCategory }[];
  /** Include alternate-line markets (player_*_alternate). Default true for full coverage. */
  includeAlternativeLines?: boolean;
  forceRefresh?: boolean;
  selectedBookmakers?: string[];
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

interface OddsApiEventsOnly {
  id?: string;
  commence_time?: string;
}

interface CostReport {
  cost_per_run: number;
  projected_monthly_cost_at_1_run_daily: number;
  token_efficiency_percentage: number;
  formula_used: string;
}

interface TokenUsageMeta {
  last: number | null;
  remaining: number | null;
  used: number | null;
}

/**
 * Deterministic cost model when provider headers are absent.
 * Formula: events endpoint (1) + per-event odds request cost (events * markets * bookmakers).
 */
export function calculateTokenCostPerExecution(
  eventCount: number,
  marketCount: number,
  bookmakerCount: number
): number {
  return 1 + (Math.max(0, eventCount) * Math.max(1, marketCount) * Math.max(1, bookmakerCount));
}

/** Savings vs legacy request shape (3 regions x 14 markets, same event count). */
export function calculateTokenEfficiencyPercentage(eventCount: number, currentCost: number): number {
  const baseline = 1 + (Math.max(0, eventCount) * LEGACY_BASELINE_REGIONS * LEGACY_BASELINE_MARKETS);
  if (baseline <= 0) return 0;
  return Math.max(0, ((baseline - currentCost) / baseline) * 100);
}

function toNumberOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBookmakerKey(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseSelectedBookmakers(explicit?: string[]): string[] {
  const envRaw = process.env.ODDSAPI_BOOKS ?? process.env.ODDSAPI_BOOKMAKERS ?? "";
  const base = explicit && explicit.length > 0
    ? explicit
    : envRaw
      ? envRaw.split(",")
      : DEFAULT_SELECTED_BOOKMAKERS;
  const normalized = [...new Set(base.map(normalizeBookmakerKey).filter(Boolean))];
  return normalized.length > 0 ? normalized : DEFAULT_SELECTED_BOOKMAKERS;
}

/** Convert "NBA"/"NHL"/"MLB" or Odds API key string to a supported Odds API sport key. */
export function toOddsApiSportKey(sportInput?: string): string {
  const normalized = String(sportInput ?? "NBA").trim().toUpperCase();
  if (SPORT_KEY_BY_CODE[normalized]) return SPORT_KEY_BY_CODE[normalized];
  // If caller already passed Odds API sport key (e.g., basketball_nba), keep it.
  if (normalized.includes("_")) return String(sportInput).trim().toLowerCase();
  return SPORT;
}

function getCacheFileForSport(sportKey: string): string {
  return path.join(CACHE_DIR, `oddsapi_props_cache_${sportKey}.json`);
}

function writeCostReport(report: CostReport): void {
  try {
    fs.writeFileSync(COST_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  } catch (err) {
    console.warn("[OddsAPI] Failed to write cost_report.json:", err);
  }
}

/** GET with timeout; throws on !ok with status so callers can fail-fast. MSW-interceptable. */
async function httpGet<T>(url: string, timeoutMs: number): Promise<{ data: T; tokenMeta: TokenUsageMeta }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { response?: { status: number } };
      err.response = { status: res.status };
      throw err;
    }
    let data: T;
    try {
      const text = await res.text();
      if (!text || !text.trim()) {
        throw new Error("Odds API returned empty body");
      }
      data = JSON.parse(text) as T;
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Odds API response was not valid JSON: ${msg}`);
    }
    const tokenMeta: TokenUsageMeta = {
      last: toNumberOrNull(res.headers.get("x-requests-last")),
      remaining: toNumberOrNull(res.headers.get("x-requests-remaining")),
      used: toNumberOrNull(res.headers.get("x-requests-used")),
    };
    return { data, tokenMeta };
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

function loadCache(sportKey: string, forceRefresh: boolean): PlayerPropOdds[] | null {
  const cacheFile = getCacheFileForSport(sportKey);
  if (forceRefresh) return null;
  try {
    if (!fs.existsSync(cacheFile)) return null;
    const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (Date.now() - (raw.fetchedAt ?? 0) > CACHE_MAX_AGE_MS) return null;
    return raw.data ?? null;
  } catch {
    return null;
  }
}

function saveCache(sportKey: string, data: PlayerPropOdds[]): void {
  const cacheFile = getCacheFileForSport(sportKey);
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({ fetchedAt: Date.now(), data }, null, 2),
      "utf8"
    );
    console.log(`[OddsAPI] Cached ${data.length} props -> ${cacheFile}`);
  } catch (err) {
    console.warn("[OddsAPI] Cache write failed:", err);
  }
}

/** Quota cache: data/odds_cache.json. Guard can read remaining without a live call. */
interface OddsQuotaCache {
  ts: number;
  ttl: number;
  remaining: number;
  data: PlayerPropOdds[];
}

function loadQuotaCache(forceRefresh: boolean): { hit: true; data: PlayerPropOdds[]; remaining: number; reason: "quota" | "ttl"; ageMs?: number } | { hit: false } {
  if (forceRefresh) return { hit: false };
  try {
    if (!fs.existsSync(ODDS_CACHE_PATH)) return { hit: false };
    const raw = JSON.parse(fs.readFileSync(ODDS_CACHE_PATH, "utf8")) as OddsQuotaCache;
    const data = raw.data ?? [];
    const remaining = Number(raw.remaining);
    const ts = Number(raw.ts);
    const ttl = Number(raw.ttl) || ODDS_CACHE_TTL_MS;
    const ageMs = Date.now() - ts;
    if (data.length > 0 && Number.isFinite(remaining) && remaining < QUOTA_GUARD_THRESHOLD) {
      return { hit: true, data, remaining, reason: "quota" };
    }
    if (data.length > 0 && ageMs < ttl) {
      return { hit: true, data, remaining, reason: "ttl", ageMs };
    }
  } catch {
    // ignore
  }
  return { hit: false };
}

function saveQuotaCache(data: PlayerPropOdds[], remaining: number): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload: OddsQuotaCache = {
      ts: Date.now(),
      ttl: ODDS_CACHE_TTL_MS,
      remaining,
      data,
    };
    fs.writeFileSync(ODDS_CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.warn("[OddsAPI] Quota cache write failed:", err);
  }
}

/** Flatten one event's bookmakers/markets into PlayerPropOdds[] (all player_* and player_*_alternate). One row per (player, stat, line); alternate markets set isMainLine false. */
function normalizeEvent(event: OddsApiEvent, sportLabel: Sport, selectedBooks: Set<string>): PlayerPropOdds[] {
  const out: PlayerPropOdds[] = [];
  const sport: Sport = sportLabel;
  const league = sportLabel;
  const eventId = event.id ?? null;

  for (const bookmaker of event.bookmakers ?? []) {
    const bookTitle = bookmaker.title ?? bookmaker.key ?? "unknown";
    const bookKeyNorm = normalizeBookmakerKey(bookmaker.key ?? bookmaker.title ?? "");
    if (selectedBooks.size > 0 && !selectedBooks.has(bookKeyNorm)) continue;
    const book = bookTitle;
    for (const mkt of bookmaker.markets ?? []) {
      const stat = mkt.key ? MARKET_KEY_TO_STAT[mkt.key] : undefined;
      if (!stat) continue;
      const isAlt = mkt.key ? isAlternateMarketKey(mkt.key) : false;
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
          isMainLine: !isAlt,
        });
      }
    }
  }
  return out;
}

/**
 * Build the Odds API events endpoint URL with masked key for audit logging.
 * Call with the same mask used in CONFIG CHECK (e.g. ab***xy).
 */
export function getOddsApiAuditUrl(
  maskedKey: string,
  sportInput?: string,
  includeAlternativeLines: boolean = true,
  selectedBookmakers?: string[]
): string {
  const sport = toOddsApiSportKey(sportInput);
  const books = parseSelectedBookmakers(selectedBookmakers).join(",");
  const markets = (includeAlternativeLines ? REQUEST_MARKET_KEYS : REQUIRED_MARKET_KEYS).join(",");
  return `${BASE_URL}/sports/${sport}/events/{eventId}/odds/?apiKey=${maskedKey}&markets=${markets}&bookmakers=${books}&oddsFormat=${ODDS_FORMAT}`;
}

/**
 * Fetch NBA player props from The Odds API. EVENT-LEVEL ONLY (no bulk player_*).
 * Flow: GET .../odds?markets=h2h → event IDs → for each GET .../events/{id}/odds?markets=player_*.
 * Token save: regions=us, oddsFormat=american, only player_points/player_rebounds/player_assists (and alternates).
 */
export async function fetchOddsAPIProps(
  options: FetchOddsAPIPropsOptions = {}
): Promise<PlayerPropOdds[]> {
  const sportKey = toOddsApiSportKey(options.sport);
  const selectedBooks = parseSelectedBookmakers(options.selectedBookmakers);
  const selectedBooksSet = new Set(selectedBooks.map(normalizeBookmakerKey));
  const sportLabel: Sport = sportKey.includes("nhl")
    ? "NHL"
    : sportKey.includes("mlb")
      ? "MLB"
      : "NBA";
  const apiKey =
    (options.apiKey ?? process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY ?? "").trim();
  const hasKey = apiKey.length >= 8;
  const useMockEnv = process.env.USE_MOCK_ODDS === "1" || process.env.USE_MOCK_ODDS === "true";
  const useMock = useMockEnv && !hasKey;
  if (useMock) {
    console.log("[TOKEN SAVED] Using mock data (no ODDSAPI_KEY or key invalid).");
    const forceRefresh = options.forceRefresh ?? false;
    const cached = loadCache(sportKey, forceRefresh);
    return cached ?? [];
  }
  if (!hasKey) {
    console.warn("[OddsAPI] Missing ODDSAPI_KEY; returning []");
    return [];
  }

  const forceRefresh = options.forceRefresh ?? false;
  const includeAlternativeLines = options.includeAlternativeLines !== false;

  const quotaCache = loadQuotaCache(forceRefresh);
  if (quotaCache.hit) {
    if (quotaCache.reason === "quota") {
      console.log(`[QUOTA WARNING] remaining=${quotaCache.remaining}`);
    } else {
      const ageMin = quotaCache.ageMs != null ? Math.round(quotaCache.ageMs / 60000) : 0;
      console.log(`[ODDS-CACHE] HIT age=${ageMin}m remaining=${quotaCache.remaining}`);
    }
    return quotaCache.data;
  }

  console.log(`[OddsAPI] Fetching player props (event-level, no bulk) sport=${sportLabel} ...`);
  const allProps: PlayerPropOdds[] = [];
  const now = Date.now();
  let tokenCostFromHeaders = 0;

  // 1) Get event IDs using events endpoint (no odds payload)
  const eventsUrl = `${BASE_URL}/sports/${sportKey}/events/?apiKey=${apiKey}`;
  let eventList: { id: string; commence_time?: string }[] = [];
  let lastRemaining: number | null = null;
  try {
    const { data, tokenMeta } = await httpGet<OddsApiEventsOnly[]>(eventsUrl, 15000);
    if (tokenMeta.remaining != null) lastRemaining = tokenMeta.remaining;
    if (tokenMeta.last != null) tokenCostFromHeaders += tokenMeta.last;
    const used = tokenMeta.used ?? "?";
    const remaining = tokenMeta.remaining ?? "?";
    console.log(`[ODDS-QUOTA] used=${used} remaining=${remaining} endpoint=${eventsUrl.replace(/apiKey=[^&]+/, "apiKey=***")}`);
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
    saveCache(sportKey, allProps);
    return allProps;
  }

  if (eventList.length === 0) {
    console.warn("[OddsAPI] No events; check sport and date.");
    saveCache(sportKey, allProps);
    return allProps;
  }

  const marketKeysToRequest = includeAlternativeLines
    ? REQUEST_MARKET_KEYS
    : REQUIRED_MARKET_KEYS;
  const marketsParam = marketKeysToRequest.join(",");
  const booksParam = selectedBooks.join(",");
  console.log(
    "[OddsAPI] Requesting markets:",
    marketsParam,
    "books=" + booksParam,
    "oddsFormat=" + ODDS_FORMAT
  );
  for (const ev of eventList) {
    try {
      const url = `${BASE_URL}/sports/${sportKey}/events/${ev.id}/odds/?apiKey=${apiKey}&markets=${marketsParam}&bookmakers=${booksParam}&oddsFormat=${ODDS_FORMAT}`;
      const { data, tokenMeta } = await httpGet<OddsApiEvent>(url, 20000);
      if (tokenMeta.remaining != null) lastRemaining = tokenMeta.remaining;
      if (tokenMeta.last != null) tokenCostFromHeaders += tokenMeta.last;
      const used = tokenMeta.used ?? "?";
      const remaining = tokenMeta.remaining ?? "?";
      const safeUrl = url.replace(/apiKey=[^&]+/, "apiKey=***");
      console.log(`[ODDS-QUOTA] used=${used} remaining=${remaining} endpoint=${safeUrl}`);
      const normalized = normalizeEvent(data as OddsApiEvent, sportLabel, selectedBooksSet);
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
  saveQuotaCache(allProps, lastRemaining ?? 0);
  saveCache(sportKey, allProps);

  // Cost model: prefer provider header credit count, fallback to deterministic request model.
  const modeledCostPerRun = calculateTokenCostPerExecution(
    eventList.length,
    marketKeysToRequest.length,
    selectedBooks.length
  );
  const costPerRun = tokenCostFromHeaders > 0 ? tokenCostFromHeaders : modeledCostPerRun;
  const projectedMonthly = costPerRun * 30;
  const tokenEfficiencyPct = calculateTokenEfficiencyPercentage(eventList.length, modeledCostPerRun);
  const formulaUsed = tokenCostFromHeaders > 0
    ? "cost_per_run = Σ(x-requests-last response header). fallback_model = 1 + events * markets * bookmakers"
    : "cost_per_run = 1 + events * markets * bookmakers (events endpoint + event odds requests)";

  writeCostReport({
    cost_per_run: Number(costPerRun.toFixed(4)),
    projected_monthly_cost_at_1_run_daily: Number(projectedMonthly.toFixed(4)),
    token_efficiency_percentage: Number(tokenEfficiencyPct.toFixed(2)),
    formula_used: formulaUsed,
  });
  if (costPerRun > 15) {
    console.warn(`[TOKEN WARNING] Single run estimated at ${costPerRun.toFixed(2)} tokens (> 15).`);
  }
  return allProps;
}
