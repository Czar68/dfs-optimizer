import fs from "fs";
import os from "os";
import path from "path";
import {
  EARLY_EXIT_REASON,
  buildEarlyExitRunStatus,
  buildRunStatus,
  formatRunStatusMarkdown,
  tryWriteRunStatusArtifacts,
} from "../src/reporting/run_status";

describe("Phase 17G early-exit run status", () => {
  it("buildEarlyExitRunStatus sets outcome=early_exit with canonical reason", () => {
    const s = buildEarlyExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "t",
      earlyExitReason: EARLY_EXIT_REASON.insufficient_eligible_legs,
      ppCards: [],
      ppPicksCount: 3,
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
    expect(s.success).toBe(true);
    expect(s.outcome).toBe("early_exit");
    expect(s.runHealth).toBe("partial_completion");
    expect(s.earlyExitReason).toBe("insufficient_eligible_legs");
    expect(s.fatalReason).toBeNull();
  });

  it("markdown formatter places Outcome before platform summaries; early_exit includes reason line", () => {
    const s = buildEarlyExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      earlyExitReason: EARLY_EXIT_REASON.no_viable_structures,
      ppCards: [],
      ppPicksCount: 10,
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
    const md = formatRunStatusMarkdown(s);
    const lines = md.split("\n");
    const idxPp = lines.findIndex((l) => l.startsWith("- **PrizePicks:**"));
    const idxOutcome = lines.findIndex((l) => l.startsWith("- **Outcome:**"));
    expect(idxOutcome).toBeGreaterThan(-1);
    expect(idxPp).toBeGreaterThan(idxOutcome);
    expect(lines.some((l) => l === "- **Early exit reason:** no_viable_structures")).toBe(true);
  });

  it("early_exit markdown omits reason line when earlyExitReason is null", () => {
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
      success: true,
      outcome: "early_exit",
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
    const md = formatRunStatusMarkdown(s);
    expect(md).toContain("- **Outcome:** early_exit");
    expect(md).toContain("- **Run health:** partial_completion");
    expect(md).not.toContain("**Early exit reason:**");
  });

  it("run_optimizer static wiring includes early-exit status emission", () => {
    const p = path.join(__dirname, "../src/run_optimizer.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("finalizeCanonicalRunStatus");
    expect(src).toContain("EARLY_EXIT_REASON");
    expect(src).toContain("insufficient_eligible_legs");
    expect(src).toContain("no_viable_structures");
  });

  it("tryWriteRunStatusArtifacts writes early-exit status to disk (orchestration-safe)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rs17g-"));
    const status = buildEarlyExitRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "x",
      earlyExitReason: EARLY_EXIT_REASON.insufficient_eligible_legs,
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
    tryWriteRunStatusArtifacts(tmp, status);
    const j = JSON.parse(
      fs.readFileSync(path.join(tmp, "data/reports/latest_run_status.json"), "utf8")
    ) as { outcome: string; earlyExitReason: string; fatalReason: string | null };
    expect(j.outcome).toBe("early_exit");
    expect(j.earlyExitReason).toBe("insufficient_eligible_legs");
    expect(j.fatalReason).toBeNull();
    const md = fs.readFileSync(path.join(tmp, "data/reports/latest_run_status.md"), "utf8");
    expect(md).toContain("early_exit");
    expect(md).toContain("insufficient_eligible_legs");
  });

  it("full_success path shape unchanged (Phase 17F compatible)", () => {
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: "run",
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
    expect(s.outcome).toBe("full_success");
    expect(s.runHealth).toBe("success");
    expect(s.earlyExitReason).toBeNull();
    expect(s.fatalReason).toBeNull();
    expect(formatRunStatusMarkdown(s)).toContain("- **Outcome:** full_success");
  });

  it("buildRunStatus defaults outcome to full_success when omitted", () => {
    const s = buildRunStatus({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestamp: null,
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
    expect(s.outcome).toBe("full_success");
    expect(s.runHealth).toBe("success");
    expect(s.earlyExitReason).toBeNull();
    expect(s.fatalReason).toBeNull();
  });
});
