import fs from "fs";
import os from "os";
import path from "path";
import { finalizeCanonicalRunStatus } from "../src/reporting/run_finalization";

describe("Phase 122 run finalization consolidation", () => {
  function mkTmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "phase122-finalize-"));
  }

  it("emits success for clean full_success finalization", () => {
    const root = mkTmp();
    fs.writeFileSync(path.join(root, "prizepicks-legs.csv"), "h\nx\n", "utf8");
    const status = finalizeCanonicalRunStatus({
      rootDir: root,
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      outcome: "full_success",
      success: true,
      ppCards: [],
      ppPicksCount: 1,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      notes: [],
      expectedArtifacts: { prizepicksPicks: true },
    });
    expect(status.runHealth).toBe("success");
    expect(status.degradationReasons).toEqual([]);
    expect(status.missingExpectedArtifacts).toEqual([]);
  });

  it("emits degraded_success with structured reasons and missing artifacts", () => {
    const root = mkTmp();
    const status = finalizeCanonicalRunStatus({
      rootDir: root,
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      outcome: "full_success",
      success: true,
      ppCards: [],
      ppPicksCount: 0,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      notes: [],
      degradationReasons: ["sheets_push_exit_1"],
      expectedArtifacts: { prizepicksPicks: true },
    });
    expect(status.runHealth).toBe("degraded_success");
    expect(status.degradationReasons).toEqual(
      expect.arrayContaining(["sheets_push_exit_1", "missing_expected_artifact:prizepicks-legs.csv"])
    );
    expect(status.missingExpectedArtifacts).toContain("prizepicks-legs.csv");
  });

  it("emits partial_completion for early_exit", () => {
    const root = mkTmp();
    const status = finalizeCanonicalRunStatus({
      rootDir: root,
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      outcome: "early_exit",
      success: true,
      earlyExitReason: "insufficient_eligible_legs",
      ppCards: [],
      ppPicksCount: 4,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      notes: [],
      expectedArtifacts: { prizepicksPicks: true },
    });
    expect(status.runHealth).toBe("partial_completion");
    expect(status.outcome).toBe("early_exit");
    expect(status.earlyExitReason).toBe("insufficient_eligible_legs");
  });

  it("emits hard_failure for fatal_exit", () => {
    const root = mkTmp();
    const status = finalizeCanonicalRunStatus({
      rootDir: root,
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      outcome: "fatal_exit",
      success: false,
      fatalReason: "uncaught_run_error",
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      notes: [],
      degradationReasons: ["fatal:uncaught_run_error"],
      expectedArtifacts: {},
    });
    expect(status.runHealth).toBe("hard_failure");
    expect(status.fatalReason).toBe("uncaught_run_error");
    expect(status.degradationReasons).toContain("fatal:uncaught_run_error");
  });

  it("run_optimizer routes through canonical finalizer (static wiring)", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/run_optimizer.ts"), "utf8");
    expect(src).toContain("finalizeCanonicalRunStatus");
  });
});
