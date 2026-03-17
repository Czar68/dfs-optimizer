import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath } from "../src/constants/paths";

type ClvRow = {
  player?: string;
  stat_type?: string;
  clv?: string;
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
  const modelsDir = getDataPath("models");
  const clvPath = path.join(modelsDir, "prop_clv_dataset.csv");

  const rows = await readCsv<ClvRow & { clv: string }>(clvPath);

  if (rows.length === 0) {
    console.log("CLV REPORT\n---------------------------------\nNo CLV data available.\n");
    return;
  }

  let totalClv = 0;
  let posCount = 0;
  const clvValues: { player: string; stat: string; clv: number }[] = [];

  for (const r of rows) {
    const player = (r.player ?? "").trim();
    const stat = (r.stat_type ?? "").trim();
    const clv = r.clv != null ? parseFloat(r.clv) : NaN;
    if (!player || !stat || !Number.isFinite(clv)) continue;
    totalClv += clv;
    if (clv > 0) posCount++;
    clvValues.push({ player, stat, clv });
  }

  const samples = clvValues.length;
  if (samples === 0) {
    console.log("CLV REPORT\n---------------------------------\nNo valid CLV rows.\n");
    return;
  }

  const avgClv = totalClv / samples;
  const posRate = posCount / samples;

  const byPlayerStat = new Map<
    string,
    { player: string; stat: string; clvSum: number; count: number }
  >();
  for (const r of clvValues) {
    const key = `${r.player}|${r.stat}`;
    if (!byPlayerStat.has(key)) {
      byPlayerStat.set(key, { player: r.player, stat: r.stat, clvSum: 0, count: 0 });
    }
    const b = byPlayerStat.get(key)!;
    b.clvSum += r.clv;
    b.count++;
  }

  const agg = Array.from(byPlayerStat.values())
    .filter((b) => b.count >= 5)
    .map((b) => ({ ...b, avg: b.clvSum / b.count }))
    .sort((a, b) => b.avg - a.avg);

  const top = agg.slice(0, 5);
  const worst = agg.slice(-5).reverse();

  console.log("---------------------------------");
  console.log("CLV REPORT");
  console.log("---------------------------------");
  console.log(`total samples: ${samples}`);
  console.log(`avg clv: ${avgClv >= 0 ? "+" : ""}${avgClv.toFixed(3)}`);
  console.log(`positive clv rate: ${(posRate * 100).toFixed(1)}%`);
  console.log("");
  console.log("top players by CLV (min 5 samples)");
  top.forEach((b) =>
    console.log(
      `  ${b.player} ${b.stat}: avg_clv=${b.avg.toFixed(3)} (n=${b.count})`
    )
  );
  console.log("");
  console.log("worst players by CLV (min 5 samples)");
  worst.forEach((b) =>
    console.log(
      `  ${b.player} ${b.stat}: avg_clv=${b.avg.toFixed(3)} (n=${b.count})`
    )
  );
  console.log("---------------------------------");
}

main().catch((err) => {
  console.error("[CLV] Failed to build CLV report:", err);
  process.exitCode = 0;
});

