// src/live_liquidity.ts
//
// Live Liquidity Scorer — Phase 5
//
// Fetches real-time player prop odds from TheRundown v2 API and computes a
// per-leg liquidity score used by the Innovative Card Builder.
//
// Liquidity formula:
//   score = (bookCount / BOOK_TOTAL_SCALE) * edgeConfirm
//
//   bookCount   – number of unique sportsbooks offering a line for this player+stat
//   BOOK_TOTAL_SCALE – normalisation denominator (5 books = full score)
//   edgeConfirm – fraction of books whose implied probability is BELOW our trueProb
//                 (i.e. they "confirm" our over-edge is real)
//
// Returns a Map<legId, score 0-1>. When the API is unavailable or a leg has no
// TheRundown match, the score falls back to the static heuristic already used in
// build_innovative_cards.ts.

import "dotenv/config";
import fetch from "node-fetch";
import { EvPick, StatCategory } from "./types";
import { americanToProb } from "./odds_math";

// ---------------------------------------------------------------------------
// TheRundown v2 API config
// ---------------------------------------------------------------------------
const API_BASE        = "https://therundown.io/api/v2";
const NBA_SPORT_ID    = 4;
const AFFILIATE_IDS   = "19,23";   // FanDuel=19, DraftKings=23
const NBA_MARKET_IDS  = [29, 35, 38, 39];  // Points, Rebounds, 3PT, Assists
const BOOK_TOTAL_SCALE = 5;        // 5-book scale: (bookCount/5) → 1.0

// Market ID → StatCategory mapping
const MARKET_TO_STAT: Record<number, StatCategory> = {
  29: "points",
  35: "rebounds",
  38: "threes",
  39: "assists",
  93: "pra",
  99: "points_assists",
  297: "points_rebounds",
  298: "rebounds_assists",
};

// ---------------------------------------------------------------------------
// TheRundown v2 response interfaces (minimal — only what we need)
// ---------------------------------------------------------------------------
interface TrdPrice {
  price: number;          // American odds integer
  is_main_line: boolean;
}

interface TrdLine {
  value: string;          // e.g. "27.5"
  prices: Record<string, TrdPrice>; // affiliateId → price
}

interface TrdParticipant {
  id:    number;
  name:  string;          // player name for TYPE_PLAYER
  type:  string;          // "TYPE_PLAYER" | "TYPE_OVER" | "TYPE_UNDER"
  lines: TrdLine[];
}

interface TrdMarket {
  market_id:    number;
  participants: TrdParticipant[];
}

interface TrdEvent {
  event_id: string;
  markets?: TrdMarket[];
}

interface TrdResponse {
  events: TrdEvent[];
}

// ---------------------------------------------------------------------------
// Name normalisation (handle "LeBron James" ↔ "Lebron James" etc.)
// ---------------------------------------------------------------------------
function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------
// Per-prop liquidity record built from TheRundown data
// ---------------------------------------------------------------------------
interface PropLiqRecord {
  line:        number;
  bookCount:   number;
  bookImplied: number[];  // implied over-probs from each book
}

