// src/run_calibration_pipeline.ts
// Phase 6 calibration pipeline CLI runner.
//
// Usage:
//   node dist/run_calibration_pipeline.js [--days-back 180] [--min-samples-per-structure 100] [--scrape] [--trends]
//
// Flags:
//   --days-back N              Consider resolved legs up to N days old (default 180).
//   --min-samples-per-structure N  Min resolved legs to include a structure in calibration (default 100).
//   --scrape                   Run ESPN scraper to fill in missing results before computing (slow).
//   --trends                   Also compute and print player-level trend summary.
//   --out-dir PATH             Directory for CSV output (default: process.cwd()).
//
// Output:
//   nba_by_structure_YYYYMMDD.csv — per-structure aggregated stats.
//   Console table showing actualWinRate vs impliedBreakeven for each structure.

import fs from "fs";
import path from "path";
import { readTrackerRows } from "./perf_tracker_db";
import { PerfTrackerRow } from "./perf_tracker_types";
import {
  buildStructureCalibrations,
  StructureCalibration,
  STRUCTURE_CALIB_MAX_AGE_DAYS,
} from "./historical/calibration_store";
import {
  computeAllPlayerTrends,
  PlayerTrend,
  TREND_MIN_SAMPLES,
  TREND_MAX_AGE_DAYS,
} from "./historical/trend_analyzer";
import { exponentialDecayWeight } from "./historical/decay_weights";
import { scrapeAndUpdateTracker, fetchActualStatFromNba } from "./scrape_nba_leg_results";

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(): {
  daysBack: number;
  minSamples: number;
  scrape: boolean;
  trends: boolean;
  outDir: string;
} {
  const argv = process.argv.slice(2);
  let daysBack = 180;
  let minSamples = 100;
  let scrape = false;
  let trends = false;
  let outDir = process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--days-back" && argv[i + 1]) {
      daysBack = Number(argv[++i]);
    } else if ((arg === "--min-samples-per-structure" || arg === "--min-samples") && argv[i + 1]) {
      minSamples = Number(argv[++i]);
    } else if (arg === "--scrape") {
      scrape = true;
    } else if (arg === "--trends") {
      trends = true;
    } else if (arg === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    }
  }

  return { daysBack, minSamples, scrape, trends, outDir };
}

// ── CSV writer ────────────────────────────────────────────────────────────────

function writeCsv(rows: string[][], outPath: string): void {
  const content = rows.map((r) => r.join(",")).join("\n") + "\n";
  fs.writeFileSync(outPath, content, "utf8");
}

// ── Structure CSV builder ─────────────────────────────────────────────────────

function buildStructureCsv(
  calibrations: StructureCalibration[],
  allRows: PerfTrackerRow[],
  daysBack: number,
  refDate: Date
): string[][] {
  const HALFLIFE = 30;

  function daysAgo(dateStr: string): number {
    const d = new Date(dateStr);
    return Math.max(0, (refDate.getTime() - d.getTime()) / 86_400_000);
  }

  // Raw resolved rows per structure key (for nCards estimate)
  const legsByStructure = new Map<string, PerfTrackerRow[]>();
  for (const r of allRows) {
    if (r.result !== 0 && r.result !== 1) continue;
    if (!r.structure || !r.platform) continue;
    const age = daysAgo(r.date);
    if (age > daysBack) continue;
    const key = `${r.platform.toUpperCase()}_${r.structure.toUpperCase()}`;
    const list = legsByStructure.get(key) ?? [];
    list.push(r);
    legsByStructure.set(key, list);
  }

  // Header
  const header = [
    "platform",
    "structure",
    "picks",
    "nLegs",
    "nEff",
    "actualLegWinRate",
    "impliedBreakeven",
    "legEdge",
    "profitPerDollar",
    "calibMult",
    "note",
  ];

  const dataRows: string[][] = [header];

  for (const c of calibrations) {
    const picks = extractPickCount(c.structure);
    const profitPerDollar = c.impliedBreakeven > 0
      ? ((c.actualLegWinRate / c.impliedBreakeven) - 1) * 100
      : 0;
    const note =
      c.legEdge > 0.03
        ? "OVER-PERFORMING"
        : c.legEdge < -0.03
        ? "UNDER-PERFORMING"
        : "NEUTRAL";

    dataRows.push([
      c.platform,
      c.structure,
      String(picks),
      String(c.nLegs),
      c.nEff.toFixed(1),
      (c.actualLegWinRate * 100).toFixed(2) + "%",
      (c.impliedBreakeven * 100).toFixed(2) + "%",
      (c.legEdge >= 0 ? "+" : "") + (c.legEdge * 100).toFixed(2) + "%",
      (profitPerDollar >= 0 ? "+" : "") + profitPerDollar.toFixed(2) + "%",
      c.calibMult.toFixed(4),
      note,
    ]);
  }

  return dataRows;
}

