import type { EvPick } from "../src/types";
import { passesUdBuilderViableLegEvFloor } from "../src/policy/eligibility_policy";

function boostedLeg(lowLegEv: number, factor: number): EvPick {
  return {
    id: "ap1",
    sport: "NBA",
    site: "underdog",
    league: "NBA",
    player: "Test",
    team: "T1",
    opponent: null,
    stat: "points",
    line: 20,
    projectionId: "p",
    gameId: "g",
    startTime: null,
    outcome: "over",
    trueProb: 0.55,
    fairOdds: 1.4,
    edge: 0.001,
    book: "bk",
    overOdds: -110,
    underOdds: -110,
    legEv: lowLegEv,
    isNonStandardOdds: false,
    udPickFactor: factor,
  } as EvPick;
}

describe("Phase AP — passesUdBuilderViableLegEvFloor", () => {
  const minLegEv = 0.012;

  it("default: boosted leg with legEv below minLegEv fails admission", () => {
    const leg = boostedLeg(0.001, 2.0);
    expect(passesUdBuilderViableLegEvFloor(leg, minLegEv, false, false)).toBe(false);
  });

  it("experiment ON: boosted leg can pass on udAdjustedLegEv floor even when legEv < minLegEv", () => {
    const leg = boostedLeg(0.001, 2.0);
    expect(passesUdBuilderViableLegEvFloor(leg, minLegEv, false, true)).toBe(true);
  });

  it("experiment OFF matches raw legEv gate for standard leg", () => {
    const std = { ...boostedLeg(0.02, 1.0), udPickFactor: 1.0 } as EvPick;
    expect(passesUdBuilderViableLegEvFloor(std, minLegEv, false, false)).toBe(true);
    expect(passesUdBuilderViableLegEvFloor(std, minLegEv, false, true)).toBe(true);
  });
});
