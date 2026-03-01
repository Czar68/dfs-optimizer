// src/perf_report.ts
// Print performance table: top edges | Player | Stat | Line | Book | Legs | Hit% | Mult | EV_adj boost

import { computeBucketCalibrations, BucketCalibration } from "./calibrate_leg_ev";

function evAdjBoost(b: BucketCalibration): number {
  const playedEV = 0.03;
  const adj = playedEV * b.mult + b.underBonus;
  return (adj - playedEV) * 100;
}

export function runPerfReport(topN = 20): void {
  const cal = computeBucketCalibrations();
  const sorted = [...cal].sort((a, b) => evAdjBoost(b) - evAdjBoost(a)).slice(0, topN);
  console.log("\n--- Perf Tracker: Top edges (by EV_adj boost) ---\n");
  const header = "Player      | Stat    | Line | Book     | n (raw) | n_eff  | Hit%  | Mult  | UnderBonus? | EV_adj boost";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const b of sorted) {
    const hitPct = (b.histHit * 100).toFixed(0);
    const mult = b.mult.toFixed(2);
    const underBonus = b.underBonus > 0 ? "+" + (b.underBonus * 100).toFixed(0) + "%" : "-";
    const boost = (evAdjBoost(b) >= 0 ? "+" : "") + evAdjBoost(b).toFixed(1) + "%";
    const nEff = (typeof b.n_eff === "number" ? b.n_eff : b.legs).toFixed(1);
    const line = [
      b.player.padEnd(12),
      b.stat.padEnd(6),
      String(b.lineBucket).padStart(4),
      b.book.padEnd(8),
      String(b.legs).padStart(7),
      nEff.padStart(7),
      hitPct.padStart(4) + "%",
      mult.padStart(5),
      underBonus.padStart(10),
      boost,
    ].join(" | ");
    console.log(line);
  }
  console.log("\n(" + cal.length + " buckets with min 5 legs; showing top " + sorted.length + "; n=raw count, n_eff=time-decay weighted)\n");
}

if (require.main === module) {
  const topN = parseInt(process.argv[2] ?? "20", 10);
  runPerfReport(topN);
}
