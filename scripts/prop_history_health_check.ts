import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV, MLB_PROPS_MASTER_CSV } from "../src/constants/paths";

type HistoryRow = {
  date?: string;
  player?: string;
  prop_type?: string;
  line?: string;
  implied_probability?: string;
  market_line?: string;
  closing_line?: string;
};

async function readCsv<T = any>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      resolve([]);
      return;
    }
    const rows: T[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: any) => rows.push(data as T))
      .on("end", () => resolve(rows))
      .on("error", (err: Error) => reject(err));
  });
}

function healthCheck(label: string, rows: HistoryRow[]): void {
  if (rows.length === 0) {
    console.log(`[PROP_HEALTH] ${label}: no rows; skipping checks.`);
    return;
  }

  console.log(`[PROP_HEALTH] ${label}: running health checks on ${rows.length} rows.`);

  const seenKeys = new Set<string>();
  const byPlayerStat: Record<string, { date: string; clv: number }[]> = {};
  let rowIndex = 1;

  for (const r of rows) {
    const player = (r.player ?? "").trim();
    const prop = (r.prop_type ?? "").trim();
    const lineStr = (r.line ?? "").trim();
    const impliedStr = (r.implied_probability ?? "").trim();

    if (!player) {
      console.warn(`[DATA WARNING] Missing player name in row ${rowIndex}`);
    }

    if (!prop) {
      console.warn(`[DATA WARNING] Missing prop_type in row ${rowIndex}`);
    }

    const lineVal = lineStr ? parseFloat(lineStr) : NaN;
    if (!lineStr || !Number.isFinite(lineVal)) {
      console.warn(`[DATA WARNING] Missing or invalid line in row ${rowIndex}`);
    } else {
      if (lineVal > 60) {
        console.warn(`[DATA WARNING] Extreme line (>60) in row ${rowIndex}: ${lineVal}`);
      }
    }

    if (impliedStr) {
      const p = parseFloat(impliedStr);
      if (!Number.isFinite(p) || p < 0 || p > 1) {
        console.warn(`[DATA WARNING] Invalid implied_probability in row ${rowIndex}: ${impliedStr}`);
      }
    }

    const key = `${player}|${prop}|${lineStr}`;
    if (seenKeys.has(key)) {
      console.warn(`[DATA WARNING] Duplicate prop detected (player/prop/line) near row ${rowIndex}: ${key}`);
    } else {
      seenKeys.add(key);
    }

    // CLV-related checks when closing_line is present
    const marketLine = r.market_line ? parseFloat(String(r.market_line)) : NaN;
    const closingLine = r.closing_line ? parseFloat(String(r.closing_line)) : NaN;
    if (r.market_line && !r.closing_line && Number.isFinite(marketLine)) {
      console.warn(
        `[DATA WARNING] Missing closing_line for ${player} ${prop} line=${lineStr} (row ${rowIndex})`
      );
    }
    if (Number.isFinite(marketLine) && Number.isFinite(closingLine)) {
      const clv = closingLine - marketLine;
      if (Math.abs(clv) > 5) {
        console.warn(
          `[DATA WARNING] Extreme CLV (>|5|) for ${player} ${prop} line=${lineStr}: ${clv.toFixed(
            2
          )}`
        );
      }
      const d = (r.date ?? "").trim();
      const bucketKey = `${player}|${prop}`;
      if (!byPlayerStat[bucketKey]) byPlayerStat[bucketKey] = [];
      byPlayerStat[bucketKey].push({ date: d, clv });
    }

    rowIndex++;
  }

  // Negative CLV streak detection (3+ consecutive negatives by date)
  for (const [key, entries] of Object.entries(byPlayerStat)) {
    const sorted = entries
      .filter((e) => e.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    let streak = 0;
    for (const e of sorted) {
      if (e.clv < 0) {
        streak++;
        if (streak >= 3) {
          console.warn(
            `[DATA WARNING] Negative CLV streak (${streak}) for ${key} — recent CLV=${e.clv.toFixed(
              2
            )}`
          );
          break;
        }
      } else {
        streak = 0;
      }
    }
  }
}

async function main(): Promise<void> {
  const nbaPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const mlbPath = getDataPath(MLB_PROPS_MASTER_CSV);

  const nbaRows = await readCsv<HistoryRow>(nbaPath);
  const mlbRows = await readCsv<HistoryRow>(mlbPath);

  healthCheck("NBA", nbaRows);
  healthCheck("MLB", mlbRows);
}

main().catch((err) => {
  console.error("[PROP_HEALTH] Health check failed:", err);
  process.exitCode = 0;
});

