// src/historical/trend_analyzer.ts
// Decay-weighted player-level hit-rate and volatility analysis.
// Used by leg_ev_pipeline to apply a trend adjustment to trueProb before card EV.

import { readTrackerRows } from "../perf_tracker_db";
import { PerfTrackerRow } from "../perf_tracker_types";
import {
  exponentialDecayWeight,
  weightedAverage,
  weightedStdDev,
} from "./decay_weights";

// ── Constants ──────────────────────────────────────────────────────────────────
export const TREND_HALFLIFE_DAYS = 14;       // 2-week half-life for trends
export const TREND_MAX_AGE_DAYS = 60;        // only recent games (2 months)
export const TREND_MIN_SAMPLES = 10;         // minimum resolved legs for trend
export const TREND_MIN_CALIB_SHIFT = 0.02;  // minimum |hitRate − trueProb| to apply boost
export const TREND_MAX_BOOST = 0.05;         // cap |prob adjustment| at ±0.05

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlayerTrend {
  player: string;
  stat: string;
  /** Raw resolved leg count within TREND_MAX_AGE_DAYS */
  nLegs: number;
  /** Decay-weighted effective sample size */
  nEff: number;
  /** Decay-weighted historical hit rate */
  hitRate: number;
  /** Weighted average trueProb at play time (model's expected hit rate) */
  avgModelProb: number;
  /** Standard deviation of residuals (hit − trueProb) — proxy for volatility */
  volatility: number;
  /**
   * Suggested adjustment to trueProb.
   * = clamp(hitRate − avgModelProb, −TREND_MAX_BOOST, +TREND_MAX_BOOST).
   * Zero when |hitRate − avgModelProb| < TREND_MIN_CALIB_SHIFT or nLegs < TREND_MIN_SAMPLES.
   */
  trendBoost: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function daysAgo(refDate: Date, dateStr: string): number {
  const d = new Date(dateStr);
  return Math.max(0, (refDate.getTime() - d.getTime()) / 86_400_000);
}

function playerStatKey(player: string, stat: string): string {
  return `${player.toLowerCase()}|${stat.toLowerCase()}`;
}

function normalizeStat(stat: string): string {
  const s = stat.toLowerCase();
  const MAP: Record<string, string> = {
    pts: "points",
    reb: "rebounds",
    ast: "assists",
    "3pm": "threes",
    "threes_made": "threes",
    "three_pointers_made": "threes",
    stl: "steals",
    blk: "blocks",
    to: "turnovers",
    tov: "turnovers",
  };
  return MAP[s] ?? s;
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Compute a PlayerTrend for a specific player+stat combination.
 * Returns null when fewer than TREND_MIN_SAMPLES resolved legs are available.
 */
export function computePlayerTrend(
  rows: PerfTrackerRow[],
  player: string,
  stat: string,
  daysBack: number = TREND_MAX_AGE_DAYS,
  halfLife: number = TREND_HALFLIFE_DAYS,
  refDate: Date = new Date()
): PlayerTrend | null {
  const normStat = normalizeStat(stat);
  const normPlayer = player.toLowerCase().trim();

  const relevant = rows.filter((r) => {
    if (r.result !== 0 && r.result !== 1) return false;
    const age = daysAgo(refDate, r.date);
    if (age > daysBack) return false;
    if (r.player.toLowerCase().trim() !== normPlayer) return false;
    if (normalizeStat(r.stat) !== normStat) return false;
    return true;
  });

  if (relevant.length < TREND_MIN_SAMPLES) return null;

  const ages = relevant.map((r) => daysAgo(refDate, r.date));
  const weights = ages.map((a) => exponentialDecayWeight(a, halfLife));
  const nEff = weights.reduce((s, w) => s + w, 0);

  const hits = relevant.map((r) => r.result as number);
  const hitRate = weightedAverage(hits, weights);

  const modelProbs = relevant.map((r) => r.trueProb);
  const avgModelProb = weightedAverage(modelProbs, weights);

  // Residuals: actual hit − model probability (per sample)
  const residuals = relevant.map((r, i) => (r.result as number) - r.trueProb);
  const volatility = weightedStdDev(residuals, weights, 0);

  // Trend boost: hitRate vs model, capped and thresholded
  const rawDiff = hitRate - avgModelProb;
  let trendBoost = 0;
  if (Math.abs(rawDiff) >= TREND_MIN_CALIB_SHIFT && nEff >= TREND_MIN_SAMPLES) {
    trendBoost = Math.max(-TREND_MAX_BOOST, Math.min(TREND_MAX_BOOST, rawDiff));
    // High volatility: reduce boost proportionally (cap at 50% reduction for vol > 0.4)
    if (volatility > 0.3) {
      const volPenalty = Math.min(1, (volatility - 0.3) / 0.2);
      trendBoost *= 1 - volPenalty * 0.5;
    }
  }

  return {
    player,
    stat: normStat,
    nLegs: relevant.length,
    nEff,
    hitRate,
    avgModelProb,
    volatility,
    trendBoost,
  };
}

/**
 * Build a trend map for all player+stat pairs in the resolved rows.
 * Returns Map<"player|stat" → PlayerTrend>.
 */
export function computeAllPlayerTrends(
  rows: PerfTrackerRow[],
  minSamples: number = TREND_MIN_SAMPLES,
  daysBack: number = TREND_MAX_AGE_DAYS,
  halfLife: number = TREND_HALFLIFE_DAYS,
  refDate: Date = new Date()
): Map<string, PlayerTrend> {
  const resolved = rows.filter(
    (r) =>
      (r.result === 0 || r.result === 1) &&
      daysAgo(refDate, r.date) <= daysBack
  );

  // Collect unique player+stat pairs
  const pairs = new Map<string, { player: string; stat: string }>();
  for (const r of resolved) {
    const key = playerStatKey(r.player, r.stat);
    if (!pairs.has(key)) {
      pairs.set(key, { player: r.player, stat: normalizeStat(r.stat) });
    }
  }

  const trendMap = new Map<string, PlayerTrend>();
  for (const [key, { player, stat }] of pairs) {
    const trend = computePlayerTrend(
      resolved,
      player,
      stat,
      daysBack,
      halfLife,
      refDate
    );
    if (trend && trend.nLegs >= minSamples) {
      trendMap.set(key, trend);
    }
  }
  return trendMap;
}

/**
 * Look up a PlayerTrend for a specific player+stat.
 * Normalizes stat name before lookup. Returns null if not found.
 */
export function getPlayerTrend(
  trends: Map<string, PlayerTrend>,
  player: string,
  stat: string
): PlayerTrend | null {
  const key = playerStatKey(player, normalizeStat(stat));
  return trends.get(key) ?? null;
}

// ── Singleton cache ────────────────────────────────────────────────────────────
let _trendCache: Map<string, PlayerTrend> | null = null;

/**
 * Load all player trends once and cache for the process lifetime.
 * Pass `force = true` to reload from disk.
 */
export function loadPlayerTrends(
  minSamples: number = TREND_MIN_SAMPLES,
  force = false
): Map<string, PlayerTrend> {
  if (_trendCache && !force) return _trendCache;
  const rows = readTrackerRows();
  _trendCache = computeAllPlayerTrends(rows, minSamples);
  const n = _trendCache.size;
  if (n > 0) {
    console.log(`[TrendAnalyzer] Loaded ${n} player trends (minSamples=${minSamples})`);
    let logged = 0;
    for (const [, t] of _trendCache) {
      if (logged >= 5) break;
      if (Math.abs(t.trendBoost) >= TREND_MIN_CALIB_SHIFT) {
        const sign = t.trendBoost >= 0 ? "+" : "";
        console.log(
          `  ${t.player.padEnd(22)} ${t.stat.padEnd(12)} ` +
            `hitRate=${(t.hitRate * 100).toFixed(1)}%  ` +
            `model=${(t.avgModelProb * 100).toFixed(1)}%  ` +
            `boost=${sign}${(t.trendBoost * 100).toFixed(1)}%  ` +
            `n=${t.nLegs}`
        );
        logged++;
      }
    }
  } else {
    console.log(
      `[TrendAnalyzer] No player trends yet (need ≥${minSamples} resolved legs per player/stat)`
    );
  }
  return _trendCache;
}
