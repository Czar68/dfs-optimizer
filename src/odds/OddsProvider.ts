/**
 * src/odds/OddsProvider.ts
 * Single unified odds source: The Odds API only.
 * Data contract: all odds data is normalized to InternalPropOdds (SgoPlayerPropOdds).
 * Robust error handling, rate-limit monitoring, no redundant fetchers.
 */

import "dotenv/config";
import type { SgoPlayerPropOdds, Sport } from "../types";
import { fetchOddsAPIProps, DEFAULT_MARKETS } from "../fetch_oddsapi_props";

export type { SgoPlayerPropOdds };

/** Data contract: internal format for all consumer code. */
export type InternalPropOdds = SgoPlayerPropOdds;

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

  if (!sports.includes("NBA")) {
    console.log("[OddsProvider] Only NBA supported; requested:", sports.join(", "));
    return {
      odds: [],
      source: "OddsAPI",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const odds = await fetchOddsAPIProps({
      apiKey,
      sport: options.sport ?? "basketball_nba",
      markets: DEFAULT_MARKETS,
      forceRefresh: options.forceRefresh ?? false,
    });

    return {
      odds,
      source: "OddsAPI",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[OddsProvider] Fetch failed:", message);
    return {
      odds: [],
      source: "OddsAPI",
      fetchedAt: new Date().toISOString(),
      error: message,
    };
  }
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
