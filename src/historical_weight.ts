// src/historical_weight.ts
// Stub: Historical weight lookups from results DB for best-bet scoring.
//
// When the results DB has enough data (50+ settled cards), this module
// will compute hit rates by site + legCount + statType and return a
// multiplier (0.5–1.5) for each card's best-bet score.
//
// Until then, returns 1.0 (neutral) for all inputs.

import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "results", "results.db");

export interface HistoricalLookup {
  /** Weight multiplier for a card based on historical hit rate (0.5–1.5, default 1.0) */
  getWeight(site: string, legCount: number, statTypes: string[]): number;
  /** Number of settled cards used to compute weights */
  sampleSize: number;
}

/**
 * Load historical weights from results DB.
 * Returns neutral weights (1.0) if DB doesn't exist or has < 50 settled cards.
 */
export function loadHistoricalWeights(): HistoricalLookup {
  if (!fs.existsSync(DB_PATH)) {
    console.log("[HistWeight] No results DB — using neutral weights (1.0)");
    return neutralLookup();
  }

  // TODO: When sqlite3 is available, query:
  //   SELECT site, leg_count, stat_type, COUNT(*) as total,
  //          SUM(CASE WHEN result='hit' THEN 1 ELSE 0 END) as hits
  //   FROM outcomes o JOIN legs l ON o.leg_id = l.leg_id
  //   GROUP BY site, leg_count, stat_type
  //   HAVING total >= 10
  //
  // Then compute: weight = hitRate / expectedHitRate (capped 0.5–1.5)

  console.log("[HistWeight] Stub: returning neutral weights (1.0) until DB has settled outcomes");
  return neutralLookup();
}

function neutralLookup(): HistoricalLookup {
  return {
    getWeight: () => 1.0,
    sampleSize: 0,
  };
}

/**
 * Penalize low-sample-size stat types.
 * Stats with < minSample legs in historical data get a discount (0.7–0.9).
 */
export function lowSamplePenalty(statType: string, sampleSize: number, minSample = 20): number {
  if (sampleSize >= minSample) return 1.0;
  if (sampleSize === 0) return 0.8;
  return 0.7 + 0.3 * (sampleSize / minSample);
}
