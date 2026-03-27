/**
 * Phase 42 — Operator hooks: console summary + optional fail-on-FAIL (no merge logic).
 */

import path from "path";
import type { CliArgs } from "../cli_args";
import type { MergeAuditSnapshot } from "./merge_audit";

const REL_DIR = path.join("data", "reports");

export function mergeQualityReportRelativePaths(): {
  latestMergeQualityJson: string;
  mergeQualityStatusJson: string;
} {
  return {
    latestMergeQualityJson: path.join(REL_DIR, "latest_merge_quality.json").replace(/\\/g, "/"),
    mergeQualityStatusJson: path.join(REL_DIR, "merge_quality_status.json").replace(/\\/g, "/"),
  };
}

/**
 * Prints artifact paths, deterministic merge-quality summary, then exits 1 when
 * {@link CliArgs.failOnMergeQuality} and severity is FAIL.
 */
export function applyMergeQualityOperatorHooks(cli: CliArgs, snapshot: MergeAuditSnapshot): void {
  const mq = snapshot.mergeQualityStatus;
  const { latestMergeQualityJson, mergeQualityStatusJson } = mergeQualityReportRelativePaths();
  console.log(`MERGE QUALITY REPORTS: ${latestMergeQualityJson} | ${mergeQualityStatusJson}`);

  const sev = mq.overallSeverity;
  const cov = mq.keyMetrics.mergeCoverage;
  const fb = mq.keyMetrics.fallbackRate;
  const covStr = cov === null ? "null" : cov.toFixed(4);
  const fbStr = fb === null ? "null" : fb.toFixed(4);
  console.log(`MERGE QUALITY: ${sev}`);
  console.log(`- liveInputDegraded: ${mq.liveInputDegraded}`);
  console.log(`- live: ${mq.liveMergeQualityLine}`);
  console.log(`- coverage: ${covStr}`);
  console.log(`- fallbackRate: ${fbStr}`);
  if (mq.driftNote) {
    console.log(`- drift: ${mq.driftNote}`);
  }

  if (cli.failOnMergeQuality && sev === "FAIL") {
    process.exit(1);
  }
}
