/**
 * src/odds/OddsProvider.ts
 * Single unified odds source: The Odds API only.
 * Data contract: all odds data is normalized to InternalPropOdds.
 * Robust error handling, rate-limit monitoring, no redundant fetchers.
 */

import "dotenv/config";
import type { InternalPlayerPropOdds, Sport } from "../types";
import { fetchOddsAPIProps, DEFAULT_MARKETS } from "../fetch_oddsapi_props";

export type { InternalPlayerPropOdds };

/** Data contract: internal format for all consumer code. */
export type InternalPropOdds = InternalPlayerPropOdds;

export interface OddsProviderOptions {
  apiKey?: string;
  sport?: string;
  forceRefresh?: boolean;
}

export interface OddsProviderResult {
  odds: InternalPropOdds[];
  source: "OddsAPI";
  fetchedAt: string;
  rateLimitRemaining?: number;
  error?: string;
}

const RATE_LIMIT_HEADER = "x-requests-remaining";

/**
 * Fetch player prop odds from The Odds API only.
 * Converts API response to InternalPropOdds[] (data contract).
 */
export async function getPlayerPropOdds(
  sports: Sport[] = ["NBA"],
  options: OddsProviderOptions = {}
): Promise<OddsProviderResult> {
  const apiKey =
    options.apiKey ??
    process.env.ODDSAPI_KEY ??
    process.env.ODDS_API_KEY ??
    "";

  if (!apiKey) {
    console.warn("[OddsProvider] Missing ODDSAPI_KEY or ODDS_API_KEY");
    return {
      odds: [],
      source: "OddsAPI",
      fetchedAt: new Date().toISOString(),
      error: "Missing API key",
    };
  }

  // Map sports to API sport names
  const sportToApiMap: Record<Sport, string> = {
    'NBA': 'basketball_nba',
    'NFL': 'american_football_nfl',
    'NHL': 'ice_hockey_nhl',
    'MLB': 'baseball_mlb',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'american_football_ncaaf',
  };

  // Support multiple sports by fetching them one by one
  const allOdds: InternalPropOdds[] = [];
  const errors: string[] = [];

  for (const sport of sports) {
    const apiSport = sportToApiMap[sport];
    if (!apiSport) {
      console.warn(`[OddsProvider] Sport ${sport} not supported by Odds API`);
      continue;
    }

    try {
      const sportOdds = await fetchOddsAPIProps({
        apiKey,
        sport: apiSport,
        markets: DEFAULT_MARKETS,
        forceRefresh: options.forceRefresh ?? false,
      });
      allOdds.push(...sportOdds);
    } catch (error) {
      const errorMsg = `Failed to fetch ${sport} odds: ${(error as Error).message}`;
      console.warn(`[OddsProvider] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    odds: allOdds,
    source: "OddsAPI",
    fetchedAt: new Date().toISOString(),
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

/** Legacy alias for merge_odds compatibility. Same as getPlayerPropOdds(...).odds. */
export async function fetchPlayerPropOdds(
  sports: Sport[] = ["NBA"],
  opts: { forceRefresh?: boolean } = {}
): Promise<InternalPropOdds[]> {
  const result = await getPlayerPropOdds(sports, {
    forceRefresh: opts.forceRefresh,
  });
  return result.odds;
}
