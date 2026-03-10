#!/usr/bin/env node
/**
 * Run: npx ts-node src/fetchOddsApi.ts
 * Live Odds API fetch (event-level only). Writes data/oddsapi_today.json + cache/oddsapi_props_cache.json.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  fetchNbaProps,
  probeLiveNbaOdds,
  type OddsLeg,
} from "./oddsapi";
import type { SgoPlayerPropOdds, StatCategory } from "./types";

const CACHE_DIR = path.join(process.cwd(), "cache");
const PROPS_CACHE_FILE = path.join(CACHE_DIR, "oddsapi_props_cache.json");

function oddsLegToSgo(leg: OddsLeg): SgoPlayerPropOdds {
  return {
    sport: "NBA",
    league: "NBA",
    player: leg.player,
    team: null,
    opponent: null,
    stat: leg.stat as StatCategory,
    line: leg.line,
    overOdds: leg.overPrice,
    underOdds: leg.underPrice,
    book: leg.bookmaker,
    eventId: leg.eventId ?? null,
    marketId: null,
    selectionIdOver: null,
    selectionIdUnder: null,
    isMainLine: true,
  };
}

function writePropsCache(legs: OddsLeg[]): void {
  const data: SgoPlayerPropOdds[] = legs.map(oddsLegToSgo);
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      PROPS_CACHE_FILE,
      JSON.stringify({ fetchedAt: Date.now(), data }, null, 2),
      "utf8"
    );
    console.log(`[fetchOddsApi] Wrote ${data.length} props -> ${PROPS_CACHE_FILE}`);
  } catch (e) {
    console.warn("[fetchOddsApi] Cache write failed:", (e as Error).message);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ODDSAPI_KEY ?? process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.error("ERROR: Set ODDSAPI_KEY in .env");
    process.exit(1);
  }

  console.log("=== Odds API live probe (NBA) ===\n");

  try {
    const probe = await probeLiveNbaOdds(apiKey);
    console.log(`# games: ${probe.games}`);
    console.log(`# bookmakers: ${probe.bookmakers.length} → ${probe.bookmakers.join(", ")}`);
    console.log(`# unique props (sample): ${probe.uniqueProps}`);
    console.log("Sample (top 20):");
    probe.sampleProps.slice(0, 20).forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  } catch (e) {
    console.warn("Probe failed (continuing):", (e as Error).message);
  }

  console.log("\n=== Fetch all player_* (event-level) → OddsLeg[] ===\n");

  const legs = await fetchNbaProps({ apiKey, forceRefresh: true });
  const players = new Set(legs.map((l) => l.player));
  const top = legs[0];
  const topStr = top ? `${top.player} ${top.stat} O${top.line} @${top.overPrice} ${top.bookmaker}` : "n/a";
  console.log(`#legs=${legs.length}, #players=${players.size}, top: ${topStr}`);

  const byBook = legs.reduce((acc, l) => {
    acc[l.bookmaker] = (acc[l.bookmaker] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const booksTable = Object.entries(byBook)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");
  console.log(`Books: ${booksTable}`);
  console.log(`Total legs: ${legs.length}`);

  const byStat = legs.reduce((acc, l) => {
    acc[l.stat] = (acc[l.stat] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("By stat:", byStat);
  console.log(`Unique players: ${players.size}`);
  console.log("\nTop 20 legs:");
  legs.slice(0, 20).forEach((l, i) => {
    console.log(
      `  ${i + 1}. ${l.player} ${l.stat} ${l.line} O${l.overPrice.toFixed(2)} U${l.underPrice.toFixed(2)} ${l.bookmaker}`
    );
  });

  writePropsCache(legs);

  if (legs.length < 100) {
    console.error(`\nFAIL: Expected 500+ legs, got ${legs.length}. Check ODDSAPI_KEY and quota.`);
    process.exit(1);
  }
  console.log(`\nOK: ${legs.length} legs (live). Run fresh_data_run.ps1 for full pipeline.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
