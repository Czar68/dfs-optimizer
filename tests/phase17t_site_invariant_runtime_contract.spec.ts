import fs from "fs";
import path from "path";
import { EVALUATION_BUCKET_ORDER } from "../src/pipeline/evaluation_buckets";
import {
  DIVERGENCE_NON_MATH_VARIANCE_BUG,
  SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE,
  SITE_INVARIANT_VERDICT_NON_COMPLIANT,
  buildSiteInvariantRuntimeContractReport,
  formatSiteInvariantRuntimeContractMarkdown,
  getSiteInvariantRuntimeContractStages,
} from "../src/reporting/site_invariant_runtime_contract";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

const root = path.join(__dirname, "..");

describe("Phase 17T — site-invariant runtime contract audit", () => {
  it("first eight contract rows match EVALUATION_BUCKET_ORDER stage ids in order", () => {
    const rows = getSiteInvariantRuntimeContractStages();
    const bucketRows = rows.filter((r) =>
      (EVALUATION_BUCKET_ORDER as readonly string[]).includes(r.stageId)
    );
    expect(bucketRows.map((r) => r.stageId)).toEqual([...EVALUATION_BUCKET_ORDER]);
  });

  it("includes reporting stages after canonical buckets", () => {
    const rows = getSiteInvariantRuntimeContractStages();
    const ids = rows.map((r) => r.stageId);
    expect(ids).toContain("final_selection_observability");
    expect(ids).toContain("final_selection_reason_attribution");
  });

  it("overall verdict is compliant_with_irreducible when no bugs and irreducible rows exist", () => {
    const rep = buildSiteInvariantRuntimeContractReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T07:00:00 ET",
    });
    expect(rep.overallVerdict).toBe(SITE_INVARIANT_VERDICT_COMPLIANT_WITH_IRREDUCIBLE);
    expect(rep.nonMathVarianceBugs.length).toBe(0);
    expect(rep.retainedIrreducibleDifferences.length).toBeGreaterThan(0);
  });

  it("overall verdict is non_compliant when explicit non-math bugs listed", () => {
    const rep = buildSiteInvariantRuntimeContractReport({
      generatedAtUtc: "t",
      runTimestampEt: null,
      explicitNonMathVarianceBugs: ["example hypothetical drift"],
    });
    expect(rep.overallVerdict).toBe(SITE_INVARIANT_VERDICT_NON_COMPLIANT);
  });

  it("no stage row uses non_math_variance_bug classification in baseline table", () => {
    for (const s of getSiteInvariantRuntimeContractStages()) {
      expect(s.divergenceClassification).not.toBe(DIVERGENCE_NON_MATH_VARIANCE_BUG);
    }
  });

  it("deterministic JSON generation", () => {
    const rep = buildSiteInvariantRuntimeContractReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: null,
    });
    const a = stableStringifyForObservability(rep);
    expect(stableStringifyForObservability(rep)).toBe(a);
  });

  it("deterministic markdown: fixed section order", () => {
    const rep = buildSiteInvariantRuntimeContractReport({
      generatedAtUtc: "t",
      runTimestampEt: null,
    });
    const md = formatSiteInvariantRuntimeContractMarkdown(rep);
    const iVerdict = md.indexOf("## Overall verdict");
    const iIrr = md.indexOf("## Retained irreducible differences");
    const iBugs = md.indexOf("## Non-math variance bugs");
    const iStage = md.indexOf("## Stage-by-stage contract");
    expect(iVerdict).toBeGreaterThan(-1);
    expect(iIrr).toBeGreaterThan(iVerdict);
    expect(iBugs).toBeGreaterThan(iIrr);
    expect(iStage).toBeGreaterThan(iBugs);
  });

  it("static: run_optimizer wires runtime contract write and shared merge", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain("writeSiteInvariantRuntimeContractFromRun");
    expect(ro).toContain("./reporting/site_invariant_runtime_contract");
    expect(ro).toContain("mergeWithSnapshot");
    expect(ro).toContain("runBucketSlice");
    expect(ro).toContain("EVALUATION_BUCKET_ORDER");
  });

  it("static: UD entrypoint uses same bucket order primitive as PP", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain("EVALUATION_BUCKET_ORDER");
    expect(ud).toContain("runBucketSlice");
    expect(ud).toContain("mergeWithSnapshot");
  });

  it("static: canonical policy modules referenced in contract table strings", () => {
    const s = getSiteInvariantRuntimeContractStages().map((r) => r.ppCanonicalSource + r.udCanonicalSource).join("\n");
    expect(s).toContain("shared_final_selection_policy");
    expect(s).toContain("shared_card_construction_gates");
    expect(s).toContain("runtime_decision_pipeline");
    expect(s).toContain("merge_odds");
  });
});
