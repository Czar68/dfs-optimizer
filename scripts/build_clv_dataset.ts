import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";

type HistoryRow = {
  date?: string;
  player?: string;
  prop_type?: string;
  line?: string;
  market_line?: string;
  closing_line?: string;
  dfs_platform?: string;
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

async function main(): Promise<void> {
  const nbaHistoryPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const modelsDir = getDataPath("models");
  const clvOutPath = path.join(modelsDir, "prop_clv_dataset.csv");
  const summaryOutPath = path.join(modelsDir, "clv_summary.csv");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const history = await readCsv<HistoryRow>(nbaHistoryPath);
  const results = await readCsv<ResultRow>(nbaResultsPath);

  if (history.length === 0 || results.length === 0) {
    console.log("[CLV] Insufficient data (history or results empty); writing empty datasets.");
    fs.writeFileSync(
      clvOutPath,
      "date,player,stat_type,line,closing_line,pick,clv,hit,margin\n",
      "utf8"
    );
    fs.writeFileSync(
      summaryOutPath,
      "player,stat_type,samples,avg_clv,positive_clv_rate,hit_rate\n",
      "utf8"
    );
    return;
  }

  // Index results by date+player+stat+line
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

  const clvLines: string[] = ["date,player,stat_type,line,closing_line,pick,clv,hit,margin"];
  const summaryBuckets = new Map<
    string,
    { samples: number; clvSum: number; clvPositives: number; hits: number }
  >();

  for (const h of history) {
    const date = (h.date ?? "").trim();
    const player = (h.player ?? "").trim();
    const stat = (h.prop_type ?? "").trim();
    const lineStr = (h.line ?? "").trim();
    const marketLine = parseNumber(h.market_line ?? h.line ?? "");
    const closingLine = parseNumber(h.closing_line ?? "");
    const pickRaw = (h.dfs_platform ?? "").toLowerCase(); // we don't store explicit pick; assume overs
    const pick = pickRaw.includes("under") ? "under" : "over";

    if (!date || !player || !stat || !lineStr || marketLine == null || closingLine == null) continue;

    let clv: number;
    if (pick === "over") {
      clv = marketLine - closingLine;
    } else {
      clv = closingLine - marketLine;
    }

    const keyRes = `${date}|${player}|${stat}|${lineStr}`;
    const res = resultMap.get(keyRes);
    const hit = res ? res.hit : 0;
    const margin = res ? res.margin : 0;

    clvLines.push(
      [
        date,
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        lineStr,
        closingLine.toString(),
        pick,
        clv.toFixed(3),
        String(hit),
        margin.toFixed(3),
      ].join(",")
    );

    const bucketKey = `${player}|${stat}`;
    if (!summaryBuckets.has(bucketKey)) {
      summaryBuckets.set(bucketKey, { samples: 0, clvSum: 0, clvPositives: 0, hits: 0 });
    }
    const b = summaryBuckets.get(bucketKey)!;
    b.samples++;
    b.clvSum += clv;
    if (clv > 0) b.clvPositives++;
    if (hit) b.hits++;
  }

  fs.writeFileSync(clvOutPath, clvLines.join("\n"), "utf8");
  console.log("[CLV] Wrote prop CLV dataset to", clvOutPath);

  const summaryLines: string[] = [
    "player,stat_type,samples,avg_clv,positive_clv_rate,hit_rate",
  ];
  for (const [key, b] of summaryBuckets.entries()) {
    if (b.samples === 0) continue;
    const [player, stat] = key.split("|");
    const avgClv = b.clvSum / b.samples;
    const posRate = b.clvPositives / b.samples;
    const hitRate = b.hits / b.samples;
    summaryLines.push(
      [
        `"${player.replace(/"/g, '""')}"`,
        `"${stat.replace(/"/g, '""')}"`,
        String(b.samples),
        avgClv.toFixed(3),
        posRate.toFixed(4),
        hitRate.toFixed(4),
      ].join(",")
    );
  }

  fs.writeFileSync(summaryOutPath, summaryLines.join("\n"), "utf8");
  console.log("[CLV] Wrote CLV summary dataset to", summaryOutPath);
}

main().catch((err) => {
  console.error("[CLV] Failed to build CLV dataset:", err);
  process.exitCode = 0;
});

