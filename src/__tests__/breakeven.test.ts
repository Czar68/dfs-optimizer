// src/__tests__/breakeven.test.ts
// Parlay breakeven: full payout schedules, binomial solver, DP EV. No fixed 50% or -115.

import {
  expectedReturnBinomial,
  solveBreakevenProbability,
  probToAmerican,
  getBreakevenForStructure,
  BREAKEVEN_TABLE_ROWS,
  formatPayouts,
} from "../config/binomial_breakeven";
import { getPayoutByHits, getStructure, ALL_STRUCTURES } from "../config/parlay_structures";

describe("Binomial breakeven solver", () => {
  it("UD 2-pick Standard (3.5×) breakeven = 53.45% (invariant), American ≈ -115", () => {
    const payouts = getPayoutByHits("UD_2P_STD")!;
    expect(payouts[2]).toBe(3.5);
    const p = solveBreakevenProbability(2, payouts);
    expect(Math.round(p * 10000) / 100).toBe(53.45);
    const american = probToAmerican(p);
    expect(american).toBeGreaterThanOrEqual(-116);
    expect(american).toBeLessThanOrEqual(-114);
  });

  it("PP 6-pick Flex (25×/2×/0.4×) breakeven = 54.21% (invariant), American ≈ -118.6", () => {
    const payouts = getPayoutByHits("6F")!;
    expect(payouts[6]).toBe(25);
    expect(payouts[5]).toBe(2);
    expect(payouts[4]).toBe(0.4);
    const p = solveBreakevenProbability(6, payouts);
    expect(Math.round(p * 10000) / 100).toBe(54.21);
    const american = probToAmerican(p);
    expect(american).toBeGreaterThanOrEqual(-120);
    expect(american).toBeLessThanOrEqual(-117);
  });

  it("autobracket throws when payout schedule has no sign change (invalid schedule)", () => {
    // n=2, only 2/2 pays 0.5x → max ER = 0.5*p^2 ≤ 0.5, so EV = ER-1 always < 0
    const invalidPayouts: Record<number, number> = { 0: 0, 1: 0, 2: 0.5 };
    expect(() => solveBreakevenProbability(2, invalidPayouts)).toThrow(/Breakeven autobracket failed|no sign change/);
  });

  it("UD 6-pick Flex 2-loss: payoutByHits includes 5 and 6 (no 4/6 tier)", () => {
    const s = getStructure("UD_6F_FLX");
    expect(s).toBeDefined();
    expect(s!.payoutByHits[6]).toBe(25);
    expect(s!.payoutByHits[5]).toBe(2.6);
    expect(s!.payoutByHits[4]).toBe(0);
    const be = getBreakevenForStructure("UD_6F_FLX");
    expect(be).toBeGreaterThan(0.54);
    expect(be).toBeLessThan(0.56);
  });

  it("UD 7-pick Flex 2-loss: payoutByHits includes 6 and 7", () => {
    const s = getStructure("UD_7F_FLX");
    expect(s).toBeDefined();
    expect(s!.payoutByHits[7]).toBe(40);
    expect(s!.payoutByHits[6]).toBe(2.75);
    expect(s!.payoutByHits[5]).toBe(0);
    const be = getBreakevenForStructure("UD_7F_FLX");
    expect(be).toBeGreaterThan(0.55);
    expect(be).toBeLessThan(0.58);
  });

  it("UD 8-pick Flex 2-loss: payoutByHits includes 6, 7, 8 (6/8 = 1×)", () => {
    const s = getStructure("UD_8F_FLX");
    expect(s).toBeDefined();
    expect(s!.payoutByHits[8]).toBe(80);
    expect(s!.payoutByHits[7]).toBe(3);
    expect(s!.payoutByHits[6]).toBe(1);
    const be = getBreakevenForStructure("UD_8F_FLX");
    expect(be).toBeGreaterThan(0.54);
    expect(be).toBeLessThan(0.56);
  });
});

describe("EV(p) at breakeven p* is zero", () => {
  it("UD_2P_STD: EV(p*) ≈ 0", () => {
    const payouts = getPayoutByHits("UD_2P_STD")!;
    const p = solveBreakevenProbability(2, payouts);
    const ev = expectedReturnBinomial(2, payouts, p);
    expect(Math.abs(ev)).toBeLessThan(1e-6);
  });

  it("6F: EV(p*) ≈ 0", () => {
    const payouts = getPayoutByHits("6F")!;
    const p = solveBreakevenProbability(6, payouts);
    const ev = expectedReturnBinomial(6, payouts, p);
    expect(Math.abs(ev)).toBeLessThan(1e-6);
  });
});

describe("American odds formula", () => {
  it("q >= 0.5: American = -100*q/(1-q)", () => {
    expect(probToAmerican(0.5)).toBe(-100);
    expect(probToAmerican(0.5345)).toBeCloseTo(-115, 0);
  });

  it("q < 0.5: American = 100*(1-q)/q", () => {
    expect(probToAmerican(0.4)).toBe(150);
  });
});

describe("Table covers all structures", () => {
  it("BREAKEVEN_TABLE_ROWS has one row per ALL_STRUCTURES", () => {
    expect(BREAKEVEN_TABLE_ROWS.length).toBe(ALL_STRUCTURES.length);
  });

  it("every structure has BE in (0.5, 0.6) and valid American odds", () => {
    for (const r of BREAKEVEN_TABLE_ROWS) {
      expect(r.breakevenPct).toBeGreaterThan(50);
      expect(r.breakevenPct).toBeLessThan(60);
      expect(Number.isFinite(r.americanOdds)).toBe(true);
    }
  });
});

describe("formatPayouts", () => {
  it("formats hits:mult for display", () => {
    const s = formatPayouts({ 6: 25, 5: 2, 4: 0.4 });
    expect(s).toContain("6:25");
    expect(s).toContain("5:2");
    expect(s).toContain("4:0.4");
  });
});
