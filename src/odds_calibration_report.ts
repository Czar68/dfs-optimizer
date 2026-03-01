// src/odds_calibration_report.ts
// Step 3: odds-bucket calibration report. Reads perf_tracker, groups by bucket + side, prints Hit% vs Implied%.

import { readTrackerRows } from "./perf_tracker_db";
import { PerfTrackerRow, inferSide } from "./perf_tracker_types";
import { americanToImpliedProb } from "./odds_math";
import { getOddsBucket } from "./odds_buckets";

export interface OddsBucketRow {
  bucket: string;
  side: string;
  book?: string;
  N: number;
  hitPct: number;
  impliedPct: number;
  delta: number;
}

function getImpliedProb(r: PerfTrackerRow): number | null {
  if (r.impliedProb != null && Number.isFinite(r.impliedProb)) return r.impliedProb;
  const side = r.side ?? inferSide(r.leg_id);
  const odds = side === "over" ? r.overOdds : r.underOdds;
  if (odds != null && Number.isFinite(odds)) return americanToImpliedProb(odds);
  return null;
}

export function computeOddsCalibrationReport(
  rows: PerfTrackerRow[],
  byBook: boolean = false
): OddsBucketRow[] {
  const withResult = rows.filter((r) => r.result === 0 || r.result === 1);
  const withImplied: { row: PerfTrackerRow; implied: number; bucket: string; side: string }[] = [];
  for (const r of withResult) {
    const implied = getImpliedProb(r);
    if (implied == null) continue;
    const side = r.side ?? inferSide(r.leg_id);
    const bucket = getOddsBucket(r.overOdds, r.underOdds, side) ?? "unknown";
    withImplied.push({ row: r, implied, bucket, side });
  }

  const key = (b: string, s: string, book?: string) => (byBook && book ? `${b}|${s}|${book}` : `${b}|${s}`);
  const groups = new Map<string, { hits: number; total: number; sumImplied: number }>();
  for (const { row, implied, bucket, side } of withImplied) {
    const k = key(bucket, side, row.book);
    const g = groups.get(k) ?? { hits: 0, total: 0, sumImplied: 0 };
    g.hits += row.result ?? 0;
    g.total += 1;
    g.sumImplied += implied;
    groups.set(k, g);
  }

  const out: OddsBucketRow[] = [];
  for (const [k, g] of groups) {
    const parts = k.split("|");
    const bucket = parts[0];
    const side = parts[1];
    const book = parts[2];
    const hitPct = g.total > 0 ? (g.hits / g.total) * 100 : 0;
    const impliedPct = g.total > 0 ? (g.sumImplied / g.total) * 100 : 0;
    out.push({
      bucket,
      side,
      book: byBook ? book : undefined,
      N: g.total,
      hitPct,
      impliedPct,
      delta: hitPct - impliedPct,
    });
  }
  return out.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.side.localeCompare(b.side));
}

export function printOddsCalibrationReport(byBook: boolean = false): OddsBucketRow[] {
  const rows = readTrackerRows();
  const report = computeOddsCalibrationReport(rows, byBook);
  console.log("\n--- Odds bucket calibration (result + impliedProb) ---\n");
  const header = "Bucket       | Side  | N    | Hit%   | Implied% | Delta   " + (byBook ? "| Book" : "");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of report) {
    const line = [
      r.bucket.padEnd(12),
      r.side.padEnd(5),
      String(r.N).padStart(5),
      (r.hitPct.toFixed(1) + "%").padStart(6),
      (r.impliedPct.toFixed(1) + "%").padStart(8),
      ((r.delta >= 0 ? "+" : "") + r.delta.toFixed(1) + "%").padStart(8),
      ...(byBook ? [r.book ?? ""] : []),
    ].join(" | ");
    console.log(line);
  }
  console.log("\n(Rows with result and impliedProb/odds; Delta = Hit% - Implied%)\n");
  return report;
}

if (require.main === module) {
  const byBook = process.argv.includes("--by-book");
  printOddsCalibrationReport(byBook);
}
