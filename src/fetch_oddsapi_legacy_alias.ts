// src/fetch_oddsapi_legacy_alias.ts — Odds API legacy alias wrapper (Phase 17W canonical name)

import { fetchOddsAPIProps, DEFAULT_MARKETS } from "./fetch_oddsapi_props";
import type { InternalPlayerPropOdds, Sport } from "./types";

export { DEFAULT_MARKETS };

/**
 * Legacy alias: same signature for merge_odds, report_single_bet_ev, tests.
 * Single source: The Odds API (fetchOddsAPIProps).
 */
export async function fetchSgoPlayerPropOdds(
  sports: Sport[] = ["NBA"],
  opts: { forceRefresh?: boolean } = {}
): Promise<InternalPlayerPropOdds[]> {
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
