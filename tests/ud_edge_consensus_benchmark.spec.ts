/**
 * UD edge consensus-vs-benchmark seam: merge supplies sharp-weighted multi-book
 * devig as `trueProb`; leg market edge in `calculate_ev.ts` benchmarks against
 * the vigged two-way from the matched odds row. PP applies Phase L substitution
 * so the benchmark uses `fairOverOdds`/`fairUnderOdds` (consensus fair pair).
 */
import { calculateEvForMergedPick } from "../src/calculate_ev";
import { fairProbChosenSide } from "../math_models/juice_adjust";
import type { MergedPick } from "../src/types";

function makePick(overrides: Partial<MergedPick> = {}): MergedPick {
  return {
    sport: "NBA",
    site: "prizepicks",
    league: "NBA",
    player: "Test Player",
    team: "LAL",
    opponent: "BOS",
    stat: "points",
    line: 24.5,
    projectionId: "proj-ud-edge-1",
    gameId: "game-1",
    startTime: "2026-03-19T19:30:00Z",
    book: "draftkings",
    overOdds: -120,
    underOdds: -105,
    trueProb: 0.52,
    fairOverOdds: -108,
    fairUnderOdds: -112,
    isDemon: false,
    isGoblin: false,
    isPromo: false,
    isNonStandardOdds: false,
    outcome: "over",
    ...overrides,
  };
}

describe("UD edge: consensus trueProb vs matched-book market benchmark", () => {
  it("UD legEv = effectiveTrueProb minus fairProbChosenSide(vigged matched overOdds/underOdds)", () => {
    const ud = makePick({ site: "underdog" });
    const ev = calculateEvForMergedPick(ud);
    expect(ev).not.toBeNull();
    const bench = fairProbChosenSide(ud.overOdds, ud.underOdds, "over");
    expect(ev!.legEv).toBeCloseTo(ev!.trueProb - bench, 6);
  });

  it("PP legEv uses consensus fair pair for benchmark when fairOver/UnderOdds are set (Phase L)", () => {
    const pp = makePick({ site: "prizepicks" });
    const ev = calculateEvForMergedPick(pp);
    expect(ev).not.toBeNull();
    const bench = fairProbChosenSide(pp.fairOverOdds, pp.fairUnderOdds, "over");
    expect(ev!.legEv).toBeCloseTo(ev!.trueProb - bench, 6);
  });

  it("with identical stored trueProb and vigged odds, UD and PP legEv differ when fair pair ≠ vigged pair", () => {
    const ud = calculateEvForMergedPick(makePick({ site: "underdog" }))!;
    const pp = calculateEvForMergedPick(makePick({ site: "prizepicks" }))!;
    expect(ud.legEv).not.toBeCloseTo(pp.legEv, 5);
  });
});
