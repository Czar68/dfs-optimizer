/**
 * tests/mock_guard.spec.ts
 * Unit tests for mock-run guards: MOCK WARNING log and MOCK- runTimestamp prefix.
 * Run: npm run test:unit
 */

import { applyMockRunTimestamp, MOCK_WARNING_MSG } from "../src/utils/mock_guard";

describe("Mock guard", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("logs [MOCK WARNING] when effectiveMockLegs > 0 and valid ODDSAPI_KEY is set", () => {
    const env = { ODDSAPI_KEY: "12345678" } as NodeJS.ProcessEnv;
    applyMockRunTimestamp("2026-03-14T06:00:00", 50, env);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(MOCK_WARNING_MSG);
  });

  it("does not log when effectiveMockLegs is 0", () => {
    const env = { ODDSAPI_KEY: "12345678" } as NodeJS.ProcessEnv;
    applyMockRunTimestamp("2026-03-14T06:00:00", 0, env);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not log when effectiveMockLegs is null", () => {
    const env = { ODDSAPI_KEY: "12345678" } as NodeJS.ProcessEnv;
    applyMockRunTimestamp("2026-03-14T06:00:00", null, env);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("prefixes runTimestamp with MOCK- when mock is active (USE_MOCK_ODDS / effectiveMockLegs > 0)", () => {
    const base = "2026-03-14T06:00:00";
    const env = {} as NodeJS.ProcessEnv;
    const out = applyMockRunTimestamp(base, 10, env);
    expect(out).toBe("MOCK-" + base);
  });

  it("returns unchanged runTimestamp when effectiveMockLegs is null", () => {
    const base = "2026-03-14T06:00:00";
    const out = applyMockRunTimestamp(base, null, {} as NodeJS.ProcessEnv);
    expect(out).toBe(base);
  });

  it("returns unchanged runTimestamp when effectiveMockLegs is 0", () => {
    const base = "2026-03-14T06:00:00";
    const out = applyMockRunTimestamp(base, 0, {} as NodeJS.ProcessEnv);
    expect(out).toBe(base);
  });
});
