/**
 * Phase 28 — Runbook pointer constant + doc anchor for canonical samples error UI.
 */
import fs from "fs";
import path from "path";
import { CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER } from "../src/reporting/canonical_sample_artifacts_error_ui";

describe("Phase 28 canonical samples troubleshooting pointer", () => {
  const repoRoot = process.cwd();

  it("exports a stable repo-relative runbook path with troubleshooting anchor", () => {
    expect(CANONICAL_SAMPLES_DASHBOARD_RUNBOOK_POINTER).toBe(
      "docs/CANONICAL_SAMPLES_DASHBOARD.md#troubleshooting"
    );
  });

  it("CANONICAL_SAMPLES_DASHBOARD.md contains a Troubleshooting section for the anchor", () => {
    const docPath = path.join(repoRoot, "docs", "CANONICAL_SAMPLES_DASHBOARD.md");
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, "utf8");
    expect(content).toMatch(/^## Troubleshooting\s*$/m);
  });
});
