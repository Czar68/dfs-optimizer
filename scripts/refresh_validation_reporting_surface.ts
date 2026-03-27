/**
 * Phase 110 — One-command validation/provenance reporting refresh (read-only; no optimizer).
 *
 * Runs (in order): see **`VALIDATION_REPORTING_REFRESH_STEPS`** in **`src/reporting/validation_reporting_refresh_contract.ts`**.
 * Writes: **`latest_feature_validation_replay_readiness.*`**, **`latest_legs_snapshot_adoption.*`**,
 * **`latest_feature_validation_overview.*`**, copies required + optional JSON into **`web-dashboard/public/data/reports/`**.
 * Dashboard: **`FeatureValidationOverviewPanel`** (Phase **109**) reads synced **`latest_feature_validation_overview.json`**;
 * Phase **112** writes **`latest_validation_reporting_freshness.json`** after success (repo vs public overview mtime).
 *
 * Usage: **`npm run refresh:validation-reporting`**
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { VALIDATION_REPORTING_REFRESH_STEPS } from "../src/reporting/validation_reporting_refresh_contract";
import { writeValidationReportingFreshnessArtifacts } from "../src/reporting/validation_reporting_freshness";

function readOverviewSummaryLine(root: string): string | null {
  const p = path.join(root, "data", "reports", "latest_feature_validation_overview.json");
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { summaryLine?: unknown };
    return typeof j.summaryLine === "string" && j.summaryLine.trim() ? j.summaryLine.trim() : null;
  } catch {
    return null;
  }
}

function main(): void {
  const root = process.cwd();
  const rows: string[] = [];

  for (const step of VALIDATION_REPORTING_REFRESH_STEPS) {
    try {
      execSync(`npm run ${step.npmScript}`, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      rows.push(`${step.id}: OK`);
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      rows.push(`${step.id}: FAIL`);
      const msg = (err.stderr || err.stdout || "").trim();
      console.error("[refresh:validation-reporting] FAILED at " + step.id);
      if (msg) console.error(msg);
      console.error(rows.join("\n"));
      process.exit(1);
    }
  }

  const overview = readOverviewSummaryLine(root);
  const fresh = writeValidationReportingFreshnessArtifacts(root);
  console.log("[refresh:validation-reporting]");
  console.log(rows.join("\n"));
  console.log(overview ? `overview: ${overview}` : "overview: (summary line unavailable)");
  console.log(`freshness: ${fresh.summaryLine}`);
  process.exit(0);
}

main();
