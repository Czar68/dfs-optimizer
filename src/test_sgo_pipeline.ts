// src/test_sgo_pipeline.ts

import { fetchSgoPlayerPropOdds } from "./fetch_sgo_odds";
import { mergeOddsWithProps } from "./merge_odds";
import { RawPick } from "./types";

// TODO: replace this with a real fetch from your PrizePicks/UD pipeline.
// For now, hard‑code a couple of example picks just to validate wiring.
const dummyPicks: RawPick[] = [
  {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "LeBron James",
    team: null,
    opponent: null,
    stat: "points",
    line: 25.5,
    projectionId: "dummy-nba-1",
    gameId: null,
    startTime: null,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
  },
  {
    sport: "NFL",
    site: "prizepicks",
    league: "NFL",
    player: "Patrick Mahomes",
    team: null,
    opponent: null,
    stat: "pass_yards",
    line: 285.5,
    projectionId: "dummy-nfl-1",
    gameId: null,
    startTime: null,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
  },
];

async function main() {
  console.log("=== Fetching SGO player props (NBA + NFL) ===");
  const sgoMarkets = await fetchSgoPlayerPropOdds();
  console.log("Total SGO markets:", sgoMarkets.length);

  // Show a small sample by league/stat
  const sample = sgoMarkets.slice(0, 10).map((m) => ({
    league: m.league,
    player: m.player,
    stat: m.stat,
    line: m.line,
    overOdds: m.overOdds,
    underOdds: m.underOdds,
  }));
  console.log("Sample SGO markets:", sample);

  console.log("\n=== Merging dummy picks with SGO ===");
  const merged = await mergeOddsWithProps(dummyPicks);
  console.log("Merged picks count:", merged.length);
  console.dir(merged, { depth: null });
}

main().catch((err) => {
  console.error("test_sgo_pipeline error:", err);
  process.exit(1);
});
