import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";

type HistoryRow = {
  date?: string;
  player?: string;
  prop_type?: string;
  market_line?: string;
  closing_line?: string;
  line_movement?: string;
  snapshot_time?: string;
  game_id?: string;
};

type ResultRow = {
  date?: string;
  player?: string;
  stat_type?: string;
  line?: string;
  actual_stat?: string;
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

function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseSnapshotDateTime(date: string, snapshotTime: string): Date | null {
  if (!date || !snapshotTime) return null;
  // date: YYYY-MM-DD, snapshot_time: HH:MM (local / ET)
  const iso = `${date}T${snapshotTime}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function parseGameTimeFromGameId(gameId: string): Date | null {
  // game_id format: TEAM1_TEAM2_YYYYMMDD (no explicit time). Assume 19:00 local as a neutral default.
  const m = gameId.match(/_(\d{8})$/);
  if (!m) return null;
  const y = m[1].slice(0, 4);
  const mo = m[1].slice(4, 6);
  const d = m[1].slice(6, 8);
  const iso = `${y}-${mo}-${d}T19:00:00`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

async function main(): Promise<void> {
  const nbaHistoryPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const modelsDir = getDataPath("models");
  const movementOutPath = path.join(modelsDir, "line_movement_dataset.csv");
  const perfOutPath = path.join(modelsDir, "move_performance.csv");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const history = await readCsv<HistoryRow>(nbaHistoryPath);
  const results = await readCsv<ResultRow>(nbaResultsPath);

  if (history.length === 0) {
    console.log("[LINE_MOVE] No history rows; writing empty datasets.");
    fs.writeFileSync(
      movementOutPath,
      "date,player,stat_type,market_line,closing_line,line_movement,snapshot_time,hours_before_game,move_type\n",
      "utf8"
    );
    fs.writeFileSync(
      perfOutPath,
      "player,stat_type,move_type,samples,hit_rate,avg_margin\n",
      "utf8"
    );
    return;
  }

  // Build result lookup: date + player + stat_type + line
  const resultMap = new Map<string, { hit: number; margin: number }>();
  for (const r of results) {
    const date = (r.date ?? "").trim();
    const player = (r.player ?? "").trim();
    const stat = (r.stat_type ?? "").trim();
    const lineStr = (r.line ?? "").trim();
    const actual = parseNumber(r.actual_stat ?? "");
    const lineVal = parseNumber(lineStr);
    if (!date || !player || !stat || !lineStr || actual == null || lineVal == null) continue;
    const key = `${date}|${player}|${stat}|${lineStr}`;
    const margin = actual - lineVal;
    const hit = actual > lineVal ? 1 : 0;
    resultMap.set(key, { hit, margin });
  }

  const movementLines: string[] = [
    "date,player,stat_type,market_line,closing_line,line_movement,snapshot_time,hours_before_game,move_type",
  ];

  const perfBuckets = new Map<
    string,
    { samples: number; hits: number; marginSum: number }
  >();

  for (const h of history) {
    const date = (h.date ?? "").trim();
    const player = (h.player ?? "").trim();
    const stat = (h.prop_type ?? "").trim();
    const marketLine = parseNumber(h.market_line ?? h.line ?? "");
    const closingLine = parseNumber(h.closing_line ?? "");
    const movement = parseNumber(h.line_movement ?? "");
    const snapshotTime = (h.snapshot_time ?? "").trim();
    const gameId = (h.game_id ?? "").trim();

    if (!date || !player || !stat || marketLine == null || closingLine == null || movement == null) {
      continue;
    }

    // Compute hours_before_game
    const snapDt = parseSnapshotDateTime(date, snapshotTime);
    const gameDt = parseGameTimeFromGameId(gameId);
    let hoursBeforeGame = 0;
    if (snapDt && gameDt) {
      const diffMs = gameDt.getTime() - snapDt.getTime();
      hoursBeforeGame = diffMs / (1000 * 60 * 60);
    }

    const absMove = Math.abs(movement);
    let moveType: "early_sharp" | "late_public" | "minor" = "minor";
    if (absMove >= 0.5 && hoursBeforeGame > 4) {
      moveType = "early_sharp";
    } else if (absMove >= 0.5 && hoursBeforeGame <= 4) {
      moveType = "late_public";
    }

    movementLines.push(
      [
        date,
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        marketLine.toString(),
        closingLine.toString(),
        movement.toString(),
        snapshotTime,
        hoursBeforeGame.toFixed(3),
        moveType,
      ].join(",")
    );

    // Aggregate performance if we have results
    const keyRes = `${date}|${player}|${stat}|${marketLine}`;
    const res = resultMap.get(keyRes);
    if (res) {
      const bucketKey = `${player}|${stat}|${moveType}`;
      if (!perfBuckets.has(bucketKey)) {
        perfBuckets.set(bucketKey, { samples: 0, hits: 0, marginSum: 0 });
      }
      const b = perfBuckets.get(bucketKey)!;
      b.samples++;
      b.hits += res.hit;
      b.marginSum += res.margin;
    }
  }

  fs.writeFileSync(movementOutPath, movementLines.join("\n"), "utf8");
  console.log("[LINE_MOVE] Wrote line movement dataset to", movementOutPath);

  const perfLines: string[] = ["player,stat_type,move_type,samples,hit_rate,avg_margin"];
  let earlySamples = 0;
  let earlyHits = 0;
  let lateSamples = 0;
  let lateHits = 0;
  let minorSamples = 0;
  let minorHits = 0;

  for (const [key, b] of perfBuckets.entries()) {
    if (b.samples === 0) continue;
    const [player, stat, moveType] = key.split("|");
    const hitRate = b.hits / b.samples;
    const avgMargin = b.marginSum / b.samples;
    perfLines.push(
      [
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        moveType,
        String(b.samples),
        hitRate.toFixed(4),
        avgMargin.toFixed(3),
      ].join(",")
    );

    if (moveType === "early_sharp") {
      earlySamples += b.samples;
      earlyHits += b.hits;
    } else if (moveType === "late_public") {
      lateSamples += b.samples;
      lateHits += b.hits;
    } else if (moveType === "minor") {
      minorSamples += b.samples;
      minorHits += b.hits;
    }
  }

  fs.writeFileSync(perfOutPath, perfLines.join("\n"), "utf8");
  console.log("[LINE_MOVE] Wrote move performance dataset to", perfOutPath);

  const earlyRate = earlySamples > 0 ? earlyHits / earlySamples : 0;
  const lateRate = lateSamples > 0 ? lateHits / lateSamples : 0;
  const minorRate = minorSamples > 0 ? minorHits / minorSamples : 0;

  console.log("EARLY SHARP HIT RATE", earlySamples > 0 ? earlyRate.toFixed(4) : "n/a");
  console.log("LATE PUBLIC HIT RATE", lateSamples > 0 ? lateRate.toFixed(4) : "n/a");
  console.log("MINOR MOVE HIT RATE", minorSamples > 0 ? minorRate.toFixed(4) : "n/a");
}

main().catch((err) => {
  console.error("[LINE_MOVE] Failed to build line movement datasets:", err);
  process.exitCode = 0;
});

