import fs from "fs";
import path from "path";

export interface ProbabilityCalibrationBucket {
  bucketLabel: string;
  minProb: number;
  maxProb: number;
  sampleCount: number;
  predictedAvgProb: number;
  realizedHitRate: number;
  calibratedProb: number;
  mode: "identity_sparse" | "calibrated";
}

export interface ProbabilityCalibrationArtifact {
  generatedAtUtc: string;
  source: string;
  activeInOptimizer: boolean;
  minSamplesPerBucket: number;
  totalResolvedRows: number;
  notes: string[];
  buckets: ProbabilityCalibrationBucket[];
}

type ReadinessArtifact = {
  status?: "not_ready" | "partially_ready" | "ready";
  activationRecommendation?: "keep_disabled" | "eligible_for_review";
  blockers?: string[];
};

let cache: ProbabilityCalibrationArtifact | null = null;
let cachePath = "";
function calibrationPath(): string {
  return path.join(process.cwd(), "artifacts", "probability_calibration.json");
}
function readinessPath(): string {
  return path.join(process.cwd(), "artifacts", "calibration_readiness.json");
}

function clamp01(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  if (p < 0.01) return 0.01;
  if (p > 0.99) return 0.99;
  return p;
}

export function enforceMonotonicBuckets(
  buckets: ProbabilityCalibrationBucket[]
): ProbabilityCalibrationBucket[] {
  let prev = 0;
  return buckets
    .slice()
    .sort((a, b) => a.minProb - b.minProb)
    .map((b) => {
      const curr = Math.max(prev, clamp01(b.calibratedProb));
      prev = curr;
      return { ...b, calibratedProb: curr };
    });
}

function parseCalibration(raw: string): ProbabilityCalibrationArtifact | null {
  try {
    const parsed = JSON.parse(raw) as ProbabilityCalibrationArtifact;
    if (!Array.isArray(parsed?.buckets)) return null;
    parsed.buckets = enforceMonotonicBuckets(parsed.buckets);
    return parsed;
  } catch {
    return null;
  }
}

export function loadProbabilityCalibration(forceReload = false): ProbabilityCalibrationArtifact | null {
  const p = calibrationPath();
  if (!forceReload && cache && cachePath === p) return cache;
  if (!fs.existsSync(p)) {
    cache = null;
    cachePath = p;
    return null;
  }
  const parsed = parseCalibration(fs.readFileSync(p, "utf8"));
  cache = parsed;
  cachePath = p;
  return parsed;
}

export function getActiveProbabilityCalibration(): ProbabilityCalibrationArtifact | null {
  const c = loadProbabilityCalibration();
  if (!c?.activeInOptimizer) return null;
  const readiness = loadCalibrationReadiness();
  if (!readiness || readiness.status !== "ready" || readiness.activationRecommendation !== "eligible_for_review") {
    return null;
  }
  return c;
}

export function loadCalibrationReadiness(): ReadinessArtifact | null {
  const p = readinessPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ReadinessArtifact;
  } catch {
    return null;
  }
}

export function applyProbabilityCalibration(
  rawProb: number,
  calibration: ProbabilityCalibrationArtifact | null
): { calibratedProb: number; applied: boolean; bucketLabel?: string } {
  const raw = clamp01(rawProb);
  if (!calibration || !calibration.buckets.length) {
    return { calibratedProb: raw, applied: false };
  }
  const bucket = calibration.buckets.find((b) => raw >= b.minProb && raw < b.maxProb);
  if (!bucket) return { calibratedProb: raw, applied: false };
  if (bucket.mode !== "calibrated") {
    return { calibratedProb: raw, applied: false, bucketLabel: bucket.bucketLabel };
  }
  return {
    calibratedProb: clamp01(bucket.calibratedProb),
    applied: true,
    bucketLabel: bucket.bucketLabel,
  };
}

