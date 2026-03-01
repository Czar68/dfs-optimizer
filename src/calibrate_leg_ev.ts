// src/calibrate_leg_ev.ts
// Query tracker → buckets (player+stat+line_bucket±0.5+book), min 5 legs. HistHit, Mult, under bias; EV_adj = playedEV * Mult [+ 0.05 for under].
// Step 3: time-decay weighting (PRIMARY_LOOKBACK_DAYS, DECAY_HALFLIFE_DAYS), n_eff in aggregation.

import { readTrackerRowsWithResult, readTrackerRows } from "./perf_tracker_db";
import { PerfTrackerRow } from "./perf_tracker_types";
import { getOddsBucket } from "./odds_buckets";
import { computeOddsCalibrationReport } from "./odds_calibration_report";

const MIN_LEGS = 5;
const MULT_CAP_LOW = 0.8;
const MULT_CAP_HIGH = 1.5;
const UNDER_BONUS_EV = 0.05;
const UNDER_STATS = new Set(["points", "rebounds", "assists", "threes", "3pm", "3-point", "pts", "reb", "ast", "3pm"]);

// Step 3: time-decay config (logged on load)
export const PRIMARY_LOOKBACK_DAYS = 90;
export const DECAY_HALFLIFE_DAYS = 30;
const LN2 = Math.log(2);

// Step 3: odds-bucket calibration (selection only); default off (read at call time for testability)
function useOddsBucketCalib(): boolean {
  return (process.env.USE_ODDS_BUCKET_CALIB ?? "0") === "1";
}
const ODDS_BUCKET_HAIRCUT = 0.02; // subtract from trueProb when bucket overconfident (Hit% < Implied%)
let _oddsBucketDeltaCache: Map<string, number> | null = null;

function getOddsBucketDeltaCache(): Map<string, number> {
  if (_oddsBucketDeltaCache) return _oddsBucketDeltaCache;
  const rows = readTrackerRows();
  const report = computeOddsCalibrationReport(rows, false);
  _oddsBucketDeltaCache = new Map();
  for (const r of report) {
    _oddsBucketDeltaCache.set(`${r.bucket}|${r.side}`, r.delta);
  }
  return _oddsBucketDeltaCache;
}

/** When USE_ODDS_BUCKET_CALIB=1 and bucket shows Hit% < Implied%, return haircut for selection (do not rewrite history). */
export function getOddsBucketCalibrationHaircut(
  overOdds: number | undefined,
  underOdds: number | undefined,
  side: "over" | "under"
): number {
  if (!useOddsBucketCalib()) return 0;
  const bucket = getOddsBucket(overOdds, underOdds, side);
  if (!bucket) return 0;
  const delta = getOddsBucketDeltaCache().get(`${bucket}|${side}`);
  if (delta == null) return 0;
  return delta < 0 ? ODDS_BUCKET_HAIRCUT : 0;
}

/** When USE_ODDS_BUCKET_CALIB=1, under bonus only if odds-bucket (under) has delta >= 0. */
export function isUnderBonusBackedByOddsBucket(overOdds: number | undefined, underOdds: number | undefined): boolean {
  if (!useOddsBucketCalib()) return true;
  const bucket = getOddsBucket(overOdds, underOdds, "under");
  if (!bucket) return true;
  const delta = getOddsBucketDeltaCache().get(`${bucket}|under`);
  if (delta == null) return true;
  return delta >= 0;
}

function lineBucket(line: number): number {
  return Math.round(line * 2) / 2;
}

function bucketKey(row: PerfTrackerRow): string {
  return [row.player, row.stat.toLowerCase(), lineBucket(row.line), row.book].join("|");
}

export interface BucketCalibration {
  player: string;
  stat: string;
  lineBucket: number;
  book: string;
  legs: number;
  n_eff: number;   // Step 3: effective sample size (time-decay weighted)
  histHit: number;
  implied: number;
  mult: number;
  underBonus: number; // 0 or UNDER_BONUS_EV when under hits more than implied
}

