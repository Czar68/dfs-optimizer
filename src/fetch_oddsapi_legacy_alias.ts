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
  // Delegate to the updated OddsProvider which now supports multiple sports
  const { getPlayerPropOdds } = await import("./odds/OddsProvider");
  const result = await getPlayerPropOdds(sports, { forceRefresh: opts.forceRefresh });
  return result.odds;
}
