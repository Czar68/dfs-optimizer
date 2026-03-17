import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath } from "../src/constants/paths";

type ResultRow = {
  date?: string;
  player?: string;
  stat_type?: string;
  line?: string;
  actual_stat?: string;
  hit?: string;
};

async function readCsv<T = Record<string, unknown>>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      resolve([]);
      return;
    }
    const rows: T[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: Record<string, unknown>) => rows.push(data as T))
      .on("end", () => resolve(rows))
      .on("error", (err: Error) => reject(err));
  });
}

function parseNumber(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseFloat(String(s).trim());
  return Number.isFinite(n) ? n : null;
}

/** Pearson correlation between two arrays. Returns null if undefined (e.g. constant vector). */
function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i];
    const b = y[i];
    sumX += a;
    sumY += b;
    sumXY += a * b;
    sumX2 += a * a;
    sumY2 += b * b;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const cov = sumXY / n - meanX * meanY;
  const varX = sumX2 / n - meanX * meanX;
  const varY = sumY2 / n - meanY * meanY;
  if (varX <= 0 || varY <= 0) return null;
  return cov / Math.sqrt(varX * varY);
}

async function main(): Promise<void> {
  const nbaResultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const modelsDir = getDataPath("models");
  const outPath = path.join(modelsDir, "prop_correlation_matrix.csv");

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const results = await readCsv<ResultRow>(nbaResultsPath);
  if (results.length === 0) {
    console.log("[CORR] No results; writing empty correlation matrix.");
    fs.writeFileSync(
      outPath,
      "stat_a,stat_b,correlation,samples\n",
      "utf8"
    );
    return;
  }

  // Group by game: (date, player) = one "game" for one player. Each unit has multiple stat_type outcomes.
  type GameKey = string;
  const byGame = new Map<GameKey, Map<string, number>>();

  for (const r of results) {
    const date = (r.date ?? "").trim();
    const player = (r.player ?? "").trim();
    const statType = (r.stat_type ?? "").trim();
    const line = parseNumber(r.line ?? "");
    const actual = parseNumber(r.actual_stat ?? "");
    const hitRaw = r.hit != null ? parseNumber(r.hit) : null;
    const hit: number | null =
      hitRaw !== null ? (hitRaw !== 0 ? 1 : 0) : actual != null && line != null ? (actual > line ? 1 : 0) : null;
    if (!date || !player || !statType || hit === null) continue;

    const gameKey: GameKey = `${date}|${player}`;
    if (!byGame.has(gameKey)) byGame.set(gameKey, new Map());
    byGame.get(gameKey)!.set(statType, hit);
  }

  // Collect all stat types
  const statTypes = new Set<string>();
  for (const map of byGame.values()) {
    for (const stat of map.keys()) statTypes.add(stat);
  }
  const statList = Array.from(statTypes).sort();

  // For each pair (stat_a, stat_b), collect vectors of (hit_a, hit_b) over games that have both
  const pairs: { stat_a: string; stat_b: string; correlation: number; samples: number }[] = [];

  for (let i = 0; i < statList.length; i++) {
    for (let j = i; j < statList.length; j++) {
      const stat_a = statList[i];
      const stat_b = statList[j];
      const x: number[] = [];
      const y: number[] = [];
      for (const map of byGame.values()) {
        const ha = map.get(stat_a);
        const hb = map.get(stat_b);
        if (ha !== undefined && hb !== undefined) {
          x.push(ha);
          y.push(hb);
        }
      }
      const n = x.length;
      if (n < 2) continue;
      const corr = pearson(x, y);
      if (corr === null) continue;
      pairs.push({ stat_a, stat_b, correlation: corr, samples: n });
    }
  }

  const lines: string[] = ["stat_a,stat_b,correlation,samples"];
  for (const p of pairs) {
    lines.push(
      [
        `"${p.stat_a.replace(/"/g, '""')}"`,
        `"${p.stat_b.replace(/"/g, '""')}"`,
        p.correlation.toFixed(4),
        String(p.samples),
      ].join(",")
    );
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("[CORR] Wrote prop correlation matrix to", outPath);

  const sorted = [...pairs].sort((a, b) => b.correlation - a.correlation);
  const topPositive = sorted.filter((p) => p.correlation > 0).slice(0, 10);
  const topNegative = sorted.filter((p) => p.correlation < 0).sort((a, b) => a.correlation - b.correlation).slice(0, 10);

  console.log("Top positive correlations:");
  for (const p of topPositive) {
    console.log(`  ${p.stat_a} vs ${p.stat_b}: ${p.correlation.toFixed(4)} (n=${p.samples})`);
  }
  console.log("Top negative correlations:");
  for (const p of topNegative) {
    console.log(`  ${p.stat_a} vs ${p.stat_b}: ${p.correlation.toFixed(4)} (n=${p.samples})`);
  }
}

main().catch((err) => {
  console.error("[CORR] Failed to build correlation matrix:", err);
  process.exitCode = 1;
});
