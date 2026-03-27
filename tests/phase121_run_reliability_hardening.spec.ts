import fs from "fs";
import path from "path";
import {
  buildEarlyExitRunStatus,
  buildFatalExitRunStatus,
  buildRunStatus,
  formatRunStatusMarkdown,
} from "../src/reporting/run_status";

describe("Phase 121 run reliability hardening", () => {
  it("run status exposes operator runHealth across success/degraded/partial/failure", () => {
    const success = buildRunStatus({
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      success: true,
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
    expect(success.runHealth).toBe("success");

    const degraded = buildRunStatus({
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      success: true,
      runHealth: "degraded_success",
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
      notes: ["Sheets push failed"],
    });
    expect(degraded.runHealth).toBe("degraded_success");
    expect(formatRunStatusMarkdown(degraded)).toContain("- **Run health:** degraded_success");

    const partial = buildEarlyExitRunStatus({
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      earlyExitReason: "insufficient_eligible_legs",
      ppCards: [],
      ppPicksCount: 5,
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
    expect(partial.runHealth).toBe("partial_completion");

    const fatal = buildFatalExitRunStatus({
      generatedAtUtc: "2026-03-23T12:00:00.000Z",
      runTimestamp: "t",
      fatalReason: "uncaught_run_error",
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
    expect(fatal.runHealth).toBe("hard_failure");
  });

  it("captures sheets push exit code for both-mode early/full paths", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/run_optimizer.ts"), "utf8");
    expect(src).toContain("let sheetsPushExitCode: number | null = null;");
    expect(src).toContain("sheetsPushExitCode = runSheetsPush(runTimestamp, args);");
    expect(src).toContain("Sheets push failed after partial run");
    expect(src).toContain("Sheets push failed after optimizer completed");
  });

  it("replaces UD guardrail hard exit with thrown error", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/run_underdog_optimizer.ts"), "utf8");
    expect(src).toContain("UD guardrail validation failure: merge ratio below threshold");
  });
});
