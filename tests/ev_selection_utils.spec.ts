/**
 * getSelectionEv / getSelectionEvLabel: gate card selection on adjEv when ENABLE_CALIBRATION_ADJEV is on.
 */

import type { EvPick } from "../src/types";
import { getSelectionEv, getSelectionEvLabel } from "../src/constants/evSelectionUtils";

const ENV_KEY = "ENABLE_CALIBRATION_ADJEV";

function makeLeg(overrides: Partial<EvPick> = {}): EvPick {
  return {
    id: "leg-1",
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "Test",
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
    legEv: 0.06,
    isNonStandardOdds: false,
    ...overrides,
  } as EvPick;
}

describe("ev_selection_utils", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (savedEnv !== undefined) process.env[ENV_KEY] = savedEnv;
    else delete process.env[ENV_KEY];
  });

  describe("getSelectionEv", () => {
    it("returns legEv when flag is off", () => {
      delete process.env[ENV_KEY];
      const leg = makeLeg({ legEv: 0.05, adjEv: 0.04 });
      expect(getSelectionEv(leg)).toBe(0.05);
    });

    it("returns legEv when flag is on but adjEv is undefined", () => {
      process.env[ENV_KEY] = "true";
      const leg = makeLeg({ legEv: 0.05 });
      expect(getSelectionEv(leg)).toBe(0.05);
    });

    it("returns adjEv when flag is on and adjEv is defined", () => {
      process.env[ENV_KEY] = "true";
      const leg = makeLeg({ legEv: 0.05, adjEv: 0.07 });
      expect(getSelectionEv(leg)).toBe(0.07);
    });

    it("returns adjEv even when adjEv < legEv when flag is on", () => {
      process.env[ENV_KEY] = "true";
      const leg = makeLeg({ legEv: 0.08, adjEv: 0.03 });
      expect(getSelectionEv(leg)).toBe(0.03);
    });
  });

  describe("getSelectionEvLabel", () => {
    it('returns "legEv" when flag is off', () => {
      delete process.env[ENV_KEY];
      expect(getSelectionEvLabel()).toBe("legEv");
    });

    it('returns "adjEv" when flag is on', () => {
      process.env[ENV_KEY] = "true";
      expect(getSelectionEvLabel()).toBe("adjEv");
    });
  });
});
