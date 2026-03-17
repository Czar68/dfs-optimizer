import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";

type HistoryRow = {
  player?: string;
  prop_type?: string;
  line?: string;
  ev?: string;
};

type ResultRow = {
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

function getLineBucket(lineStr: string | undefined): number | null {
  if (!lineStr) return null;
  const n = parseFloat(lineStr);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

async function main(): Promise<void> {
  const nbaHistoryPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const modelsDir = getDataPath("models");
  const outPath = path.join(modelsDir, "player_prop_hit_rates.csv");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const history = await readCsv<HistoryRow>(nbaHistoryPath);
  const results = await readCsv<ResultRow>(nbaResultsPath);

  if (history.length === 0 || results.length === 0) {
    console.log("[HIT_RATE] Insufficient data (history or results empty); writing empty dataset.");
    fs.writeFileSync(
      outPath,
      "player,stat_type,line_bucket,samples,hit_rate,avg_margin\n",
      "utf8"
    );
    return;
  }

  // Index results by player+stat+line bucket
  const resultMap = new Map<string, { hits: number; misses: number; margins: number[] }>();

  for (const r of results) {
    const player = (r.player ?? "").trim();
    const stat = (r.stat_type ?? "").trim();
    const lineBucket = getLineBucket(r.line);
    const actual = r.actual_stat != null ? parseFloat(String(r.actual_stat)) : NaN;
    const lineVal = r.line != null ? parseFloat(String(r.line)) : NaN;
    if (!player || !stat || !Number.isFinite(lineBucket ?? NaN) || !Number.isFinite(actual) || !Number.isFinite(lineVal)) {
      continue;
    }
    const key = `${player}|${stat}|${lineBucket}`;
    if (!resultMap.has(key)) {
      resultMap.set(key, { hits: 0, misses: 0, margins: [] });
    }
    const rec = resultMap.get(key)!;
    const margin = actual - lineVal;
    rec.margins.push(margin);
    if (actual > lineVal) rec.hits++;
    else rec.misses++;
  }

  const agg = new Map<string, { samples: number; hits: number; margins: number[] }>();

  for (const h of history) {
    const player = (h.player ?? "").trim();
    const stat = (h.prop_type ?? "").trim();
    const lineBucket = getLineBucket(h.line);
    if (!player || !stat || !Number.isFinite(lineBucket ?? NaN)) continue;
    const key = `${player}|${stat}|${lineBucket}`;
    const res = resultMap.get(key);
    if (!res) continue;
    if (!agg.has(key)) {
      agg.set(key, { samples: 0, hits: 0, margins: [] });
    }
    const a = agg.get(key)!;
    const samplesHere = res.hits + res.misses;
    a.samples += samplesHere;
    a.hits += res.hits;
    a.margins.push(...res.margins);
  }

  const lines: string[] = ["player,stat_type,line_bucket,samples,hit_rate,avg_margin"];
  for (const [key, val] of agg.entries()) {
    const [player, stat, bucketStr] = key.split("|");
    const samples = val.samples;
    if (samples <= 0) continue;
    const hitRate = val.hits / samples;
    const avgMargin =
      val.margins.length > 0
        ? val.margins.reduce((a, b) => a + b, 0) / val.margins.length
        : 0;
    lines.push(
      [
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        bucketStr,
        String(samples),
        hitRate.toFixed(4),
        avgMargin.toFixed(3),
      ].join(",")
    );
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("[HIT_RATE] Wrote hit-rate dataset to", outPath);
}

main().catch((err) => {
  console.error("[HIT_RATE] Failed to build dataset:", err);
  process.exitCode = 0;
});

