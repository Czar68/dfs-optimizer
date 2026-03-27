/**
 * Phase 97 — Signal vs graded outcome (read-only; not optimizer input).
 *
 * Buckets by signal value **[0,1]**: low **[0, 0.33)**, mid **[0.33, 0.66)**, high **[0.66, 1]**.
 * **`hit_rate`** = hits / (hits + misses); pushes count toward **`count`** only.
 */
import type { EvPick } from "../types";
import type { FeatureScoreSignals } from "./feature_scoring";

export type SignalBucketLabel = "low" | "mid" | "high";

export interface BucketPerformance {
  count: number;
  hit_rate: number;
}

export interface SignalAxisPerformance {
  overall: BucketPerformance;
  high_bucket: BucketPerformance;
  mid_bucket: BucketPerformance;
  low_bucket: BucketPerformance;
}

export type SignalPerformanceReport = {
  minutes_signal: SignalAxisPerformance;
  usage_signal: SignalAxisPerformance;
  environment_signal: SignalAxisPerformance;
  defense_signal: SignalAxisPerformance;
};

type Acc = { hits: number; misses: number; pushes: number };

function emptyAcc(): Acc {
  return { hits: 0, misses: 0, pushes: 0 };
}

/** Partitions **[0,1]** into low / mid / high; non-finite values → **null** (pick skipped for that axis). */
export function signalValueBucket(signal01: number): SignalBucketLabel | null {
  if (!Number.isFinite(signal01)) return null;
  const x = Math.min(1, Math.max(0, signal01));
  if (x < 0.33) return "low";
  if (x < 0.66) return "mid";
  return "high";
}

function hitRate(hits: number, misses: number): number {
  const d = hits + misses;
  return d > 0 ? hits / d : 0;
}

function accToPerf(acc: Acc): BucketPerformance {
  const total = acc.hits + acc.misses + acc.pushes;
  return { count: total, hit_rate: hitRate(acc.hits, acc.misses) };
}

function addOutcome(acc: Acc, o: "hit" | "miss" | "push"): void {
  if (o === "hit") acc.hits += 1;
  else if (o === "miss") acc.misses += 1;
  else acc.pushes += 1;
}

function evaluateOneAxis(picks: readonly EvPick[], signalKey: keyof FeatureScoreSignals["signals"]): SignalAxisPerformance {
  const overall = emptyAcc();
  const low = emptyAcc();
  const mid = emptyAcc();
  const high = emptyAcc();

  for (const p of picks) {
    if (p.featureSignals?.signals == null) continue;
    const o = p.gradedLegOutcome;
    if (o !== "hit" && o !== "miss" && o !== "push") continue;

    const s = p.featureSignals.signals[signalKey];
    if (typeof s !== "number" || !Number.isFinite(s)) continue;

    const b = signalValueBucket(s);
    if (b == null) continue;

    addOutcome(overall, o);
    addOutcome(b === "low" ? low : b === "mid" ? mid : high, o);
  }

  return {
    overall: accToPerf(overall),
    low_bucket: accToPerf(low),
    mid_bucket: accToPerf(mid),
    high_bucket: accToPerf(high),
  };
}

/** Per-axis hit rates vs signal tertiles; only picks with **`featureSignals`** + **`gradedLegOutcome`** contribute. */
export function evaluateSignalPerformance(picks: readonly EvPick[]): SignalPerformanceReport {
  return {
    minutes_signal: evaluateOneAxis(picks, "minutes_signal"),
    usage_signal: evaluateOneAxis(picks, "usage_signal"),
    environment_signal: evaluateOneAxis(picks, "environment_signal"),
    defense_signal: evaluateOneAxis(picks, "defense_signal"),
  };
}
