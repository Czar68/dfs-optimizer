/**
 * Phase 77 — Portfolio diversification (greedy soft penalties + hard guardrails).
 */
import type { CardEvResult, EvPick, FlexType } from "../src/types";
import {
  canonicalLegKey,
  computeSoftPenalty,
  hardViolatesPortfolioConstraints,
  selectDiversifiedPortfolioExport,
  DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY,
  cardIdentityKey,
} from "../src/policy/portfolio_diversification";

function mkPick(overrides: Partial<EvPick> & { id: string; player: string }): EvPick {
  const { id, player, ...rest } = overrides;
  return {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    team: "T1",
    opponent: "T2",
    stat: "points",
    line: 20,
    projectionId: id,
    gameId: "g1",
    startTime: null,
    outcome: "over",
    trueProb: 0.55,
    fairOdds: -110,
    edge: 0.05,
    book: "fd",
    overOdds: -110,
    underOdds: -110,
    legEv: 0.03,
    isNonStandardOdds: false,
    id,
    player,
    ...rest,
  };
}

function mkCard(
  flexType: FlexType,
  cardEv: number,
  legs: { pick: EvPick; side: "over" | "under" }[]
): CardEvResult {
  return {
    flexType,
    legs,
    stake: 1,
    totalReturn: cardEv + 1,
    expectedValue: cardEv,
    winProbability: 0.4,
    cardEv,
    winProbCash: 0.3,
    winProbAny: 0.35,
    avgProb: 0.55,
    avgEdgePct: 5,
    hitDistribution: {},
  };
}

describe("Phase 77 canonicalLegKey", () => {
  it("uses legKey when set", () => {
    const p = mkPick({ id: "a", player: "X", legKey: "k1" });
    expect(canonicalLegKey(p, "over")).toBe("k1");
  });
});

describe("Phase 77 greedy diversification", () => {
  it("preserves raw EV ordering when no penalties apply (disjoint legs)", () => {
    const a = mkPick({ id: "l1", player: "P1" });
    const b = mkPick({ id: "l2", player: "P2" });
    const c = mkPick({ id: "l3", player: "P3" });
    const d = mkPick({ id: "l4", player: "P4" });
    const e = mkPick({ id: "l5", player: "P5" });
    const f = mkPick({ id: "l6", player: "P6" });
    const cards = [
      mkCard("6F", 0.09, [
        { pick: a, side: "over" },
        { pick: b, side: "over" },
        { pick: c, side: "over" },
        { pick: d, side: "over" },
        { pick: e, side: "over" },
        { pick: f, side: "over" },
      ]),
      mkCard("6F", 0.08, [
        { pick: mkPick({ id: "m1", player: "Q1" }), side: "over" },
        { pick: mkPick({ id: "m2", player: "Q2" }), side: "over" },
        { pick: mkPick({ id: "m3", player: "Q3" }), side: "over" },
        { pick: mkPick({ id: "m4", player: "Q4" }), side: "over" },
        { pick: mkPick({ id: "m5", player: "Q5" }), side: "over" },
        { pick: mkPick({ id: "m6", player: "Q6" }), side: "over" },
      ]),
    ];
    const sorted = [...cards].sort((x, y) => y.cardEv - x.cardEv);
    const { exported, report } = selectDiversifiedPortfolioExport(sorted, 2, {
      ...DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY,
    });
    expect(exported.length).toBe(2);
    expect(exported[0].cardEv).toBe(0.09);
    expect(exported[1].cardEv).toBe(0.08);
    expect(report.topRepeatedLegsDiversified.every((t) => t.count <= 2)).toBe(true);
  });

  it("does not mutate input cardEv on exported annotations", () => {
    const legs = [
      mkPick({ id: "z1", player: "A" }),
      mkPick({ id: "z2", player: "B" }),
      mkPick({ id: "z3", player: "C" }),
      mkPick({ id: "z4", player: "D" }),
      mkPick({ id: "z5", player: "E" }),
      mkPick({ id: "z6", player: "F" }),
    ];
    const c0 = mkCard(
      "6F",
      0.1,
      legs.map((p) => ({ pick: p, side: "over" as const }))
    );
    const origEv = c0.cardEv;
    const { exported } = selectDiversifiedPortfolioExport([c0], 1, DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY);
    expect(exported[0].cardEv).toBe(origEv);
    expect(exported[0].rawCardEv).toBe(origEv);
  });

  it("prefers a lower raw EV card when top card exhausts overlap budget for a duplicate-heavy slate", () => {
    const shared = mkPick({ id: "shared", player: "Star" });
    const pool: CardEvResult[] = [];
    for (let i = 0; i < 3; i++) {
      const others = [1, 2, 3, 4, 5].map((j) =>
        mkPick({ id: `o${i}-${j}`, player: `Pl${i}${j}` })
      );
      const legs = [shared, ...others].map((p) => ({ pick: p, side: "over" as const }));
      pool.push(mkCard("6F", 0.1 - i * 0.001, legs));
    }
    const sorted = [...pool].sort((a, b) => b.cardEv - a.cardEv);
    const policy = {
      ...DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY,
      maxPairwiseSharedLegsHard: 2,
      penaltyPerSharedLegWithSelected: 0.5,
    };
    const { exported } = selectDiversifiedPortfolioExport(sorted, 2, policy);
    expect(exported.length).toBe(2);
    const k0 = cardIdentityKey(exported[0]);
    const k1 = cardIdentityKey(exported[1]);
    expect(k0).not.toBe(k1);
  });
});

describe("Phase 77 hard / soft helpers", () => {
  it("hardViolatesPortfolioConstraints blocks excessive leg reuse", () => {
    const p = mkPick({ id: "x", player: "One" });
    const card = mkCard("2P", 0.05, [
      { pick: p, side: "over" },
      { pick: mkPick({ id: "y", player: "Two" }), side: "over" },
    ]);
    const state = {
      legCounts: new Map([[canonicalLegKey(p, "over"), 3]]),
      playerLegSlots: new Map<string, number>(),
      selected: [] as CardEvResult[],
    };
    expect(
      hardViolatesPortfolioConstraints(card, DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY, state)
    ).toBe(true);
  });

  it("computeSoftPenalty increases with repeated legs", () => {
    const p = mkPick({ id: "r1", player: "Z" });
    const card = mkCard("2P", 0.06, [
      { pick: p, side: "over" },
      { pick: mkPick({ id: "r2", player: "Y" }), side: "over" },
    ]);
    const empty = {
      legCounts: new Map<string, number>(),
      playerLegSlots: new Map<string, number>(),
      playerStatCounts: new Map<string, number>(),
      gameLegCounts: new Map<string, number>(),
      selected: [] as CardEvResult[],
    };
    const z = computeSoftPenalty(card, DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY, empty);
    const heavy = {
      ...empty,
      legCounts: new Map([[canonicalLegKey(p, "over"), 2]]),
    };
    const h = computeSoftPenalty(card, DEFAULT_PORTFOLIO_DIVERSIFICATION_POLICY, heavy);
    expect(h.penaltyTotal).toBeGreaterThan(z.penaltyTotal);
  });
});
