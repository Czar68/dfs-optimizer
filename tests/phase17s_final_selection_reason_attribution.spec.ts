import fs from "fs";
import path from "path";
import type { CardEvResult, FlexType } from "../src/types";
import { filterAndOptimize } from "../src/SelectionEngine";
import {
  FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL,
  FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION,
  FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL,
  attributeFilterAndOptimizeBatch,
  attributeFinalSelectionUdFormatEntries,
  applyFinalCardSelectionPipeline,
  applyFinalSelectionToFormatEntries,
} from "../src/policy/shared_final_selection_policy";
import {
  buildFinalSelectionReasonsReport,
  buildPpFinalSelectionReasons,
  buildUdFinalSelectionReasons,
  formatFinalSelectionReasonsMarkdown,
  listPpExportCapRemovals,
  listUdExportCapRemovals,
} from "../src/reporting/final_selection_reason_attribution";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

const root = path.join(__dirname, "..");

function ppCard(structureId: string, flexType: FlexType, overrides: Partial<CardEvResult> = {}): CardEvResult {
  return {
    structureId,
    flexType,
    legs: [],
    stake: 1,
    totalReturn: 2,
    expectedValue: 0.05,
    cardEv: 0.05,
    winProbability: 0.5,
    winProbCash: 0.5,
    winProbAny: 0.5,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {},
    ...overrides,
  } as CardEvResult;
}

