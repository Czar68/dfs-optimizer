import fs from "fs";
import path from "path";
import { buildPpCardBuilderPool, PP_CARD_BUILDER_MAX_POOL_LEGS } from "../src/policy/pp_card_builder_pool";
import type { EvPick } from "../src/types";

/** Minimal PP leg for pool ordering (market edge via `edge`; legacy trueProb screen no longer applied). */
function mkPpLeg(overrides: Partial<EvPick> & Pick<EvPick, "id" | "player" | "edge" | "trueProb">): EvPick {
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
    fairOdds: 1.2,
    book: "bk",
    overOdds: -110,
    underOdds: -110,
    legEv: overrides.edge ?? 0,
    isNonStandardOdds: false,
    ...overrides,
  } as EvPick;
}

describe("Phase 78 — PP card builder pool aligns with eligibility (market edge)", () => {
  it("does not drop legs with positive market edge when trueProb is below naive 0.5 + structure-style bar", () => {
    const lowTrueProbHighEdge = mkPpLeg({
      id: "a",
      player: "A",
      edge: 0.018,
      trueProb: 0.48,
      legEv: 0.018,
    });
    const pool = buildPpCardBuilderPool([lowTrueProbHighEdge]);
    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe("a");
  });

  it("sorts by edge descending and caps at PP_CARD_BUILDER_MAX_POOL_LEGS", () => {
    const legs = Array.from({ length: PP_CARD_BUILDER_MAX_POOL_LEGS + 5 }, (_, i) =>
      mkPpLeg({
        id: `id-${i}`,
        player: `P${i}`,
        edge: i * 0.001,
        trueProb: 0.52,
        legEv: i * 0.001,
      })
    );
    const pool = buildPpCardBuilderPool(legs);
    expect(pool.length).toBe(PP_CARD_BUILDER_MAX_POOL_LEGS);
    expect(pool[0].edge).toBeGreaterThan(pool[1].edge);
  });

  it("static: run_optimizer uses buildPpCardBuilderPool (no trueProb vs structureBE pool filter)", () => {
    const ro = fs.readFileSync(path.join(__dirname, "..", "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain("buildPpCardBuilderPool");
    expect(ro).not.toMatch(/trueProb\s*>=\s*structureBE/);
  });
});
