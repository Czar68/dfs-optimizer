// src/odds/sources/therundownProps.ts
// TheRundown v2 API adapter for multi-sport player props as backup odds source
// Docs: https://docs.therundown.io/guides/player-props

import "dotenv/config";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { americanToProb } from "../../odds_math";
import { SgoPlayerPropOdds, StatCategory, Sport } from "../../types";
import { isValidAmericanOdds } from "../normalize_odds";

const INVALID_ODDS_JSONL = path.join(process.cwd(), "debug", "invalid_odds.jsonl");
const AFFILIATE_NAME: Record<string, string> = { "19": "FanDuel", "23": "DraftKings" };

interface InvalidOddsForensicCounters {
  invalidByBook: Record<string, number>;
  invalidByMarket: Record<string, number>;
  invalidByReason: { zero: number; absLess100: number; absOver10000: number; truncation_suspect: number };
}

function ensureDebugDir(): void {
  const dir = path.dirname(INVALID_ODDS_JSONL);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function reasonFromValue(parsedOddsValue: number): "zero" | "absLess100" | "absOver10000" {
  if (parsedOddsValue === 0 || !Number.isFinite(parsedOddsValue) || Math.abs(parsedOddsValue - 0.0001) < 1e-6) return "zero";
  const abs = Math.abs(parsedOddsValue);
  if (abs < 100) return "absLess100";
  if (abs > 10000) return "absOver10000";
  return "absLess100";
}

function isTruncationSuspect(rawOddsValue: unknown, parsedOddsValue: number): boolean {
  if (typeof rawOddsValue !== "string") return false;
  const digitCount = (rawOddsValue.replace(/\D/g, "")).length;
  return digitCount >= 3 && Math.abs(parsedOddsValue) < 100;
}

function logInvalidOddsTrd(
  payload: {
    source: "trd";
    eventId: string;
    marketId: number;
    player: string;
    stat: string;
    line: number;
    side: string;
    bookKey: string;
    bookName: string;
    rawOddsValue: unknown;
    parsedOddsValue: number;
    reason: string;
    rawSnippet: unknown;
  },
  counters: InvalidOddsForensicCounters
): void {
  ensureDebugDir();
  fs.appendFileSync(INVALID_ODDS_JSONL, JSON.stringify(payload) + "\n", "utf8");
  counters.invalidByBook[payload.bookKey] = (counters.invalidByBook[payload.bookKey] ?? 0) + 1;
  counters.invalidByMarket[String(payload.marketId)] = (counters.invalidByMarket[String(payload.marketId)] ?? 0) + 1;
  const r = payload.reason as keyof InvalidOddsForensicCounters["invalidByReason"];
  if (r in counters.invalidByReason) (counters.invalidByReason as Record<string, number>)[r]++;
}

// Debug logging control
const DEBUG = process.env.DEBUG_THERUNDOWN === "1";
const DEBUG_ODDS = process.env.DEBUG_ODDS === "1";

function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[TheRundown DEBUG] ${message}`, ...args);
  }
}

// TheRundown API configuration
// Using v2 (recommended) - market-based model with player props support
// Docs: https://docs.therundown.io/introduction
const API_BASE = "https://therundown.io/api/v2";

// Sport IDs from TheRundown API documentation
const SPORT_IDS: Record<Sport, number> = {
  'NBA': 4,
  'NFL': 1,
  'MLB': 2,
  'NHL': 6,
  'NCAAF': 3,
  'NCAAB': 5
};

// Player prop market IDs and stat mapping: unified with config/nba_props.ts (same stats as SGO).
// Docs confirm: 29=Points 35=Rebounds 38=3PT 39=Assists (https://docs.therundown.io/guides/player-props)
// Set THERUNDOWN_MARKETS=full to add combo markets (93=PRA,99=Pts+Ast,297=Pts+Reb,298=Reb+Ast)
import { THERUNDOWN_NBA_MARKET_IDS, THERUNDOWN_MARKET_ID_TO_STAT, NBA_STAT_CATEGORIES } from "../../config/nba_props";

// Core 4 markets confirmed by TheRundown docs — always request these.
// Full list adds combo markets (PRA etc.) — useful when plan supports them.
const NBA_MARKETS_CORE = [29, 35, 38, 39]; // Points, Rebounds, 3PT, Assists
const NBA_MARKETS_FULL = [...THERUNDOWN_NBA_MARKET_IDS]; // adds PRA, Pts+Ast, etc.

const PLAYER_PROP_MARKETS: Record<Sport, number[]> = {
  NBA: process.env.THERUNDOWN_MARKETS === "full" ? NBA_MARKETS_FULL : NBA_MARKETS_CORE,
  NHL: [],
  NFL: [],
  MLB: [],
  NCAAB: [...NBA_MARKETS_CORE],
  NCAAF: []
};

// Affiliate IDs: 19=FanDuel, 23=DraftKings.
// Pinnacle (7) omitted — not available on most plan tiers and triggers 0-price sentinels.
const AFFILIATE_IDS = "19,23";

const BOOK_WEIGHTS: Record<string, number> = {
  "19": 1.0,
  "23": 1.0,
};

function getBookWeight(affiliateId: string): number {
  return BOOK_WEIGHTS[affiliateId] || 0.3;
}

// Statistical utilities for consensus calculation
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mad(values: number[]): number {
  const med = median(values);
  return median(values.map(v => Math.abs(v - med)));
}

// V2 API Response Interfaces
interface TheRundownV2Price {
  price: number;
  is_main_line: boolean;
  updated_at: string;
}

interface TheRundownV2Line {
  value: string;
  prices: Record<string, TheRundownV2Price>;
}

interface TheRundownV2Participant {
  id: number;
  name: string;
  type: string; // "TYPE_OVER" | "TYPE_UNDER" | "TYPE_PLAYER"
  lines: TheRundownV2Line[];
}

interface TheRundownV2Market {
  market_id: number;
  name: string;
  period_id: number;
  participants: TheRundownV2Participant[];
}

interface TheRundownV2Team {
  id: number;
  name: string;
}

interface TheRundownV2Event {
  event_id: string;
  sport_id: number;
  teams: TheRundownV2Team[];
  markets?: TheRundownV2Market[];
}

interface TheRundownV2Response {
  events: TheRundownV2Event[];
  meta?: {
    delta_last_id?: string;
  };
}

// Main function to fetch player props from TheRundown v2 API
export async function getPlayerPropsFromTheRundown(sports: Sport[] = ['NBA']): Promise<SgoPlayerPropOdds[]> {
  const apiKey = process.env.THERUNDOWN_API_KEY;
  
  if (!apiKey) {
    console.warn("getPlayerPropsFromTheRundown: missing THERUNDOWN_API_KEY, returning []");
    return [];
  }

  const allResults: SgoPlayerPropOdds[] = [];

  for (const sport of sports) {
    const sportId = SPORT_IDS[sport];
    if (!sportId) {
      debugLog(`No sport_id mapping for ${sport}, skipping`);
      continue;
    }

    const marketIds = PLAYER_PROP_MARKETS[sport];
    if (!marketIds || marketIds.length === 0) {
      debugLog(`No player prop markets configured for ${sport}, skipping`);
      continue;
    }

    debugLog(`Fetching ${sport} player props (sport_id: ${sportId}, markets: ${marketIds.join(',')})`);
    
    try {
      const sportResults = await fetchSportPlayerPropsV2(sport, sportId, marketIds, apiKey);
      allResults.push(...sportResults);
    } catch (error) {
      debugLog(`Error fetching ${sport} props:`, error);
      console.error(`getPlayerPropsFromTheRundown: Error fetching ${sport} props:`, error);
      // Don't throw - continue to next sport
    }
  }

  debugLog(`Total combined results: ${allResults.length} player prop markets`);
  return allResults;
}

async function fetchSportPlayerPropsV2(
  sport: Sport,
  sportId: number,
  marketIds: number[],
  apiKey: string
): Promise<SgoPlayerPropOdds[]> {
  // V2 endpoint: GET /sports/{sport_id}/events/{date}?market_ids=...&affiliate_ids=...
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
  const marketIdsParam = marketIds.join(',');
  const eventsUrl = `${API_BASE}/sports/${sportId}/events/${today}?key=${encodeURIComponent(apiKey)}&market_ids=${marketIdsParam}&affiliate_ids=${AFFILIATE_IDS}&offset=300`;
  
  console.log(`[TheRundown] GET /sports/${sportId}/events/${today}?market_ids=${marketIdsParam}&affiliate_ids=${AFFILIATE_IDS}&offset=300`);

  const eventsResponse = await fetch(eventsUrl);

  if (!eventsResponse.ok) {
    const errorText = await eventsResponse.text();
    if (eventsResponse.status === 429) {
      console.warn(`[TheRundown] 429 = Daily data point limit reached. ${errorText.substring(0, 150)}`);
      console.warn(`[TheRundown] Returning no data (usage NOT recorded). Limit resets at midnight UTC or upgrade plan.`);
      return []; // Don't throw - graceful degradation, no usage recorded
    }
    if (eventsResponse.status === 404) {
      console.log(`[TheRundown] 404 = No events for ${sport} (sport_id=${sportId}) on ${today} - may be no games scheduled`);
      console.log(`[TheRundown] Response: ${errorText.substring(0, 200)}`);
    } else if (eventsResponse.status === 401) {
      console.error(`[TheRundown] 401 = Authentication failed - check THERUNDOWN_API_KEY`);
      console.error(`[TheRundown] Response: ${errorText.substring(0, 200)}`);
    } else {
      console.error(`[TheRundown] ${eventsResponse.status} error: ${errorText.substring(0, 300)}`);
    }
    throw new Error(`Events API failed: ${eventsResponse.status} ${eventsResponse.statusText}`);
  }

  const data = await eventsResponse.json() as TheRundownV2Response;

  const eventCount = data.events?.length ?? 0;
  const marketsInFirst = data.events?.[0]?.markets?.length ?? 0;
  console.log(`[TheRundown] Response: ${eventCount} events, first event has ${marketsInFirst} markets`);

  if (eventCount === 0) {
    console.log(`[TheRundown] No events for ${sport} on ${today} — no games scheduled or plan doesn't include this sport/date.`);
    return [];
  }
  if (marketsInFirst === 0 && eventCount > 0) {
    const requested = marketIdsParam;
    console.warn(
      `[TheRundown] Events found (${eventCount}) but 0 markets returned. ` +
      `Requested market_ids=${requested}. ` +
      `Your plan may not include these markets — try THERUNDOWN_MARKETS=full or check your plan tier.`
    );
  }

  // Process v2 market-based response structure
  return processTheRundownV2Response(sport, data.events);
}

