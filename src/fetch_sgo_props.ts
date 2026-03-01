// src/fetch_sgo_props.ts

import "dotenv/config";
import fetch from "node-fetch";

export interface SgoProp {
  player: string;
  stat: "points" | "rebounds" | "assists";
  line: number;
  overOdds: number;   // American
  underOdds: number;  // American
  book: string;
}

const SGO_API_KEY = process.env.SGO_API_KEY;
if (!SGO_API_KEY) {
  throw new Error("Missing SGO_API_KEY in .env");
}

// Adjust base URL if docs specify a different host or version path
const BASE_URL = "https://api.sportsgameodds.com/v2";

/**
 * Fetch NBA player points/rebounds/assists odds from SportsGameOdds.
 * This is a first pass; oddID / field names may need tweaking after inspecting real JSON.
 */
export async function fetchSgoProps(): Promise<SgoProp[]> {
  const params = new URLSearchParams({
    leagueID: "NBA",
    oddsAvailable: "true",
    // NOTE: This assumes simple keys; adapt to the exact oddID values from the docs/Data Explorer.
    // You may need something like: points-NBA-player-game-ou-over, etc.
    oddID: [
      "player_points",
      "player_rebounds",
      "player_assists",
    ].join(","),
    oddsFormat: "american",
  });

  const url = `${BASE_URL}/events?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "x-api-key": SGO_API_KEY as string,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SportsGameOdds error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as any;
  const data = json.data ?? json;

  const results: SgoProp[] = [];

  // The following assumes a plausible schema; you will refine once you see actual data
  for (const event of data) {
    const odds = event.odds ?? event.markets ?? [];
    for (const market of odds) {
      const oddID = (market.oddID || market.id || "") as string;

      let stat: SgoProp["stat"] | null = null;
      if (oddID.includes("points")) stat = "points";
      else if (oddID.includes("rebounds")) stat = "rebounds";
      else if (oddID.includes("assists")) stat = "assists";

      if (!stat) continue;

      const lines = market.lines ?? market.outcomes ?? [];
      for (const lineObj of lines) {
        const player =
          (lineObj.playerName ||
            lineObj.player ||
            lineObj.participantName) as string | undefined;
        const line = (lineObj.line ||
          lineObj.points ||
          lineObj.total) as number | undefined;

        const overOdds = (lineObj.overAmerican ||
          lineObj.overOdds ||
          lineObj.over) as number | undefined;
        const underOdds = (lineObj.underAmerican ||
          lineObj.underOdds ||
          lineObj.under) as number | undefined;

        const book =
          (lineObj.bookmaker || lineObj.book || lineObj.source) as
            | string
            | undefined;

        if (!player || line == null || overOdds == null || underOdds == null || !book) {
          continue;
        }

        results.push({
          player,
          stat,
          line,
          overOdds,
          underOdds,
          book,
        });
      }
    }
  }

  return results;
}
