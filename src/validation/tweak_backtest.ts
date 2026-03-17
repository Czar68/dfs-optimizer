// src/validation/tweak_backtest.ts
// Phase 8 tweak validation: shows pre/post ROI impact of each EV tweak.
//
// Usage:
//   node dist/src/validation/tweak_backtest.js
//
// Reads perf_tracker.jsonl, simulates applying each tweak individually
// (juice, opp-adjust, corr-adjust) against raw legEv, then shows a
// comparison table with ROI lift per tweak.

import { readTrackerRows } from "../perf_tracker_db";
import { PerfTrackerRow } from "../perf_tracker_types";
import { juiceAwareLegEv, fairBeFromTwoWayOdds } from "../ev/juice_adjust";
import { getOppAdjustment } from "../matchups/opp_adjust";

interface TweakResult {
  name: string;
  legs: number;
  rawHitRate: number;
  rawAvgEdge: number;
  tweakedAvgEdge: number;
  rawRoi: number;
  tweakedRoi: number;
  liftPct: number;
}

function computeRoi(
  rows: PerfTrackerRow[],
  edgeFn: (r: PerfTrackerRow) => number
): { avgEdge: number; roi: number; hitRate: number } {
  if (rows.length === 0) return { avgEdge: 0, roi: 0, hitRate: 0 };
  let totalProfit = 0;
  let totalEdge = 0;
  let hits = 0;

  for (const r of rows) {
    const edge = edgeFn(r);
    totalEdge += edge;
    const fairPayout = r.trueProb > 0 ? 1 / r.trueProb : 1;
    totalProfit += r.result === 1 ? (fairPayout - 1) : -1;
    if (r.result === 1) hits++;
  }

  return {
    avgEdge: totalEdge / rows.length,
    roi: totalProfit / rows.length,
    hitRate: hits / rows.length,
  };
}

function main(): void {
  const rows = readTrackerRows();
  const resolved = rows.filter(
    (r) => (r.result === 0 || r.result === 1) && r.playedEV >= 0.01
  );

  console.log(`\n${"=".repeat(70)}`);
  console.log(` Phase 8 Tweak Backtest Comparison`);
  console.log(`${"=".repeat(70)}`);
  console.log(`[Data] ${resolved.length} resolved legs (EV>=1%)\n`);

  if (resolved.length < 10) {
    console.log(
      "Insufficient data for tweak comparison (need >=10 resolved legs).\n" +
        "Run: npm run calibrate:scrape to fill ESPN results.\n"
    );
    return;
  }

  const rawEdge = (r: PerfTrackerRow) => r.trueProb - 0.5;

  const rawStats = computeRoi(resolved, rawEdge);

  const tweaks: TweakResult[] = [];

  // Tweak 1: Juice awareness
  {
    const juiceEdge = (r: PerfTrackerRow) => {
      if (r.overOdds != null && r.underOdds != null) {
        return juiceAwareLegEv(r.trueProb, r.overOdds, r.underOdds);
      }
      return r.trueProb - 0.5;
    };
    const juiceRows = resolved.filter(
      (r) => r.overOdds != null && r.underOdds != null
    );
    const juiceStats = computeRoi(juiceRows, juiceEdge);
    const juiceRaw = computeRoi(juiceRows, rawEdge);

    tweaks.push({
      name: "Juice Aware",
      legs: juiceRows.length,
      rawHitRate: juiceRaw.hitRate,
      rawAvgEdge: juiceRaw.avgEdge,
      tweakedAvgEdge: juiceStats.avgEdge,
      rawRoi: juiceRaw.roi,
      tweakedRoi: juiceStats.roi,
      liftPct: juiceRaw.roi !== 0 ? ((juiceStats.roi - juiceRaw.roi) / Math.abs(juiceRaw.roi)) * 100 : 0,
    });
  }

  // Tweak 2: Opponent adjustment
  {
    const oppEdge = (r: PerfTrackerRow) => {
      const adj = getOppAdjustment(r.opp ?? null, r.stat);
      const adjustedProb = adj
        ? Math.max(0.01, Math.min(0.99, r.trueProb + adj.shift))
        : r.trueProb;
      return adjustedProb - 0.5;
    };
    const oppRows = resolved.filter(
      (r) => r.opp != null && r.opp !== ""
    );
    const oppStats = computeRoi(oppRows, oppEdge);
    const oppRaw = computeRoi(oppRows, rawEdge);

    tweaks.push({
      name: "Opponent Adj",
      legs: oppRows.length,
      rawHitRate: oppRaw.hitRate,
      rawAvgEdge: oppRaw.avgEdge,
      tweakedAvgEdge: oppStats.avgEdge,
      rawRoi: oppRaw.roi,
      tweakedRoi: oppStats.roi,
      liftPct: oppRaw.roi !== 0 ? ((oppStats.roi - oppRaw.roi) / Math.abs(oppRaw.roi)) * 100 : 0,
    });
  }

  // Tweak 3: All combined
  {
    const combinedEdge = (r: PerfTrackerRow) => {
      let prob = r.trueProb;
      const oppAdj = getOppAdjustment(r.opp ?? null, r.stat);
      if (oppAdj) prob = Math.max(0.01, Math.min(0.99, prob + oppAdj.shift));
      if (r.overOdds != null && r.underOdds != null) {
        return juiceAwareLegEv(prob, r.overOdds, r.underOdds);
      }
      return prob - 0.5;
    };
    const combinedStats = computeRoi(resolved, combinedEdge);

    tweaks.push({
      name: "ALL Combined",
      legs: resolved.length,
      rawHitRate: rawStats.hitRate,
      rawAvgEdge: rawStats.avgEdge,
      tweakedAvgEdge: combinedStats.avgEdge,
      rawRoi: rawStats.roi,
      tweakedRoi: combinedStats.roi,
      liftPct: rawStats.roi !== 0 ? ((combinedStats.roi - rawStats.roi) / Math.abs(rawStats.roi)) * 100 : 0,
    });
  }

  // Print table
  console.log(
    "+-----------------+-------+----------+----------+----------+----------+----------+"
  );
  console.log(
    "| Tweak           | Legs  | Hit Rate | Raw Edge | Twk Edge | Raw ROI  | Twk ROI  |"
  );
  console.log(
    "+-----------------+-------+----------+----------+----------+----------+----------+"
  );

  for (const t of tweaks) {
    const row = [
      t.name.padEnd(15),
      String(t.legs).padStart(5),
      ((t.rawHitRate * 100).toFixed(1) + "%").padStart(8),
      ((t.rawAvgEdge * 100).toFixed(2) + "%").padStart(8),
      ((t.tweakedAvgEdge * 100).toFixed(2) + "%").padStart(8),
      ((t.rawRoi * 100).toFixed(1) + "%").padStart(8),
      ((t.tweakedRoi * 100).toFixed(1) + "%").padStart(8),
    ].join(" | ");
    console.log(`| ${row} |`);
  }

  console.log(
    "+-----------------+-------+----------+----------+----------+----------+----------+\n"
  );

  // Summary
  const allCombined = tweaks.find((t) => t.name === "ALL Combined");
  if (allCombined) {
    const lift = allCombined.tweakedRoi - allCombined.rawRoi;
    console.log(
      `Phase 8 combined lift: ${lift >= 0 ? "+" : ""}${(lift * 100).toFixed(2)}% ROI ` +
        `(raw ${(allCombined.rawRoi * 100).toFixed(1)}% -> tweaked ${(allCombined.tweakedRoi * 100).toFixed(1)}%)`
    );
  }
}

if (require.main === module) {
  main();
}
