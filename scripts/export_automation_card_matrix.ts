/**
 * Export automation card matrix (one row per canonical structure; 31 total).
 * Outputs: data/output_logs/automation-card-matrix.csv, artifacts/automation-card-matrix.json, artifacts/automation-card-matrix-audit.json
 *
 * Run: npx ts-node scripts/export_automation_card_matrix.ts
 * Or:  npm run export:automation-card-matrix
 *
 * Used by run_optimizer.ps1 after a successful optimizer run; failure (row-count mismatch or exception) fails the pipeline.
 */

import { writeAutomationCardMatrix } from "../src/automation/automation_card_matrix";

function main(): void {
  const root = process.cwd();
  let result: ReturnType<typeof writeAutomationCardMatrix>;
  try {
    result = writeAutomationCardMatrix(root);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AUTOMATION_CARD_MATRIX] Export failed (unhandled exception):", msg);
    process.exit(1);
  }

  console.log(`[automation-card-matrix] Wrote ${result.rowCount} rows (canonical structures)`);
  console.log(`  CSV:  ${result.csvPath}`);
  console.log(`  JSON: ${result.jsonPath}`);
  console.log(`  Audit: ${result.auditPath}`);
  if (result.audit.missingMonteCarloStructures.length > 0) {
    console.warn(`  Missing Monte Carlo data: ${result.audit.missingMonteCarloStructures.join(", ")}`);
  }
  if (result.audit.missingBreakevenStructures.length > 0) {
    console.warn(`  Missing breakeven data: ${result.audit.missingBreakevenStructures.join(", ")}`);
  }

  if (result.rowCount !== result.audit.totalCanonicalStructures) {
    console.error(
      `[AUTOMATION_CARD_MATRIX] Row count mismatch: got ${result.rowCount}, expected ${result.audit.totalCanonicalStructures}`
    );
    process.exit(1);
  }

  const a = result.audit;
  console.log(
    `AUTOMATION_CARD_MATRIX rows=${result.rowCount} expected=${a.totalCanonicalStructures} missingMonteCarlo=${a.missingMonteCarloStructures.length} missingBreakeven=${a.missingBreakevenStructures.length} selected=${a.selectedForWagerCount}`
  );
}

main();