/** Days from row date to refDate (default now). */
function daysFrom(refDate: Date, dateStr: string): number {
  const d = new Date(dateStr);
  return (refDate.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
}

/** Time-decay weight: exp(-age_days * ln(2) / halflife). */
export function decayWeight(ageDays: number, halflifeDays: number = DECAY_HALFLIFE_DAYS): number {
  return Math.exp(-ageDays * LN2 / halflifeDays);
}

export function computeBucketCalibrationsFromRows(
  rows: PerfTrackerRow[],
  refDate: Date = new Date()
): BucketCalibration[] {
  const withResult = rows.filter((r) => r.result === 0 || r.result === 1);
  const byBucket = new Map<string, PerfTrackerRow[]>();
  for (const r of withResult) {
    const ageDays = daysFrom(refDate, r.date);
    if (ageDays > PRIMARY_LOOKBACK_DAYS) continue; // exclude only too-old; allow future dates (e.g. tests)
    const key = bucketKey(r);
    const list = byBucket.get(key) ?? [];
    list.push(r);
    byBucket.set(key, list);
  }

  const out: BucketCalibration[] = [];
  for (const [key, list] of byBucket) {
    if (list.length < MIN_LEGS) continue;
    const weights = list.map((r) => decayWeight(daysFrom(refDate, r.date)));
    const sumW = weights.reduce((a, b) => a + b, 0);
    const n_eff = sumW;
    const histHit = weights.reduce((s, w, i) => s + (list[i].result ?? 0) * w, 0) / sumW;
    const implied = weights.reduce((s, w, i) => s + list[i].trueProb * w, 0) / sumW;
    const rawMult = implied > 0 ? histHit / implied : 1;
    const mult = Math.max(MULT_CAP_LOW, Math.min(MULT_CAP_HIGH, rawMult));
    const underHist = 1 - histHit;
    const underImplied = 1 - implied;
    const statNorm = list[0].stat.toLowerCase();
    const underBonus =
      UNDER_STATS.has(statNorm) && underHist > underImplied ? UNDER_BONUS_EV : 0;
    const [player, stat, lb, book] = key.split("|");
    out.push({
      player,
      stat,
      lineBucket: parseFloat(lb) || 0,
      book,
      legs: list.length,
      n_eff,
      histHit,
      implied,
      mult,
      underBonus,
    });
  }
  return out;
}

let _calibrationSettingsLogged = false;

export function computeBucketCalibrations(): BucketCalibration[] {
  const rows = readTrackerRowsWithResult();
  if (!_calibrationSettingsLogged) {
    console.log(
      `[Calibration] PRIMARY_LOOKBACK_DAYS=${PRIMARY_LOOKBACK_DAYS} DECAY_HALFLIFE_DAYS=${DECAY_HALFLIFE_DAYS} rows_with_result=${rows.length}`
    );
    _calibrationSettingsLogged = true;
  }
  return computeBucketCalibrationsFromRows(rows);
}

const statNormMap: Record<string, string> = {
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  threes: "3pm",
  "3pm": "3pm",
  "3-point": "3pm",
  pts: "points",
  reb: "rebounds",
  ast: "assists",
};

function normalizedStat(stat: string): string {
  return statNormMap[stat.toLowerCase()] ?? stat.toLowerCase();
}

/** Get mult and under bonus for a leg (over). For under legs pass isUnder=true to apply under bonus when applicable. Step 3: when USE_ODDS_BUCKET_CALIB=1, under bonus only if backed by odds-bucket evidence (overOdds/underOdds optional). */
export function getCalibration(
  calibrations: BucketCalibration[],
  player: string,
  stat: string,
  line: number,
  book: string,
  isUnder?: boolean,
  overOdds?: number,
  underOdds?: number
): { mult: number; underBonus: number; bucket?: BucketCalibration } {
  const lb = lineBucket(line);
  const statN = normalizedStat(stat);
  const key = [player, statN, lb, book].join("|");
  const b = calibrations.find(
    (c) =>
      c.player === player &&
      normalizedStat(c.stat) === statN &&
      c.lineBucket === lb &&
      c.book === book
  );
  if (!b) return { mult: 1, underBonus: 0 };
  let underBonus = isUnder ? b.underBonus : 0;
  if (underBonus > 0 && !isUnderBonusBackedByOddsBucket(overOdds, underOdds)) underBonus = 0;
  return {
    mult: b.mult,
    underBonus,
    bucket: b,
  };
}

/** EV_adj = playedEV * mult + underBonus (for under legs). */
export function adjustedEV(
  playedEV: number,
  mult: number,
  isUnder?: boolean,
  underBonus?: number
): number {
  const bonus = isUnder && underBonus ? underBonus : 0;
  return playedEV * mult + bonus;
}