/** Extract number of picks from structure string ("4P" → 4, "3F" → 3, "2S" → 2). */
function extractPickCount(structure: string): number {
  const match = structure.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Console table printer ─────────────────────────────────────────────────────

function printStructureTable(calibrations: StructureCalibration[]): void {
  if (calibrations.length === 0) {
    console.log("\n[CalibPipeline] No structures with sufficient data yet.");
    console.log(
      "  → Run --scrape to fill results, then re-run once you have ≥100 resolved legs per structure.\n"
    );
    return;
  }

  console.log("\n┌──────────────────────────────────────────────────────────────────────────────┐");
  console.log("│  STRUCTURE CALIBRATION vs IMPLIED BREAKEVEN                                  │");
  console.log("├──────────┬──────┬──────────┬──────────┬──────────┬──────────┬────────────────┤");
  console.log("│ Structure│ Legs │  Actual  │ Implied  │   Edge   │ CalibMul │ Signal         │");
  console.log("├──────────┼──────┼──────────┼──────────┼──────────┼──────────┼────────────────┤");

  for (const c of calibrations) {
    const edgeSign = c.legEdge >= 0 ? "+" : "";
    const signal =
      c.legEdge > 0.03
        ? "↑ OVER-PERFORM"
        : c.legEdge < -0.03
        ? "↓ UNDER-PERFORM"
        : "  neutral";

    const line = [
      c.structureKey.padEnd(9),
      String(c.nLegs).padStart(5),
      ((c.actualLegWinRate * 100).toFixed(1) + "%").padStart(8),
      ((c.impliedBreakeven * 100).toFixed(1) + "%").padStart(8),
      (edgeSign + (c.legEdge * 100).toFixed(1) + "%").padStart(8),
      c.calibMult.toFixed(3).padStart(8),
      signal,
    ].join(" │ ");

    console.log(`│ ${line} │`);
  }

  console.log("└──────────┴──────┴──────────┴──────────┴──────────┴──────────┴────────────────┘\n");
}

function printTrendsTable(trends: Map<string, PlayerTrend>): void {
  const all = [...trends.values()].sort(
    (a, b) => Math.abs(b.trendBoost) - Math.abs(a.trendBoost)
  );
  const top = all.slice(0, 20);
  if (top.length === 0) {
    console.log("[TrendAnalyzer] No player trends with sufficient data.\n");
    return;
  }

  console.log("\n┌───────────────────────────────────────────────────────────────────────────┐");
  console.log("│  PLAYER TRENDS (top 20 by trend boost)                                    │");
  console.log("├─────────────────────────┬─────────────┬────────┬────────┬────────┬────────┤");
  console.log("│ Player                  │ Stat        │ HitRt% │ Model% │ Boost% │ Legs   │");
  console.log("├─────────────────────────┼─────────────┼────────┼────────┼────────┼────────┤");
  for (const t of top) {
    const boostSign = t.trendBoost >= 0 ? "+" : "";
    const line = [
      t.player.substring(0, 24).padEnd(24),
      t.stat.substring(0, 12).padEnd(12),
      ((t.hitRate * 100).toFixed(1) + "%").padStart(6),
      ((t.avgModelProb * 100).toFixed(1) + "%").padStart(6),
      (boostSign + (t.trendBoost * 100).toFixed(1) + "%").padStart(6),
      String(t.nLegs).padStart(5),
    ].join(" │ ");
    console.log(`│ ${line} │`);
  }
  console.log("└─────────────────────────┴─────────────┴────────┴────────┴────────┴────────┘\n");
}

// ── Kelly preview ─────────────────────────────────────────────────────────────

/** Print a simple calibration comparison for the top-10 most-calibrated structures. */
function printKellyPreview(calibrations: StructureCalibration[]): void {
  if (calibrations.length === 0) return;

  console.log("\n--- Kelly preview (calibration impact on trueProb and EV) ---");
  console.log(
    "Structure  trueProb(baseline)  calibratedProb  baseEV      calibratedEV"
  );

  const EXAMPLE_PROB = 0.57;
  for (const c of calibrations.slice(0, 10)) {
    const rawEv = EXAMPLE_PROB - 0.5;
    const calibProb = Math.max(
      EXAMPLE_PROB - 0.05,
      Math.min(EXAMPLE_PROB + 0.05, EXAMPLE_PROB * c.calibMult)
    );
    const calibEv = calibProb - 0.5;
    const sign = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
    console.log(
      `  ${c.structureKey.padEnd(8)}  ${(EXAMPLE_PROB * 100).toFixed(1)}%               ` +
        `${(calibProb * 100).toFixed(1)}%           ` +
        `${sign(rawEv)}    ${sign(calibEv)}`
    );
  }
  console.log(
    "\n  (example at trueProb=57% per leg; adjust with actual pool of filtered legs)\n"
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { daysBack, minSamples, scrape, trends, outDir } = parseArgs();

  console.log(`\n${"═".repeat(70)}`);
  console.log(` Phase 6 Calibration Pipeline`);
  console.log(
    ` daysBack=${daysBack}  minSamples=${minSamples}  scrape=${scrape}  trends=${trends}`
  );
  console.log(`${"═".repeat(70)}\n`);

  // ── Step 1: optionally scrape ESPN for missing results ─────────────────────
  if (scrape) {
    console.log("[Step 1] Scraping ESPN box scores to fill missing results…");
    const { updated, skipped, noData } = await scrapeAndUpdateTracker(
      fetchActualStatFromNba
    );
    console.log(
      `[Scraper] updated=${updated}  skipped=${skipped}  noData=${noData}\n`
    );
  } else {
    console.log("[Step 1] Skipped scraping (pass --scrape to run ESPN fetcher).\n");
  }

  // ── Step 2: load resolved tracker rows ────────────────────────────────────
  const allRows = readTrackerRows();
  const resolved = allRows.filter((r) => r.result === 0 || r.result === 1);
  const withStructure = resolved.filter((r) => r.structure && r.platform);
  console.log(
    `[Step 2] Tracker: ${allRows.length} total rows, ${resolved.length} resolved, ${withStructure.length} with structure tag`
  );

  if (withStructure.length === 0) {
    console.log(
      "\n⚠  No rows have structure/platform tags yet.\n" +
        "   → Run `npm run backfill` to tag existing rows from tier1.csv / tier2.csv.\n" +
        "   → Future optimizer runs will auto-tag new rows.\n"
    );
  }

  // ── Step 3: build structure calibrations ──────────────────────────────────
  console.log("\n[Step 3] Building per-structure calibrations…");
  const refDate = new Date();
  const calibrations = buildStructureCalibrations(allRows, minSamples, refDate);
  console.log(`         Found ${calibrations.length} structure(s) with ≥${minSamples} legs`);

  // ── Step 4: print console table ───────────────────────────────────────────
  printStructureTable(calibrations);

  // ── Step 5: write CSV ─────────────────────────────────────────────────────
  const dateStr = refDate.toISOString().slice(0, 10).replace(/-/g, "");
  const csvPath = path.join(outDir, `nba_by_structure_${dateStr}.csv`);
  const csvRows = buildStructureCsv(calibrations, allRows, daysBack, refDate);
  writeCsv(csvRows, csvPath);
  console.log(`[Step 5] Wrote ${csvRows.length - 1} structure row(s) to ${csvPath}`);

  // ── Step 6: Kelly preview ─────────────────────────────────────────────────
  printKellyPreview(calibrations);

  // ── Step 7: optional player trends ────────────────────────────────────────
  if (trends) {
    console.log("[Step 7] Computing player trends…");
    const trendMap = computeAllPlayerTrends(
      allRows,
      TREND_MIN_SAMPLES,
      daysBack,
      14,
      refDate
    );
    console.log(`         Found ${trendMap.size} player trends with ≥${TREND_MIN_SAMPLES} legs`);
    printTrendsTable(trendMap);
  }

  // ── Stop conditions check ─────────────────────────────────────────────────
  console.log("Stop conditions:");
  const commonStructures = [
    "PP_2P", "PP_3P", "PP_4P", "PP_5P", "PP_6P",
    "PP_3F", "PP_4F", "PP_5F", "PP_6F",
    "UD_2S", "UD_3S", "UD_4S", "UD_5S", "UD_6S",
    "UD_3F", "UD_4F", "UD_5F", "UD_6F",
  ];
  const calibrated = new Set(calibrations.map((c) => c.structureKey));
  const structureCoverage = commonStructures.filter((s) => calibrated.has(s));
  const stopStructures = structureCoverage.length >= 12;
  console.log(
    `  [${stopStructures ? "✅" : "❌"}] ≥12 common structures calibrated (have ${structureCoverage.length}/${commonStructures.length})`
  );
  console.log(
    `  [${calibrations.length > 0 ? "✅" : "❌"}] calibration_store returns actualWinRate (${calibrations.length} structs)`
  );
  console.log(
    `  [${resolved.length >= 500 ? "✅" : "❌"}] ≥500 resolved legs backfilled (have ${resolved.length})`
  );

  if (!stopStructures || resolved.length < 500) {
    console.log(
      "\n  ⏳ Accumulate more data: run `npm run backfill` and `node dist/run_calibration_pipeline.js --scrape`"
    );
    console.log("     as more game days resolve.\n");
  } else {
    console.log("\n  ✅ All stop conditions met — calibration is active!\n");
  }
}

main().catch((err) => {
  console.error("[CalibPipeline] Fatal error:", err);
  process.exit(1);
});
