// src/validation/backtest_engine.ts
// Phase 7.4: Backtest engine — proves historical edges produce positive ROI.
//
// Reads perf_tracker.jsonl, buckets resolved legs by EV threshold, simulates
// card-level outcomes against actual results, and reports ROI by EV tier.
//
// Usage:
//   node dist/validation/backtest_engine.js [--min-ev 0.01] [--historical-only] [--by-structure]

import { readTrackerRows } from "../perf_tracker_db";
import { PerfTrackerRow } from "../perf_tracker_types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestResult {
  evThreshold: number;
  totalLegs: number;
  hits: number;
  misses: number;
  hitRate: number;
  avgModelProb: number;
  avgPlayedEV: number;
  /** Simulated per-unit ROI if we wagered $1 on each leg at implied fair odds */
  roi: number;
  /** Sum of (result − trueProb) — positive = model underestimates hit rate */
  cumulativeEdge: number;
}

export interface StructureBacktest {
  structureKey: string;
  platform: string;
  structure: string;
  totalLegs: number;
  hits: number;
  hitRate: number;
  impliedBreakeven: number;
  edge: number;
  roi: number;
}

// ── Gospel implied breakeven (duplicated from calibration_store to keep standalone) ──

const IMPLIED_BE: Record<string, number> = {
  PP_2P: 0.5774, PP_3P: 0.5503, PP_4P: 0.5623, PP_5P: 0.5744, PP_6P: 0.5743,
  PP_3F: 0.5980, PP_4F: 0.5690, PP_5F: 0.5425, PP_6F: 0.5421,
  UD_2S: 0.5345, UD_3S: 0.4983, UD_4S: 0.5623, UD_5S: 0.5744, UD_6S: 0.5765,
  UD_7S: 0.5764, UD_8S: 0.5765,
  UD_3F: 0.5700, UD_4F: 0.5567, UD_5F: 0.5426, UD_6F: 0.5345,
  UD_7F: 0.5421, UD_8F: 0.5503,
};

// ── Core engine ────────────────────────────────────────────────────────────────

/**
 * Run the backtest across EV thresholds from 1% to 5% in 0.5% steps.
 */
export function runBacktest(
  rows: PerfTrackerRow[],
  thresholds: number[] = [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05]
): BacktestResult[] {
  const resolved = rows.filter((r) => r.result === 0 || r.result === 1);
  if (resolved.length === 0) return [];

  return thresholds.map((thresh) => {
    const qualifying = resolved.filter((r) => r.playedEV >= thresh);
    if (qualifying.length === 0) {
      return {
        evThreshold: thresh,
        totalLegs: 0, hits: 0, misses: 0, hitRate: 0,
        avgModelProb: 0, avgPlayedEV: 0, roi: 0, cumulativeEdge: 0,
      };
    }

    const hits = qualifying.filter((r) => r.result === 1).length;
    const misses = qualifying.length - hits;
    const hitRate = hits / qualifying.length;
    const avgModelProb = qualifying.reduce((s, r) => s + r.trueProb, 0) / qualifying.length;
    const avgPlayedEV = qualifying.reduce((s, r) => s + r.playedEV, 0) / qualifying.length;

    // Simulated ROI: bet $1 per leg at fair odds implied by trueProb.
    // If result=1, profit = (1/trueProb − 1); if result=0, profit = −1.
    let totalProfit = 0;
    let cumulativeEdge = 0;
    for (const r of qualifying) {
      const fairPayout = r.trueProb > 0 ? 1 / r.trueProb : 1;
      totalProfit += r.result === 1 ? (fairPayout - 1) : -1;
      cumulativeEdge += (r.result ?? 0) - r.trueProb;
    }
    const roi = totalProfit / qualifying.length;

    return {
      evThreshold: thresh,
      totalLegs: qualifying.length,
      hits, misses, hitRate, avgModelProb, avgPlayedEV, roi, cumulativeEdge,
    };
  });
}

/**
 * Run backtest grouped by platform+structure (PP_4P, UD_3F, etc.)
 */
