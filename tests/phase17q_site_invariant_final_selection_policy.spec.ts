import fs from "fs";
import path from "path";
import type { CardEvResult, EvPick } from "../src/types";
import { resolveSelectionRegistryStructureId } from "../src/SelectionEngine";
import {
  FINAL_SELECTION_POLICY_STAGE_ORDER,
  applyExportCapSliceFormatEntries,
  applyExportCapSliceRankedCards,
  applyFinalCardSelectionPipeline,
  applyFinalSelectionToFormatEntries,
} from "../src/policy/shared_final_selection_policy";
import { compareCardsForExportPrimaryRanking } from "../src/policy/shared_post_eligibility_optimization";

const root = path.join(__dirname, "..");

function mkPick(overrides: Partial<EvPick> & Pick<EvPick, "id" | "player">): EvPick {
  return {
    sport: "NBA",
    site: "underdog",
    league: "NBA",
    team: "T1",
    opponent: "T2",
    stat: "points",
    line: 22,
    projectionId: "p",
    gameId: "g",
    startTime: null,
    outcome: "over",
    trueProb: 0.55,
    fairOdds: 1.2,
    edge: 0.02,
    book: "bk",
    overOdds: -110,
    underOdds: -110,
    legEv: 0.02,
    isNonStandardOdds: false,
    ...overrides,
  } as EvPick;
}

describe("Phase 17Q — site-invariant final selection policy", () => {
  it("exports deterministic final-selection stage order", () => {
    expect(FINAL_SELECTION_POLICY_STAGE_ORDER).toEqual([
      "pre_ranked_card_candidates",
      "breakeven_and_anti_dilution_selection_engine",
      "export_primary_ranking_sort",
      "export_cap_slice",
    ]);
  });

  it("resolveSelectionRegistryStructureId prefers UD structureId over abbreviated flexType", () => {
    const card = {
      flexType: "5P",
      structureId: "UD_5P_STD",
      legs: [{ pick: mkPick({ id: "1", player: "A" }), side: "over" as const }],
      stake: 1,
      totalReturn: 2,
      expectedValue: 0.1,
      cardEv: 0.1,
      winProbability: 0.5,
      winProbCash: 0.5,
      winProbAny: 0.5,
      avgProb: 0.55,
      avgEdgePct: 5,
      hitDistribution: {},
    } as CardEvResult;
    expect(resolveSelectionRegistryStructureId(card)).toBe("UD_5P_STD");
  });

  it("applyExportCapSliceRankedCards matches slice semantics and honors uncapped export", () => {
    const a = { cardEv: 0.1 } as CardEvResult;
    const b = { cardEv: 0.2 } as CardEvResult;
    expect(applyExportCapSliceRankedCards([a, b], 1)).toEqual([a]);
    expect(applyExportCapSliceRankedCards([a, b], Number.MAX_SAFE_INTEGER)).toEqual([a, b]);
  });

  it("applyExportCapSliceFormatEntries is deterministic and matches PP slice behavior on inner cardEv order", () => {
    const e1 = { format: "A", card: { cardEv: 0.1 } as CardEvResult };
    const e2 = { format: "B", card: { cardEv: 0.2 } as CardEvResult };
    expect(applyExportCapSliceFormatEntries([e1, e2], 1)).toEqual([e1]);
  });

  it("applyFinalCardSelectionPipeline and applyFinalSelectionToFormatEntries use same SelectionEngine contract (platform differs)", () => {
    const c = (ev: number, flexType: string, structureId?: string): CardEvResult =>
      ({
        flexType: flexType as CardEvResult["flexType"],
        structureId,
        site: "prizepicks",
        legs: [
          { pick: mkPick({ id: "x", player: "A", site: "prizepicks" }), side: "over" },
          { pick: mkPick({ id: "y", player: "B", site: "prizepicks" }), side: "over" },
        ],
        stake: 1,
        totalReturn: 2,
        expectedValue: ev,
        cardEv: ev,
        winProbability: 0.5,
        winProbCash: 0.5,
        winProbAny: 0.5,
        avgProb: 0.55,
        avgEdgePct: 5,
        hitDistribution: {},
      }) as CardEvResult;
    const pp = applyFinalCardSelectionPipeline([c(0.05, "2P")], "PP");
    expect(Array.isArray(pp)).toBe(true);
    const ud = applyFinalSelectionToFormatEntries([{ format: "UD_2P_STD", card: c(0.05, "2P", "UD_2P_STD") }], "UD");
    expect(Array.isArray(ud)).toBe(true);
  });

  it("equivalent ranked cards compare identically for export primary ranking regardless of site field on legs", () => {
    const base = (site: "prizepicks" | "underdog"): CardEvResult =>
      ({
        flexType: "3P",
        site,
        legs: [
          { pick: mkPick({ id: "a", player: "A", site }), side: "over" },
          { pick: mkPick({ id: "b", player: "B", site }), side: "over" },
        ],
        stake: 1,
        totalReturn: 2,
        expectedValue: 0.1,
        cardEv: 0.1,
        winProbability: 0.5,
        winProbCash: 0.5,
        winProbAny: 0.5,
        avgProb: 0.55,
        avgEdgePct: 5,
        hitDistribution: {},
      }) as CardEvResult;
    expect(compareCardsForExportPrimaryRanking(base("prizepicks"), base("underdog"))).toBe(0);
  });

  it("static: run_optimizer wires shared_final_selection_policy (no direct SelectionEngine import)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./policy/shared_final_selection_policy"');
    expect(ro).toContain("attributeFilterAndOptimizeBatch");
    expect(ro).toContain("applyExportCapSliceRankedCards");
    expect(ro).not.toContain('./SelectionEngine');
  });

  it("static: run_underdog_optimizer wires shared final selection + export cap", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain('from "./policy/shared_final_selection_policy"');
    expect(ud).toContain("attributeFinalSelectionUdFormatEntries");
    expect(ud).toContain("applyExportCapSliceFormatEntries");
    expect(ud).not.toContain("allCards.slice(0, maxCardsCap)");
  });

  it("Phase 17N — 17O — 17P invariants: entrypoints still import prior shared modules", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro).toContain("shared_leg_eligibility");
    expect(ro).toContain("shared_card_construction_gates");
    expect(ro).toContain("shared_post_eligibility_optimization");
    expect(ud).toContain("shared_leg_eligibility");
    expect(ud).toContain("shared_card_construction_gates");
    expect(ud).toContain("shared_post_eligibility_optimization");
  });

  it("irreducible: SelectionEngine implementation lives in src/SelectionEngine.ts (registry math, not duplicated)", () => {
    const se = fs.readFileSync(path.join(root, "src", "SelectionEngine.ts"), "utf8");
    expect(se).toContain("filterAndOptimize");
    expect(se).toContain("resolveSelectionRegistryStructureId");
  });
});
