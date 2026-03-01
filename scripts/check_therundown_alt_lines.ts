#!/usr/bin/env npx ts-node
/**
 * One-off: call TheRundown v2 events API and log whether alt lines are
 * returned for player props (participant.lines.length and is_main_line).
 * Run: npx ts-node scripts/check_therundown_alt_lines.ts
 */
import "dotenv/config";
import fetch from "node-fetch";

const API_BASE = "https://therundown.io/api/v2";
const NBA_SPORT_ID = 4;
const MARKET_IDS = "29,35,38,39"; // Points, Rebounds, 3PT, Assists
const AFFILIATE_IDS = "19,23"; // FanDuel, DraftKings

async function main() {
  const apiKey = process.env.THERUNDOWN_API_KEY;
  if (!apiKey) {
    console.error("Missing THERUNDOWN_API_KEY in .env");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const url = `${API_BASE}/sports/${NBA_SPORT_ID}/events/${today}?key=${encodeURIComponent(apiKey)}&market_ids=${MARKET_IDS}&affiliate_ids=${AFFILIATE_IDS}&offset=300`;
  console.log("Request (default main_line=false → include alts):");
  console.log(url);
  console.log("");

  const res = await fetch(url);
  if (!res.ok) {
    console.error("HTTP", res.status, res.statusText);
    console.error(await res.text());
    process.exit(1);
  }

  const data = (await res.json()) as { events?: any[] };
  const events = data.events ?? [];
  console.log(`Events returned: ${events.length}`);

  if (events.length === 0) {
    console.log("No events for today — try a date with games or check plan.");
    return;
  }

  let participantsChecked = 0;
  const maxParticipants = 8;

  for (const event of events) {
    const markets = event.markets ?? [];
    const propMarkets = markets.filter((m: any) => [29, 35, 38, 39].includes(m.market_id));
    if (propMarkets.length === 0) continue;

    const teams = event.teams ?? [];
    const home = teams.find((t: any) => t.is_home)?.name ?? "?";
    const away = teams.find((t: any) => t.is_away)?.name ?? "?";
    console.log(`\n--- ${away} @ ${home} ---`);

    for (const market of propMarkets) {
      const participants = market.participants ?? [];
      const marketName = market.name ?? `market_${market.market_id}`;
      console.log(`\n  Market: ${marketName} (id=${market.market_id}), participants=${participants.length}`);

      for (const participant of participants) {
        if (participantsChecked >= maxParticipants) break;
        const lines = participant.lines ?? [];
        const name = (participant.name ?? "").replace(/ (Over|Under)$/, "");
        const type = participant.type ?? "";

        // For each line, get is_main_line from first affiliate's price
        const lineDetails = lines.map((line: any) => {
          const prices = line.prices ?? {};
          const firstAff = Object.keys(prices)[0];
          const priceObj = firstAff ? prices[firstAff] : null;
          const isMain = priceObj && typeof priceObj === "object" ? (priceObj as any).is_main_line : null;
          return { value: line.value, is_main_line: isMain };
        });

        const mainCount = lineDetails.filter((d: any) => d.is_main_line === true).length;
        const altCount = lineDetails.filter((d: any) => d.is_main_line === false).length;

        console.log(`    ${name} (${type}): lines=${lines.length} (main=${mainCount}, alt=${altCount})`);
        if (lines.length <= 5) {
          lineDetails.forEach((d: any) => console.log(`      value=${d.value} is_main_line=${d.is_main_line}`));
        } else {
          lineDetails.slice(0, 3).forEach((d: any) => console.log(`      value=${d.value} is_main_line=${d.is_main_line}`));
          console.log(`      ... and ${lines.length - 3} more`);
        }
        participantsChecked++;
      }
      if (participantsChecked >= maxParticipants) break;
    }
    if (participantsChecked >= maxParticipants) break;
  }

  console.log("\nDone. If you see lines > 1 and is_main_line=false for some entries, your account gets alt lines.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
