import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";

type HistoryRow = {
  player?: string;
  prop_type?: string;
  line?: string;
  implied_probability?: string;
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

async function main(): Promise<void> {
  const nbaHistoryPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const modelsDir = getDataPath("models");
  const outPath = path.join(modelsDir, "prop_edge_dataset.csv");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const history = await readCsv<HistoryRow>(nbaHistoryPath);
  const results = await readCsv<ResultRow>(nbaResultsPath);

  if (history.length === 0 || results.length === 0) {
    console.log("[EDGE] Insufficient data (history or results empty); writing empty dataset.");
    fs.writeFileSync(
      outPath,
      "player,stat_type,line,implied_probability,actual_hit_rate,edge\n",
      "utf8"
    );
    return;
  }

  const buckets = new Map<string, { implied: number[]; hits: number; total: number }>();

  for (const h of history) {
    const player = (h.player ?? "").trim();
    const stat = (h.prop_type ?? "").trim();
    const line = (h.line ?? "").trim();
    const implied = h.implied_probability != null ? parseFloat(h.implied_probability) : NaN;
    if (!player || !stat || !line || !Number.isFinite(implied)) continue;
    const key = `${player}|${stat}|${line}`;
    if (!buckets.has(key)) {
      buckets.set(key, { implied: [], hits: 0, total: 0 });
    }
    buckets.get(key)!.implied.push(implied);
  }

  for (const r of results) {
    const player = (r.player ?? "").trim();
    const stat = (r.stat_type ?? "").trim();
    const line = (r.line ?? "").trim();
    const actual = r.actual_stat != null ? parseFloat(String(r.actual_stat)) : NaN;
    const lineVal = line ? parseFloat(line) : NaN;
    if (!player || !stat || !line || !Number.isFinite(actual) || !Number.isFinite(lineVal)) continue;
    const key = `${player}|${stat}|${line}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total++;
    if (actual > lineVal) bucket.hits++;
  }

  const lines: string[] = ["player,stat_type,line,implied_probability,actual_hit_rate,edge"];
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.total === 0) continue;
    const [player, stat, line] = key.split("|");
    const impliedAvg =
      bucket.implied.length > 0
        ? bucket.implied.reduce((a, b) => a + b, 0) / bucket.implied.length
        : 0;
    const actualHitRate = bucket.hits / bucket.total;
    const edge = actualHitRate - impliedAvg;
    lines.push(
      [
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        line,
        impliedAvg.toFixed(4),
        actualHitRate.toFixed(4),
        edge.toFixed(4),
      ].join(",")
    );
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("[EDGE] Wrote prop edge dataset to", outPath);
}

main().catch((err) => {
  console.error("[EDGE] Failed to build dataset:", err);
  process.exitCode = 0;
});

