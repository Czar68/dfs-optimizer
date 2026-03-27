import fs from "fs";
import os from "os";
import path from "path";
import {
  FATAL_REASON,
  buildEarlyExitRunStatus,
  buildFatalExitRunStatus,
  buildRunStatus,
  formatRunStatusMarkdown,
  tryWriteRunStatusArtifacts,
} from "../src/reporting/run_status";

describe("Phase 17H fatal-exit run status", () => {
  it("buildFatalExitRunStatus sets outcome=fatal_exit with canonical fatal reason", () => {
    const s = buildFatalExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "t",
      fatalReason: FATAL_REASON.validation_failure,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    expect(s.success).toBe(false);
    expect(s.outcome).toBe("fatal_exit");
    expect(s.runHealth).toBe("hard_failure");
    expect(s.fatalReason).toBe("validation_failure");
    expect(s.earlyExitReason).toBeNull();
  });

  it("markdown includes fatal reason line only for fatal_exit when fatalReason is set", () => {
    const fatal = buildFatalExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      fatalReason: FATAL_REASON.no_positive_ev_legs,
      ppCards: [],
      ppPicksCount: 0,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    const mFatal = formatRunStatusMarkdown(fatal);
    expect(mFatal).toContain("- **Fatal reason:** no_positive_ev_legs");
    expect(mFatal).not.toContain("**Early exit reason:**");

    const fatalNoReason = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      success: false,
      outcome: "fatal_exit",
      fatalReason: null,
      earlyExitReason: null,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    expect(formatRunStatusMarkdown(fatalNoReason)).not.toContain("**Fatal reason:**");
  });

  it("formatter keeps Outcome before PrizePicks/Underdog summaries (deterministic)", () => {
    const s = buildFatalExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "x",
      fatalReason: FATAL_REASON.json_output_failure,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    const lines = formatRunStatusMarkdown(s).split("\n");
    const idxOutcome = lines.findIndex((l) => l.startsWith("- **Outcome:**"));
    const idxPp = lines.findIndex((l) => l.startsWith("- **PrizePicks:**"));
    expect(idxOutcome).toBeLessThan(idxPp);
  });

  it("run_optimizer static wiring includes fatal exit status", () => {
    const p = path.join(__dirname, "../src/run_optimizer.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("emitFatalRunStatus");
    expect(src).toContain("finalizeCanonicalRunStatus");
    expect(src).toContain("FATAL_REASON");
    expect(src).toContain("uncaught_run_error");
    expect(src).toContain("validation_failure");
    expect(src).toContain("no_positive_ev_legs");
    expect(src).toContain("json_output_failure");
  });

  it("tryWriteRunStatusArtifacts persists fatal_exit JSON before operator would exit", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs17h-"));
    const status = buildFatalExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      fatalReason: FATAL_REASON.uncaught_run_error,
      ppCards: [],
      ppPicksCount: null,
      udCards: [],
      udPicksCount: null,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    tryWriteRunStatusArtifacts(tmp, status);
    const j = JSON.parse(
      fs.readFileSync(path.join(tmp, "data/reports/latest_run_status.json"), "utf8")
    ) as { success: boolean; outcome: string; runHealth: string; fatalReason: string };
    expect(j.success).toBe(false);
    expect(j.outcome).toBe("fatal_exit");
    expect(j.runHealth).toBe("hard_failure");
    expect(j.fatalReason).toBe("uncaught_run_error");
  });

  it("full_success and early_exit remain compatible with fatalReason null", () => {
    const full = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "a",
      success: true,
      outcome: "full_success",
      earlyExitReason: null,
      fatalReason: null,
      ppCards: [],
      ppPicksCount: 0,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    expect(full.fatalReason).toBeNull();
    expect(full.runHealth).toBe("success");
    const early = buildEarlyExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "b",
      earlyExitReason: "insufficient_eligible_legs",
      ppCards: [],
      ppPicksCount: 1,
      udCards: [],
      udPicksCount: 0,
      digest: { generated: false, shownCount: null, dedupedCount: null },
      artifacts: {
        prizepicksCardsCsvPath: null,
        underdogCardsCsvPath: null,
        prizepicksPicksCsvPath: null,
        underdogPicksCsvPath: null,
        telegramDigestPath: null,
      },
      notes: [],
    });
    expect(early.fatalReason).toBeNull();
    expect(early.outcome).toBe("early_exit");
    expect(early.runHealth).toBe("partial_completion");
  });
});
