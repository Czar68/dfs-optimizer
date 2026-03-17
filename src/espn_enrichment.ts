/**
 * ESPN enrichment: recent player form (last-5 avg vs line) before EV scoring.
 * Gated by FLAGS.espnEnrichment. Best-effort only — never throws.
 */

import fetch from "node-fetch";
import type { EspnEnrichment, MergedPick, EvPick } from "./types";
import { FLAGS, isFeatureEnabled } from "./constants/featureFlags";

const ESPN_SEARCH_BASE = "https://site.api.espn.com/apis/common/v3/search";
const ESPN_GAMELOG_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";
const REQUEST_TIMEOUT_MS = 8_000;

/** Stat key (our merge_odds stat) → ESPN category label in gamelog. */
const STAT_TO_ESPN: Record<string, string> = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  threes: "3PM",
  blocks: "BLK",
  steals: "STL",
  turnovers: "TO",
};

/** Combo stat → component stats to sum. */
const COMBO_COMPONENTS: Record<string, string[]> = {
  pra: ["points", "rebounds", "assists"],
  points_rebounds: ["points", "rebounds"],
  points_assists: ["points", "assists"],
  rebounds_assists: ["rebounds", "assists"],
  stocks: ["steals", "blocks"],
};

function getEspnCategoriesForStat(statKey: string): string[] {
  const key = statKey.toLowerCase().replace(/[\s_-]+/g, "");
  if (key.includes("+")) {
    const parts = key.split("+").map((p) => p.trim());
    const out: string[] = [];
    for (const p of parts) {
      const cat = STAT_TO_ESPN[p] ?? (p === "pts" ? "PTS" : p === "reb" ? "REB" : p === "ast" ? "AST" : p === "3pm" ? "3PM" : p === "stl" ? "STL" : p === "blk" ? "BLK" : null);
      if (cat) out.push(cat);
    }
    return out.length ? out : [STAT_TO_ESPN.points];
  }
  const single = STAT_TO_ESPN[statKey] ?? STAT_TO_ESPN[key];
  if (single) return [single];
  const comps = COMBO_COMPONENTS[key];
  if (comps) return comps.map((c) => STAT_TO_ESPN[c]).filter(Boolean);
  return [STAT_TO_ESPN.points];
}

/** Parse a single game row for stat value(s). Returns sum for combo. */
function statValueFromGameRow(row: Record<string, unknown>, categories: string[]): number {
  let sum = 0;
  const stats = (row.statistics ?? row.stats ?? row.stat) as unknown;
  if (Array.isArray(stats)) {
    for (let i = 0; i < stats.length; i++) {
      const label = (row.labels as string[])?.[i] ?? (stats[i] as { name?: string })?.name ?? "";
      const cat = String(label).toUpperCase().trim();
      if (categories.includes(cat)) {
        const val = parseFloat(String((stats[i] as { value?: number; displayValue?: string })?.value ?? (stats[i] as { displayValue?: string })?.displayValue ?? stats[i])) || 0;
        sum += val;
      }
    }
    return sum;
  }
  if (stats && typeof stats === "object" && !Array.isArray(stats)) {
    const obj = stats as Record<string, unknown>;
    for (const cat of categories) {
      const v = obj[cat] ?? obj[cat.toLowerCase()];
      sum += parseFloat(String(v)) || 0;
    }
  }
  return sum;
}

/** Extract last 5 game stat values from gamelog API response. */
function parseGamelogLast5(data: unknown, categories: string[]): { values: number[]; count: number } {
  const values: number[] = [];
  const obj = data as Record<string, unknown>;
  const events = (obj.events ?? obj.games ?? obj.items ?? []) as unknown[];
  const list = Array.isArray(events) ? events.slice(-5) : [];
  for (const ev of list) {
    const row = (ev as Record<string, unknown>).statistics ?? (ev as Record<string, unknown>).stats ?? ev;
    if (row && typeof row === "object") {
      const v = statValueFromGameRow(row as Record<string, unknown>, categories);
      values.push(v);
    }
  }
  return { values, count: values.length };
}

/**
 * Fetch ESPN recent form for one player/stat. Returns null on any error (best-effort).
 */
