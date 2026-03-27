/**
 * Phase 17X — cli_args must not parse process.argv or exit at import time.
 */
import fs from "fs";
import path from "path";

import {
  getCliArgs,
  getDefaultCliArgs,
  parseArgs,
  resetCliArgsResolutionForTests,
  setCliArgsForProcess,
} from "../src/cli_args";
import { getSiteInvariantRuntimeContractStages } from "../src/reporting/site_invariant_runtime_contract";

const root = path.join(__dirname, "..");

describe("Phase 17X — cli_args import-time side effects", () => {
  afterEach(() => {
    resetCliArgsResolutionForTests();
  });

  it("getDefaultCliArgs is deterministic and does not read process.argv", () => {
    const a = getDefaultCliArgs();
    const b = getDefaultCliArgs();
    expect(a.platform).toBe("pp");
    expect(a.sports).toEqual(["NBA"]);
    expect(b.bankroll).toBe(a.bankroll);
  });

  it("parseArgs override preserves flag resolution (behavior-neutral spot checks)", () => {
    const p = parseArgs(["--platform", "both", "--min-edge-per-leg", "0.01"]);
    expect(p.platform).toBe("both");
    expect(p.minEdge).toBe(0.01);
    expect(p.providers).toEqual(["PP", "UD"]);
    const vol = parseArgs(["--volume"]);
    expect(vol.volume).toBe(true);
    expect(vol.minEdge).toBe(0.004);
  });

  it("static: cli_args.ts has no top-level parsed argv export or import-time exit", () => {
    const src = fs.readFileSync(path.join(root, "src", "cli_args.ts"), "utf8");
    expect(src).not.toMatch(/export const cliArgs = parseArgs\(\)/);
    expect(src).not.toMatch(/if \(cliArgs\.help\)/);
    expect(src).not.toMatch(/if \(cliArgs\.printEffectiveConfig\)/);
    expect(src).toContain("optimizer_cli_bootstrap");
    expect(src).toContain("handleCliArgsEarlyExit");
  });

  it("static: optimizer entrypoints import bootstrap before other local modules", () => {
    const ro = fs.readFileSync(path.join(root, "src", "run_optimizer.ts"), "utf8");
    const ud = fs.readFileSync(path.join(root, "src", "run_underdog_optimizer.ts"), "utf8");
    expect(ro.indexOf('./optimizer_cli_bootstrap"')).toBeLessThan(ro.indexOf('from "./merge_odds"'));
    expect(ud.indexOf('./optimizer_cli_bootstrap"')).toBeLessThan(ud.indexOf('from "./merge_odds"'));
  });

  it("setCliArgsForProcess + getCliArgs round-trip for policy consumers", () => {
    const parsed = parseArgs(["--platform", "ud", "--bankroll", "777"]);
    setCliArgsForProcess(parsed);
    expect(getCliArgs().platform).toBe("ud");
    expect(getCliArgs().bankroll).toBe(777);
  });

  it("regression: Phase 17T runtime contract stage count unchanged (>=10)", () => {
    expect(getSiteInvariantRuntimeContractStages().length).toBeGreaterThanOrEqual(10);
  });
});
