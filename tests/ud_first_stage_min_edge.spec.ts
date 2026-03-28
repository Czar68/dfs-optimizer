/**
 * First-stage UD filter: leg.edge >= udMinEdge via sharedLegPassesMinEdge (aligned with exported legEv).
 */
import { parseArgs } from "../src/cli_args";
import type { EvPick } from "../src/types";
import {
  filterUdEvPicksCanonical,
  udLegFirstFailureCode,
  UD_FAIL_SHARED_MIN_EDGE,
  UD_FAIL_MIN_EDGE,
} from "../src/policy/runtime_decision_pipeline";
import { computeUdRunnerLegEligibility } from "../src/policy/eligibility_policy";

function mkUd(overrides: Partial<EvPick> & Pick<EvPick, "trueProb" | "edge" | "legEv">): EvPick {
  return {
    id: "min-edge-1",
    sport: "NBA",
    site: "underdog",
    league: "NBA",
    player: "A",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 20,
    projectionId: "p1",
    gameId: "g1",
    startTime: null,
    outcome: "over",
    fairOdds: 1.2,
    book: "bk",
    overOdds: -110,
    underOdds: -110,
    isNonStandardOdds: false,
    udPickFactor: null,
    ...overrides,
  } as EvPick;
}

describe("UD first-stage udMinEdge (shared comparator)", () => {
  const args = parseArgs([]);

  it("filterUdEvPicksCanonical enforces leg.edge >= policy.udMinEdge after factor", () => {
    const { udMinEdge } = computeUdRunnerLegEligibility(args);
    expect(udMinEdge).toBeGreaterThan(0);
    const lowEdge = mkUd({ trueProb: 0.53, edge: udMinEdge - 0.001, legEv: udMinEdge - 0.001 });
    const highEdge = mkUd({ trueProb: 0.53, edge: udMinEdge + 0.001, legEv: udMinEdge + 0.001 });
    expect(filterUdEvPicksCanonical([lowEdge], args)).toHaveLength(0);
    expect(filterUdEvPicksCanonical([highEdge], args)).toHaveLength(1);
  });

  it("udLegFirstFailureCode returns UD_FAIL_SHARED_MIN_EDGE before trueProb floor", () => {
    const { udMinEdge } = computeUdRunnerLegEligibility(args);
    const lowEdge = mkUd({ trueProb: 0.53, edge: udMinEdge - 0.001, legEv: udMinEdge - 0.001 });
    expect(udLegFirstFailureCode(lowEdge, args)).toBe(UD_FAIL_SHARED_MIN_EDGE);
  });

  it("UD_FAIL_MIN_EDGE remains trueProb < UD_MIN_TRUE_PROB (distinct from shared min-edge)", () => {
    const { udMinEdge } = computeUdRunnerLegEligibility(args);
    const lowProb = mkUd({
      trueProb: 0.51,
      edge: udMinEdge + 0.05,
      legEv: udMinEdge + 0.05,
    });
    expect(udLegFirstFailureCode(lowProb, args)).toBe(UD_FAIL_MIN_EDGE);
  });
});
