// Strict CLI parsing + --print-effective-config (Prompt 4).

import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { parseArgs, getEffectiveConfig } from "../cli_args";

const distScript = path.join(process.cwd(), "dist", "src", "run_optimizer.js");
const hasDist = () => fs.existsSync(distScript);

describe("CLI strict parsing", () => {
  it("unknown argument causes exit 2 when run as optimizer entry", () => {
    if (!hasDist()) {
      console.warn("Skipping: dist/src/run_optimizer.js not found (run tsc first)");
      return;
    }
    const out = spawnSync(process.execPath, [distScript, "--unknown-flag"], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env },
    });
    expect(out.status).toBe(2);
    expect(out.stderr).toContain("Unknown argument");
  });

  it("--min-edge-per-leg parses and applies", () => {
    const result = parseArgs(["--min-edge-per-leg", "0.02"]);
    expect(result.minEdge).toBe(0.02);
  });

  it("--min-leg-ev parses and applies", () => {
    const result = parseArgs(["--min-leg-ev", "0.025"]);
    expect(result.minEv).toBe(0.025);
  });

  it("--max-cards-per-tier parses and applies", () => {
    const result = parseArgs(["--max-cards-per-tier", "300"]);
    expect(result.maxCards).toBe(300);
    expect(result.maxExport).toBe(300);
  });

  it("--odds-refresh parses live|cache|auto", () => {
    expect(parseArgs(["--odds-refresh", "live"]).oddsRefresh).toBe("live");
    expect(parseArgs(["--odds-refresh", "cache"]).oddsRefresh).toBe("cache");
    expect(parseArgs(["--odds-refresh", "auto"]).oddsRefresh).toBe("auto");
  });

  it("--odds-max-age-min parses and applies", () => {
    const result = parseArgs(["--odds-max-age-min", "60"]);
    expect(result.oddsMaxAgeMin).toBe(60);
  });

  it("--include-alt-lines sets includeAltLines true", () => {
    const result = parseArgs(["--no-alt-lines", "--include-alt-lines"]);
    expect(result.includeAltLines).toBe(true);
  });

  it("--require-alt-lines and --no-require-alt-lines", () => {
    expect(parseArgs(["--require-alt-lines"]).requireAltLines).toBe(true);
    expect(parseArgs(["--no-require-alt-lines"]).requireAltLines).toBe(false);
  });

  it("--print-effective-config sets flag", () => {
    const result = parseArgs(["--print-effective-config"]);
    expect(result.printEffectiveConfig).toBe(true);
  });

  it("--odds-refresh missing value causes exit 2", () => {
    if (!hasDist()) return;
    const out = spawnSync(process.execPath, [distScript, "--odds-refresh"], {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env },
    });
    expect(out.status).toBe(2);
    expect(out.stderr).toMatch(/requires|odds-refresh/);
  });
});

describe("getEffectiveConfig / print-effective-config output", () => {
  it("getEffectiveConfig returns expected fields", () => {
    const args = parseArgs(["--platform", "both", "--odds-refresh", "live", "--min-edge-per-leg", "0.01"]);
    const config = getEffectiveConfig(args);
    expect(config.oddsRefresh).toBe("live");
    expect(config.includeAltLines).toBe(true);
    expect(config.requireAltLines).toBe(true);
    expect(config.minEdgePerLeg).toBe(0.01);
    expect(config.minLegEv).toBe(0.02); // default
    expect(config.maxCards).toBe(400);
    expect(config.maxCardsPerTier).toBe(400);
    expect(config.oddsMaxAgeMin).toBe(120);
    expect(config.platform).toBe("both");
    expect(config.bankroll).toBe(1000);
  });

  it("getEffectiveConfig reflects all overrides", () => {
    const args = parseArgs([
      "--min-leg-ev", "0.03",
      "--max-cards-per-tier", "200",
      "--odds-max-age-min", "60",
      "--no-alt-lines",
      "--no-require-alt-lines",
      "--bankroll", "500",
    ]);
    const config = getEffectiveConfig(args);
    expect(config.minLegEv).toBe(0.03);
    expect(config.maxCards).toBe(200);
    expect(config.maxCardsPerTier).toBe(200);
    expect(config.oddsMaxAgeMin).toBe(60);
    expect(config.includeAltLines).toBe(false);
    expect(config.requireAltLines).toBe(false);
    expect(config.bankroll).toBe(500);
  });
});
