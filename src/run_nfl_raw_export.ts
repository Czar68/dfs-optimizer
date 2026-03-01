// src/run_nfl_raw_export.ts

/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fetchPrizePicksRawProps } from "./fetch_props";
import { RawPick } from "./types";

function writeNflRawCsv(picks: RawPick[], outPath: string): void {
  const headers = [
    "player",
    "team",
    "opponent",
    "stat",
    "line",
    "league",
    "startTime",
    "isDemon",
    "isGoblin",
    "isPromo",
  ];

  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const p of picks) {
    const row = [
      p.player,
      p.team ?? "",
      p.opponent ?? "",
      p.stat,
      p.line,
      p.league,
      p.startTime ?? "",
      p.isDemon,
      p.isGoblin,
      p.isPromo,
    ].map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") ? s.replace(/,/g, ";") : s;
    });

    lines.push(row.join(","));
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

async function run(): Promise<void> {
  console.log("run_nfl_raw_export: fetching PrizePicks NBA+NFL props...");
  const allPicks = await fetchPrizePicksRawProps();

  const nflPicks = allPicks.filter((p) => p.league === "NFL");
  console.log(
    `run_nfl_raw_export: got ${allPicks.length} total picks, ${nflPicks.length} NFL picks`
  );

  const outPath = path.join(process.cwd(), "prizepicks-nfl-raw.csv");
  writeNflRawCsv(nflPicks, outPath);
  console.log(`run_nfl_raw_export: wrote ${nflPicks.length} rows to ${outPath}`);
}

run().catch((err) => {
  console.error("run_nfl_raw_export failed:", err);
  process.exit(1);
});
