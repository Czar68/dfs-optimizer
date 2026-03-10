/**
 * src/best_ev_engine.ts
 * Universal Best-EV Selection Engine.
 * Generates 2–6 leg structures for PP and UD, computes exact CardEV from registry,
 * ranks and outputs top 3 per platform. No inline math — all from math_models.
 */

import { getAllRegistryStructureIds, getRegistryEntry } from "../math_models/registry";
import { cardEvFromRegistry } from "../math_models/card_ev_from_registry";
import { binomPmf } from "../math_models/hit_distribution_dp";

export type Platform = "PP" | "UD";

export interface StructureRankRow {
  platform: Platform;
  structureId: string;
  size: number;
  type: string;
  cardEv: number;
  cardEvPct: number;
}

const REPRESENTATIVE_AVG_PROB = 0.55;

/** Build iid binomial hit distribution for n legs with avg probability p. */
function hitDistributionIid(n: number, p: number): Record<number, number> {
  const dist: Record<number, number> = {};
  for (let k = 0; k <= n; k++) {
    const prob = binomPmf(k, n, p);
    if (prob > 0) dist[k] = prob;
  }
  return dist;
}

/** Filter structure IDs to 2–6 leg only and by platform. */
function getStructuresForPlatform(platform: Platform): string[] {
  const all = getAllRegistryStructureIds();
  return all.filter((id) => {
    const entry = getRegistryEntry(id);
    if (!entry || entry.size < 2 || entry.size > 6) return false;
    return entry.platform === platform;
  });
}

/**
 * Compute exact CardEV for each structure using registry outcome payouts.
 * EV = Σ P(outcome) × Payout(outcome) - 1.
 */
export function rankStructuresByCardEv(
  platform: Platform,
  avgProb: number = REPRESENTATIVE_AVG_PROB
): StructureRankRow[] {
  const ids = getStructuresForPlatform(platform);
  const rows: StructureRankRow[] = [];

  for (const structureId of ids) {
    const entry = getRegistryEntry(structureId);
    if (!entry) continue;
    const dist = hitDistributionIid(entry.size, avgProb);
    const cardEv = cardEvFromRegistry(dist, structureId);
    rows.push({
      platform: entry.platform as Platform,
      structureId: entry.structureId,
      size: entry.size,
      type: entry.type,
      cardEv,
      cardEvPct: cardEv * 100,
    });
  }

  rows.sort((a, b) => b.cardEv - a.cardEv);
  return rows;
}

/**
 * Output summary table: top 3 potential card structures per platform.
 * Avoids filler dilution by ranking on exact outcome-based EV.
 */
export function printTopStructuresTable(avgProb: number = REPRESENTATIVE_AVG_PROB): void {
  const topN = 3;
  console.log("\n=== Universal Best-EV Selection (Registry, outcome-based EV) ===\n");
  console.log(`Representative leg hit probability: ${(avgProb * 100).toFixed(0)}%\n`);

  for (const platform of ["PP", "UD"] as Platform[]) {
    const rows = rankStructuresByCardEv(platform, avgProb);
    const top = rows.slice(0, topN);
    console.log(`--- ${platform} Top ${topN} structures ---`);
    if (top.length === 0) {
      console.log("  (none)\n");
      continue;
    }
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      console.log(
        `  ${i + 1}. ${r.structureId} (${r.size}-leg ${r.type})  CardEV: ${r.cardEvPct.toFixed(2)}%`
      );
    }
    console.log("");
  }
  console.log("============================================================\n");
}
