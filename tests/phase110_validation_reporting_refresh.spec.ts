/**
 * Phase 110 — refresh:validation-reporting wiring (no math / policy changes).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { VALIDATION_REPORTING_REFRESH_STEPS } from "../src/reporting/validation_reporting_refresh_contract";

describe("Phase 110 — validation reporting refresh", () => {
  const repoRoot = process.cwd();

  it("contract step order and npm scripts exist in package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(VALIDATION_REPORTING_REFRESH_STEPS.length).toBe(4);
    expect(VALIDATION_REPORTING_REFRESH_STEPS[0]!.id).toBe("replay_readiness");
    expect(VALIDATION_REPORTING_REFRESH_STEPS[1]!.id).toBe("legs_snapshot_adoption");
    expect(VALIDATION_REPORTING_REFRESH_STEPS[2]!.id).toBe("feature_validation_overview");
    expect(VALIDATION_REPORTING_REFRESH_STEPS[3]!.id).toBe("sync_dashboard_reports");
    for (const s of VALIDATION_REPORTING_REFRESH_STEPS) {
      expect(typeof pkg.scripts[s.npmScript]).toBe("string");
      expect(pkg.scripts[s.npmScript]!.length).toBeGreaterThan(0);
    }
  });

  it("success path: refresh exits 0 and prints step lines", () => {
    const out = execSync("npm run refresh:validation-reporting", {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out).toContain("[refresh:validation-reporting]");
    expect(out).toContain("replay_readiness: OK");
    expect(out).toContain("legs_snapshot_adoption: OK");
    expect(out).toContain("feature_validation_overview: OK");
    expect(out).toContain("sync_dashboard_reports: OK");
    expect(out).toMatch(/overview: feature_validation_overview /);
  });

  it("failure propagates: invalid cwd fails on first npm step", () => {
    const bad = fs.mkdtempSync(path.join(require("os").tmpdir(), "dfs-p110-bad-"));
    expect(() =>
      execSync("npm run refresh:validation-reporting", {
        cwd: bad,
        encoding: "utf8",
      })
    ).toThrow();
  });
});
