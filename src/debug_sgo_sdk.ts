// src/debug_sgo_sdk.ts

import "dotenv/config";
import SportsGameOdds from "sports-odds-api";

async function main() {
  const apiKey = process.env.SGO_API_KEY;

  if (!apiKey) {
    throw new Error("Missing SGO_API_KEY in environment (SGO_API_KEY)");
  }

  const client = new SportsGameOdds({
    apiKeyParam: apiKey,
  });

  // Fetch NBA events with odds
  const page = await client.events.get({
    leagueID: "NBA",
    oddsAvailable: true,
    finalized: false,
    limit: 5,
  });

  console.log("Events returned:", page.data.length);

  if (!page.data.length) {
    console.log("No NBA events with odds found");
    return;
  }

  const event = page.data[0];

  console.log("Event leagueID:", event.leagueID);
  console.log("Event teams raw names:", {
    home: event.teams?.home?.names,
    away: event.teams?.away?.names,
  });

  const odds = event.odds as Record<string, unknown> | undefined;

  if (!odds) {
    console.log("Event has no odds object");
    return;
  }

  const oddEntries = Object.entries(odds);
  console.log("Total odds markets on event:", oddEntries.length);

  // NEW: log distinct statIDs on this event so we can see all supported stats
  const statIDs = new Set<string>();
  for (const [, odd] of oddEntries) {
    const o = odd as any;
    if (o.statID) statIDs.add(String(o.statID));
  }
  console.log("Distinct statIDs on this event:", Array.from(statIDs));

  // Existing sample: player points full-game O/U markets
  const playerOu = oddEntries
    .filter(
      ([oddID]) =>
        oddID.startsWith("points-") &&
        oddID.includes("-game-ou-") &&
        !oddID.includes("-all-") && // exclude team/total markets
        !oddID.includes("-home-") &&
        !oddID.includes("-away-")
    )
    .slice(0, 20)
    .map(([oddID, odd]) => {
      const o = odd as any;
      return {
        oddID,
        betTypeID: o.betTypeID,
        statID: o.statID,
        statEntityID: o.statEntityID,
        periodID: o.periodID,
        sideID: o.sideID,
        line: o.line,
        price: o.price,
        odds: o.odds,
        closeOdds: o.closeOdds,
        sportsbookID: o.sportsbookID,
      };
    });

  console.log("Sample player points O/U odds:", playerOu);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("debug_sgo_sdk failed", err);
  process.exit(1);
});
