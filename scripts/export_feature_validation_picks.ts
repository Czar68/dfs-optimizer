/**
 * Phase 101 — Export grounded **`EvPick[]`** JSON for **`npm run validate:feature-outcome -- --input=<path>`**.
 *
 * Usage:
 *   `npx ts-node scripts/export_feature_validation_picks.ts [--cwd=<dir>] [--out=<rel|abs>] [--tracker=<rel|abs>] [--policy=<legacy_best_effort|snapshot_preferred|snapshot_strict>] [--enforce-snapshot] [--no-snapshot-status] [--no-policy-status]`
 *
 * Defaults: **`cwd`** = process.cwd(), **`out`** = **`data/reports/feature_validation_input.json`**, **`tracker`** = **`data/perf_tracker.jsonl`** under **`cwd`**.
 *
 * Grounded sources: **`perf_tracker.jsonl`** rows with **`result`** 0/1, joined to **`existingLegCsvPaths`** + **`existingGroundedLegJsonPaths`** (root, **`data/output_logs/`**, **`web-dashboard/public/data/`**, **`data/legs_archive/*-legs-YYYYMMDD.json`**).
 */
import fs from "fs";
import path from "path";
import {
  exportFeatureValidationPicks,
  formatFeatureValidationPicksJson,
  FEATURE_VALIDATION_INPUT_DEFAULT_REL,
  normalizeFeatureValidationPolicy,
  DEFAULT_FEATURE_VALIDATION_POLICY,
  type FeatureValidationPolicy,
} from "../src/reporting/feature_validation_export";

function parseArgs(argv: string[]): {
  cwd: string;
  outRel: string;
  tracker?: string;
  enforceSnapshot: boolean;
  writeSnapshotStatus: boolean;
  policy?: FeatureValidationPolicy;
  writePolicyStatus: boolean;
} {
  let cwd = process.cwd();
  let outRel = FEATURE_VALIDATION_INPUT_DEFAULT_REL;
  let tracker: string | undefined;
  let enforceSnapshot = false;
  let writeSnapshotStatus = true;
  let policy: FeatureValidationPolicy | undefined;
  let writePolicyStatus = true;
  for (const a of argv) {
    if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
    else if (a.startsWith("--out=")) outRel = a.slice("--out=".length).trim();
    else if (a.startsWith("--tracker=")) tracker = a.slice("--tracker=".length).trim();
    else if (a.startsWith("--policy=")) {
      const raw = a.slice("--policy=".length).trim();
      const p = normalizeFeatureValidationPolicy(raw);
      if (!p) {
        console.error(
          `[export:feature-validation-picks] Invalid --policy=${raw} (use legacy_best_effort | snapshot_preferred | snapshot_strict)`
        );
        process.exit(2);
      }
      policy = p;
    } else if (a === "--enforce-snapshot") enforceSnapshot = true;
    else if (a === "--no-snapshot-status") writeSnapshotStatus = false;
    else if (a === "--no-policy-status") writePolicyStatus = false;
  }
  return { cwd, outRel, tracker, enforceSnapshot, writeSnapshotStatus, policy, writePolicyStatus };
}

function main(): void {
  const { cwd, outRel, tracker, enforceSnapshot, writeSnapshotStatus, policy, writePolicyStatus } = parseArgs(
    process.argv.slice(2)
  );
  const policySource = policy ? "argv" : process.env.FEATURE_VALIDATION_POLICY ? "env" : "default";
  const effectivePreview =
    policy ?? normalizeFeatureValidationPolicy(process.env.FEATURE_VALIDATION_POLICY) ?? DEFAULT_FEATURE_VALIDATION_POLICY;
  console.log(
    `[export:feature-validation-picks] policy_source=${policySource} effective_policy=${effectivePreview} write_policy_status=${writePolicyStatus}`
  );
  const { picks, stats } = exportFeatureValidationPicks({
    cwd,
    trackerPath: tracker,
    dedupe: true,
    enforceSnapshotResolved: enforceSnapshot || undefined,
    writeSnapshotStatusArtifacts: writeSnapshotStatus,
    policy,
    writePolicyStatusArtifacts: writePolicyStatus,
  });

  if (stats.trackerRowsWithResult === 0) {
    console.error("[export:feature-validation-picks] No perf_tracker rows with result 0/1. Nothing to export.");
    process.exit(1);
  }
  if (picks.length === 0) {
    console.error(
      `[export:feature-validation-picks] No picks exported (skipped_no_leg=${stats.skippedNoLeg}, tracker_with_result=${stats.trackerRowsWithResult}). Ensure legs CSV/JSON match by leg_id or Phase 101E exact fields.`
    );
    if (stats.enforcementFailed) {
      console.error("[export:feature-validation-picks] enforcement_failed=true (snapshot-bound rows did not all resolve).");
    }
    process.exit(1);
  }

  const absOut = path.isAbsolute(outRel) ? path.normalize(outRel) : path.join(cwd, outRel);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, formatFeatureValidationPicksJson(picks), "utf8");
  console.log(
    `[export:feature-validation-picks] OK exported=${picks.length} written=${absOut} policy=${stats.featureValidationPolicy}`
  );
  console.log(
    `  tracker_rows=${stats.trackerRowsRead} with_result=${stats.trackerRowsWithResult} skipped_no_leg=${stats.skippedNoLeg} joined_leg_id=${stats.joinedByLegId} joined_reconstruction=${stats.joinedByReconstruction}`
  );
  console.log(
    `  snapshot_rows=${stats.rowsWithLegsSnapshotId} legacy_rows=${stats.rowsWithoutLegsSnapshotId} snap_join_id=${stats.snapshotJoinedByLegId} snap_join_recon=${stats.snapshotJoinedByReconstruction} legacy_join_id=${stats.legacyJoinedByLegId} legacy_join_recon=${stats.legacyJoinedByReconstruction}`
  );
  console.log(
    `  skip_missing_snap_dir=${stats.skippedMissingSnapshotDirectory} skip_snap_no_match=${stats.skippedSnapshotPresentNoLegMatch} skip_snap_ambig=${stats.skippedSnapshotAmbiguousReconstruction} skip_legacy_no_leg=${stats.skippedLegacyNoLegMatch} enforcement_failed=${stats.enforcementFailed}`
  );
  if (stats.enforcementFailed) {
    console.error("[export:feature-validation-picks] enforcement_failed=true (snapshot-bound skips).");
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}
