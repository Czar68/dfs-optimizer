#!/usr/bin/env npx ts-node
/**
 * Run bucket calibration from data/perf_tracker.jsonl and print report.
 * Flags buckets with mult < 0.85 or > 1.35 (per user request).
 * Usage: npx ts-node scripts/run_calibration_report.ts
 */
import {
  computeBucketCalibrationsFromRows,
  type BucketCalibration,
} from "../src/calibrate_leg_ev";
import { readTrackerRowsWithResult } from "../src/perf_tracker_db";

const MULT_LOW_FLAG = 0.85;
const MULT_HIGH_FLAG = 1.35;

function main(): void {
  const rows = readTrackerRowsWithResult();
  console.log(`[Calibration] rows_with_result=${rows.length}`);
  if (rows.length === 0) {
    console.log("No tracker rows with result; skipping calibration report.");
    return;
  }
  const buckets = computeBucketCalibrationsFromRows(rows);
  console.log(`[Calibration] buckets=${buckets.length} (mult capped [0.8, 1.5] per unit test)\n`);

  if (buckets.length === 0) {
    console.log("  No buckets with ≥5 legs; mult range N/A (calibration inactive until more tracker data).");
  } else {
    const mults = buckets.map((b) => b.mult);
    const minM = Math.min(...mults);
    const maxM = Math.max(...mults);
    console.log(`  Mult range: ${minM.toFixed(3)} – ${maxM.toFixed(3)}`);
  }

  const flagged = buckets.filter((b) => b.mult < MULT_LOW_FLAG || b.mult > MULT_HIGH_FLAG);
  if (flagged.length > 0) {
    console.log(`\n  FLAGGED (mult < ${MULT_LOW_FLAG} or > ${MULT_HIGH_FLAG}): ${flagged.length} buckets`);
    for (const b of flagged.slice(0, 20)) {
      console.log(
        `    ${b.player} ${b.stat} ${b.lineBucket} ${b.book}: legs=${b.legs} histHit=${(b.histHit * 100).toFixed(1)}% implied=${(b.implied * 100).toFixed(1)}% mult=${b.mult.toFixed(3)}`
      );
    }
    if (flagged.length > 20) console.log(`    ... and ${flagged.length - 20} more`);
  } else {
    console.log(`\n  No buckets flagged (all mult in [${MULT_LOW_FLAG}, ${MULT_HIGH_FLAG}]).`);
  }

  if (buckets.length > 0) {
    console.log("\n  Sample buckets (first 5):");
    for (const b of buckets.slice(0, 5)) {
      console.log(
        `    ${b.player} ${b.stat} ${b.lineBucket} ${b.book}: legs=${b.legs} histHit=${(b.histHit * 100).toFixed(1)}% mult=${b.mult.toFixed(3)}`
      );
    }
  }
}

main();
