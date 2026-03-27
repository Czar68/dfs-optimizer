/**
 * Phase 74 — Threshold sensitivity & minimal relaxation search (market-relative edge only).
 * Uses enrichMetrics / marketEdgeFair (aligned with Phase 73 gating).
 */

import fs from "fs";
import path from "path";
import { parseCsv } from "../tracking/legs_csv_index";
import {
  enrichMetrics,
  inferSideFromLegIdCanonical,
  naiveLegMetric,
  type ParsedLegRow,
} from "./market_edge_alignment_analysis";
import { PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD } from "../policy/eligibility_policy";

export const THRESHOLD_REBALANCING_SCHEMA_VERSION = 1;

export type EnrichedLeg = ReturnType<typeof enrichMetrics>[number];

export interface LegWithPlayer extends ParsedLegRow {
  player: string;
}

export type EnrichedLegWithPlayer = EnrichedLeg & { player: string };

export function enrichLegsWithPlayer(raw: LegWithPlayer[]): EnrichedLegWithPlayer[] {
  const e = enrichMetrics(raw);
  return e.map((row, i) => ({ ...row, player: raw[i]?.player ?? row.id }));
}

/** Load legs CSV including `player` for FCFS simulation. */
export function loadLegCsvWithPlayer(pathStr: string): LegWithPlayer[] {
  if (!fs.existsSync(pathStr)) return [];
  const { headers, rows } = parseCsv(pathStr);
  if (headers.length === 0) return [];
  const idx = (h: string) => headers.indexOf(h);
  const idIdx = idx("id");
  const tpIdx = idx("trueProb");
  const oIdx = idx("overOdds");
  const uIdx = idx("underOdds");
  const levIdx = idx("legEv");
  const edgeIdx = idx("edge");
  const playerIdx = idx("player");
  if (idIdx < 0 || tpIdx < 0 || oIdx < 0 || uIdx < 0 || levIdx < 0 || edgeIdx < 0) return [];

  const out: LegWithPlayer[] = [];
  for (const row of rows) {
    const id = (row[idIdx] ?? "").trim();
    if (!id) continue;
    const trueProb = parseFloat(row[tpIdx] ?? "");
    const overOdds = parseFloat(row[oIdx] ?? "");
    const underOdds = parseFloat(row[uIdx] ?? "");
    const legEv = parseFloat(row[levIdx] ?? "");
    const edge = parseFloat(row[edgeIdx] ?? "");
    const player = playerIdx >= 0 ? (row[playerIdx] ?? "").trim() : "";
    if (!Number.isFinite(trueProb) || !Number.isFinite(overOdds) || !Number.isFinite(underOdds)) continue;
    const side = inferSideFromLegIdCanonical(id);
    out.push({
      id,
      player: player || id,
      trueProb,
      overOdds,
      underOdds,
      legEv: Number.isFinite(legEv) ? legEv : naiveLegMetric(trueProb),
      edge: Number.isFinite(edge) ? edge : naiveLegMetric(trueProb),
      side,
    });
  }
  return out;
}

/** FCFS cap: max one leg per player; preserves CSV row order. */
export function applyFcfsPlayerCap(legs: EnrichedLegWithPlayer[], maxPerPlayer: number): EnrichedLegWithPlayer[] {
  const counts = new Map<string, number>();
  const out: EnrichedLegWithPlayer[] = [];
  for (const leg of legs) {
    const k = leg.player;
    const n = counts.get(k) ?? 0;
    if (n + 1 > maxPerPlayer) continue;
    counts.set(k, n + 1);
    out.push(leg);
  }
  return out;
}

export function ppSequentialMarketFairStages(
  enriched: EnrichedLeg[],
  minEdge: number,
  minLegEv: number,
  adjustedEv: number
): {
  afterMinEdge: number;
  afterMinLegEv: number;
  afterEffectiveEv: number;
  drops: { stage: string; dropped: number }[];
} {
  const m = (r: EnrichedLeg) => r.marketEdgeFair;
  const s0 = enriched.length;
  const stage1 = enriched.filter((r) => m(r) >= minEdge);
  const s1 = stage1.length;
  const stage2 = stage1.filter((r) => m(r) >= minLegEv);
  const s2 = stage2.length;
  const stage3 = stage2.filter((r) => m(r) >= adjustedEv);
  const s3 = stage3.length;
  return {
    afterMinEdge: s1,
    afterMinLegEv: s2,
    afterEffectiveEv: s3,
    drops: [
      { stage: "pp_min_edge", dropped: s0 - s1 },
      { stage: "pp_min_leg_ev", dropped: s1 - s2 },
      { stage: "pp_effective_ev", dropped: s2 - s3 },
    ],
  };
}

export function ppBindingStageFromDrops(drops: { stage: string; dropped: number }[]): string {
  let max = -1;
  let name = "none";
  for (const d of drops) {
    if (d.dropped > max) {
      max = d.dropped;
      name = d.stage;
    }
  }
  return max <= 0 ? "none" : name;
}

export function ppCombinedFloor(minEdge: number, minLegEv: number, adjustedEv: number): number {
  return Math.max(minEdge, minLegEv, adjustedEv);
}