// ---------------------------------------------------------------------------
// Fetch live odds from TheRundown and build player→stat→LiqRecord map
// ---------------------------------------------------------------------------
async function fetchTheRundownPropMap(
  date: string,
  apiKey: string
): Promise<Map<string, Map<StatCategory, PropLiqRecord>>> {
  const marketParam = NBA_MARKET_IDS.join(",");
  const url = `${API_BASE}/sports/${NBA_SPORT_ID}/events/${date}?key=${encodeURIComponent(apiKey)}&market_ids=${marketParam}&affiliate_ids=${AFFILIATE_IDS}&offset=300`;

  console.log(`[LiveLiq] GET TheRundown events for ${date} (markets: ${marketParam})`);

  let eventsData: TrdResponse;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[LiveLiq] TheRundown HTTP ${res.status} — falling back to static liquidity`);
      return new Map();
    }
    eventsData = (await res.json()) as TrdResponse;
  } catch (err) {
    console.warn(`[LiveLiq] TheRundown fetch error: ${(err as Error).message}`);
    return new Map();
  }

  const events = eventsData.events ?? [];
  console.log(`[LiveLiq] TheRundown returned ${events.length} events`);

  // playerNormName → stat → PropLiqRecord
  const propMap = new Map<string, Map<StatCategory, PropLiqRecord>>();

  for (const event of events) {
    for (const market of event.markets ?? []) {
      const stat = MARKET_TO_STAT[market.market_id];
      if (!stat) continue;

      for (const participant of market.participants) {
        if (participant.type !== "TYPE_PLAYER") continue;
        const normPlayer = normName(participant.name);

        for (const line of participant.lines) {
          const lineVal = parseFloat(line.value);
          if (!Number.isFinite(lineVal)) continue;

          // Collect over-implied probs from each book that has this line
          const bookImplieds: number[] = [];
          for (const [, priceObj] of Object.entries(line.prices)) {
            const american = priceObj.price;
            if (american === 0 || !Number.isFinite(american)) continue;
            const implied = americanToProb(american);
            if (implied > 0 && implied < 1) bookImplieds.push(implied);
          }

          if (bookImplieds.length === 0) continue;

          // Upsert — prefer the main-line (most books) record
          if (!propMap.has(normPlayer)) propMap.set(normPlayer, new Map());
          const statMap = propMap.get(normPlayer)!;

          const existing = statMap.get(stat);
          if (!existing || bookImplieds.length > existing.bookCount) {
            statMap.set(stat, {
              line:        lineVal,
              bookCount:   bookImplieds.length,
              bookImplied: bookImplieds,
            });
          }
        }
      }
    }
  }

  console.log(`[LiveLiq] Built prop map: ${propMap.size} players with live data`);
  return propMap;
}

// ---------------------------------------------------------------------------
// Compute edgeConfirm: fraction of books whose implied prob < our trueProb
// (means they offer us an edge, confirming our model is right)
// ---------------------------------------------------------------------------
function computeEdgeConfirm(trueProb: number, bookImplieds: number[]): number {
  if (bookImplieds.length === 0) return 0.5; // neutral
  const confirming = bookImplieds.filter(b => b < trueProb).length;
  return confirming / bookImplieds.length;
}

// ---------------------------------------------------------------------------
// Static fallback: book-count heuristic based on how many books the
// existing odds data was merged from (EvPick.book is a single string,
// so we use a simple heuristic: if book exists → 2 books minimum)
// ---------------------------------------------------------------------------
function staticLiquidity(pick: EvPick): number {
  if (!pick.book) return 0.50;
  return 0.65;
}

// ---------------------------------------------------------------------------
// Main export: computeLiveLiquidity
//
// Returns a Map<legId, liquidityScore 0-1>.
// If the API returns no data (plan limitation, late night, etc.),
// all legs silently fall back to staticLiquidity().
// ---------------------------------------------------------------------------
export async function computeLiveLiquidity(
  legs: EvPick[],
  date: string
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const apiKey = process.env.THERUNDOWN_API_KEY;

  if (!apiKey) {
    console.warn("[LiveLiq] No THERUNDOWN_API_KEY in env — using static liquidity for all legs");
    for (const leg of legs) scores.set(leg.id, staticLiquidity(leg));
    return scores;
  }

  const propMap = await fetchTheRundownPropMap(date, apiKey);
  let liveHits = 0;
  let fallbacks = 0;

  for (const leg of legs) {
    const normPlayer = normName(leg.player);
    const statMap    = propMap.get(normPlayer);
    const record     = statMap?.get(leg.stat);

    if (!record || record.bookCount === 0) {
      // No live data — fall back to static
      scores.set(leg.id, staticLiquidity(leg));
      fallbacks++;
      continue;
    }

    const bookCount   = record.bookCount;
    const edgeConfirm = computeEdgeConfirm(leg.trueProb, record.bookImplied);
    const rawScore    = (bookCount / BOOK_TOTAL_SCALE) * edgeConfirm;
    const score       = Math.max(0.1, Math.min(1.0, rawScore));

    scores.set(leg.id, score);
    liveHits++;
  }

  console.log(`[LiveLiq] Scored ${liveHits} legs live, ${fallbacks} fallbacks to static`);
  return scores;
}

// ---------------------------------------------------------------------------
// Attach live liquidity scores to EvPick[] for downstream use
// Mutates legs in-place (adds _liveLiquidity property via type assertion)
// ---------------------------------------------------------------------------
export type EvPickWithLiquidity = EvPick & { _liveLiquidity?: number };

export async function enrichLegsWithLiveLiquidity(
  legs: EvPick[],
  date: string
): Promise<EvPickWithLiquidity[]> {
  const scoreMap = await computeLiveLiquidity(legs, date);
  return legs.map(leg => ({
    ...leg,
    _liveLiquidity: scoreMap.get(leg.id),
  }));
}