export async function fetchEspnRecentForm(
  playerName: string,
  statKey: string,
  line: number
): Promise<EspnEnrichment | null> {
  const fetchedAt = new Date().toISOString();
  try {
    const searchUrl = `${ESPN_SEARCH_BASE}?query=${encodeURIComponent(playerName)}&type=player&limit=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as { items?: { id?: string; athleteId?: string }[] };
    const items = searchData.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    const athleteId = first?.id ?? first?.athleteId ?? (first as { id?: string }).id;
    if (!athleteId) return null;

    const season = new Date().getFullYear();
    const gamelogUrl = `${ESPN_GAMELOG_BASE}/${athleteId}/gamelog?season=${season}`;
    const gamelogRes = await fetch(gamelogUrl, {
      headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!gamelogRes.ok) return null;
    const gamelogData = (await gamelogRes.json()) as unknown;
    const categories = getEspnCategoriesForStat(statKey);
    const { values, count } = parseGamelogLast5(gamelogData, categories);
    if (count === 0) return null;

    const last5Avg = values.reduce((a, b) => a + b, 0) / count;
    const vsLineGap = last5Avg - line;

    return {
      last5Avg,
      last5Games: count,
      vsLineGap,
      injuryStatus: undefined,
      fetchedAt,
    };
  } catch {
    return null;
  }
}

const CONCURRENCY = 8;

/** Simple semaphore: at most CONCURRENCY concurrent fetches. */
async function withSemaphore<T>(sem: { count: number; wait: (() => void)[] }, fn: () => Promise<T>): Promise<T> {
  while (sem.count >= CONCURRENCY) {
    await new Promise<void>((r) => { sem.wait.push(r); });
  }
  sem.count++;
  try {
    return await fn();
  } finally {
    sem.count--;
    const next = sem.wait.shift();
    if (next) next();
  }
}

/**
 * Enrich merged legs with ESPN recent form. Gates on FLAGS.espnEnrichment.
 * Rate-limited to 8 concurrent fetches; one failure does not block others.
 */
export async function enrichLegsWithEspn(legs: MergedPick[]): Promise<MergedPick[]> {
  if (!FLAGS.espnEnrichment || !legs?.length) return legs;

  const sem = { count: 0, wait: [] as (() => void)[] };
  const results = await Promise.allSettled(
    legs.map((leg) =>
      withSemaphore(sem, async () => {
        const form = await fetchEspnRecentForm(leg.player, leg.stat, leg.line);
        return { leg, form };
      })
    )
  );

  let enriched = 0;
  let nulls = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value.form) {
      (legs[i] as MergedPick).espnEnrichment = r.value.form;
      enriched++;
    } else if (r.status === "fulfilled" && !r.value.form) {
      nulls++;
    }
  }
  console.log(`[ESPN] enriched ${enriched}/${legs.length} legs (${nulls} nulls)`);
  return legs;
}

/**
 * Nudge adjEv by vsLineGap (10% weight, cap ±15%). Returns leg unchanged if flag off or no espnEnrichment.
 */
export function applyEspnAdjEv(leg: EvPick): EvPick {
  if (!FLAGS.espnEnrichment || !leg.espnEnrichment) return leg;
  const { vsLineGap } = leg.espnEnrichment;
  const line = leg.line;
  if (!line || !Number.isFinite(vsLineGap)) return leg;

  let nudge = (vsLineGap / line) * 0.1;
  nudge = Math.max(-0.15, Math.min(0.15, nudge));
  const baseEv = leg.adjEv ?? leg.legEv;
  leg.adjEv = baseEv * (1 + nudge);
  return leg;
}

// --- ESPN_ENRICHMENT_ENABLED (injury/status): enrichLegs on EvPick[] ---

const BLOCKED_STATUSES = new Set(["Out", "Suspended", "Injured Reserve", "IR"]);

function normalizeForLookup(name: string): string {
  return name
    .replace(/\s*(Jr\.?|III?|IV|II)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Fetch ESPN athlete roster (injury status), filter out BLOCKED legs, set espnStatus on rest.
 * Used when ESPN_ENRICHMENT_ENABLED. EvPick[] in, EvPick[] out (subset).
 */
export async function enrichLegs(legs: EvPick[]): Promise<EvPick[]> {
  if (!isFeatureEnabled("ESPN_ENRICHMENT_ENABLED") || !legs?.length) return legs;
  try {
    const rosterUrl = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes?limit=500";
    const res = await fetch(rosterUrl, {
      headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return legs;
    const data = (await res.json()) as { items?: { id?: string; fullName?: string; status?: { type?: { name?: string } }; displayName?: string }[] };
    const items = data.items ?? [];
    const byName = new Map<string, { id: string; statusName: string }>();
    for (const item of items) {
      const name = (item.fullName ?? item.displayName ?? "").trim();
      if (!name) continue;
      const statusName = item.status?.type?.name ?? "unknown";
      byName.set(normalizeForLookup(name), { id: String(item.id ?? ""), statusName });
    }
    const filtered: EvPick[] = [];
    for (const leg of legs) {
      const key = normalizeForLookup(leg.player);
      const match = byName.get(key) ?? (key.split(" ").length >= 2 ? byName.get(key.split(" ").slice(-1)[0] ?? "") : undefined);
      if (match && BLOCKED_STATUSES.has(match.statusName)) {
        console.log(`[ESPN] BLOCKED: ${leg.player} ${match.statusName}`);
        continue;
      }
      if (match) (leg as EvPick & { espnStatus?: string }).espnStatus = match.statusName;
      filtered.push(leg);
    }
    return filtered;
  } catch {
    return legs;
  }
}
