/**
 * Phase 113 — Validation/provenance runbook doc contract (no runtime logic).
 */
import fs from "fs";
import path from "path";

const RUNBOOK = path.join(process.cwd(), "docs", "VALIDATION_PROVENANCE_RUNBOOK.md");
const PROJECT_STATE = path.join(process.cwd(), "docs", "PROJECT_STATE.md");

describe("Phase 113 — VALIDATION_PROVENANCE_RUNBOOK.md", () => {
  it("runbook exists and references key npm scripts and artifacts", () => {
    expect(fs.existsSync(RUNBOOK)).toBe(true);
    const text = fs.readFileSync(RUNBOOK, "utf8");
    for (const needle of [
      "export:feature-validation-replay-readiness",
      "export:legs-snapshot-adoption",
      "export:feature-validation-overview",
      "refresh:validation-reporting",
      "postrun:model-refresh",
      "run:with-post-refresh",
      "export:feature-validation-picks",
      "sync:dashboard-reports",
      "legacy_best_effort",
      "snapshot_preferred",
      "snapshot_strict",
      "latest_feature_validation_overview.json",
      "latest_validation_reporting_freshness",
      "latest_feature_validation_replay_readiness",
      "latest_tracker_snapshot_new_row_enforcement",
    ]) {
      expect(text).toContain(needle);
    }
  });

  it("PROJECT_STATE.md points at the runbook", () => {
    const s = fs.readFileSync(PROJECT_STATE, "utf8");
    expect(s).toContain("docs/VALIDATION_PROVENANCE_RUNBOOK.md");
    expect(s).toContain("Phase 113");
  });
});
