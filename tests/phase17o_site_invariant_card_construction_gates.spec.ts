import fs from "fs";
import path from "path";
import type { CardEvResult, EvPick } from "../src/types";
import {
  CARD_GATE_FAIL_TEAM_GAME_LIMITS,
  CARD_GATE_FAIL_UNIQUE_PLAYERS,
  CARD_GATE_PASS,
  SHARED_CARD_CONSTRUCTION_GATE_ORDER,
  constructionLegSetKeyFromCard,
  dedupeCardCandidatesByLegIdSetBestCardEv,
  dedupeFormatCardEntriesByLegSetBestCardEv,
  firstCardConstructionGateFailure,
  hasOppositeSideSameUnderlyingMarket,
  prospectiveLegsPassStructuralGates,
} from "../src/policy/shared_card_construction_gates";

const root = path.join(__dirname, "..");

function baseLeg(overrides: Partial<EvPick> & Pick<EvPick, "id" | "player">): EvPick {
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

describe("Phase 17O — site-invariant card construction gates", () => {
  it("exports deterministic shared gate order (PP and UD)", () => {
    expect(SHARED_CARD_CONSTRUCTION_GATE_ORDER).toEqual([
      "unique_players_per_card",
      "opposite_side_same_underlying_market",
      "team_and_game_density_limits",
    ]);
  });

  it("firstCardConstructionGateFailure is identical for equivalent normalized leg pools (site label only differs)", () => {
    const a = baseLeg({ id: "1", player: "A", site: "prizepicks" });
    const b = baseLeg({ id: "2", player: "B", site: "underdog" });
    expect(firstCardConstructionGateFailure([a, b])).toBe(CARD_GATE_PASS);
    expect(firstCardConstructionGateFailure([a, { ...a, id: "x", player: "A", stat: "rebounds" }])).toBe(
      CARD_GATE_FAIL_UNIQUE_PLAYERS
    );
  });

  it("unique players failure is first in gate order (stable reason codes)", () => {
    const dup = baseLeg({ id: "1", player: "A" });
    expect(firstCardConstructionGateFailure([dup, { ...dup, id: "2", stat: "rebounds" }])).toBe(
      CARD_GATE_FAIL_UNIQUE_PLAYERS
    );
  });

  it("hasOppositeSideSameUnderlyingMarket flags over+under on same player/stat/line (unique-players gate runs first in chain)", () => {
    const over = baseLeg({ id: "1", player: "A", outcome: "over" });
    const under = { ...over, id: "2", outcome: "under" as const };
    expect(hasOppositeSideSameUnderlyingMarket([over, under])).toBe(true);
    expect(firstCardConstructionGateFailure([over, under])).toBe(CARD_GATE_FAIL_UNIQUE_PLAYERS);
  });

  it("team/game density limits match legacy PP caps (4th leg same game)", () => {
    const g1 = baseLeg({ id: "1", player: "A", team: "T1", opponent: "T2" });
    const g2 = baseLeg({ id: "2", player: "B", team: "T1", opponent: "T2" });
    const g3 = baseLeg({ id: "3", player: "C", team: "T1", opponent: "T2" });
    const g4 = baseLeg({ id: "4", player: "D", team: "T1", opponent: "T2" });
    expect(firstCardConstructionGateFailure([g1, g2, g3])).toBe(CARD_GATE_PASS);
    expect(firstCardConstructionGateFailure([g1, g2, g3, g4])).toBe(CARD_GATE_FAIL_TEAM_GAME_LIMITS);
  });

  it("prospectiveLegsPassStructuralGates mirrors firstCardConstructionGateFailure === PASS", () => {
    const legs = [baseLeg({ id: "1", player: "A" }), baseLeg({ id: "2", player: "B" })];
    expect(prospectiveLegsPassStructuralGates(legs)).toBe(true);
    expect(prospectiveLegsPassStructuralGates([legs[0], { ...legs[0], id: "z", stat: "assists" }])).toBe(false);
  });

  it("dedupe by leg-id set is identical for PP-shaped and UD-shaped CardEvResult (unordered ids)", () => {
    const mk = (site: "prizepicks" | "underdog", id1: string, id2: string): CardEvResult => ({
      flexType: "3P",
      site,
      legs: [
        { pick: baseLeg({ id: id1, player: "A", site }), side: "over" },
        { pick: baseLeg({ id: id2, player: "B", site }), side: "over" },
      ],
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
    });
    const low = mk("prizepicks", "a", "b");
    low.cardEv = 0.05;
    const high = mk("underdog", "b", "a");
    high.cardEv = 0.2;
    const out = dedupeCardCandidatesByLegIdSetBestCardEv([low, high]);
    expect(out.length).toBe(1);
    expect(out[0].cardEv).toBe(0.2);
    expect(constructionLegSetKeyFromCard(low)).toBe(constructionLegSetKeyFromCard(high));
  });

  it("dedupeFormatCardEntriesByLegSetBestCardEv keeps higher EV and winning format", () => {
    const card = (ev: number): CardEvResult => ({
      flexType: "3P",
      site: "underdog",
      legs: [
        { pick: baseLeg({ id: "x", player: "A", site: "underdog" }), side: "over" },
        { pick: baseLeg({ id: "y", player: "B", site: "underdog" }), side: "over" },
      ],
      stake: 1,
      totalReturn: 2,
      expectedValue: ev,
      cardEv: ev,
      winProbability: 0.5,
      winProbCash: 0.5,
      winProbAny: 0.5,
      avgProb: 0.5,
      avgEdgePct: 1,
      hitDistribution: {},
    });
    const a = { format: "UD_3P_STD", card: card(0.05) };
    const b = { format: "UD_3F_FLX", card: card(0.12) };
    const out = dedupeFormatCardEntriesByLegSetBestCardEv([a, b]);
    expect(out.length).toBe(1);
    expect(out[0].format).toBe("UD_3F_FLX");
    expect(out[0].card.cardEv).toBe(0.12);
  });

  it("static: run_optimizer wires shared card gates (no local isCardWithinCorrelationLimits body)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./policy/shared_card_construction_gates"');
    expect(ro).toContain("firstCardConstructionGateFailure");
    expect(ro).toContain("dedupeCardCandidatesByLegIdSetBestCardEv");
    expect(ro).not.toMatch(/function\s+isCardWithinCorrelationLimits\s*\(/);
    expect(ro).not.toMatch(/MAX_LEGS_PER_GAME_PER_CARD\s*=\s*4/);
  });

  it("static: run_underdog_optimizer wires shared card gates (no ad hoc player-set-only check)", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain('from "./policy/shared_card_construction_gates"');
    expect(ud).toContain("firstCardConstructionGateFailure");
    expect(ud).toContain("dedupeFormatCardEntriesByLegSetBestCardEv");
    expect(ud).not.toMatch(/players\.size\s*<\s*combo\.length/);
  });

  it("Phase 17N — shared leg eligibility module still imported from run entrypoints", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro).toContain("shared_leg_eligibility");
    expect(ud).toContain("shared_leg_eligibility");
  });

  it("approved irreducible variance: card EV evaluators remain platform-specific (not duplicated here)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro).toContain("evaluateFlexCard");
    expect(ud).toContain("evaluateUdStandardCard");
    expect(ud).toContain("evaluateUdFlexCard");
  });
});