describe("Phase 17S — final selection reason attribution", () => {
  it("attributeFilterAndOptimizeBatch.kept matches filterAndOptimize (no semantic change)", () => {
    const cards = [
      ppCard("PP_6F", "6F", { avgProb: 0.52, legs: [{ pick: {} as any, side: "over" }] }),
      ppCard("PP_5P", "5P", { avgProb: 0.52, legs: [{ pick: {} as any, side: "over" }] }),
    ];
    const a = attributeFilterAndOptimizeBatch(cards, "PP");
    const b = filterAndOptimize(cards, "PP");
    expect(a.kept.length).toBe(b.length);
    for (let i = 0; i < b.length; i++) {
      expect(a.kept[i].cardEv).toBe(b[i].cardEv);
      expect(a.kept[i].structureId ?? a.kept[i].flexType).toBe(b[i].structureId ?? b[i].flexType);
    }
    expect(applyFinalCardSelectionPipeline(cards, "PP")).toEqual(b);
  });

  it("attributeFinalSelectionUdFormatEntries.keptEntries matches applyFinalSelectionToFormatEntries", () => {
    const e = (id: string, ft: FlexType, avgProb: number) => ({
      format: id,
      card: ppCard(id, ft, { avgProb, legs: [{ pick: {} as any, side: "over" }] }),
    });
    const entries = [e("UD_6F_FLEX", "6F", 0.52), e("UD_5P_STD", "5P", 0.52)];
    const attr = attributeFinalSelectionUdFormatEntries(entries, "UD");
    const pipe = applyFinalSelectionToFormatEntries(entries, "UD");
    expect(attr.keptEntries.length).toBe(pipe.length);
    expect(attr.keptEntries.map((x) => x.card.cardEv)).toEqual(pipe.map((x) => x.card.cardEv));
  });

  it("PP: per-type min EV, export cap, and breakeven attribution counts", () => {
    const before = [ppCard("A", "6F", { cardEv: 0.001 }), ppCard("B", "6F", { cardEv: 0.09 })];
    const filtered = [before[1]];
    const sorted = [filtered[0]];
    const exported = [filtered[0]];
    const rep = buildPpFinalSelectionReasons({
      cardsBeforeEvFilter: before,
      filteredCards: filtered,
      sortedCards: sorted,
      exportCards: exported,
    });
    expect(rep.countsByReason[FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL]).toBe(1);
    expect(rep.countsByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]).toBe(0);
    expect(rep.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]).toBe(0);
    expect(rep.dominantRemovalReason).toBe(FINAL_SELECTION_REASON_PER_TYPE_MIN_EV_REMOVAL);
  });

  it("PP: export-cap removals attributed separately from selection engine", () => {
    const c = ppCard("X", "6F", { avgProb: 0.52, legs: [{ pick: {} as any, side: "over" }] });
    const d = ppCard("Y", "5P", { avgProb: 0.52, legs: [{ pick: {} as any, side: "over" }] });
    const sorted = [c, d];
    const exported = [c];
    expect(listPpExportCapRemovals(sorted, exported)).toEqual([d]);
    const rep = buildPpFinalSelectionReasons({
      cardsBeforeEvFilter: [c, d],
      filteredCards: [c, d],
      sortedCards: sorted,
      exportCards: exported,
    });
    expect(rep.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]).toBe(1);
    expect(rep.stages.find((s) => s.stageId === "postFinalSelection_to_postExportCap")?.countsByReason[
      FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION
    ]).toBe(1);
  });

  it("UD: breakeven drop attributed", () => {
    const lowBe = { format: "UD_2P_STD", card: ppCard("UD_2P_STD", "2P", { avgProb: 0.01, legs: [] }) };
    const built = [lowBe];
    const ranked = attributeFinalSelectionUdFormatEntries(built, "UD").keptEntries;
    const rep = buildUdFinalSelectionReasons({
      builtPreFinalSelection: built,
      postFinalSelectionRanked: ranked,
      postExportCap: ranked,
    });
    expect(rep.countsByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]).toBe(1);
    expect(rep.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]).toBe(0);
  });

  it("UD: export-cap removals listed separately from breakeven", () => {
    const legs = new Array(6).fill(0).map(() => ({ pick: {} as any, side: "over" as const }));
    const ok = {
      format: "UD_6F_FLEX",
      card: ppCard("UD_6F_FLEX", "6F", { avgProb: 0.58, legs }),
    };
    const built = [ok];
    const ranked = attributeFinalSelectionUdFormatEntries(built, "UD").keptEntries;
    expect(ranked.length).toBeGreaterThan(0);
    const exported: typeof ranked = [];
    expect(listUdExportCapRemovals(ranked, exported)).toEqual(ranked);
    const rep = buildUdFinalSelectionReasons({
      builtPreFinalSelection: built,
      postFinalSelectionRanked: ranked,
      postExportCap: exported,
    });
    expect(rep.countsByReason[FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL]).toBe(0);
    expect(rep.countsByReason[FINAL_SELECTION_REASON_EXPORT_CAP_TRUNCATION]).toBe(ranked.length);
  });

  it("deterministic JSON + markdown ordering", () => {
    const report = buildFinalSelectionReasonsReport({
      generatedAtUtc: "2026-03-20T12:00:00.000Z",
      runTimestampEt: "2026-03-20T07:00:00 ET",
      pp: null,
      ud: null,
    });
    const s = stableStringifyForObservability(report);
    expect(stableStringifyForObservability(report)).toBe(s);
    expect(s.startsWith('{\n  "generatedAtUtc"')).toBe(true);
    const md = formatFinalSelectionReasonsMarkdown(
      buildFinalSelectionReasonsReport({
        generatedAtUtc: "t",
        runTimestampEt: "t",
        pp: buildPpFinalSelectionReasons({
          cardsBeforeEvFilter: [],
          filteredCards: [],
          sortedCards: [],
          exportCards: [],
        }),
        ud: null,
      })
    );
    const iPp = md.indexOf("## PrizePicks");
    const iUd = md.indexOf("## Underdog");
    expect(iPp).toBeGreaterThan(-1);
    expect(iUd).toBe(-1);
  });

  it("static: run_optimizer wires reason artifacts from shared pipeline outputs", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./reporting/final_selection_reason_attribution"');
    expect(ro).toContain("writeFinalSelectionReasonsArtifacts");
    expect(ro).toContain("buildPpFinalSelectionReasons");
    expect(ro).toContain("buildFinalSelectionReasonsReport");
    expect(ro).toContain("finalSelectionReasons");
    expect(ro).toContain("cardsBeforeEvFilterTail");
  });

  it("static: run_underdog_optimizer wires UD reason attribution from shared pipeline outputs", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain("buildUdFinalSelectionReasons");
    expect(ud).toContain("finalSelectionReasons");
    expect(ud).toContain("postFinalSelectionRanked");
  });

  it("static: shared_final_selection_policy exports attribution helpers", () => {
    const pol = fs.readFileSync(path.join(root, "src", "policy", "shared_final_selection_policy.ts"), "utf8");
    expect(pol).toContain("attributeFilterAndOptimizeBatch");
    expect(pol).toContain("attributeFinalSelectionUdFormatEntries");
    expect(pol).toContain("FINAL_SELECTION_REASON_BREAKEVEN_FILTER_REMOVAL");
  });
});
