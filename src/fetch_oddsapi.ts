// src/fetch_oddsapi.ts — The Odds API (the-odds-api.com) REST client.
// Used by fresh_data_run / pipeline. ODDSAPI_KEY from .env.

import axios from "axios";
import "dotenv/config";

const API_KEY = process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY ?? "";
const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "basketball_nba";

/**
 * Fetch NBA odds from The Odds API (game lines: h2h, spreads, totals).
 * For player props use fetch_oddsapi_props.ts (SgoPlayerPropOdds[] for pipeline).
 */
export async function fetchOddsAPI(params?: {
  regions?: string;
  markets?: string;
  oddsFormat?: "american" | "decimal";
}): Promise<unknown> {
  const regions = params?.regions ?? "us";
  const markets = params?.markets ?? "h2h";
  const oddsFormat = params?.oddsFormat ?? "american";
  const url = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
  const resp = await axios.get(url, { timeout: 20000 });
  return resp.data;
}

export { API_KEY as ODDSAPI_KEY, BASE_URL, SPORT };
