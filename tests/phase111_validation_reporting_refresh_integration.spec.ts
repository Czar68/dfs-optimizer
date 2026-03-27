/**
 * Phase 111 — Post-run integration for **`npm run refresh:validation-reporting`** (contract only; PowerShell is SSOT).
 */
import { defaultPostRunSteps, runPostRunSteps } from "../src/tracking/post_run_wrapper";
import { VALIDATION_REPORTING_REFRESH_STEPS } from "../src/reporting/validation_reporting_refresh_contract";

describe("Phase 111 — validation reporting post-run integration", () => {
  it("defaultPostRunSteps ends with refresh:validation-reporting after model artifacts (ordering)", () => {
    const steps = defaultPostRunSteps();
    expect(steps.map((s) => s.name)).toEqual([
      "capture_snapshot",
      "refresh_model_artifacts",
      "refresh_validation_reporting",
    ]);
    expect(steps[2]!.command).toBe("npm run refresh:validation-reporting");
  });

  it("refresh contract remains owned by refresh_validation_reporting_surface.ts (no duplicated step list in post_run_wrapper)", () => {
    expect(VALIDATION_REPORTING_REFRESH_STEPS.some((s) => s.npmScript === "export:feature-validation-overview")).toBe(
      true
    );
  });

  it("runPostRunSteps fails fast when validation reporting step fails", () => {
    const calls: string[] = [];
    const out = runPostRunSteps(
      (cmd) => {
        calls.push(cmd);
        if (cmd === "npm run refresh:validation-reporting") {
          return { exitCode: 1, message: "validation refresh failed" };
        }
        return { exitCode: 0, message: "ok" };
      },
      () => "2026-03-23T00:00:00.000Z"
    );
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(3);
    expect(out.logs[2]!.step).toBe("refresh_validation_reporting");
    expect(out.logs[2]!.status).toBe("failed");
  });

  it("runPostRunSteps does not run validation when model refresh fails", () => {
    const calls: string[] = [];
    const out = runPostRunSteps(
      (cmd) => {
        calls.push(cmd);
        if (cmd === "npm run refresh:model-artifacts") {
          return { exitCode: 1, message: "model failed" };
        }
        return { exitCode: 0, message: "ok" };
      },
      () => "2026-03-23T00:00:00.000Z"
    );
    expect(out.ok).toBe(false);
    expect(calls).toEqual(["npm run capture:snapshot", "npm run refresh:model-artifacts"]);
  });
});
