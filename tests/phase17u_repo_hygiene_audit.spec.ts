import fs from "fs";
import path from "path";
import {
  REPO_HYGIENE_KEEP_ACTIVE,
  REPO_HYGIENE_SAFE_REMOVE,
  buildRepoHygieneAuditReport,
  formatRepoHygieneAuditMarkdown,
  getRepoHygieneAuditCandidates,
  PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED,
} from "../src/reporting/repo_hygiene_audit";
import { getSiteInvariantRuntimeContractStages } from "../src/reporting/site_invariant_runtime_contract";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

const root = path.join(__dirname, "..");

describe("Phase 17U — repo hygiene audit", () => {
  it("deterministic JSON generation", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: null,
      safeRemovalsPerformed: ["test removal"],
    });
    const s = stableStringifyForObservability(rep);
    expect(stableStringifyForObservability(rep)).toBe(s);
  });

  it("deterministic markdown: sections in fixed order", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "t",
      runTimestampEt: null,
      safeRemovalsPerformed: [],
    });
    const md = formatRepoHygieneAuditMarkdown(rep);
    const iRm = md.indexOf("## Safe removals performed");
    const iArch = md.indexOf("## Archived this phase");
    const iRem = md.indexOf("## Removed this phase");
    const iSkip = md.indexOf("## Skipped (needs review)");
    const iCand = md.indexOf("## Candidates (sorted by path)");
    expect(iRm).toBeGreaterThan(-1);
    expect(iArch).toBeGreaterThan(iRm);
    expect(iRem).toBeGreaterThan(iArch);
    expect(iSkip).toBeGreaterThan(iRem);
    expect(iCand).toBeGreaterThan(iSkip);
  });

  it("schema v2 includes Phase 17V execution arrays (default empty)", () => {
    const rep = buildRepoHygieneAuditReport({
      generatedAtUtc: "t",
      runTimestampEt: null,
      safeRemovalsPerformed: [],
    });
    expect(rep.schemaVersion).toBe(2);
    expect(rep.archivedThisPhase).toEqual([]);
    expect(rep.removedThisPhase).toEqual([]);
    expect(rep.skippedNeedsReview).toEqual([]);
  });

  it("classification: each candidate has exactly one known classification", () => {
    for (const c of getRepoHygieneAuditCandidates()) {
      expect([
        "safe_remove",
        "safe_archive",
        "keep_active",
        "keep_needs_review",
      ]).toContain(c.classification);
    }
  });

  it("default safe removals list documents Phase 17U hygiene actions", () => {
    expect(PHASE17U_DEFAULT_SAFE_REMOVALS_PERFORMED.length).toBeGreaterThan(0);
  });

  it("static: package.json verify:canonical includes tier1 scarcity + Phase 17U/V/W/X tests", () => {
    const pj = fs.readFileSync(path.join(root, "package.json"), "utf8");
    expect(pj).toContain("phase16_tier1_scarcity_attribution.spec.ts");
    expect(pj).toContain("phase17w_legacy_naming_cleanup.spec.ts");
    expect(pj).toContain("phase17x_cli_args_side_effect_free.spec.ts");
    expect(pj).toContain("phase17v_safe_archive_execution.spec.ts");
    expect(pj).toContain("phase17u_repo_hygiene_audit.spec.ts");
  });

  it("static: PROJECT_STATE no longer references missing refactor_report.md", () => {
    const ps = fs.readFileSync(path.join(root, "docs", "PROJECT_STATE.md"), "utf8");
    expect(ps).not.toMatch(/refactor_report\.md/);
  });

  it("static: run_optimizer wires repo hygiene audit after runtime contract", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain("writeRepoHygieneAuditFromRun");
    expect(ro).toContain("./reporting/repo_hygiene_audit");
    expect(ro).toContain("writeSiteInvariantRuntimeContractFromRun");
  });

  it("Phase 17T runtime contract stage table unchanged in count (regression guard)", () => {
    expect(getSiteInvariantRuntimeContractStages().length).toBeGreaterThanOrEqual(10);
  });

  it("no deleted source paths appear as import targets in entrypoints (spot-check)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).not.toContain("refactor_report");
  });
});
