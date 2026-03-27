/**
 * Phase 106 — `data/reports/latest_feature_validation_replay_readiness.json` / `.md`
 * Usage: npx ts-node scripts/export_feature_validation_replay_readiness.ts [--cwd=<dir>] [--tracker=<rel|abs>]
 */
import path from "path";
import { writeFeatureValidationReplayReadinessArtifacts } from "../src/reporting/export_feature_validation_replay_readiness";

let cwd = process.cwd();
let tracker: string | undefined;
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
  else if (a.startsWith("--tracker=")) tracker = a.slice("--tracker=".length).trim();
}
const r = writeFeatureValidationReplayReadinessArtifacts({ cwd, trackerPath: tracker });
console.log(`[export:feature-validation-replay-readiness] OK ${r.summaryLine}`);
