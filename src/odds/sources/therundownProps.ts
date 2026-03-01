// src/odds/sources/therundownProps.ts
// TheRundown v2 API adapter for multi-sport player props as backup odds source
// Docs: https://docs.therundown.io/guides/player-props

import "dotenv/config";
import fetch from "node-fetch";
import { americanToProb } from "../../odds_math";
import { SgoPlayerPropOdds, StatCategory, Sport } from "../../types";

// Debug logging control
const DEBUG = process.env.DEBUG_THERUNDOWN === "1";

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

function processTheRundownV2Response(
  sport: Sport,
  events: TheRundownV2Event[]
): SgoPlayerPropOdds[] {
  const results: SgoPlayerPropOdds[] = [];
  let eventsWithMarkets = 0;
  let totalMarkets = 0;

  for (const event of events) {
    if (!event.markets || event.markets.length === 0) {
      debugLog(`Event ${event.event_id} has no markets`);
      continue;
    }
    
    eventsWithMarkets++;
    totalMarkets += event.markets.length;

    // Extract teams for context
    const homeTeam = event.teams[1]?.name || null;
    const awayTeam = event.teams[0]?.name || null;

    for (const market of event.markets) {
      const statCategory = THERUNDOWN_MARKET_ID_TO_STAT[market.market_id];
      if (!statCategory) {
        debugLog(`Unknown market_id ${market.market_id} for ${sport}, skipping`);
        continue;
      }
      // Only import stats in our unified NBA list (same as SGO)
      if (sport === "NBA" && !NBA_STAT_CATEGORIES.includes(statCategory)) {
        debugLog(`Skipping ${market.market_id} (${statCategory}) - not in NBA_STAT_CATEGORIES`);
        continue;
      }

      // V2 API separates Over and Under into different participants
      // Strategy: Collect all participants first, then pair by player+line
      const playerLineMap = new Map<string, { 
        over?: number; 
        under?: number; 
        stat: StatCategory; 
        line: number; 
        eventId: string; 
        marketId: number;
        playerName: string;
      }>();

      // First pass: Collect all participant data
      for (const participant of market.participants) {
        // Extract player name (remove "Over"/"Under" suffix)
        let playerName = participant.name;
        for (const suffix of [" Over", " Under"]) {
          playerName = playerName.replace(suffix, "");
        }

        const isOver = participant.type === "TYPE_OVER" || participant.name.includes("Over");

        // Process each line (over/under value) for this player
        for (const line of participant.lines) {
          const lineValue = parseFloat(line.value);
          if (isNaN(lineValue)) {
            continue;
          }

          const key = `${playerName}_${lineValue}`;
          
          // Initialize entry if needed
          if (!playerLineMap.has(key)) {
            playerLineMap.set(key, {
              stat: statCategory,
              line: lineValue,
              eventId: event.event_id,
              marketId: market.market_id,
              playerName: playerName
            });
          }

          const entry = playerLineMap.get(key)!;
          
          // Calculate consensus odds for this side (over or under)
          let consensus = 0;
          let totalWeight = 0;
          let validPrices = 0;

          for (const [affiliateId, priceObj] of Object.entries(line.prices)) {
            // TheRundown v2 returns { price, is_main_line, updated_at } objects.
            // Guard against plans/versions that return the price directly as a number.
            const price: number =
              typeof priceObj === "object" && priceObj !== null
                ? (priceObj as TheRundownV2Price).price
                : Number(priceObj);

            // Sentinel 0.0001 = line not available for this affiliate
            if (!isFinite(price) || price === 0.0001 || price === 0) continue;

            const weight = getBookWeight(affiliateId);
            consensus += price * weight;
            totalWeight += weight;
            validPrices++;
          }

          if (totalWeight > 0 && validPrices > 0) {
            consensus = Math.round(consensus / totalWeight);
            if (isOver) {
              entry.over = consensus;
            } else {
              entry.under = consensus;
            }
            debugLog(`Collected ${isOver ? 'over' : 'under'} for ${playerName} ${statCategory} ${lineValue}: ${consensus} (${validPrices} books)`);
          } else {
            debugLog(`No valid prices for ${playerName} ${statCategory} ${lineValue} ${isOver ? 'over' : 'under'}`);
          }
        }
      }

      // Second pass: Create results only for entries with both over AND under
      let pairedCount = 0;
      let unpairedCount = 0;
      for (const [key, entry] of playerLineMap) {
        if (entry.over !== undefined && entry.under !== undefined) {
          const result: SgoPlayerPropOdds = {
            sport,
            player: entry.playerName,
            team: null,
            opponent: null,
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
          };
          results.push(result);
          pairedCount++;
        } else {
          unpairedCount++;
          if (unpairedCount <= 3) { // Log first 3 unpaired for debugging
            console.log(`[TheRundown] Unpaired: ${key} - has over=${entry.over !== undefined}, under=${entry.under !== undefined}`);
          }
        }
      }
      if (pairedCount > 0) {
        console.log(`[TheRundown] Market ${market.market_id} (${statCategory}): ${pairedCount} paired, ${unpairedCount} unpaired`);
      }
    }
  }

  // Always-visible summary — not gated by DEBUG flag
  if (results.length > 0) {
    console.log(`[TheRundown] Processed ${results.length} player props from ${eventsWithMarkets}/${events.length} events (${totalMarkets} markets matched stat filter)`);
  } else {
    console.warn(
      `[TheRundown] Processed 0 player props from ${eventsWithMarkets} events with markets. ` +
      `Check market_id mapping — set DEBUG_THERUNDOWN=1 for per-market detail.`
    );
  }
  debugLog(`Processed ${results.length} ${sport} player prop markets from v2 API`);
  return results;
}

// Backward compatibility function for NBA
export async function getNbaPlayerPropsFromTheRundown(): Promise<SgoPlayerPropOdds[]> {
  return getPlayerPropsFromTheRundown(['NBA']);
}
