/**
 * Phase 108 — `data/reports/latest_feature_validation_overview.json` / `.md`
 * Usage: npx ts-node scripts/export_feature_validation_overview.ts [--cwd=<dir>] [--tracker=<rel|abs>]
 */
import path from "path";
import { writeFeatureValidationOverviewArtifacts } from "../src/reporting/export_feature_validation_overview";

let cwd = process.cwd();
let tracker: string | undefined;
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
  else if (a.startsWith("--tracker=")) tracker = a.slice("--tracker=".length).trim();
}
const r = writeFeatureValidationOverviewArtifacts({ cwd, trackerPath: tracker });
console.log(`[export:feature-validation-overview] OK ${r.summaryLine}`);
