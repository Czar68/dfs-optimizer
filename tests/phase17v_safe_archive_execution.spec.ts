import fs from "fs";
import path from "path";
import {
  PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED,
  PHASE17V_ARCHIVED_THIS_PHASE,
  PHASE17V_REMOVED_THIS_PHASE,
  PHASE17V_SKIPPED_NEEDS_REVIEW,
  buildRepoHygieneAuditReport,
  formatRepoHygieneAuditMarkdown,
  getRepoHygieneAuditCandidates,
} from "../src/reporting/repo_hygiene_audit";
import { getSiteInvariantRuntimeContractStages } from "../src/reporting/site_invariant_runtime_contract";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

const root = path.join(__dirname, "..");

const OLD_TWEAK_PATH_SNIPPET = "src/validation/tweak_backtest";

/** Canonical phase tests: same bundle as `npm run verify:canonical` (Jest file list). */
function readVerifyCanonicalTestFiles(): string[] {
  const pj = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: { "verify:canonical": string };
  };
  const line = pj.scripts["verify:canonical"];
  const matches = [...line.matchAll(/tests\/[^\s]+\.spec\.ts/g)];
  return matches.map((m) => m[0]);
}

describe("Phase 17V — safe archive / removal execution", () => {
  it("hygiene report lists Phase 17V archived / removed / skipped (deterministic)", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: null,
      safeRemovalsPerformed: [...PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED],
      archivedThisPhase: [...PHASE17V_ARCHIVED_THIS_PHASE],
      removedThisPhase: [...PHASE17V_REMOVED_THIS_PHASE],
      skippedNeedsReview: [...PHASE17V_SKIPPED_NEEDS_REVIEW],
    });
    expect(rep.schemaVersion).toBe(2);
    expect(rep.archivedThisPhase).toEqual([...PHASE17V_ARCHIVED_THIS_PHASE].sort((a, b) => a.localeCompare(b)));
    expect(rep.removedThisPhase).toEqual([]);
    expect(rep.skippedNeedsReview).toEqual([...PHASE17V_SKIPPED_NEEDS_REVIEW].sort((a, b) => a.localeCompare(b)));
    const s = stableStringifyForObservability(rep);
    expect(stableStringifyForObservability(rep)).toBe(s);
  });

  it("markdown formatter preserves fixed section order (17U + 17V blocks)", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "t",
      runTimestampEt: null,
      safeRemovalsPerformed: [],
      archivedThisPhase: ["a"],
      removedThisPhase: [],
      skippedNeedsReview: ["s"],
    });
    const md = formatRepoHygieneAuditMarkdown(rep);
    const iRm = md.indexOf("## Safe removals performed");
    const iArch = md.indexOf("## Archived this phase");
    const iRem = md.indexOf("## Removed this phase");
    const iSkip = md.indexOf("## Skipped (needs review)");
    const iCand = md.indexOf("## Candidates (sorted by path)");
    expect(iArch).toBeGreaterThan(iRm);
    expect(iRem).toBeGreaterThan(iArch);
    expect(iSkip).toBeGreaterThan(iRem);
    expect(iCand).toBeGreaterThan(iSkip);
  });

  it("audit candidate table references archived path (not src/) for tweak backtest", () => {
    const rows = getRepoHygieneAuditCandidates().filter((c) =>
      c.candidatePath.includes("tweak_backtest")
    );
    expect(rows.length).toBe(1);
    expect(rows[0].candidatePath).toBe("tools/archive/validation/tweak_backtest.ts");
  });

  it("static: pre-archive path is not referenced by runtime entrypoints", () => {
    const entrypoints = [
      path.join(root, "src", "run_optimizer.ts"),
      path.join(root, "src", "run_underdog_optimizer.ts"),
      path.join(root, "src", "calculate_ev.ts"),
    ];
    for (const p of entrypoints) {
      if (!fs.existsSync(p)) continue;
      const t = fs.readFileSync(p, "utf8");
      expect(t).not.toContain(OLD_TWEAK_PATH_SNIPPET);
    }
  });

  it("static: pre-archive path is not in package.json scripts or verify:canonical line", () => {
    const pj = fs.readFileSync(path.join(root, "package.json"), "utf8");
    expect(pj).not.toContain(OLD_TWEAK_PATH_SNIPPET);
  });

  it("static: pre-archive path is not referenced by canonical phase test files", () => {
    for (const rel of readVerifyCanonicalTestFiles()) {
      if (rel === "tests/phase17v_safe_archive_execution.spec.ts") {
        continue; // this file intentionally references the literal for static guards
      }
      const p = path.join(root, rel);
      const t = fs.readFileSync(p, "utf8");
      expect(t).not.toContain(OLD_TWEAK_PATH_SNIPPET);
    }
  });

  it("regression: Phase 17T runtime contract stage count unchanged (>=10)", () => {
    expect(getSiteInvariantRuntimeContractStages().length).toBeGreaterThanOrEqual(10);
  });
});
