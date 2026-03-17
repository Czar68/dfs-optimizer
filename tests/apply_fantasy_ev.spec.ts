/**
 * applyFantasyAdjEv: fantasy score nudge into adjEv when ENABLE_FANTASY_EV is on.
 */

import type { EvPick } from "../src/types";
import type { UnifiedProp } from "../src/types/unified-prop";
import { applyFantasyAdjEv, FANTASY_BASELINE, FANTASY_SCALE } from "../src/apply_fantasy_ev";

const mockCalculateFantasyScore = jest.fn();
jest.mock("../src/services/fantasyAggregator", () => ({
  calculateFantasyScore: (...args: unknown[]) => mockCalculateFantasyScore(...args),
}));

function makeLeg(overrides: Partial<EvPick> = {}): EvPick {
  return {
    id: "pp-1-pts-22.5",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "LeBron James",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 22.5,
    projectionId: "1",
    gameId: "g1",
    startTime: null,
    outcome: "over",
    trueProb: 0.58,
    fairOdds: 0.72,
    edge: 0.08,
    book: "DraftKings",
    overOdds: -120,
    underOdds: 100,
    legEv: 0.08,
    isNonStandardOdds: false,
    scoringWeight: 1.0,
    ...overrides,
  } as EvPick;
}

function fantasyResult(lineValue: number): UnifiedProp[] {
  return [
    {
      id: "fantasy-1",
      provider: "PP",
      player: "LeBron James",
      statType: "points",
      lineValue,
      breakeven: 0.5,
      odds: { over: -120, under: 100 },
      raw: {},
      isDerived: true,
    } as UnifiedProp,
  ];
}

describe("applyFantasyAdjEv", () => {
  const savedEnv = process.env.ENABLE_FANTASY_EV;

  afterEach(() => {
    process.env.ENABLE_FANTASY_EV = savedEnv;
    mockCalculateFantasyScore.mockReset();
  });

  it("fantasyEv field is set on the leg when flag is on and score is non-zero", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(25));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.fantasyEv).toBeDefined();
    expect(typeof leg.fantasyEv).toBe("number");
  });

  it("positive fantasy score nudges adjEv up", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(15));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeGreaterThan(0.10);
  });

  it("negative fantasy score nudges adjEv down", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(-5));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    expect(leg.adjEv!).toBeLessThan(0.10);
  });

  it("nudge is capped at +20% signal even for extreme fantasy scores", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(500));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    const maxNudge = 0.2 * 0.08;
    expect(leg.adjEv!).toBeLessThanOrEqual(0.10 * (1 + maxNudge) + 0.0001);
  });

  it("nudge is capped at -20% signal even for extreme negative scores", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(-500));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.adjEv).toBeDefined();
    const minNudge = -0.2 * 0.08;
    expect(leg.adjEv!).toBeGreaterThanOrEqual(0.10 * (1 + minNudge) - 0.0001);
  });

  it("leg returned unchanged when FLAGS.fantasyEv is false", () => {
    process.env.ENABLE_FANTASY_EV = "";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(25));
    const leg = makeLeg({ legEv: 0.10 });
    applyFantasyAdjEv(leg);
    expect(leg.fantasyEv).toBeUndefined();
    expect(leg.adjEv).toBeUndefined();
    expect(leg.legEv).toBe(0.10);
  });

  it("leg returned unchanged when calculateFantasyScore returns 0 / baseline", () => {
    process.env.ENABLE_FANTASY_EV = "true";
    mockCalculateFantasyScore.mockReturnValue(fantasyResult(FANTASY_BASELINE));
    const leg = makeLeg({ legEv: 0.10 });
    const baseEv = leg.adjEv ?? leg.legEv;
    applyFantasyAdjEv(leg);
    expect(leg.fantasyEv).toBe(0);
    expect(leg.adjEv).toBe(baseEv);
  });
});
