/**
 * Phase 118 — Write data/reports/latest_historical_feature_coverage_audit.json + .md (read-only inventory).
 * Usage: npx ts-node scripts/export_historical_feature_coverage_audit.ts [cwd]
 */

import {
  buildHistoricalFeatureCoverageAudit,
  writeHistoricalFeatureCoverageAuditArtifacts,
} from "../src/reporting/historical_feature_coverage_audit";

function main(): void {
  const cwd = process.argv[2] ?? process.cwd();
  const audit = buildHistoricalFeatureCoverageAudit({
    generatedAtUtc: new Date().toISOString(),
    cwd,
  });
  writeHistoricalFeatureCoverageAuditArtifacts(cwd, audit);
  console.log(`[Phase118] ${audit.summaryLine}`);
  console.log(`[Phase118] Wrote data/reports/${"latest_historical_feature_coverage_audit.json"} + .md`);
}

main();
