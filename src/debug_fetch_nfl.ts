// src/debug_fetch_nfl.ts

import fetch from "node-fetch";
import fs from "fs";

const PRIZEPICKS_PROJECTIONS_BASE_URL = "https://api.prizepicks.com/projections";

// NFL league id = 9
const NFL_LEAGUE_ID = 9;

// Loosen filters for debugging: drop single_stat/in_game/game_mode
const NFL_QUERY = `league_id=${NFL_LEAGUE_ID}&per_page=250&state_code=KY`;

async function main() {
  const url = `${PRIZEPICKS_PROJECTIONS_BASE_URL}?${NFL_QUERY}`;
  console.log("Debug NFL fetch URL:", url);

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        origin: "https://app.prizepicks.com",
        referer: "https://app.prizepicks.com/",
        "sec-ch-ua":
          '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
        "x-device-id": "fdd10fa5-892f-4c4d-b140-d5e8cead14ba",
        "x-device-info":
          "anonymousId=,name=,os=windows,osVersion=Windows NT 10.0; Win64; x64,platform=web,appVersion=,gameMode=prizepools,stateCode=KY,fbp=fb.1.1768940483859.648114649408665373",
      },
    });

    console.log("HTTP status:", res.status);
    if (!res.ok) {
      console.error("NFL fetch failed with status", res.status);
      return;
    }

    const json = await res.json();
    fs.writeFileSync(
      "pp_nfl_projections_sample.json",
      JSON.stringify(json, null, 2),
      "utf8"
    );
    console.log(
      "Wrote pp_nfl_projections_sample.json to project root with NFL projections payload"
    );
  } catch (err) {
    console.error("Error fetching NFL projections:", err);
  }
}

main().catch((err) => {
  console.error("Unhandled error in debug_fetch_nfl:", err);
});
