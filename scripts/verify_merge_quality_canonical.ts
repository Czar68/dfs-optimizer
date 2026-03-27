/**
 * Phase 42 — Read-only merge quality line for verify:canonical.
 * Exits 1 on FAIL only when MERGE_QUALITY_ENFORCE=true (optional CI gate).
 */
import fs from "fs";
import path from "path";

const cwd = process.cwd();
const rel = path.join("data", "reports", "merge_quality_status.json");
const abs = path.join(cwd, rel);

if (!fs.existsSync(abs)) {
  console.log(`MERGE QUALITY VERIFY: (missing ${rel.replace(/\\/g, "/")})`);
  process.exit(0);
}

const raw = fs.readFileSync(abs, "utf8");
const j = JSON.parse(raw) as { overallSeverity?: string };
const sev = typeof j.overallSeverity === "string" ? j.overallSeverity : "UNKNOWN";
console.log(`MERGE QUALITY VERIFY: ${sev}`);

const enforce = process.env.MERGE_QUALITY_ENFORCE === "true";
if (enforce && sev === "FAIL") {
  process.exit(1);
}
if (!enforce && sev === "FAIL") {
  console.log(
    "MERGE QUALITY VERIFY: npm exit 0 (FAIL is non-fatal for verify:canonical; set MERGE_QUALITY_ENFORCE=true to fail this step)"
  );
}
process.exit(0);
