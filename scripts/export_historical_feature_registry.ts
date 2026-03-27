/**
 * Phase 80 — Write data/reports/latest_historical_feature_registry.json + .md and
 * artifacts/historical_feature_rows.jsonl from perf_tracker.jsonl (grounded features only).
 * Usage: npx ts-node scripts/export_historical_feature_registry.ts [cwd]
 */

import {
  buildHistoricalFeatureRegistryPayload,
  writeHistoricalFeatureRegistryArtifacts,
} from "../src/modeling/historical_feature_extract";

function main(): void {
  const cwd = process.argv[2] ?? process.cwd();
  const payload = buildHistoricalFeatureRegistryPayload({ cwd });
  writeHistoricalFeatureRegistryArtifacts(cwd, payload);
  console.log(
    `[Phase80] Wrote data/reports/latest_historical_feature_registry.json + .md; ` +
      `${payload.jsonlRelativePath} (${payload.rowCount} rows, ${payload.marketGroups} market groups)`
  );
}

main();