function parseLineValue(raw: string): { direction: "over" | "under"; line: number } | null {
  const m = raw.match(/^(over|under)\s+\+?([\d.]+)$/i);
  if (!m) return null;
  const line = parseFloat(m[2]);
  if (isNaN(line)) return null;
  return { direction: m[1].toLowerCase() as "over" | "under", line };
}

function processTheRundownV2Response(
  sport: Sport,
  events: TheRundownV2Event[]
): SgoPlayerPropOdds[] {
  const results: SgoPlayerPropOdds[] = [];
  let eventsWithMarkets = 0;
  let totalMarkets = 0;

  let totalLinesParsed = 0;
  let invalidPriceDropped = 0;
  let invalidOddsDropped = 0;
  let validPaired = 0;
  const invalidOddsExamples: string[] = [];
  const forensicCounters: InvalidOddsForensicCounters = {
    invalidByBook: {},
    invalidByMarket: {},
    invalidByReason: { zero: 0, absLess100: 0, absOver10000: 0, truncation_suspect: 0 },
  };

  for (const event of events) {
    if (!event.markets || event.markets.length === 0) {
      debugLog(`Event ${event.event_id} has no markets`);
      continue;
    }
    
    eventsWithMarkets++;
    totalMarkets += event.markets.length;

    const homeTeam = event.teams[1]?.name || null;
    const awayTeam = event.teams[0]?.name || null;

    for (const market of event.markets) {
      const statCategory = THERUNDOWN_MARKET_ID_TO_STAT[market.market_id];
      if (!statCategory) {
        debugLog(`Unknown market_id ${market.market_id} for ${sport}, skipping`);
        continue;
      }
      if (sport === "NBA" && !NBA_STAT_CATEGORIES.includes(statCategory)) {
        debugLog(`Skipping ${market.market_id} (${statCategory}) - not in NBA_STAT_CATEGORIES`);
        continue;
      }

      const playerLineMap = new Map<string, { 
        over?: number; 
        under?: number; 
        stat: StatCategory; 
        line: number; 
        eventId: string; 
        marketId: number;
        playerName: string;
      }>();

      for (const participant of market.participants) {
        if (participant.type !== "TYPE_PLAYER") continue;
        const playerName = participant.name;

        for (const line of participant.lines) {
          const parsed = parseLineValue(line.value);
          if (!parsed) {
            debugLog(`Unparseable line.value "${line.value}" for ${playerName}`);
            continue;
          }

          totalLinesParsed++;

          const key = `${playerName}_${parsed.line}`;
          if (!playerLineMap.has(key)) {
            playerLineMap.set(key, {
              stat: statCategory,
              line: parsed.line,
              eventId: event.event_id,
              marketId: market.market_id,
              playerName,
            });
          }

          const entry = playerLineMap.get(key)!;

          let consensus = 0;
          let totalWeight = 0;
          let validPrices = 0;

          for (const [affiliateId, priceObj] of Object.entries(line.prices)) {
            const rawPriceVal: unknown =
              typeof priceObj === "object" && priceObj !== null
                ? (priceObj as TheRundownV2Price).price
                : priceObj;
            const price: number = Number(rawPriceVal);

            if (!isFinite(price) || price === 0.0001 || price === 0) {
              invalidPriceDropped++;
              const reason = "zero";
              logInvalidOddsTrd(
                {
                  source: "trd",
                  eventId: event.event_id,
                  marketId: market.market_id,
                  player: playerName,
                  stat: statCategory,
                  line: parsed.line,
                  side: parsed.direction,
                  bookKey: affiliateId,
                  bookName: AFFILIATE_NAME[affiliateId] ?? affiliateId,
                  rawOddsValue: rawPriceVal,
                  parsedOddsValue: price,
                  reason,
                  rawSnippet: priceObj,
                },
                forensicCounters
              );
              continue;
            }
            if (!isValidAmericanOdds(price)) {
              invalidPriceDropped++;
              let reason: string = reasonFromValue(price);
              if (isTruncationSuspect(rawPriceVal, price)) {
                reason = "truncation_suspect";
              }
              logInvalidOddsTrd(
                {
                  source: "trd",
                  eventId: event.event_id,
                  marketId: market.market_id,
                  player: playerName,
                  stat: statCategory,
                  line: parsed.line,
                  side: parsed.direction,
                  bookKey: affiliateId,
                  bookName: AFFILIATE_NAME[affiliateId] ?? affiliateId,
                  rawOddsValue: rawPriceVal,
                  parsedOddsValue: price,
                  reason,
                  rawSnippet: priceObj,
                },
                forensicCounters
              );
              if (invalidOddsExamples.length < 5) {
                invalidOddsExamples.push(`${playerName} ${statCategory} ${parsed.line} ${parsed.direction}: raw=${price}`);
              }
              continue;
            }

            const weight = getBookWeight(affiliateId);
            consensus += price * weight;
            totalWeight += weight;
            validPrices++;
          }

          if (totalWeight > 0 && validPrices > 0) {
            consensus = Math.round(consensus / totalWeight);
            if (!isValidAmericanOdds(consensus)) {
              invalidPriceDropped++;
              const rawConsensus = consensus;
              let reason: string = reasonFromValue(consensus);
              if (isTruncationSuspect(String(consensus), consensus)) {
                reason = "truncation_suspect";
              }
              logInvalidOddsTrd(
                {
                  source: "trd",
                  eventId: event.event_id,
                  marketId: market.market_id,
                  player: playerName,
                  stat: statCategory,
                  line: parsed.line,
                  side: parsed.direction,
                  bookKey: "consensus",
                  bookName: "consensus",
                  rawOddsValue: rawConsensus,
                  parsedOddsValue: consensus,
                  reason,
                  rawSnippet: { consensus: rawConsensus },
                },
                forensicCounters
              );
              if (invalidOddsExamples.length < 5) {
                invalidOddsExamples.push(`${playerName} ${statCategory} ${parsed.line} ${parsed.direction}: consensus=${consensus}`);
              }
              continue;
            }
            if (parsed.direction === "over") {
              entry.over = consensus;
            } else {
              entry.under = consensus;
            }
            debugLog(`${parsed.direction} ${playerName} ${statCategory} ${parsed.line}: ${consensus} (${validPrices} books)`);
            // 1D: odds parse debug (DEBUG_ODDS=1)
            if (DEBUG_ODDS && totalLinesParsed <= 10) {
              const impliedPct = americanToProb(consensus) * 100;
              console.log("TRD parsed:", consensus, "| IMPLIED PROB:", `${impliedPct.toFixed(2)}%`);
            }
          }
        }
      }

      let pairedCount = 0;
      let unpairedCount = 0;
      for (const [, entry] of playerLineMap) {
        if (entry.over !== undefined && entry.under !== undefined) {
          if (!isValidAmericanOdds(entry.over) || !isValidAmericanOdds(entry.under)) {
            invalidOddsDropped++;
            if (invalidOddsExamples.length < 5) {
              invalidOddsExamples.push(`${entry.playerName} ${entry.stat} ${entry.line}: over=${entry.over} under=${entry.under} (pair rejected)`);
            }
            continue;
          }
          results.push({
            sport,
            player: entry.playerName,
            team: homeTeam,
            opponent: awayTeam,
            league: sport,
            stat: entry.stat,
            line: entry.line,
            overOdds: entry.over,
            underOdds: entry.under,
            book: "consensus",
            eventId: entry.eventId,
            marketId: entry.marketId.toString(),
            selectionIdOver: null,
            selectionIdUnder: null,
          });
          pairedCount++;
          validPaired++;
        } else {
          unpairedCount++;
        }
      }
      if (pairedCount > 0 || unpairedCount > 0) {
        debugLog(`Market ${market.market_id} (${statCategory}): ${pairedCount} paired, ${unpairedCount} unpaired`);
      }
    }
  }

  console.log(
    `[TheRundown] Parsed ${totalLinesParsed} lines → ${validPaired} valid paired markets | ` +
    `${invalidPriceDropped} invalid-price dropped, ${invalidOddsDropped} invalid-pair dropped`
  );
  const totalForensic = Object.values(forensicCounters.invalidByBook).reduce((a, b) => a + b, 0);
  if (totalForensic > 0) {
    console.log(
      `[TheRundown] Invalid odds forensics: ${INVALID_ODDS_JSONL} | ` +
      `invalidByBook=${JSON.stringify(forensicCounters.invalidByBook)} ` +
      `invalidByMarket=${JSON.stringify(forensicCounters.invalidByMarket)} ` +
      `invalidByReason=${JSON.stringify(forensicCounters.invalidByReason)}`
    );
  }
  if (invalidOddsExamples.length > 0) {
    console.log(`[TheRundown] Invalid odds examples: ${invalidOddsExamples.join(" | ")}`);
  }

  if (results.length > 0) {
    console.log(`[TheRundown] ${results.length} player props from ${eventsWithMarkets}/${events.length} events (${totalMarkets} markets matched)`);
  } else {
    console.warn(
      `[TheRundown] 0 player props from ${eventsWithMarkets} events with markets. ` +
      `Set DEBUG_THERUNDOWN=1 for detail.`
    );
  }
  return results;
}

// Backward compatibility function for NBA
export async function getNbaPlayerPropsFromTheRundown(): Promise<SgoPlayerPropOdds[]> {
  return getPlayerPropsFromTheRundown(['NBA']);
}
