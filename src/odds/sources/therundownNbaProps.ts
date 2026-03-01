// src/odds/sources/therundownNbaProps.ts
// TheRundown v2 API adapter for NBA player props as backup odds source

import "dotenv/config";
import fetch from "node-fetch";
import { americanToProb } from "../../odds_math";
import { SgoPlayerPropOdds, StatCategory } from "../../types";

// Debug logging control
const DEBUG = process.env.DEBUG_THERUNDOWN === "1";

function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[TheRundown DEBUG] ${message}`, ...args);
  }
}

// TheRundown API configuration
// Use v2 only - v1 /sports/{id}/dates calls in logs are from elsewhere (e.g. sports-odds-api or another app)
const API_BASE = "https://therundown.io/api/v2";
const NBA_SPORT_ID = 4; // From API documentation

// Book weights for consensus calculation (same as existing)
const BOOK_WEIGHTS: Record<string, number> = {
  "fanduel": 1.0,
  "pinnacle": 0.7,
  "circa": 0.7,
  // All other books get 0.3 weight
};

function getBookWeight(book: string): number {
  const normalized = book.toLowerCase();
  return BOOK_WEIGHTS[normalized] ?? 0.3;
}

// Market mapping from TheRundown market names to our StatCategory
const MARKET_TO_STAT: Record<string, StatCategory | null> = {
  "Player Points": "points",
  "Player Rebounds": "rebounds", 
  "Player Assists": "assists",
  "Player Threes": "threes",
  "Player Blocks": "blocks",
  "Player Steals": "steals",
  "Player Turnovers": "turnovers",
  "Player Points + Rebounds": "pr",
  "Player Points + Assists": "pa",
  "Player Rebounds + Assists": "ra",
  "Player Points + Rebounds + Assists": "pra",
};

// Statistical utilities (same as existing consensus logic)
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mad(values: number[]): number {
  const med = median(values);
  const deviations = values.map(v => Math.abs(v - med));
  return median(deviations);
}

// Pair over/under odds by book for each prop
interface BookPair {
  book: string;
  affiliateId: number;
  overOdds: number;
  underOdds: number;
  overProb: number;
  underProb: number;
  overProbDevig: number;
}

function pairOverUnderByBook(lines: any[]): BookPair[] {
  const byBook = new Map<number, { over?: any; under?: any }>();
  
  for (const line of lines) {
    const affiliateId = Object.keys(line.prices)[0]; // Get first affiliate
    const price = line.prices[affiliateId];
    
    if (!byBook.has(Number(affiliateId))) {
      byBook.set(Number(affiliateId), {});
    }
    
    const entry = byBook.get(Number(affiliateId))!;
    
    // Determine if this is over or under based on line value
    if (line.value && line.value.toString().startsWith("o")) {
      entry.over = { ...line, price: price.price, affiliateId: Number(affiliateId) };
    } else if (line.value && line.value.toString().startsWith("u")) {
      entry.under = { ...line, price: price.price, affiliateId: Number(affiliateId) };
    }
  }
  
  const pairs: BookPair[] = [];
  for (const [affiliateId, { over, under }] of byBook.entries()) {
    if (over && under) {
      const overProb = americanToProb(over.price);
      const underProb = americanToProb(under.price);
      const total = overProb + underProb;
      
      if (total > 0) {
        pairs.push({
          book: `affiliate_${affiliateId}`, // We'll map this later
          affiliateId,
          overOdds: over.price,
          underOdds: under.price,
          overProb,
          underProb,
          overProbDevig: overProb / total, // Proportional devig
        });
      }
    }
  }
  
  return pairs;
}

// Robust consensus calculation with outlier removal (same as existing)
function calculateConsensus(pairs: BookPair[]): number | null {
  if (pairs.length === 0) return null;
  
  const devigProbs = pairs.map(p => p.overProbDevig);
  
  // Calculate median and MAD for outlier detection
  const med = median(devigProbs);
  const m = mad(devigProbs);
  
  debugLog(`Consensus calculation: median=${med.toFixed(4)}, MAD=${m.toFixed(4)}, pairs=${pairs.length}`);
  
  // Filter outliers (3 * MAD threshold)
  let filteredPairs: BookPair[];
  if (m > 0) {
    filteredPairs = pairs.filter(p => Math.abs(p.overProbDevig - med) <= 3 * m);
    debugLog(`Outlier filtering: ${pairs.length - filteredPairs.length} outliers removed`);
  } else {
    filteredPairs = pairs;
  }
  
  // If filtering leaves <2 books, fall back to all pairs
  if (filteredPairs.length < 2) {
    filteredPairs = pairs;
    debugLog(`Fallback: using all ${pairs.length} pairs (filtered had <2)`);
  }
  
  // Calculate weighted mean
  const weights = filteredPairs.map(p => getBookWeight(p.book));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  if (totalWeight === 0) return null;
  
  const weightedMean = filteredPairs.reduce((sum, p, i) => {
    return sum + p.overProbDevig * weights[i];
  }, 0) / totalWeight;
  
  debugLog(`Weighted consensus: ${weightedMean.toFixed(4)} from ${filteredPairs.length} books`);
  
  return weightedMean;
}

// Convert consensus probability back to American odds
function probToAmerican(prob: number): number {
  if (prob <= 0) return 0;
  if (prob >= 1) return 0;
  if (prob >= 0.5) {
    return -(prob / (1 - prob)) * 100;
  }
  return ((1 - prob) / prob) * 100;
}

// Main function to fetch NBA player props from TheRundown
export async function getNbaPlayerPropsFromTheRundown(): Promise<SgoPlayerPropOdds[]> {
  const apiKey = process.env.THERUNDOWN_API_KEY;
  
  if (!apiKey) {
    console.error("TheRundown API key not found. Set THERUNDOWN_API_KEY environment variable.");
    return [];
  }
  
  debugLog("Fetching NBA player props from TheRundown");
  
  try {
    // Get today's date
    const today = new Date().toISOString().slice(0, 10);
    const url = `${API_BASE}/sports/${NBA_SPORT_ID}/events/${today}?key=${apiKey}`;
    
    console.log(`[TheRundown] Calling: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const bodyText = await response.text();
      debugLog("[TheRundown] HTTP", response.status, response.statusText);
      debugLog("Response body (first 300 chars):", bodyText.slice(0, 300));
      
      if (response.status === 404) {
        console.log(`[TheRundown] 404 = No NBA events for ${today} - may be no games scheduled`);
      } else if (response.status === 429) {
        console.log("TheRundown rate limit exceeded");
        return [];
      }
      
      throw new Error(`TheRundown HTTP ${response.status}: ${response.statusText}`);
    }
    
    const json = await response.json();
    debugLog("JSON parsed successfully");
    
    if (!json.events || !Array.isArray(json.events)) {
      debugLog("No events found in response");
      return [];
    }
    
    debugLog(`Processing ${json.events.length} events`);
    
    const consensusOdds: SgoPlayerPropOdds[] = [];
    let totalPlayerProps = 0;
    let consensusProps = 0;
    
    // Process each event
    for (const event of json.events) {
      if (!event.markets || !Array.isArray(event.markets)) continue;
      
      for (const market of event.markets) {
        // Look for player prop markets (participant-based)
        if (!market.participants || !Array.isArray(market.participants)) continue;
        
        const statCategory = MARKET_TO_STAT[market.name];
        if (!statCategory) continue;
        
        debugLog(`Found player prop market: ${market.name} -> ${statCategory}`);
        
        for (const participant of market.participants) {
          if (participant.type !== "TYPE_PLAYER") continue;
          if (!participant.lines || !Array.isArray(participant.lines)) continue;
          
          totalPlayerProps++;
          
          // Pair over/under odds by book
          const pairs = pairOverUnderByBook(participant.lines);
          
          if (pairs.length < 2) {
            debugLog(`Skipping ${participant.name}: insufficient paired books (${pairs.length})`);
            continue;
          }
          
          // Calculate consensus probability
          const consensusProb = calculateConsensus(pairs);
          
          if (consensusProb === null) {
            debugLog(`Skipping ${participant.name}: no consensus calculated`);
            continue;
          }
          
          consensusProps++;
          
          // Convert consensus back to American odds
          const consensusOverOdds = probToAmerican(consensusProb);
          const consensusUnderOdds = probToAmerican(1 - consensusProb);
          
          // Create SgoPlayerPropOdds-compatible object
          consensusOdds.push({
            sport: "NBA",
            player: participant.name,
            team: null, // TheRundown doesn't provide team in participant data
            opponent: null,
            league: "NBA",
            stat: statCategory,
            line: parseFloat(participant.lines[0]?.value?.replace(/[^0-9.-]/g, '') || "0"),
            overOdds: consensusOverOdds,
            underOdds: consensusUnderOdds,
            book: "consensus", // Indicate this is a consensus price
            eventId: event.event_id,
            marketId: market.market_id?.toString(),
            selectionIdOver: null,
            selectionIdUnder: null,
          });
        }
      }
    }
    
    debugLog(`Total player props found: ${totalPlayerProps}`);
    debugLog(`Props with consensus: ${consensusProps}`);
    debugLog(`Final consensus odds returned: ${consensusOdds.length}`);
    
    return consensusOdds;
    
  } catch (error) {
    debugLog("Fetch error:", error);
    
    if (error instanceof Error) {
      console.error("getNbaPlayerPropsFromTheRundown: Unexpected error:", error.message);
    }
    
    return [];
  }
}
