/**
 * Run one live Odds API fetch (forceRefresh) and report quota usage.
 * Usage: npx ts-node scripts/run_odds_quota_report.ts
 * Requires ODDSAPI_KEY in .env. Writes data/odds_cache.json after fetch.
 */

import "../src/load_env";
import fs from "fs";
import path from "path";
import { fetchOddsAPIProps } from "../src/fetch_oddsapi_props";

const DATA_DIR = path.join(process.cwd(), "data");
const ODDS_CACHE_PATH = path.join(DATA_DIR, "odds_cache.json");

function readRemaining(): number | null {
  try {
    if (!fs.existsSync(ODDS_CACHE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(ODDS_CACHE_PATH, "utf8"));
    const r = Number(raw.remaining);
    return Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const before = readRemaining();
  console.log("[QUOTA-REPORT] Before run: remaining =", before ?? "unknown (no cache)");

  const rows = await fetchOddsAPIProps({
    sport: "basketball_nba",
    forceRefresh: true,
  });

  const after = readRemaining();
  const delta = before != null && after != null ? before - after : null;

  const books = new Set(rows.map((r) => r.book));
  const hasPP = books.has("PrizePicks") || books.has("prizepicks");
  const hasUD = books.has("Underdog") || books.has("underdog");

  console.log("\n[QUOTA-REPORT] Summary:");
  console.log("  remaining before run (from last cache):", before ?? "N/A");
  console.log("  remaining after run:", after ?? "N/A");
  console.log("  Delta (requests consumed this run):", delta != null ? delta : "N/A (run again after cache exists for delta)");
  console.log("  #legs:", rows.length);
  console.log("  PrizePicks in response:", hasPP ? "YES" : "NO");
  console.log("  Underdog in response:", hasUD ? "YES" : "NO");
  console.log("  Books seen:", [...books].sort().join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
