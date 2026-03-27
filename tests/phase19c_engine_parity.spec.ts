/**
 * Phase 19C — Engine parity (canonical): PP/UD contracts, payouts SSOT, thresholds, summarize shape.
 * Migrated from src/__tests__/engine_parity.test.ts so Jest testMatch (tests/ tree, .spec.ts) runs it.
 * tests/parity_test.spec.ts remains the dedicated math parity suite; this file covers engine contracts.
 */
import { getDefaultCliArgs } from "../src/cli_args";
import { getPayoutsAsRecord } from "../src/config/prizepicks_payouts";
import { breakEvenProbLabel } from "../src/engine_contracts";
import { createPrizepicksEngine } from "../src/pp_engine";
import { createUnderdogEngine } from "../src/ud_engine";

const ppEngine = createPrizepicksEngine(getDefaultCliArgs());
const udEngine = createUnderdogEngine(getDefaultCliArgs());

describe("Phase 19C — PP Payouts SSOT (canonical values vs hardcoded originals)", () => {
  const ORIGINAL_HARDCODED: Record<string, Record<number, number>> = {
    "2P": { 2: 3 },
    "3P": { 3: 6 },
    "4P": { 4: 10 },
    "5P": { 5: 20 },
    "6P": { 6: 37.5 },
    "3F": { 3: 3, 2: 1 },
    "4F": { 4: 6, 3: 1.5 },
    "5F": { 5: 10, 4: 2, 3: 0.4 },
    "6F": { 6: 25, 5: 2, 4: 0.4 },
  };

  for (const [structure, expected] of Object.entries(ORIGINAL_HARDCODED)) {
    it(`${structure} canonical payouts match original hardcoded values`, () => {
      expect(getPayoutsAsRecord(structure)).toEqual(expected);
    });
  }
});

describe("Phase 19C — Engine contracts (PlatformEngine shape)", () => {
  it("ppEngine satisfies PlatformEngine with platform=pp", () => {
    expect(ppEngine.platform).toBe("pp");
    expect(typeof ppEngine.getThresholds).toBe("function");
    expect(typeof ppEngine.filterLegs).toBe("function");
    expect(typeof ppEngine.buildCards).toBe("function");
    expect(typeof ppEngine.exportResults).toBe("function");
    expect(typeof ppEngine.summarize).toBe("function");
  });

  it("udEngine satisfies PlatformEngine with platform=ud", () => {
    expect(udEngine.platform).toBe("ud");
    expect(typeof udEngine.getThresholds).toBe("function");
    expect(typeof udEngine.filterLegs).toBe("function");
    expect(typeof udEngine.buildCards).toBe("function");
    expect(typeof udEngine.exportResults).toBe("function");
    expect(typeof udEngine.summarize).toBe("function");
  });
});

describe("Phase 19C — Engine thresholds (defaults vs original constants)", () => {
  it("PP defaults: minEdge=0.015, minLegEv=0.020, maxLegsPerPlayer=1", () => {
    const t = ppEngine.getThresholds();
    expect(t.platform).toBe("pp");
    expect(t.minEdge).toBe(0.015);
    expect(t.minLegEv).toBe(0.020);
    expect(t.maxLegsPerPlayer).toBe(1);
  });

  it("UD defaults: minEdge=0.006, minLegEv=0.012, maxLegsPerPlayer=1", () => {
    const t = udEngine.getThresholds();
    expect(t.platform).toBe("ud");
    expect(t.minEdge).toBe(0.006);
    expect(t.minLegEv).toBe(0.012);
    expect(t.maxLegsPerPlayer).toBe(1);
  });
});

describe("Phase 19C — breakEvenProbLabel", () => {
  it("PP label references 0.50 binary", () => {
    const label = breakEvenProbLabel("pp");
    expect(label).toContain("0.50");
    expect(label).toContain("PP");
  });

  it("UD label references udAdjustedLegEv", () => {
    const label = breakEvenProbLabel("ud");
    expect(label).toContain("udAdjustedLegEv");
    expect(label).toContain("PP convention");
  });
});

describe("Phase 19C — summarize (shape with zero inputs)", () => {
  it("PP summary fields", () => {
    const s = ppEngine.summarize(100, [], []);
    expect(s).toEqual({
      platform: "pp",
      mergedPicks: 100,
      legsAfterFilter: 0,
      cardsBuilt: 0,
      cardsAfterFilter: 0,
      topCardEvs: [],
    });
  });

  it("UD summary fields", () => {
    const s = udEngine.summarize(50, [], []);
    expect(s.platform).toBe("ud");
    expect(s.mergedPicks).toBe(50);
    expect(s.legsAfterFilter).toBe(0);
  });
});
