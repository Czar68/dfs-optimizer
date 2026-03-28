/**
 * UD gating vs exported legEv: leg filter uses trueProb / udAdjustedLegEv tiers;
 * builder viable pool uses leg.legEv (market-relative) vs udMinLegEv unless boosted experiment.
 */
import { parseArgs } from "../src/cli_args";
import type { EvPick } from "../src/types";
import { filterUdEvPicksCanonical } from "../src/policy/runtime_decision_pipeline";
import {
  passesUdBuilderViableLegEvFloor,
  computeUdRunnerLegEligibility,
} from "../src/policy/eligibility_policy";

function mkUdLeg(overrides: Partial<EvPick> & Pick<EvPick, "trueProb" | "legEv" | "edge">): EvPick {
  return {
    id: "ud-gate-test-1",
    sport: "NBA",
    site: "underdog",
    league: "NBA",
    player: "Test",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 22,
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

describe("UD gating metric vs exported legEv", () => {
  const args = parseArgs([]);

  it("filterUdEvPicksCanonical admits a standard leg by trueProb floor, not by legEv", () => {
    const leg = mkUdLeg({
      trueProb: 0.53,
      edge: -0.02,
      legEv: -0.02,
    });
    const out = filterUdEvPicksCanonical([leg], args);
    expect(out).toHaveLength(1);
    expect(out[0]!.legEv).toBe(-0.02);
  });

  it("passesUdBuilderViableLegEvFloor rejects standard legs when legEv is below udMinLegEv floor", () => {
    const leg = mkUdLeg({
      trueProb: 0.53,
      edge: -0.02,
      legEv: -0.02,
    });
    const { udMinLegEv } = computeUdRunnerLegEligibility(args);
    expect(passesUdBuilderViableLegEvFloor(leg, udMinLegEv, false, false)).toBe(false);
  });

  it("passesUdBuilderViableLegEvFloor uses legEv for standard picks (same basis as calculate_ev legEv export)", () => {
    const leg = mkUdLeg({
      trueProb: 0.53,
      edge: 0.01,
      legEv: 0.01,
    });
    const { udMinLegEv } = computeUdRunnerLegEligibility(args);
    expect(passesUdBuilderViableLegEvFloor(leg, udMinLegEv, false, false)).toBe(
      leg.legEv >= udMinLegEv
    );
  });
});
