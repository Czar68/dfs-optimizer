// src/fetch_oddsapi_odds.ts — Thin wrapper: same SgoPlayerPropOdds[] API (no SGO).
// Canonical odds: fetch_oddsapi_props.ts. run_optimizer uses fetchOddsAPIProps directly.

import { fetchOddsAPIProps, DEFAULT_MARKETS } from "./fetch_oddsapi_props";
import type { SgoPlayerPropOdds, Sport } from "./types";

/**
 * Drop-in signature for merge_odds, report_single_bet_ev, tests.
 * Delegates to fetchOddsAPIProps (full Odds API props, no SGO).
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

/** Test helper: requireAltLines / alt-line guard. */
export function _throwIfNoAlts(
  altLineCount: number,
  leagueID: string,
  _harvestParams: unknown,
  mainLineCount: number,
  totalRows: number
): void {
  const { cliArgs } = require("./cli_args") as {
    cliArgs: { includeAltLines?: boolean; requireAltLines?: boolean };
  };
  if (!cliArgs.includeAltLines || altLineCount > 0) return;
  const msg = `[OddsAPI] 0 alt lines for ${leagueID}. mainLines=${mainLineCount} totalRows=${totalRows}`;
  if (cliArgs.requireAltLines && leagueID === "NBA") {
    throw new Error(
      `REQUIRE_ALT_LINES FAILED — aborting run.\n${msg}\nUse --no-require-alt-lines to downgrade to a warning.`
    );
  }
  console.warn(`[OddsAPI] WARNING: ${msg}`);
}
