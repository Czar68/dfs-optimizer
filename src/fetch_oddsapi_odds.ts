// src/fetch_oddsapi_odds.ts — Unified Odds API only (legacy alias for OddsProvider)

import { fetchOddsAPIProps, DEFAULT_MARKETS } from "./fetch_oddsapi_props";
import type { SgoPlayerPropOdds, Sport } from "./types";

export { DEFAULT_MARKETS };

/**
 * Legacy alias: same signature for merge_odds, report_single_bet_ev, tests.
 * Single source: The Odds API (fetchOddsAPIProps).
 */
export async function fetchSgoPlayerPropOdds(
  sports: Sport[] = ["NBA"],
  opts: { forceRefresh?: boolean } = {}
): Promise<SgoPlayerPropOdds[]> {
  if (!sports.includes("NBA")) {
    console.log("[OddsAPI] Only NBA supported; requested:", sports.join(", "));
    return [];
  }
  return fetchOddsAPIProps({
    apiKey: process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY,
    sport: "basketball_nba",
    markets: DEFAULT_MARKETS,
    forceRefresh: opts.forceRefresh ?? false,
  });
}
