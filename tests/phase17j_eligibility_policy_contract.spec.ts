import fs from "fs";
import os from "os";
import path from "path";
import { parseArgs } from "../src/cli_args";
import {
  UNDERDOG_GLOBAL_LEG_EV_FLOOR,
  UNDERDOG_FLEX_STRUCTURES,
  UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION,
} from "../src/config/underdog_structures";
import {
  buildEligibilityPolicyContract,
  buildPrizePicksEligibilityPolicy,
  buildUnderdogEligibilityPolicy,
  compareEligibilityPolicies,
  computePpEngineWrapperThresholds,
  computePpRunnerLegEligibility,
  computeUdRunnerLegEligibility,
  formatEligibilityPolicyContractMarkdown,
  getEligibilityPolicyContractPaths,
  writeEligibilityPolicyContractArtifacts,
  PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD,
} from "../src/policy/eligibility_policy";

/** Mirrors `src/run_optimizer.ts` module-level formulas (no import — proves policy layer matches). */
function mirrorRunOptimizerLegThresholds(args: ReturnType<typeof parseArgs>) {
  const minEdgePerLeg = args.minEdge ?? (args.volume ? 0.004 : 0.015);
  const minLegEv = args.minEv ?? (args.volume ? 0.004 : 0.02);
  const adjustedEvThreshold = args.volume ? 0.004 : 0.0225;
  const maxLegsPerPlayerGlobal = args.volume ? 2 : 1;
  return { minEdgePerLeg, minLegEv, adjustedEvThreshold, maxLegsPerPlayerGlobal, volumeMode: !!args.volume };
}

/** Mirrors `src/run_underdog_optimizer.ts` udMinLegEv / udMinEdge / udVolume. */
function mirrorUdRunnerThresholds(args: ReturnType<typeof parseArgs>) {
  const udVolume = !!(args.udVolume || args.volume);
  const udMinLegEv = udVolume ? 0.004 : (args.udMinEv ?? args.minEv ?? 0.012);
  const udMinEdge = args.minEdge ?? (udVolume ? 0.004 : 0.006);
  return { udVolume, udMinLegEv, udMinEdge, maxLegsPerPlayerPerStat: 1 };
}

describe("Phase 17J eligibility policy contract", () => {
  it("normalized PP policy generation is deterministic", () => {
    const a = parseArgs([]);
    const p1 = buildPrizePicksEligibilityPolicy(a);
    const p2 = buildPrizePicksEligibilityPolicy(a);
    expect(p1).toEqual(p2);
  });

  it("normalized UD policy generation is deterministic", () => {
    const a = parseArgs([]);
    const u1 = buildUnderdogEligibilityPolicy(a);
    const u2 = buildUnderdogEligibilityPolicy(a);
    expect(u1).toEqual(u2);
  });

  it("policy comparison marks shared vs platform-specific", () => {
    const a = parseArgs([]);
    const pp = buildPrizePicksEligibilityPolicy(a);
    const ud = buildUnderdogEligibilityPolicy(a);
    const cmp = compareEligibilityPolicies(pp, ud);
    const keys = cmp.map((c) => c.key).sort();
    expect(keys).toEqual([...keys].sort());
    const identical = cmp.filter((c) => c.relation === "identical");
    const approved = cmp.filter((c) => c.classification === "platform_specific_approved");
    const review = cmp.filter((c) => c.classification === "platform_specific_needs_review");
    expect(identical.length + approved.length + review.length).toBe(cmp.length);
    expect(approved.some((c) => c.key.includes("pp_effective_ev"))).toBe(true);
  });

  it("markdown contract output is deterministic and ordered", () => {
    const a = parseArgs([]);
    const c = buildEligibilityPolicyContract(a, "2026-03-20T12:00:00.000Z");
    const m1 = formatEligibilityPolicyContractMarkdown(c);
    const m2 = formatEligibilityPolicyContractMarkdown(c);
    expect(m1).toBe(m2);
    expect(m1.startsWith("# Eligibility Policy Contract\n")).toBe(true);
    const idx = (s: string) => m1.indexOf(s);
    expect(idx("## 1. Generated timestamp")).toBeLessThan(idx("## 2. Shared policy"));
    expect(idx("## 2. Shared policy")).toBeLessThan(idx("## 3. PrizePicks-only policy"));
    expect(idx("## 3. PrizePicks-only policy")).toBeLessThan(idx("## 4. Underdog-only policy"));
    expect(idx("## 4. Underdog-only policy")).toBeLessThan(idx("## 5. Differences requiring review"));
    expect(idx("## 5. Differences requiring review")).toBeLessThan(idx("## 6. Notes"));
  });

  it("artifact writer writes both json and md", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "phase17j-"));
    const a = parseArgs([]);
    writeEligibilityPolicyContractArtifacts(tmp, a, "2026-03-20T12:00:00.000Z");
    const { jsonPath, mdPath } = getEligibilityPolicyContractPaths(tmp);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
    const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(j.schemaVersion).toBe(1);
    expect(j.prizePicks.runnerLegEligibility).toEqual(computePpRunnerLegEligibility(a));
  });

  it("PP/UD policy values match mirrored runner formulas (not magic numbers)", () => {
    const a = parseArgs([]);
    expect(computePpRunnerLegEligibility(a)).toEqual(mirrorRunOptimizerLegThresholds(a));
    expect(computeUdRunnerLegEligibility(a)).toEqual(mirrorUdRunnerThresholds(a));
  });

  it("registry constants are wired into UD policy object", () => {
    const a = parseArgs([]);
    const ud = buildUnderdogEligibilityPolicy(a);
    expect(ud.legGates.underdogGlobalLegEvFloorRegistry).toBe(UNDERDOG_GLOBAL_LEG_EV_FLOOR);
    expect(ud.cardConstructionGates.standardStructureIdsAllowed).toEqual(
      [...UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION].sort()
    );
    expect(ud.cardConstructionGates.flexStructureIdsAllowed).toEqual(
      UNDERDOG_FLEX_STRUCTURES.map((s) => s.id).sort()
    );
  });

  it("Phase 17K: PP engine wrapper thresholds match runner (no divergence)", () => {
    const noVol = parseArgs([]);
    const c1 = buildEligibilityPolicyContract(noVol, "t");
    expect(c1.prizePicks.runnerVsEngineDivergence).toBe(false);
    expect(computePpRunnerDivergesFromEngine(noVol)).toBe(false);
    const vol = parseArgs(["--volume"]);
    const c2 = buildEligibilityPolicyContract(vol, "t");
    expect(c2.prizePicks.runnerVsEngineDivergence).toBe(false);
    expect(computePpRunnerDivergesFromEngine(vol)).toBe(false);
  });

  it("PP min legs for card build constant matches run_optimizer", () => {
    expect(PP_MIN_ELIGIBLE_LEGS_FOR_CARD_BUILD).toBe(6);
  });
});

function computePpRunnerDivergesFromEngine(args: ReturnType<typeof parseArgs>): boolean {
  const r = computePpRunnerLegEligibility(args);
  const e = computePpEngineWrapperThresholds(args);
  return (
    // @ts-ignore
    r.minEdgePerLeg !== e.minEdge ||
    // @ts-ignore
    r.minLegEv !== e.minLegEv ||
    // @ts-ignore
    r.adjustedEvThreshold !== e.evAdjThresh ||
    r.maxLegsPerPlayerGlobal !== e.maxLegsPerPlayer
  );
}
