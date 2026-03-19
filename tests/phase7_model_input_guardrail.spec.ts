import { calculateEvForMergedPick, calculateEvForMergedPicks } from "../src/calculate_ev";
import type { MergedPick } from "../src/types";

type MergedPickWithUdFactor = MergedPick & { udPickFactor?: number | null };

function makeBaseMergedPick(overrides: Partial<MergedPickWithUdFactor> = {}): MergedPickWithUdFactor {
  return {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "Test Player",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 24.5,
    projectionId: "proj-1",
    gameId: "game-1",
    startTime: "2026-03-19T19:30:00Z",
    book: "oddsapi",
    overOdds: -110,
    underOdds: -110,
    trueProb: 0.57,
    fairOverOdds: -100,
    fairUnderOdds: -100,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    outcome: "over",
    ...overrides,
  };
}

describe("phase 7 model input guardrail", () => {
  it("keeps valid standard rows unchanged for modeling", () => {
    const pick = makeBaseMergedPick();
    const ev = calculateEvForMergedPick(pick);
    expect(ev).not.toBeNull();
    expect(ev?.projectionId).toBe(pick.projectionId);
    expect(ev?.line).toBe(pick.line);
    expect(ev?.outcome).toBe("over");
  });

  it("fails closed on malformed required identity fields", () => {
    const pick = makeBaseMergedPick({ projectionId: "" });
    expect(calculateEvForMergedPick(pick)).toBeNull();
  });

  it("fails closed on non-finite numeric inputs", () => {
    const badLine = makeBaseMergedPick({ line: Number.NaN });
    const badProb = makeBaseMergedPick({ trueProb: Number.POSITIVE_INFINITY });
    const badOverOdds = makeBaseMergedPick({ overOdds: Number.NaN });

    expect(calculateEvForMergedPick(badLine)).toBeNull();
    expect(calculateEvForMergedPick(badProb)).toBeNull();
    expect(calculateEvForMergedPick(badOverOdds)).toBeNull();
  });

  it("fails closed on unsupported side/state combinations", () => {
    const invalidOutcome = makeBaseMergedPick({ outcome: "sideways" as unknown as "over" });
    const contradictoryState = makeBaseMergedPick({
      site: "prizepicks",
      isNonStandardOdds: true,
      nonStandard: {
        category: "underdog_pick_factor_modifier",
        explicitness: "explicit",
      },
    });

    expect(calculateEvForMergedPick(invalidOutcome)).toBeNull();
    expect(calculateEvForMergedPick(contradictoryState)).toBeNull();
  });

  it("keeps supported UD nonstandard rows eligible", () => {
    const udNonStandard = makeBaseMergedPick({
      site: "underdog",
      isNonStandardOdds: true,
      udPickFactor: 0.92,
      nonStandard: {
        category: "underdog_pick_factor_modifier",
        explicitness: "explicit",
      },
    });

    const ev = calculateEvForMergedPick(udNonStandard);
    expect(ev).not.toBeNull();
    expect(ev?.site).toBe("underdog");
    expect(ev?.isNonStandardOdds).toBe(true);
  });

  it("deterministically excludes malformed rows from batch path", () => {
    const rows: MergedPickWithUdFactor[] = [
      makeBaseMergedPick({ projectionId: "good-1" }),
      makeBaseMergedPick({ projectionId: "" }),
      makeBaseMergedPick({ projectionId: "good-2", site: "underdog", isNonStandardOdds: true, udPickFactor: 1.05, nonStandard: { category: "underdog_pick_factor_modifier", explicitness: "derived" } }),
      makeBaseMergedPick({ projectionId: "bad-odds", underOdds: Number.NaN }),
    ];

    const out = calculateEvForMergedPicks(rows);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.projectionId).sort()).toEqual(["good-1", "good-2"]);
  });
});
