/**
 * Phase 104 — `data/reports/latest_legs_snapshot_adoption.json` / `.md`
 * Usage: npx ts-node scripts/export_legs_snapshot_adoption.ts [--cwd=<dir>]
 */
import path from "path";
import { writeLegsSnapshotAdoptionArtifacts } from "../src/reporting/export_legs_snapshot_adoption";

let cwd = process.cwd();
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--cwd=")) cwd = path.resolve(a.slice("--cwd=".length).trim());
}
const r = writeLegsSnapshotAdoptionArtifacts(cwd);
console.log("[export:legs-snapshot-adoption] OK", r.summaryLine);
