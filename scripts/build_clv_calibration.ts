import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath } from "../src/constants/paths";

type ClvRow = {
  implied_prob?: string;
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

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function bucketImpliedProb(p: number): number {
  const clamped = Math.max(0, Math.min(1, p));
  const bucketIndex = Math.floor(clamped / 0.02); // 0.00–0.0199 → 0.00, etc.
  const bucket = bucketIndex * 0.02;
  return Number(bucket.toFixed(2));
}

async function main(): Promise<void> {
  const dataPath = getDataPath(path.join("models", "prop_clv_dataset.csv"));
  const outPath = getDataPath(path.join("models", "clv_calibration_curve.csv"));

  if (!fs.existsSync(dataPath)) {
    console.log("[CLV] Input dataset not found:", dataPath);
    fs.writeFileSync(
      outPath,
      "implied_prob_bucket,actual_hit_rate,samples\n",
      "utf8"
    );
    return;
  }

  const rows = await readCsv<ClvRow>(dataPath);
  if (rows.length === 0) {
    console.log("[CLV] No rows in input dataset; writing empty calibration curve.");
    fs.writeFileSync(
      outPath,
      "implied_prob_bucket,actual_hit_rate,samples\n",
      "utf8"
    );
    return;
  }

  const buckets = new Map<number, { hits: number; samples: number }>();

  for (const r of rows) {
    const p = parseNumber(r.implied_prob);
    const hitRaw = parseNumber(r.hit);
    if (p == null || hitRaw == null) continue;

    const bucket = bucketImpliedProb(p);
    const entry = buckets.get(bucket) ?? { hits: 0, samples: 0 };
    entry.samples += 1;
    entry.hits += hitRaw !== 0 ? 1 : 0;
    buckets.set(bucket, entry);
  }

  const header = "implied_prob_bucket,actual_hit_rate,samples";
  const lines: string[] = [header];

  const sortedBuckets = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const b of sortedBuckets) {
    const { hits, samples } = buckets.get(b)!;
    if (samples === 0) continue;
    const hitRate = hits / samples;
    lines.push(
      `${b.toFixed(2)},${hitRate.toFixed(4)},${samples}`
    );
  }

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("[CLV] Wrote calibration curve to", outPath);
}

main().catch((err) => {
  console.error("[CLV] Failed to build calibration curve:", err);
  process.exitCode = 1;
});

