import fs from "fs";
import path from "path";
import { readTrackerRows, readTrackerRowsWithResult } from "../perf_tracker_db";
import type { PerfTrackerRow } from "../perf_tracker_types";

export type ReadinessStatus = "not_ready" | "partially_ready" | "ready";
export type ActivationRecommendation = "keep_disabled" | "eligible_for_review";

export interface CalibrationReadinessCriteria {
  minResolvedRows: number;
  minSamplesPerBucket: number;
  minBucketsMeetingSample: number;
  minClvRows: number;
}

export interface CalibrationReadinessBucket {
  bucketLabel: string;
  minProb: number;
  maxProb: number;
  resolvedRows: number;
  clvRows: number;
  meetsSample: boolean;
}

export interface CalibrationReadinessArtifact {
  generatedAtUtc: string;
  status: ReadinessStatus;
  activationRecommendation: ActivationRecommendation;
  criteria: CalibrationReadinessCriteria;
  counts: {
    resolvedRows: number;
    clvRows: number;
    bucketsMeetingSample: number;
    totalBuckets: number;
    minBucketResolved: number;
    maxBucketResolved: number;
  };
  blockers: string[];
  buckets: CalibrationReadinessBucket[];
}

const START = 0.45;
const END = 0.75;
const STEP = 0.05;

export const DEFAULT_READINESS_CRITERIA: CalibrationReadinessCriteria = {
  minResolvedRows: 200,
  minSamplesPerBucket: 25,
  minBucketsMeetingSample: 4,
  minClvRows: 100,
};

function rowProb(r: PerfTrackerRow): number {
  const p = r.trueProb;
  if (!Number.isFinite(p)) return 0.5;
  return Math.max(0.01, Math.min(0.99, p));
}

export function buildCalibrationReadiness(
  allRows: PerfTrackerRow[],
  resolvedRows: PerfTrackerRow[],
  criteria = DEFAULT_READINESS_CRITERIA
): CalibrationReadinessArtifact {
  const buckets: CalibrationReadinessBucket[] = [];
  const bucketCount = Math.round((END - START) / STEP);
  for (let i = 0; i < bucketCount; i++) {
    const lo = Number((START + i * STEP).toFixed(2));
    const hi = Number((lo + STEP).toFixed(2));
    const inBucket = resolvedRows.filter((r) => {
      const p = rowProb(r);
      return p >= lo && p < hi;
    });
    const clvRows = inBucket.filter(
      (r) =>
        (typeof r.clvDelta === "number" && Number.isFinite(r.clvDelta)) ||
        (typeof r.closeImpliedProb === "number" && Number.isFinite(r.closeImpliedProb))
    );
    buckets.push({
      bucketLabel: `${lo.toFixed(2)}-${hi.toFixed(2)}`,
      minProb: lo,
      maxProb: hi,
      resolvedRows: inBucket.length,
      clvRows: clvRows.length,
      meetsSample: inBucket.length >= criteria.minSamplesPerBucket,
    });
  }

  const resolved = resolvedRows.length;
  const clvRows = allRows.filter(
    (r) =>
      (typeof r.clvDelta === "number" && Number.isFinite(r.clvDelta)) ||
      (typeof r.closeImpliedProb === "number" && Number.isFinite(r.closeImpliedProb))
  ).length;
  const bucketsMeeting = buckets.filter((b) => b.meetsSample).length;
  const countsArr = buckets.map((b) => b.resolvedRows);
  const minBucketResolved = countsArr.length ? Math.min(...countsArr) : 0;
  const maxBucketResolved = countsArr.length ? Math.max(...countsArr) : 0;

  const blockers: string[] = [];
  if (resolved < criteria.minResolvedRows) {
    blockers.push(`resolved_rows ${resolved} < min_resolved_rows ${criteria.minResolvedRows}`);
  }
  if (bucketsMeeting < criteria.minBucketsMeetingSample) {
    blockers.push(
      `buckets_meeting_sample ${bucketsMeeting} < min_buckets_meeting_sample ${criteria.minBucketsMeetingSample}`
    );
  }
  if (clvRows < criteria.minClvRows) {
    blockers.push(`clv_rows ${clvRows} < min_clv_rows ${criteria.minClvRows}`);
  }

  let status: ReadinessStatus = "ready";
  if (blockers.length > 0) {
    status = bucketsMeeting > 0 || resolved >= Math.floor(criteria.minResolvedRows * 0.5)
      ? "partially_ready"
      : "not_ready";
  }
  const activationRecommendation: ActivationRecommendation =
    status === "ready" ? "eligible_for_review" : "keep_disabled";

  return {
    generatedAtUtc: new Date().toISOString(),
    status,
    activationRecommendation,
    criteria,
    counts: {
      resolvedRows: resolved,
      clvRows,
      bucketsMeetingSample: bucketsMeeting,
      totalBuckets: buckets.length,
      minBucketResolved,
      maxBucketResolved,
    },
    blockers,
    buckets,
  };
}

export function exportCalibrationReadiness(options?: {
  outJsonPath?: string;
  outMdPath?: string;
  criteria?: CalibrationReadinessCriteria;
}): { jsonPath: string; mdPath: string; readiness: CalibrationReadinessArtifact } {
  const allRows = readTrackerRows();
  const resolvedRows = readTrackerRowsWithResult();
  const readiness = buildCalibrationReadiness(allRows, resolvedRows, options?.criteria);

  const jsonPath =
    options?.outJsonPath ?? path.join(process.cwd(), "artifacts", "calibration_readiness.json");
  const mdPath =
    options?.outMdPath ?? path.join(process.cwd(), "artifacts", "calibration_readiness.md");
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(readiness, null, 2), "utf8");

  const lines: string[] = [];
  lines.push("# Calibration Readiness");
  lines.push("");
  lines.push(`Generated: ${readiness.generatedAtUtc}`);
  lines.push(`Status: ${readiness.status}`);
  lines.push(`Recommendation: ${readiness.activationRecommendation}`);
  lines.push("");
  lines.push("## Counts");
  lines.push(`- Resolved rows: ${readiness.counts.resolvedRows}`);
  lines.push(`- CLV rows: ${readiness.counts.clvRows}`);
  lines.push(
    `- Buckets meeting sample: ${readiness.counts.bucketsMeetingSample}/${readiness.counts.totalBuckets}`
  );
  lines.push("");
  lines.push("## Blockers");
  if (readiness.blockers.length === 0) lines.push("- None");
  else readiness.blockers.forEach((b) => lines.push(`- ${b}`));
  lines.push("");
  lines.push("## Bucket Coverage");
  lines.push("| Bucket | Resolved | CLV | Meets Sample |");
  lines.push("|---|---:|---:|:---:|");
  for (const b of readiness.buckets) {
    lines.push(
      `| ${b.bucketLabel} | ${b.resolvedRows} | ${b.clvRows} | ${b.meetsSample ? "yes" : "no"} |`
    );
  }
  fs.writeFileSync(mdPath, lines.join("\n") + "\n", "utf8");

  return { jsonPath, mdPath, readiness };
}

if (require.main === module) {
  const out = exportCalibrationReadiness();
  console.log(`[export:calibration-readiness] wrote ${out.jsonPath}`);
  console.log(`[export:calibration-readiness] wrote ${out.mdPath}`);
  console.log(
    `[export:calibration-readiness] status=${out.readiness.status} recommendation=${out.readiness.activationRecommendation} resolved=${out.readiness.counts.resolvedRows} clv=${out.readiness.counts.clvRows}`
  );
}