export function countPpAfterCombinedFloorAndCap(
  enriched: EnrichedLegWithPlayer[],
  combinedT: number,
  maxLegsPerPlayer: number
): number {
  const passed = enriched.filter((r) => r.marketEdgeFair >= combinedT);
  return applyFcfsPlayerCap(passed, maxLegsPerPlayer).length;
}

export function findMinimalCombinedFloorTStar(
  enriched: EnrichedLegWithPlayer[],
  maxLegsPerPlayer: number,
  goalLegs: number
): {
  tStar: number | null;
  maxAchievableLegsAfterCap: number;
  impossibleForGoal: boolean;
} {
  const ms = enriched.map((r) => r.marketEdgeFair).filter((x) => Number.isFinite(x));
  if (ms.length === 0) {
    return { tStar: null, maxAchievableLegsAfterCap: 0, impossibleForGoal: true };
  }
  let lo = Math.min(...ms);
  let hi = Math.max(...ms);
  const maxAtLo = countPpAfterCombinedFloorAndCap(enriched, lo, maxLegsPerPlayer);
  if (maxAtLo < goalLegs) {
    return { tStar: null, maxAchievableLegsAfterCap: maxAtLo, impossibleForGoal: true };
  }
  for (let iter = 0; iter < 56; iter++) {
    const mid = (lo + hi) / 2;
    const c = countPpAfterCombinedFloorAndCap(enriched, mid, maxLegsPerPlayer);
    if (c >= goalLegs) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-8) break;
  }
  const tStar = lo;
  const maxAchievableLegsAfterCap = countPpAfterCombinedFloorAndCap(enriched, tStar, maxLegsPerPlayer);
  return { tStar, maxAchievableLegsAfterCap, impossibleForGoal: false };
}

export function udStandardPathCount(enriched: EnrichedLeg[], udMinEdge: number, standardPickMinLegEv: number): number {
  return enriched.filter((r) => r.marketEdgeFair >= udMinEdge && r.marketEdgeFair >= standardPickMinLegEv).length;
}

export function udCombinedFloor(udMinEdge: number, standardPickMinLegEv: number): number {
  return Math.max(udMinEdge, standardPickMinLegEv);
}

export function findMinimalUdCombinedFloorForGoal(
  enriched: EnrichedLeg[],
  goalLegs: number
): { tStar: number | null; maxLegs: number; impossibleForGoal: boolean } {
  const ms = enriched.map((r) => r.marketEdgeFair).filter((x) => Number.isFinite(x));
  if (ms.length === 0) return { tStar: null, maxLegs: 0, impossibleForGoal: true };
  let lo = Math.min(...ms);
  let hi = Math.max(...ms);
  const maxAtLo = enriched.filter((r) => r.marketEdgeFair >= lo).length;
  if (maxAtLo < goalLegs) {
    return { tStar: null, maxLegs: maxAtLo, impossibleForGoal: true };
  }
  for (let iter = 0; iter < 56; iter++) {
    const mid = (lo + hi) / 2;
    const c = enriched.filter((r) => r.marketEdgeFair >= mid).length;
    if (c >= goalLegs) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-8) break;
  }
  const tStar = lo;
  const maxLegs = enriched.filter((r) => r.marketEdgeFair >= tStar).length;
  return { tStar, maxLegs, impossibleForGoal: false };
}

export interface PpSweepRow {
  label: string;
  minEdgePerLeg: number;
  minLegEv: number;
  adjustedEvThreshold: number;
  combinedFloor: number;
  afterSequentialEffective: number;
  afterPlayerCap: number;
}

export function sweepPpRelaxEffectiveEv(
  enriched: EnrichedLegWithPlayer[],
  baseline: { minEdgePerLeg: number; minLegEv: number; adjustedEvThreshold: number; maxLegsPerPlayer: number },
  effectiveEvValues: number[]
): PpSweepRow[] {
  const rows: PpSweepRow[] = [];
  for (const eff of effectiveEvValues) {
    const minEdge = baseline.minEdgePerLeg;
    const minLegEv = baseline.minLegEv;
    const seq = ppSequentialMarketFairStages(enriched, minEdge, minLegEv, eff);
    const combined = ppCombinedFloor(minEdge, minLegEv, eff);
    const passed = enriched.filter((r) => r.marketEdgeFair >= combined);
    const afterCap = applyFcfsPlayerCap(passed, baseline.maxLegsPerPlayer);
    rows.push({
      label: `eff=${eff}`,
      minEdgePerLeg: minEdge,
      minLegEv,
      adjustedEvThreshold: eff,
      combinedFloor: combined,
      afterSequentialEffective: seq.afterEffectiveEv,
      afterPlayerCap: afterCap.length,
    });
  }
  return rows;
}

export function resolveLegPaths(root: string): { pp: string | null; ud: string | null } {
  const candidatesPp = [path.join(root, "prizepicks-legs.csv"), path.join(root, "data", "output_logs", "prizepicks-legs.csv")];
  const candidatesUd = [path.join(root, "underdog-legs.csv"), path.join(root, "data", "output_logs", "underdog-legs.csv")];
  return {
    pp: candidatesPp.find((p) => fs.existsSync(p)) ?? null,
    ud: candidatesUd.find((p) => fs.existsSync(p)) ?? null,
  };
}

export { PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD };
