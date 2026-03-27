/**
 * Phase 17Y — Explicit CliArgs threading through canonical runtime paths
 * (behavior-neutral; cliArgs Proxy remains for legacy callers).
 */
import fs from "fs";
import path from "path";

import {
  getDefaultCliArgs,
  parseArgs,
  resetCliArgsResolutionForTests,
  setCliArgsForProcess,
} from "../src/cli_args";

const root = path.join(__dirname, "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase 17Y — explicit CliArgs threading", () => {
  afterEach(() => {
    resetCliArgsResolutionForTests();
  });

  it("merge_odds: fetch path does not reference process-global cliArgs identifier", () => {
    const merge = readSrc("src/merge_odds.ts");
    expect(merge).not.toMatch(/\bcliArgs\./);
    expect(merge).not.toMatch(/\bgetCliArgs\b/);
    expect(merge).not.toMatch(/resolveMergeCli/);
    expect(merge).toContain("fetchFreshOdds(");
    expect(merge).toContain("cli: CliArgs");
  });

  it("pp_engine / ud_engine: no direct cliArgs import; engines use constructor CliArgs", () => {
    const pp = readSrc("src/pp_engine.ts");
    const ud = readSrc("src/ud_engine.ts");
    expect(pp).not.toContain('import { cliArgs }');
    expect(ud).not.toContain('import { cliArgs }');
    expect(pp).toContain("constructor(private readonly cli: CliArgs)");
    expect(ud).toContain("constructor(private readonly cli: CliArgs)");
    expect(pp).toContain("createPrizepicksEngine");
    expect(ud).toContain("createUnderdogEngine");
  });

  it("run_optimizer: mergeWithSnapshot receives explicit args in PP match_merge slice", () => {
    const ro = readSrc("src/run_optimizer.ts");
    expect(ro).toContain("mergeWithSnapshot(");
    expect(ro).toMatch(/mergeWithSnapshot\([\s\S]*args[\s\S]*\)/);
    expect(ro).toContain("createPrizepicksEngine(args)");
    expect(ro).toContain("computePpRunnerLegEligibility(args)");
  });

  it("run_underdog_optimizer: runUnderdogOptimizer passes cli through; no module-level cliArgs sports/policy", () => {
    const ud = readSrc("src/run_underdog_optimizer.ts");
    expect(ud).not.toMatch(/^const sports: Sport\[\] = cliArgs\.sports/m);
    expect(ud).toContain("export async function runUnderdogOptimizer");
    expect(ud).toContain("cli?: CliArgs");
    expect(ud).toContain("mergeWithSnapshot(rawProps, existingSnapshot.rows, snapshotMeta, snapshotAudit, args)");
    expect(ud).toContain("mergeOddsWithPropsWithMetadata(rawProps, args)");
  });

  it("defaults / flag resolution unchanged (spot-check vs Phase 17X)", () => {
    const def = getDefaultCliArgs();
    expect(def.platform).toBe("pp");
    expect(def.sports).toEqual(["NBA"]);
    const vol = parseArgs(["--volume"]);
    expect(vol.volume).toBe(true);
    expect(vol.minEdge).toBe(0.004);
  });

  it("cliArgs Proxy compatibility: lazy getCliArgs still works for uncovered modules", () => {
    const parsed = parseArgs(["--platform", "both", "--bankroll", "888"]);
    setCliArgsForProcess(parsed);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cliArgs } = require("../src/cli_args") as { cliArgs: { bankroll: number; platform: string } };
    expect(cliArgs.bankroll).toBe(888);
    expect(cliArgs.platform).toBe("both");
  });

  it("17X bootstrap contract unchanged: entrypoints import bootstrap before merge_odds", () => {
    const ro = readSrc("src/run_optimizer.ts");
    const udo = readSrc("src/run_underdog_optimizer.ts");
    expect(ro.indexOf('./optimizer_cli_bootstrap"')).toBeLessThan(ro.indexOf('from "./merge_odds"'));
    expect(udo.indexOf('./optimizer_cli_bootstrap"')).toBeLessThan(udo.indexOf('from "./merge_odds"'));
  });
});
