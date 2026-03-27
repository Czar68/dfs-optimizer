import fs from "fs";
import os from "os";
import path from "path";
import type { CardEvResult, FlexType } from "../src/types";
import {
  buildFinalSelectionObservabilityReport,
  buildPpFinalSelectionObservability,
  buildUdFinalSelectionObservability,
  formatFinalSelectionObservabilityMarkdown,
  GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN,
  GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD,
  GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT,
  GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN,
  mergeFinalSelectionObservabilityArtifact,
  stableStringifyForObservability,
} from "../src/reporting/final_selection_observability";

const root = path.join(__dirname, "..");

function ppStub(structureId: string, flexType: FlexType = "6F"): CardEvResult {
  return { structureId, flexType } as CardEvResult;
}

describe("Phase 17R — final selection observability", () => {
  it("PP: counts and structure distribution by stage", () => {
    const a = ppStub("PP_6F");
    const b = ppStub("PP_5P");
    const obs = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [a, b, b],
      filteredCards: [a, b],
      selectionCards: [a],
      sortedCards: [a],
      exportCards: [a],
    });
    expect(obs.postStructureEvaluationBuild.total).toBe(3);
    expect(obs.postStructureEvaluationBuild.byStructureKey["PP_6F"]).toBe(1);
    expect(obs.postStructureEvaluationBuild.byStructureKey["PP_5P"]).toBe(2);
    expect(obs.postPerTypeMinEvFilter.total).toBe(2);
    expect(obs.postFinalSelection.total).toBe(1);
    expect(obs.postExportCap.total).toBe(1);
    expect(obs.selectionEngineRemovalFromFiltered).toBe(1);
    expect(obs.exportCapRemovalFromSorted).toBe(0);
    expect(obs.deltas).toHaveLength(3);
  });

  it("UD: counts align with built / post-selection / export pools", () => {
    const c = (id: string) =>
      ({ format: id, card: { structureId: id, flexType: "6F" } as CardEvResult }) as {
        format: string;
        card: CardEvResult;
      };
    const built = [c("UD_6F_FLEX"), c("UD_6F_FLEX"), c("UD_5P_STD")];
    const post = [c("UD_6F_FLEX")];
    const exp = [c("UD_6F_FLEX")];
    const obs = buildUdFinalSelectionObservability({
      builtPreFinalSelection: built,
      postFinalSelection: post,
      postExportCap: exp,
    });
    expect(obs.postStructureEvaluationBuild.total).toBe(3);
    expect(obs.postFinalSelection.total).toBe(1);
    expect(obs.postExportCap.total).toBe(1);
    expect(obs.selectionEngineRemovalFromBuilt).toBe(2);
    expect(obs.exportCapRemovalFromRanked).toBe(0);
  });

  it("deterministic JSON: stable key ordering for nested objects", () => {
    const report = buildFinalSelectionObservabilityReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T07:00:00 ET",
      pp: null,
      ud: null,
    });
    const s = stableStringifyForObservability(report);
    expect(stableStringifyForObservability(report)).toBe(s);
    expect(s.startsWith('{\n  "combinedGuardrailNotes"')).toBe(true);
    const idxGen = s.indexOf('"generatedAtUtc"');
    const idxPp = s.indexOf('"pp"');
    expect(idxGen).toBeLessThan(idxPp);
  });

  it("markdown: fixed section order (PP → UD → Guardrails)", () => {
    const pp = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [ppStub("X")],
      filteredCards: [ppStub("X")],
      selectionCards: [ppStub("X")],
      sortedCards: [ppStub("X")],
      exportCards: [ppStub("X")],
    });
    const ud = buildUdFinalSelectionObservability({
      builtPreFinalSelection: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
      postFinalSelection: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
      postExportCap: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
    });
    const md = formatFinalSelectionObservabilityMarkdown(
      buildFinalSelectionObservabilityReport({
        generatedAtUtc: "t",
        runTimestampEt: "t",
        pp,
        ud,
      })
    );
    const iPp = md.indexOf("## PrizePicks");
    const iUd = md.indexOf("## Underdog");
    const iG = md.indexOf("## Guardrails");
    expect(iPp).toBeGreaterThan(-1);
    expect(iUd).toBeGreaterThan(-1);
    expect(iG).toBeGreaterThan(-1);
    expect(iPp).toBeLessThan(iUd);
    expect(iUd).toBeLessThan(iG);
  });

  it("guardrails: dominance note only when export max share ≥ threshold", () => {
    const domSid = "DOM";
    const many = Array.from({ length: 11 }, () => ppStub(domSid));
    const high = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: many,
      filteredCards: many,
      selectionCards: many,
      sortedCards: many,
      exportCards: many,
    });
    expect(
      high.guardrailNotes.some((n) => n.includes("Exported pool") && n.includes("PP"))
    ).toBe(true);
    const balanced = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [ppStub("A"), ppStub("B")],
      filteredCards: [ppStub("A"), ppStub("B")],
      selectionCards: [ppStub("A"), ppStub("B")],
      sortedCards: [ppStub("A"), ppStub("B")],
      exportCards: [ppStub("A"), ppStub("B")],
    });
    expect(balanced.guardrailNotes.some((n) => n.includes("Exported pool"))).toBe(false);
    expect(GUARDRAIL_DOMINANCE_EXPORT_SHARE_THRESHOLD).toBe(0.55);
  });

  it("guardrails: selection-removal note when ratio ≥ threshold", () => {
    const one = ppStub("S");
    const ten = Array.from({ length: 10 }, (_, i) => ppStub(`S${i}`));
    const highRemoval = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: ten,
      filteredCards: ten,
      selectionCards: [one],
      sortedCards: [one],
      exportCards: [one],
    });
    expect(highRemoval.guardrailNotes.some((n) => n.includes("Final selection removed"))).toBe(true);
    const lowRemoval = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: ten,
      filteredCards: ten,
      selectionCards: ten,
      sortedCards: ten,
      exportCards: ten,
    });
    expect(lowRemoval.guardrailNotes.some((n) => n.includes("Final selection removed"))).toBe(false);
    expect(GUARDRAIL_SELECTION_REMOVAL_RATIO_WARN).toBe(0.35);
  });

  it("guardrails: export-mix shift note when max |Δpct| ≥ threshold", () => {
    const pre = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [ppStub("A"), ppStub("B")],
      filteredCards: [ppStub("A"), ppStub("B")],
      selectionCards: [ppStub("A"), ppStub("B")],
      sortedCards: [ppStub("A"), ppStub("B")],
      exportCards: [ppStub("A"), ppStub("B")],
    });
    const shifted = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [ppStub("A"), ppStub("B")],
      filteredCards: [ppStub("A"), ppStub("B")],
      selectionCards: [ppStub("A"), ppStub("B")],
      sortedCards: [ppStub("A"), ppStub("B")],
      exportCards: Array.from({ length: 20 }, () => ppStub("A")),
    });
    expect(shifted.postExportCap.pctByStructureKey["A"]).toBe(100);
    expect(pre.postFinalSelection.pctByStructureKey["A"]).toBe(50);
    expect(shifted.guardrailNotes.some((n) => n.includes("Export cap shifted structure mix"))).toBe(true);
    expect(GUARDRAIL_EXPORT_CAP_MAX_PCT_POINT_SHIFT).toBe(15);
  });

  it("guardrails: cross-site note when PP vs UD removal ratios diverge enough", () => {
    const ppHigh = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [ppStub("p")],
      filteredCards: Array.from({ length: 10 }, (_, i) => ppStub(`p${i}`)),
      selectionCards: [ppStub("p0")],
      sortedCards: [ppStub("p0")],
      exportCards: [ppStub("p0")],
    });
    const udLow = buildUdFinalSelectionObservability({
      builtPreFinalSelection: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
      postFinalSelection: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
      postExportCap: [{ format: "UD_2P_STD", card: ppStub("UD_2P_STD", "2P") }],
    });
    const rep = buildFinalSelectionObservabilityReport({
      generatedAtUtc: "t",
      runTimestampEt: "t",
      pp: ppHigh,
      ud: udLow,
    });
    expect(rep.combinedGuardrailNotes.some((n) => n.startsWith("[cross-site]"))).toBe(true);
    expect(GUARDRAIL_CROSS_SITE_SELECTION_REMOVAL_DELTA_WARN).toBe(0.25);
  });

  it("mergeFinalSelectionObservabilityArtifact combines pp/ud patches deterministically", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-obs-"));
    const ts = "2026-03-20T07:00:00 ET";
    mergeFinalSelectionObservabilityArtifact(dir, {
      runTimestampEt: ts,
      generatedAtUtc: "a",
      ud: buildUdFinalSelectionObservability({
        builtPreFinalSelection: [],
        postFinalSelection: [],
        postExportCap: [],
      }),
    });
    const ppOnly = buildPpFinalSelectionObservability({
      cardsBeforeEvFilter: [],
      filteredCards: [],
      selectionCards: [],
      sortedCards: [],
      exportCards: [],
    });
    mergeFinalSelectionObservabilityArtifact(dir, {
      runTimestampEt: ts,
      generatedAtUtc: "b",
      pp: ppOnly,
    });
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "data", "reports", "latest_final_selection_observability.json"), "utf8"));
    expect(raw.pp).not.toBeNull();
    expect(raw.ud).not.toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("static: run_optimizer wires observability from PP tails + UD run result", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./reporting/final_selection_observability"');
    expect(ro).toContain("writeFinalSelectionObservabilityArtifacts");
    expect(ro).toContain("buildPpFinalSelectionObservability");
    expect(ro).toContain("buildFinalSelectionObservabilityReport");
    expect(ro).toContain("finalSelectionObservability");
    expect(ro).toContain("cardsBeforeEvFilterTail");
  });

  it("static: run_underdog_optimizer exposes UD observability from shared selection outputs", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain("buildUdFinalSelectionObservability");
    expect(ud).toContain("finalSelectionObservability");
    expect(ud).toContain("udBuiltPreFinal");
  });
});
