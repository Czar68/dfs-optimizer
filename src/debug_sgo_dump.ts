/* eslint-disable no-console */
import SportsGameOdds from "sports-odds-api";

const client = new SportsGameOdds({
  apiKeyHeader: process.env.SPORTS_ODDS_API_KEY_HEADER!,
});

async function run() {
  const nbaPage = await client.events.get({
    leagueID: "NBA",
    oddsAvailable: true,
    includeOpposingOdds: true,
    limit: 1,
  });

  console.log(
    JSON.stringify(
      nbaPage.data?.map((event: any) => ({
        eventID: event.eventID,
        teams: event.teams,
        sampleOdds: Object.values(event.odds ?? {}).slice(0, 3),
      })),
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
