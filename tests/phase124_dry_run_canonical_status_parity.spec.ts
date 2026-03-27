import fs from "fs";
import os from "os";
import path from "path";
import { writeDryRunCanonicalStatus } from "../scripts/write_dry_run_canonical_status";

describe("Phase 124 — dry-run canonical status parity", () => {
  it("writes fresh canonical latest_run_status JSON + markdown via canonical finalizer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase124-dryrun-"));
    writeDryRunCanonicalStatus({
      rootDir: root,
      runTimestamp: "20260323-210000",
    });

    const jsonPath = path.join(root, "data/reports/latest_run_status.json");
    const mdPath = path.join(root, "data/reports/latest_run_status.md");
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const status = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
      runHealth: string;
      outcome: string;
      success: boolean;
      degradationReasons: string[];
      notes: string[];
    };
    expect(status.success).toBe(true);
    expect(status.outcome).toBe("full_success");
    expect(status.runHealth).toBe("degraded_success");
    expect(status.degradationReasons).toContain("dry_run_no_live_execution");
    expect(status.notes).toContain(
      "Dry-run mode: optimizer fetch/merge/build execution was intentionally skipped."
    );
  });

  it("run_optimizer.ps1 dry-run path emits canonical status and no dry_run_ok legacy status", () => {
    const ps = fs.readFileSync(path.join(__dirname, "../scripts/run_optimizer.ps1"), "utf8");
    expect(ps).toContain("scripts/write_dry_run_canonical_status.ts");
    expect(ps).toContain("data\\reports\\latest_run_status.json");
    expect(ps).not.toContain("dry_run_ok");
  });
});
