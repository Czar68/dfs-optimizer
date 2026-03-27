/**
 * Phase 114 — `data/reports/latest_validation_provenance_audit_bundle.json` / `.md`
 * Usage: npx ts-node scripts/export_validation_provenance_audit_bundle.ts [--cwd=<dir>]
 */
import path from "path";
import { writeValidationProvenanceAuditBundleArtifacts } from "../src/reporting/validation_provenance_audit_bundle";

let cwd = process.cwd();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
}
const b = writeValidationProvenanceAuditBundleArtifacts(cwd);
console.log(`[export:validation-provenance-audit-bundle] OK ${b.summaryLine}`);
