// src/historical/calibration_store.ts
// Per-structure (PP/UD × 2P–8P / 3F–8F / 2S–8S) historical calibration.
// Loads resolved perf_tracker.jsonl rows and computes decay-weighted leg win-rates
// per structure, then compares against gospel implied breakeven from payout config.

import { readTrackerRows } from "../perf_tracker_db";
import { PerfTrackerRow } from "../perf_tracker_types";
import { PP_PAYOUTS } from "../config/pp_payouts";
import { UD_PAYOUTS } from "../config/ud_payouts";
import {
  exponentialDecayWeight,
  weightedAverage,
} from "./decay_weights";

// ── Constants ──────────────────────────────────────────────────────────────────
export const STRUCTURE_CALIB_HALFLIFE_DAYS = 30;
export const STRUCTURE_CALIB_MAX_AGE_DAYS = 180;
export const STRUCTURE_MIN_SAMPLES_DEFAULT = 100;

// ── Implied breakeven lookup (per-leg, from gospel payout tables) ──────────────

/** Map structureKey → per-leg implied breakeven (from payout gospel). */
const IMPLIED_BREAKEVEN: Record<string, number> = {
  // PrizePicks Power
  PP_2P: PP_PAYOUTS.power[2].breakeven,
  PP_3P: PP_PAYOUTS.power[3].breakeven,
  PP_4P: PP_PAYOUTS.power[4].breakeven,
  PP_5P: PP_PAYOUTS.power[5].breakeven,
  PP_6P: PP_PAYOUTS.power[6].breakeven,
  // PrizePicks Flex
  PP_3F: PP_PAYOUTS.flex[3].breakeven,
  PP_4F: PP_PAYOUTS.flex[4].breakeven,
  PP_5F: PP_PAYOUTS.flex[5].breakeven,
  PP_6F: PP_PAYOUTS.flex[6].breakeven,
  // Underdog Standard
  UD_2S: UD_PAYOUTS.standard[2].breakeven,
  UD_3S: UD_PAYOUTS.standard[3].breakeven,
  UD_4S: UD_PAYOUTS.standard[4].breakeven,
  UD_5S: UD_PAYOUTS.standard[5].breakeven,
  UD_6S: UD_PAYOUTS.standard[6].breakeven,
  UD_7S: UD_PAYOUTS.standard[7].breakeven,
  UD_8S: UD_PAYOUTS.standard[8].breakeven,
  // Underdog Flex
  UD_3F: UD_PAYOUTS.flex[3].breakeven,
  UD_4F: UD_PAYOUTS.flex[4].breakeven,
  UD_5F: UD_PAYOUTS.flex[5].breakeven,
  UD_6F: UD_PAYOUTS.flex[6].breakeven,
  UD_7F: UD_PAYOUTS.flex[7].breakeven,
  UD_8F: UD_PAYOUTS.flex[8].breakeven,
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StructureCalibration {
  /** e.g. "PP_4P", "UD_3F", "UD_2S" */
  structureKey: string;
  /** "PP" | "UD" */
  platform: string;
  /** "4P" | "3F" | "2S" | "3S" etc. */
  structure: string;
  /** Raw resolved leg count (within STRUCTURE_CALIB_MAX_AGE_DAYS) */
  nLegs: number;
  /** Decay-weighted effective sample size */
  nEff: number;
  /** Decay-weighted average hit rate for legs played in this structure */
  actualLegWinRate: number;
  /** Per-leg implied breakeven from gospel payout table */
  impliedBreakeven: number;
  /** actualLegWinRate − impliedBreakeven (positive = historically +EV) */
  legEdge: number;
  /**
   * Calibration multiplier for true probabilities.
   * = actualLegWinRate / impliedBreakeven, capped to [0.85, 1.15].
   * Use: adjustedProb = trueProb * calibMult (capped within ±0.07 shift).
   */
  calibMult: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Infer platform ("PP" | "UD") from tracker row.
 * Priority: row.platform field → leg_id prefix → "PP" fallback.
 */
function inferPlatform(row: PerfTrackerRow): string {
  if (row.platform) return row.platform.toUpperCase();
  const id = (row.leg_id ?? "").toLowerCase();
  if (id.startsWith("underdog")) return "UD";
  if (id.startsWith("prizepicks")) return "PP";
  return "PP";
}

function daysAgo(refDate: Date, dateStr: string): number {
  const d = new Date(dateStr);
  return Math.max(0, (refDate.getTime() - d.getTime()) / 86_400_000);
}

function buildKey(platform: string, structure: string): string {
  return `${platform.toUpperCase()}_${structure.toUpperCase()}`;
}

function normalizeLegEdge(structureKey: string): number {
  return IMPLIED_BREAKEVEN[structureKey] ?? 0.56;
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build structure calibrations from resolved tracker rows.
 * Only rows with result ∈ {0,1} and a `structure` field are considered.
 */
export function buildStructureCalibrations(
  rows: PerfTrackerRow[],
  minSamples: number = STRUCTURE_MIN_SAMPLES_DEFAULT,
  refDate: Date = new Date()
): StructureCalibration[] {
  // Collect resolved rows that have structure info, within age window
  const resolved = rows.filter(
    (r) =>
      (r.result === 0 || r.result === 1) &&
      r.structure &&
      daysAgo(refDate, r.date) <= STRUCTURE_CALIB_MAX_AGE_DAYS
  );

  // Group by structureKey
  const groups = new Map<string, PerfTrackerRow[]>();
  for (const row of resolved) {
    const platform = inferPlatform(row);
    const structure = (row.structure ?? "").toUpperCase();
    const key = buildKey(platform, structure);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: StructureCalibration[] = [];

  for (const [key, list] of groups) {
    if (list.length < minSamples) continue;

    const ages = list.map((r) => daysAgo(refDate, r.date));
    const weights = ages.map((a) =>
      exponentialDecayWeight(a, STRUCTURE_CALIB_HALFLIFE_DAYS)
    );
    const nEff = weights.reduce((s, w) => s + w, 0);
    const hits = list.map((r) => r.result as number);
    const actualLegWinRate = weightedAverage(hits, weights);

    const impliedBreakeven = normalizeLegEdge(key);
    const legEdge = actualLegWinRate - impliedBreakeven;
    const rawMult = impliedBreakeven > 0 ? actualLegWinRate / impliedBreakeven : 1;
    const calibMult = Math.max(0.85, Math.min(1.15, rawMult));

    const parts = key.split("_");
    out.push({
      structureKey: key,
      platform: parts[0],
      structure: parts.slice(1).join("_"),
      nLegs: list.length,
      nEff,
      actualLegWinRate,
      impliedBreakeven,
      legEdge,
      calibMult,
    });
  }

  return out.sort((a, b) => a.structureKey.localeCompare(b.structureKey));
}

/**
 * Look up calibration for a specific platform + flexType.
 * Returns null if not found or fewer than minSamples.
 */
export function getStructureCalibration(
  calibrations: StructureCalibration[],
  platform: "PP" | "UD",
  flexType: string
): StructureCalibration | null {
  const key = buildKey(platform, flexType);
  return calibrations.find((c) => c.structureKey === key) ?? null;
}

// ── Singleton cache ────────────────────────────────────────────────────────────
let _structureCalibCache: StructureCalibration[] | null = null;

/**
 * Load structure calibrations once and cache for the process lifetime.
 * Pass `force = true` to reload from disk (e.g. after a scrape run).
 */
export function loadStructureCalibrations(
  minSamples: number = STRUCTURE_MIN_SAMPLES_DEFAULT,
  force = false
): StructureCalibration[] {
  if (_structureCalibCache && !force) return _structureCalibCache;
  const rows = readTrackerRows();
  _structureCalibCache = buildStructureCalibrations(rows, minSamples);
  const n = _structureCalibCache.length;
  if (n > 0) {
    console.log(
      `[CalibStore] Loaded ${n} structure calibrations (minSamples=${minSamples})`
    );
    for (const c of _structureCalibCache) {
      const edgeSign = c.legEdge >= 0 ? "+" : "";
      console.log(
        `  ${c.structureKey.padEnd(8)} actual=${(c.actualLegWinRate * 100).toFixed(1)}%  implied=${(c.impliedBreakeven * 100).toFixed(1)}%  edge=${edgeSign}${(c.legEdge * 100).toFixed(1)}%  n=${c.nLegs}`
      );
    }
  } else {
    console.log(
      `[CalibStore] No structure calibrations yet (need ≥${minSamples} resolved legs per structure)`
    );
  }
  return _structureCalibCache;
}
