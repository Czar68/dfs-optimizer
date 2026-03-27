/**
 * Phase 102 — `data/reports/latest_legs_snapshot_integrity.json` / `.md`
 * Usage: npx ts-node scripts/export_legs_snapshot_integrity.ts [--cwd=<dir>]
 */
import path from "path";
import { writeLegsSnapshotIntegrityArtifacts } from "../src/reporting/export_legs_snapshot_integrity";

let cwd = process.cwd();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
}
writeLegsSnapshotIntegrityArtifacts(cwd);
console.log("[export:legs-snapshot-integrity] OK", path.join(cwd, "data", "reports", "latest_legs_snapshot_integrity.json"));
