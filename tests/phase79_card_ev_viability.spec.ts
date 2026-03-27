import { buildCardEvViabilityPayload } from "../src/reporting/card_ev_viability";
import type { EvPick } from "../src/types";

function mkLeg(overrides: Partial<EvPick> & Pick<EvPick, "id" | "player" | "trueProb" | "edge">): EvPick {
  return {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    team: "T1",
    opponent: "T2",
    stat: "points",
    line: 20,
    projectionId: "p",
    gameId: "g",
    startTime: null,
    outcome: "over",
    fairOdds: 1.2,
    book: "bk",
    overOdds: -110,
    underOdds: -110,
    legEv: overrides.edge ?? 0,
    isNonStandardOdds: false,
    ...overrides,
  } as EvPick;
}

describe("Phase 79 — card EV viability report", () => {
  it("builds payload with structure blocks and breakeven columns", async () => {
    const legs: EvPick[] = [];
    for (let i = 0; i < 8; i++) {
      legs.push(
        mkLeg({
          id: `p${i}`,
          player: `Player${i}`,
          trueProb: 0.55 + i * 0.001,
          edge: 0.02 + i * 0.0001,
        })
      );
    }
    const p = await buildCardEvViabilityPayload(legs, {
      maxSamplesPerStructure: 50,
      minCardEvFallback: 0.008,
    });
    expect(p.schemaVersion).toBe(1);
    expect(p.poolLegsUsed).toBe(8);
    expect(p.structures.length).toBeGreaterThan(0);
    const twoP = p.structures.find((s) => s.flexType === "2P");
    expect(twoP).toBeDefined();
    expect(twoP!.requiredBreakevenAvgLegProb).toBeGreaterThan(0);
    expect(twoP!.sportCardEvThreshold).toBe(0.008);
    expect(p.sportCardEvThreshold).toBe(0.008);
    expect(p.rootCauseClassification.length).toBeGreaterThan(0);
  });
});
