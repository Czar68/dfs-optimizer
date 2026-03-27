import fs from "fs";
import path from "path";
import type { CardEvResult, EvPick } from "../src/types";
import {
  DUPLICATE_PLAYER_LEG_CORRELATION_PENALTY_BASE,
  SHARED_POST_ELIGIBILITY_OPTIMIZATION_STAGE_ORDER,
  applyPostEvaluatorDuplicatePlayerLegPenalty,
  compareCardsForExportPrimaryRanking,
  compareLegsForPostEligibilityRanking,
  postEligibilityLegValueMetric,
  sortCardsForExportPrimaryRanking,
  sortFormatCardEntriesForExportPrimaryRanking,
  sortLegsByPostEligibilityValue,
} from "../src/policy/shared_post_eligibility_optimization";

const root = path.join(__dirname, "..");

function pick(overrides: Partial<EvPick> & Pick<EvPick, "id" | "player">): EvPick {
  return {
    sport: "NBA",
    site: "prizepicks",
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

describe("Phase 17P — site-invariant post-eligibility optimization", () => {
  it("exports explicit shared optimization stage order", () => {
    expect(SHARED_POST_ELIGIBILITY_OPTIMIZATION_STAGE_ORDER[0]).toBe(
      "post_evaluator_duplicate_player_leg_penalty"
    );
    expect(SHARED_POST_ELIGIBILITY_OPTIMIZATION_STAGE_ORDER).toContain(
      "selection_engine_breakeven_anti_dilution_pp_only"
    );
    expect(SHARED_POST_ELIGIBILITY_OPTIMIZATION_STAGE_ORDER).toContain("export_primary_ranking_sort_cards");
  });

  it("postEligibilityLegValueMetric matches PP effectiveEv / UD bench metric (adjEv ?? legEv)", () => {
    const a = pick({ id: "1", player: "A", legEv: 0.03, adjEv: undefined });
    const b = pick({ id: "2", player: "B", legEv: 0.02, adjEv: 0.05 });
    expect(postEligibilityLegValueMetric(a)).toBe(0.03);
    expect(postEligibilityLegValueMetric(b)).toBe(0.05);
    expect(compareLegsForPostEligibilityRanking(b, a)).toBeLessThan(0);
  });

  it("applyPostEvaluatorDuplicatePlayerLegPenalty is identical for PP vs UD site on same card shape", () => {
    const base = {
      flexType: "3P" as const,
      stake: 1,
      totalReturn: 2,
      expectedValue: 0.1,
      cardEv: 0.1,
      winProbability: 0.5,
      winProbCash: 0.5,
      winProbAny: 0.5,
      avgProb: 0.5,
      avgEdgePct: 1,
      hitDistribution: {},
    };
    const legs = [
      { pick: pick({ id: "l1", player: "Dup", site: "prizepicks" }), side: "over" as const },
      { pick: pick({ id: "l2", player: "Dup", site: "prizepicks", stat: "rebounds" }), side: "over" as const },
    ];
    const ppCard: CardEvResult = { ...base, site: "prizepicks", legs };
    const udCard: CardEvResult = { ...base, site: "underdog", legs: legs.map((x, i) => ({
      ...x,
      pick: { ...x.pick, site: "underdog" as const, id: i === 0 ? "l1" : "l2" },
    })) };
    const pOut = applyPostEvaluatorDuplicatePlayerLegPenalty(ppCard);
    const uOut = applyPostEvaluatorDuplicatePlayerLegPenalty(udCard);
    expect(pOut.cardEv).toBeCloseTo(0.1 * DUPLICATE_PLAYER_LEG_CORRELATION_PENALTY_BASE);
    expect(uOut.cardEv).toBe(pOut.cardEv);
  });

  it("compareCardsForExportPrimaryRanking tie-breaks on winProbCash then leg ids", () => {
    const mk = (idSuffix: string, ev: number, wp: number): CardEvResult =>
      ({
        flexType: "2P",
        site: "prizepicks",
        legs: [
          { pick: pick({ id: `a-${idSuffix}`, player: "A" }), side: "over" },
          { pick: pick({ id: `b-${idSuffix}`, player: "B" }), side: "over" },
        ],
        stake: 1,
        totalReturn: 2,
        expectedValue: ev,
        cardEv: ev,
        winProbability: wp,
        winProbCash: wp,
        winProbAny: wp,
        avgProb: 0.5,
        avgEdgePct: 1,
        hitDistribution: {},
      }) as CardEvResult;
    const x = mk("x", 0.1, 0.5);
    const y = mk("y", 0.1, 0.6);
    expect(compareCardsForExportPrimaryRanking(y, x)).toBeLessThan(0);
    const z = mk("z", 0.1, 0.5);
    z.legs[0].pick.id = "z-a";
    z.legs[1].pick.id = "z-b";
    const w = mk("w", 0.1, 0.5);
    w.legs[0].pick.id = "w-a";
    w.legs[1].pick.id = "w-b";
    expect(compareCardsForExportPrimaryRanking(z, w)).not.toBe(0);
  });

  it("sortFormatCardEntriesForExportPrimaryRanking matches sortCardsForExportPrimaryRanking on inner cards", () => {
    const c = (ev: number, wp: number, ida: string, idb: string): CardEvResult =>
      ({
        flexType: "2P",
        site: "underdog",
        legs: [
          { pick: pick({ id: ida, player: "A", site: "underdog" }), side: "over" },
          { pick: pick({ id: idb, player: "B", site: "underdog" }), side: "over" },
        ],
        stake: 1,
        totalReturn: 2,
        expectedValue: ev,
        cardEv: ev,
        winProbability: wp,
        winProbCash: wp,
        winProbAny: wp,
        avgProb: 0.5,
        avgEdgePct: 1,
        hitDistribution: {},
      }) as CardEvResult;
    const cards = [c(0.05, 0.5, "a1", "b1"), c(0.12, 0.5, "a2", "b2")];
    const wrapped = cards.map((card, i) => ({ format: `S${i}`, card }));
    const sortedInner = sortCardsForExportPrimaryRanking(cards);
    const sortedWrapped = sortFormatCardEntriesForExportPrimaryRanking(wrapped);
    expect(sortedWrapped.map((x) => x.card.cardEv)).toEqual(sortedInner.map((x) => x.cardEv));
  });

  it("static: run_optimizer has no local duplicate-player penalty / card sort heuristic", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./policy/shared_post_eligibility_optimization"');
    expect(ro).toContain("applyPostEvaluatorDuplicatePlayerLegPenalty");
    expect(ro).toContain("sortCardsForExportPrimaryRanking");
    expect(ro).toContain("sortLegsByPostEligibilityValue");
    expect(ro).not.toMatch(/function\s+applyCorrelationPenalty\s*\(/);
    expect(ro).not.toMatch(/CORRELATION_PENALTY_PER_DUPLICATE/);
  });

  it("static: run_underdog_optimizer uses shared post-opt for penalty, export sort, bench legs", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain('from "./policy/shared_post_eligibility_optimization"');
    expect(ud).toContain("applyPostEvaluatorDuplicatePlayerLegPenalty");
    expect(ud).toContain("sortFormatCardEntriesForExportPrimaryRanking");
    expect(ud).toContain("sortLegsByPostEligibilityValue");
    expect(ud).not.toMatch(/deduped\.sort\(\(a,\s*b\)\s*=>\s*b\.card\.cardEv/);
  });

  it("Phase 17N + 17O shared modules still wired from entrypoints", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro).toContain("shared_leg_eligibility");
    expect(ro).toContain("shared_card_construction_gates");
    expect(ud).toContain("shared_leg_eligibility");
    expect(ud).toContain("shared_card_construction_gates");
  });

  it("irreducible: SelectionEngine is orchestrated via shared_final_selection_policy (Phase 17Q)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./policy/shared_final_selection_policy"');
    expect(ro).toContain("attributeFilterAndOptimizeBatch");
    expect(ro).not.toContain('./SelectionEngine');
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain("attributeFinalSelectionUdFormatEntries");
    expect(ud).not.toContain('./SelectionEngine');
  });
});
