/**
 * Phase 16M: reporting rollups + graded card return (structure-aware, no EV math changes).
 */

import type { TrackedCard, TrackedLeg, LegResult } from "../src/tracking/tracker_schema";
import { computeGradedCardGrossReturn } from "../src/tracking/card_return";
import { cardInPeriod } from "../src/tracking/time_bounds";
import { buildTopLegAggregates } from "../src/tracking/reporting_rollups";
import { computePerformanceStatsFromGraded } from "../src/tracking/analytics_engine";

function mkLeg(r: LegResult, player = "A"): TrackedLeg {
  return {
    playerName: player,
    market: "points",
    line: 20.5,
    pick: "Over",
    projectedProb: 0.55,
    consensusOdds: -110,
    result: r,
  };
}

describe("Phase 16M computeGradedCardGrossReturn", () => {
  it("PP 6F flex: 5 wins + 1 loss uses partial tier (5 hits)", () => {
    const legs: TrackedLeg[] = [
      ...Array.from({ length: 5 }, () => mkLeg("Win")),
      mkLeg("Loss"),
    ];
    const card: TrackedCard = {
      cardId: "x",
      platform: "PP",
      flexType: "6F",
      structureId: "6F",
      projectedEv: 0.1,
      breakevenGap: 0,
      timestamp: new Date().toISOString(),
      legs,
    };
    const { gross, ambiguous } = computeGradedCardGrossReturn(card);
    expect(ambiguous).toBe(false);
    expect(gross).toBe(2);
  });

  it("PP 6P power: all wins uses full tier", () => {
    const legs: TrackedLeg[] = Array.from({ length: 6 }, () => mkLeg("Win"));
    const card: TrackedCard = {
      cardId: "y",
      platform: "PP",
      flexType: "6P",
      structureId: "6P",
      projectedEv: 0.1,
      breakevenGap: 0,
      timestamp: new Date().toISOString(),
      legs,
    };
    const { gross, ambiguous } = computeGradedCardGrossReturn(card);
    expect(ambiguous).toBe(false);
    expect(gross).toBe(37.5);
  });

  it("UD 6F flex uses UD_6F_FLX structure id when present", () => {
    const legs: TrackedLeg[] = Array.from({ length: 6 }, () => mkLeg("Win"));
    const card: TrackedCard = {
      cardId: "z",
      platform: "UD",
      flexType: "6F",
      structureId: "UD_6F_FLX",
      projectedEv: 0.1,
      breakevenGap: 0,
      timestamp: new Date().toISOString(),
      legs,
    };
    const { gross } = computeGradedCardGrossReturn(card);
    expect(gross).toBe(25);
  });
});

describe("Phase 16M time bounds", () => {
  it("cardInPeriod day matches ET calendar day of anchor", () => {
    const anchor = new Date("2026-03-19T20:00:00.000Z");
    const sameDay = "2026-03-19T12:00:00.000Z";
    const nextDay = "2026-03-20T12:00:00.000Z";
    expect(cardInPeriod(sameDay, "day", anchor)).toBe(true);
    expect(cardInPeriod(nextDay, "day", anchor)).toBe(false);
  });
});

describe("Phase 16M top legs + stats", () => {
  it("buildTopLegAggregates rolls wins by leg key", () => {
    const base: TrackedCard = {
      cardId: "c1",
      platform: "PP",
      flexType: "3P",
      structureId: "3P",
      projectedEv: 0.1,
      breakevenGap: 0,
      timestamp: new Date().toISOString(),
      legs: [],
    };
    const graded: TrackedCard[] = [
      {
        ...base,
        legs: [mkLeg("Win", "X"), mkLeg("Win", "Y"), mkLeg("Loss", "Z")],
      },
    ];
    const rows = buildTopLegAggregates(graded, 10);
    const x = rows.find((r) => r.playerName === "X");
    expect(x?.wins).toBe(1);
    const stats = computePerformanceStatsFromGraded(graded);
    expect(stats.totalGradedCards).toBe(1);
    expect(stats.legWinRatePct).toBeCloseTo((2 / 3) * 100, 5);
  });
});
