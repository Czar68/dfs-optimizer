import fs from "fs";
import path from "path";
import type { EvPick } from "../src/types";
import { parseArgs } from "../src/cli_args";
import {
  PHASE17N_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS,
  PHASE17N_IRREDUCIBLE_PLATFORM_MATH,
  PHASE17N_SHARED_ELIGIBILITY_STAGE_ORDER,
  applySharedFirstComeFirstServedCap,
  resolvePrizePicksRunnerExportCardLimit,
  resolveUnderdogRunnerExportCardCap,
  sharedLegPassesMinEdge,
} from "../src/policy/shared_leg_eligibility";
import { filterPpLegsGlobalPlayerCap, filterUdEvPicksCanonical } from "../src/policy/runtime_decision_pipeline";
import { buildPrizePicksEligibilityPolicy, buildUnderdogEligibilityPolicy } from "../src/policy/eligibility_policy";

const root = path.join(__dirname, "..");

describe("Phase 17N — site-invariant eligibility enforcement", () => {
  it("exports locked approved-irreducible classification lists (non-math bugs must not appear here)", () => {
    expect(PHASE17N_IRREDUCIBLE_PLATFORM_MATH.length).toBeGreaterThan(0);
    expect(PHASE17N_IRREDUCIBLE_PLATFORM_INPUT_SEMANTICS.length).toBeGreaterThan(0);
    expect(PHASE17N_SHARED_ELIGIBILITY_STAGE_ORDER).toEqual([
      "shared_min_edge_comparator",
      "shared_min_leg_ev_or_platform_tiered_ev",
      "shared_fcfs_cap",
    ]);
  });

  it("PP and UD policy contracts name shared export resolvers (cross-site export slice policy)", () => {
    const a = parseArgs([]);
    const pp = buildPrizePicksEligibilityPolicy(a);
    const ud = buildUnderdogEligibilityPolicy(a);
    expect(pp.exportAndRanking).toMatchObject({
      exportResolver: "resolvePrizePicksRunnerExportCardLimit",
    });
    expect(ud.exportAndRanking).toMatchObject({
      exportResolver: "resolveUnderdogRunnerExportCardCap",
      exportUncap: false,
    });
  });

  it("resolvePrizePicksRunnerExportCardLimit matches legacy PP vs both semantics", () => {
    const a = parseArgs([]);
    expect(resolvePrizePicksRunnerExportCardLimit(a, false)).toBe(a.maxExport);
    expect(resolvePrizePicksRunnerExportCardLimit(a, true)).toBe(a.maxCards);
    const uncapped = parseArgs(["--export-uncap"]);
    expect(resolvePrizePicksRunnerExportCardLimit(uncapped, false)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("resolveUnderdogRunnerExportCardCap matches legacy default 800 and honors --export-uncap", () => {
    const a = parseArgs([]);
    expect(resolveUnderdogRunnerExportCardCap(a)).toBe(a.maxCards ?? 800);
    const uncapped = parseArgs(["--export-uncap"]);
    expect(resolveUnderdogRunnerExportCardCap(uncapped)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("shared min-edge comparator is identical for PP-shaped and UD-shaped legs", () => {
    const minEdge = 0.008;
    const ppLeg = { edge: 0.01 } as Pick<EvPick, "edge">;
    const udLeg = { edge: 0.01 } as Pick<EvPick, "edge">;
    expect(sharedLegPassesMinEdge(ppLeg, minEdge)).toBe(true);
    expect(sharedLegPassesMinEdge(udLeg, minEdge)).toBe(true);
    expect(sharedLegPassesMinEdge({ edge: 0.001 } as Pick<EvPick, "edge">, minEdge)).toBe(false);
  });

  it("FCFS cap: same implementation path; grouping mode is the only allowed difference", () => {
    const base = {
      sport: "NBA",
      league: "NBA",
      team: "T1",
      opponent: null,
      projectionId: "p1",
      gameId: "g1",
      startTime: null,
      outcome: "over" as const,
      trueProb: 0.55,
      fairOdds: 1.2,
      book: "bk",
      overOdds: -110,
      underOdds: -110,
      isNonStandardOdds: false,
    };
    const a: EvPick = {
      ...base,
      id: "1",
      site: "prizepicks",
      player: "P1",
      stat: "points",
      line: 20,
      edge: 0.02,
      legEv: 0.02,
    } as EvPick;
    const b: EvPick = { ...a, id: "2", stat: "rebounds" } as EvPick;
    const c: EvPick = { ...a, id: "3", player: "P2" } as EvPick;
    const legs = [a, b, c];

    const ppStyle = applySharedFirstComeFirstServedCap(legs, 1, "per_player");
    expect(ppStyle.map((x) => x.id)).toEqual(["1", "3"]);

    const udStyle = applySharedFirstComeFirstServedCap(legs, 1, "per_player_per_stat_site");
    expect(udStyle.map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("filterPpLegsGlobalPlayerCap delegates to shared FCFS primitive (per_player)", () => {
    const base = {
      sport: "NBA",
      site: "prizepicks" as const,
      league: "NBA",
      team: "T1",
      opponent: null,
      projectionId: "p",
      gameId: "g",
      startTime: null,
      outcome: "over" as const,
      trueProb: 0.55,
      fairOdds: 1.2,
      book: "bk",
      overOdds: -110,
      underOdds: -110,
      isNonStandardOdds: false,
      edge: 0.02,
      legEv: 0.02,
    };
    const legs = [
      { ...base, id: "1", player: "A", stat: "points", line: 1 } as EvPick,
      { ...base, id: "2", player: "A", stat: "rebounds", line: 1 } as EvPick,
    ];
    expect(filterPpLegsGlobalPlayerCap(legs, 1)).toEqual(applySharedFirstComeFirstServedCap(legs, 1, "per_player"));
  });

  it("equivalent normalized legs (same edge/legEv/factor path) produce identical shared-eligibility outcomes for min-edge + FCFS when site label differs", () => {
    const mk = (site: "prizepicks" | "underdog", id: string): EvPick =>
      ({
        id,
        sport: "NBA",
        site,
        league: "NBA",
        player: "X",
        team: "T1",
        opponent: null,
        stat: "points",
        line: 22,
        projectionId: `proj-${id}`,
        gameId: `game-${id}`,
        startTime: null,
        outcome: "over",
        trueProb: 0.58,
        fairOdds: 1.38,
        edge: 0.045,
        book: "bk",
        overOdds: -110,
        underOdds: -110,
        legEv: 0.045,
        isNonStandardOdds: false,
        udPickFactor: null,
      }) as EvPick;

    const args = parseArgs([]);
    const ppLeg = mk("prizepicks", "p1");
    const udLeg = mk("underdog", "u1");
    expect(sharedLegPassesMinEdge(ppLeg, args.minEdge ?? 0.008)).toBe(true);
    expect(sharedLegPassesMinEdge(udLeg, args.minEdge ?? 0.008)).toBe(true);

    const udOut = filterUdEvPicksCanonical([udLeg], args);
    expect(udOut.length).toBe(1);
    // PP global cap on single leg is identical primitive output for per_player mode
    expect(filterPpLegsGlobalPlayerCap([ppLeg], 2)).toEqual(
      applySharedFirstComeFirstServedCap([ppLeg], 2, "per_player")
    );
  });

  it("static: run_optimizer uses shared export resolver (no inline exportUncap/maxCards/maxExport ternary)", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    expect(ro).toContain('from "./policy/shared_leg_eligibility"');
    expect(ro).toContain("resolvePrizePicksRunnerExportCardLimit");
    expect(ro).not.toMatch(
      /exportUncap\s*\?\s*Number\.MAX_SAFE_INTEGER\s*:\s*platform\s*===\s*["']both["']/
    );
  });

  it("static: run_underdog_optimizer uses computeUdRunnerLegEligibility + shared export cap (no duplicate udMinEdge formula)", () => {
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ud).toContain("computeUdRunnerLegEligibility");
    expect(ud).toContain("resolveUnderdogRunnerExportCardCap");
    expect(ud).toContain('from "./policy/shared_leg_eligibility"');
    expect(ud).not.toMatch(/const\s+udMinEdge\s*=\s*cliArgs\.minEdge/);
    expect(ud).not.toMatch(/maxCards\s*\?\?\s*800/);
  });

  it("static: runtime_decision_pipeline wires shared FCFS cap for PP + UD", () => {
    const p = fs.readFileSync(path.join(root, "src", "policy", "runtime_decision_pipeline.ts"), "utf8");
    expect(p).toContain('from "./shared_leg_eligibility"');
    expect(p).toContain("applySharedFirstComeFirstServedCap");
    expect(p).toContain('applySharedFirstComeFirstServedCap(safeFiltered, maxPerKey, "per_player_per_stat_site")');
  });

  it("static: opposite-side / dedupe timing remains contract-documented (shared policy text)", () => {
    const pp = buildPrizePicksEligibilityPolicy(parseArgs([]));
    const ud = buildUnderdogEligibilityPolicy(parseArgs([]));
    expect(typeof pp.cardConstructionGates.dedupeTiming).toBe("string");
    expect(typeof pp.cardConstructionGates.oppositeSideExclusionTiming).toBe("string");
    expect(typeof ud.cardConstructionGates.dedupeTiming).toBe("string");
    expect(typeof ud.cardConstructionGates.oppositeSideExclusionTiming).toBe("string");
  });
});