export function runStructureBacktest(rows: PerfTrackerRow[]): StructureBacktest[] {
  const resolved = rows.filter(
    (r) => (r.result === 0 || r.result === 1) && r.platform && r.structure
  );
  if (resolved.length === 0) return [];

  const groups = new Map<string, PerfTrackerRow[]>();
  for (const r of resolved) {
    const key = `${r.platform!.toUpperCase()}_${r.structure!.toUpperCase()}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const results: StructureBacktest[] = [];
  for (const [key, list] of groups) {
    const hits = list.filter((r) => r.result === 1).length;
    const hitRate = hits / list.length;
    const implied = IMPLIED_BE[key] ?? 0.56;
    const edge = hitRate - implied;
    const roi = implied > 0 ? (hitRate / implied - 1) * 100 : 0;
    const parts = key.split("_");

    results.push({
      structureKey: key,
      platform: parts[0],
      structure: parts.slice(1).join("_"),
      totalLegs: list.length,
      hits,
      hitRate,
      impliedBreakeven: implied,
      edge,
      roi,
    });
  }

  return results.sort((a, b) => a.structureKey.localeCompare(b.structureKey));
}

// ── Console printer ────────────────────────────────────────────────────────────

function printBacktestTable(results: BacktestResult[]): void {
  console.log("\n┌────────────────────────────────────────────────────────────────────────┐");
  console.log("│  BACKTEST: Historical Edge Validation                                  │");
  console.log("├────────┬───────┬───────┬────────┬─────────┬────────┬──────────────────┤");
  console.log("│ EV≥    │ Legs  │ Hits  │ Hit%   │ Model%  │ ROI    │ Edge Signal      │");
  console.log("├────────┼───────┼───────┼────────┼─────────┼────────┼──────────────────┤");

  for (const r of results) {
    if (r.totalLegs === 0) continue;
    const signal = r.roi > 0.05
      ? "✅ PROFITABLE"
      : r.roi > 0
        ? "↗ marginal +"
        : r.roi > -0.05
          ? "~ break-even"
          : "↘ -EV";

    const line = [
      ((r.evThreshold * 100).toFixed(1) + "%").padStart(6),
      String(r.totalLegs).padStart(5),
      String(r.hits).padStart(5),
      ((r.hitRate * 100).toFixed(1) + "%").padStart(6),
      ((r.avgModelProb * 100).toFixed(1) + "%").padStart(7),
      ((r.roi * 100).toFixed(1) + "%").padStart(6),
      signal,
    ].join(" │ ");
    console.log(`│ ${line} │`);
  }
  console.log("└────────┴───────┴───────┴────────┴─────────┴────────┴──────────────────┘\n");
}

function printStructureTable(results: StructureBacktest[]): void {
  if (results.length === 0) {
    console.log("[Backtest] No structure-level data available (need platform/structure tags).\n");
    return;
  }

  console.log("\n┌──────────────────────────────────────────────────────────────────┐");
  console.log("│  STRUCTURE BACKTEST: Win Rate vs Gospel Breakeven               │");
  console.log("├──────────┬───────┬────────┬──────────┬──────────┬──────────────┤");
  console.log("│ Structure│ Legs  │ Hit%   │ Implied% │   Edge   │ Signal       │");
  console.log("├──────────┼───────┼────────┼──────────┼──────────┼──────────────┤");

  for (const r of results) {
    const signal = r.edge > 0.03
      ? "✅ OVER"
      : r.edge > 0
        ? "↗ slight +"
        : r.edge > -0.03
          ? "~ neutral"
          : "↘ UNDER";
    const edgeSign = r.edge >= 0 ? "+" : "";
    const line = [
      r.structureKey.padEnd(9),
      String(r.totalLegs).padStart(5),
      ((r.hitRate * 100).toFixed(1) + "%").padStart(6),
      ((r.impliedBreakeven * 100).toFixed(1) + "%").padStart(8),
      (edgeSign + (r.edge * 100).toFixed(1) + "%").padStart(8),
      signal,
    ].join(" │ ");
    console.log(`│ ${line} │`);
  }
  console.log("└──────────┴───────┴────────┴──────────┴──────────┴──────────────┘\n");
}

// ── CLI main ──────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  let minEv = 0.01;
  let byStructure = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--min-ev" && argv[i + 1]) minEv = Number(argv[++i]);
    if (argv[i] === "--by-structure") byStructure = true;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(` Phase 7.4 Backtest Engine`);
  console.log(` minEv=${(minEv * 100).toFixed(1)}%  byStructure=${byStructure}`);
  console.log(`${"═".repeat(60)}\n`);

  const rows = readTrackerRows();
  const resolved = rows.filter((r) => r.result === 0 || r.result === 1);
  console.log(`[Backtest] Loaded ${rows.length} tracker rows, ${resolved.length} resolved`);

  if (resolved.length < 10) {
    console.log(
      "\n⚠  Insufficient data for meaningful backtest (need ≥10 resolved legs).\n" +
      "   Run: npm run calibrate:scrape to fill results from ESPN.\n"
    );
    return;
  }

  // EV threshold sweep
  const thresholds = [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05].filter((t) => t >= minEv);
  const results = runBacktest(resolved, thresholds);
  printBacktestTable(results);

  // Structure breakdown
  if (byStructure) {
    const structResults = runStructureBacktest(resolved);
    printStructureTable(structResults);
  }

  // Summary verdict
  const r2 = results.find((r) => Math.abs(r.evThreshold - 0.02) < 0.001);
  if (r2 && r2.totalLegs >= 50) {
    const verdict = r2.roi > 0
      ? `✅ Model generates +ROI at EV≥2% (ROI=${(r2.roi * 100).toFixed(1)}%, n=${r2.totalLegs})`
      : `❌ Model ROI is negative at EV≥2% (ROI=${(r2.roi * 100).toFixed(1)}%, n=${r2.totalLegs})`;
    console.log(verdict);
  } else {
    console.log("⏳ Insufficient data at EV≥2% threshold (need ≥50 legs)");
  }
}

if (require.main === module) {
  main();
}
