// src/fetchTheRundownLegs.ts
// Harvest TheRundown NBA props as a third leg source (--providers PP,UD,TRD).
// Writes therundown-legs.csv, appends quota_log, records provider-usage.

import fs from "fs";
import path from "path";
import { getPlayerPropsFromTheRundown } from "./odds/sources/therundownProps";
import { americanToProb } from "./odds_math";
import { oddsCache } from "./odds_cache";

const QUOTA_LOG_PATH = path.join(process.cwd(), "quota_log.txt");
const TRD_LEGS_CSV = "therundown-legs.csv";

const LEGS_HEADER = [
  "Sport",
  "id",
  "player",
  "team",
  "stat",
  "line",
  "league",
  "book",
  "overOdds",
  "underOdds",
  "trueProb",
  "edge",
  "legEv",
  "runTimestamp",
  "gameTime",
  "IsWithin24h",
  "IsNonStandardOdds",
];

function escapeCsv(val: string | number): string {
  const s = String(val ?? "");
  return s.includes(",") ? s.replace(/,/g, ";") : s;
}

export interface TrdHarvestResult {
  raw: number;
  merged: number;
  legs: number;
}

/**
 * Fetch TheRundown NBA props, write therundown-legs.csv (merge format like PP/UD),
 * append TRD HARVEST to quota_log, record usage in provider-usage.json.
 * Log: "TRD: X raw → Y merged → Z legs".
 */
export async function harvestTheRundownLegs(): Promise<TrdHarvestResult> {
  const raw = await getPlayerPropsFromTheRundown(["NBA"]);
  const runTimestamp = new Date().toISOString();

  const rows: string[][] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const overProb = americanToProb(r.overOdds);
    const underProb = americanToProb(r.underOdds);
    const total = overProb + underProb;
    const trueProb = total > 0 ? overProb / total : 0.5;
    const id = `trd-${i + 1}-${r.player.replace(/\s+/g, "_")}-${r.stat}-${r.line}`;
    rows.push([
      escapeCsv(r.sport),
      escapeCsv(id),
      escapeCsv(r.player),
      escapeCsv(r.team ?? ""),
      escapeCsv(r.stat),
      escapeCsv(r.line),
      escapeCsv(r.league),
      escapeCsv(r.book),
      escapeCsv(r.overOdds),
      escapeCsv(r.underOdds),
      escapeCsv(trueProb.toFixed(6)),
      "0",
      "0",
      escapeCsv(runTimestamp),
      "",
      "TRUE",
      "FALSE",
    ]);
  }

  const legs = rows.length;
  if (legs > 0) {
    const csvPath = path.join(process.cwd(), TRD_LEGS_CSV);
    const lines = [LEGS_HEADER.join(","), ...rows.map((row) => row.join(","))];
    fs.writeFileSync(csvPath, lines.join("\n"), "utf8");

    try {
      fs.appendFileSync(
        QUOTA_LOG_PATH,
        `${runTimestamp} | TRD HARVEST: ${legs} rows\n`,
        "utf8"
      );
      console.log(`[TRD] Quota entry appended → quota_log.txt`);
    } catch {
      /* non-fatal */
    }

    oddsCache.recordTheRundownUsage(legs);
  }

  console.log(`TRD: ${raw.length} raw → ${legs} merged → ${legs} legs`);
  return { raw: raw.length, merged: legs, legs };
}
