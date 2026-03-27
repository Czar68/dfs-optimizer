import fs from "fs";
import path from "path";
import { readTrackerRowsWithResult } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";
import {
  enforceMonotonicBuckets,
  ProbabilityCalibrationArtifact,
  ProbabilityCalibrationBucket,
} from "../modeling/probability_calibration";

const START = 0.45;
const END = 0.75;
const STEP = 0.05;
const MIN_SAMPLES_DEFAULT = 25;
const TARGET_SHRINK_SAMPLES = 100;

function rowProb(r: PerfTrackerRow): number {
  const p = r.trueProb;
  if (!Number.isFinite(p)) return 0.5;
  return Math.max(0.01, Math.min(0.99, p));
}

function clamp01(p: number): number {
  return Math.max(0.01, Math.min(0.99, p));
}

export function buildProbabilityCalibrationArtifact(
  rows: PerfTrackerRow[],
  options?: { minSamplesPerBucket?: number; activeInOptimizer?: boolean }
): ProbabilityCalibrationArtifact {
  const minSamplesPerBucket = options?.minSamplesPerBucket ?? MIN_SAMPLES_DEFAULT;
  const buckets: ProbabilityCalibrationBucket[] = [];
  const bucketCount = Math.round((END - START) / STEP);
  for (let i = 0; i < bucketCount; i++) {
    const lo = Number((START + i * STEP).toFixed(2));
    const hi = Number((lo + STEP).toFixed(2));
    const inBucket = rows.filter((r) => {
      const p = rowProb(r);
      return p >= lo && p < hi;
    });
    const n = inBucket.length;
    const pred = n > 0 ? inBucket.reduce((s, r) => s + rowProb(r), 0) / n : (lo + hi) / 2;
    const realized = n > 0 ? inBucket.reduce((s, r) => s + (r.result === 1 ? 1 : 0), 0) / n : pred;
    const weight = Math.min(1, n / TARGET_SHRINK_SAMPLES);
    const shrunk = pred + (realized - pred) * weight;
    const mode: "identity_sparse" | "calibrated" = n >= minSamplesPerBucket ? "calibrated" : "identity_sparse";
    buckets.push({
      bucketLabel: `${lo.toFixed(2)}-${hi.toFixed(2)}`,
      minProb: lo,
      maxProb: hi,
      sampleCount: n,
      predictedAvgProb: pred,
      realizedHitRate: realized,
      calibratedProb: mode === "calibrated" ? clamp01(shrunk) : clamp01(pred),
      mode,
    });
  }
  const monotonic = enforceMonotonicBuckets(buckets);
  const calibratedCount = monotonic.filter((b) => b.mode === "calibrated").length;
  const notes: string[] = [];
  notes.push("Phase 16R bucket mapping from resolved perf_tracker rows.");
  notes.push(`Sparse buckets (<${minSamplesPerBucket}) default to identity mapping.`);
  notes.push("Calibrated buckets use shrinkage toward realized hit rate, then monotonic pass.");
  if (calibratedCount === 0) notes.push("No bucket met minimum samples; mapping is identity-only.");
  return {
    generatedAtUtc: new Date().toISOString(),
    source: "data/perf_tracker.jsonl result in {0,1}",
    activeInOptimizer: options?.activeInOptimizer ?? false,
    minSamplesPerBucket,
    totalResolvedRows: rows.length,
    notes,
    buckets: monotonic,
  };
}

export function exportProbabilityCalibration(options?: {
  outPath?: string;
  minSamplesPerBucket?: number;
  activeInOptimizer?: boolean;
}): { outPath: string; artifact: ProbabilityCalibrationArtifact } {
  const rows = readTrackerRowsWithResult();
  const artifact = buildProbabilityCalibrationArtifact(rows, {
    minSamplesPerBucket: options?.minSamplesPerBucket,
    activeInOptimizer: options?.activeInOptimizer,
  });
  const outPath = options?.outPath ?? path.join(process.cwd(), "artifacts", "probability_calibration.json");
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2), "utf8");
  return { outPath, artifact };
}

if (require.main === module) {
  const out = exportProbabilityCalibration();
  const calibrated = out.artifact.buckets.filter((b) => b.mode === "calibrated").length;
  console.log(`[export:calibration] wrote ${out.outPath}`);
  console.log(
    `[export:calibration] resolved_rows=${out.artifact.totalResolvedRows} calibrated_buckets=${calibrated}/${out.artifact.buckets.length} active=${out.artifact.activeInOptimizer}`
  );
}

