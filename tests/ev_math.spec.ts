/**
 * tests/ev_math.spec.ts
 * Unit tests for core EV math: implied probability, Kelly sizing, breakeven, composite line.
 * Run: npm run test:unit
 */

import { americanToImpliedProb } from "../src/odds_math";
import {
  americanToDecimal,
  calculateKellyFraction,
} from "../math_models/single_bet_ev";
import { solveBreakevenProbability } from "../math_models/breakeven_binomial";
import { getPayoutByHits } from "../src/config/parlay_structures";
import {
  compositePRALine,
  COMPOSITE_CORR_WEIGHT,
} from "../src/merge_odds";

// --- Suite 1: Implied probability from American odds ---
describe("Implied probability from American odds", () => {
  it("-110 → 0.5238 (±0.0001)", () => {
    const p = americanToImpliedProb(-110);
    expect(p).toBeCloseTo(110 / 210, 4);
    expect(p).toBeCloseTo(0.5238, 4);
    expect(Math.abs(p - 0.5238)).toBeLessThanOrEqual(0.0001);
  });

  it("+150 → 0.4000", () => {
    const p = americanToImpliedProb(150);
    expect(p).toBe(100 / (150 + 100));
    expect(p).toBeCloseTo(0.4, 4);
  });

  it("-200 → 0.6667", () => {
    const p = americanToImpliedProb(-200);
    expect(p).toBeCloseTo(200 / 300, 4);
    expect(p).toBeCloseTo(0.6667, 4);
  });

  it("+100 → 0.5000", () => {
    const p = americanToImpliedProb(100);
    expect(p).toBe(0.5);
  });

  it("0 odds returns 0.5 (edge case; should not occur in production)", () => {
    const p = americanToImpliedProb(0);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBe(0.5);
  });
});

// --- Suite 2: Kelly stake ---
/** Full Kelly stake $ = bankroll * kellyFraction. Half Kelly = same * 0.5. */
function kellyStakeDollars(
  edgeDecimal: number,
  americanOdds: number,
  bankroll: number,
  halfKelly: boolean
): number {
  const decimalOdds = americanToDecimal(americanOdds);
  const trueProb = (1 + edgeDecimal) / decimalOdds;
  const fraction = calculateKellyFraction(trueProb, decimalOdds);
  const mult = halfKelly ? 0.5 : 1;
  return bankroll * fraction * mult;
}

describe("Kelly stake", () => {
  it("edge=0.05, odds=-110, bankroll=1000, fullKelly → expected stake ~55", () => {
    const stake = kellyStakeDollars(0.05, -110, 1000, false);
    const decimalOdds = americanToDecimal(-110);
    const b = decimalOdds - 1;
    const expectedFraction = 0.05 / b;
    expect(expectedFraction).toBeCloseTo(0.055, 2);
    expect(stake).toBeCloseTo(1000 * expectedFraction, 0);
    expect(stake).toBeGreaterThanOrEqual(50);
    expect(stake).toBeLessThanOrEqual(60);
  });

  it("edge=0.05, odds=-110, bankroll=1000, halfKelly → half of full", () => {
    const fullStake = kellyStakeDollars(0.05, -110, 1000, false);
    const halfStake = kellyStakeDollars(0.05, -110, 1000, true);
    expect(halfStake).toBeCloseTo(fullStake * 0.5, 5);
  });

  it("edge=0 → stake=0 (no edge, no bet)", () => {
    const stake = kellyStakeDollars(0, -110, 1000, false);
    expect(stake).toBeGreaterThanOrEqual(0);
    expect(stake).toBeLessThanOrEqual(1e-10);
  });

  it("edge<0 → stake=0 (negative edge, never bet)", () => {
    const stake = kellyStakeDollars(-0.05, -110, 1000, false);
    expect(stake).toBe(0);
  });

  it("Kelly never exceeds bankroll (cap test)", () => {
    const decimalOdds = americanToDecimal(-110);
    const trueProb = 0.99;
    const fraction = calculateKellyFraction(trueProb, decimalOdds);
    expect(fraction).toBeLessThanOrEqual(1);
    const stake = 1000 * fraction;
    expect(stake).toBeLessThanOrEqual(1000);
  });
});

// --- Suite 3: Breakeven probability (invariants from artifacts/parlay_breakeven_table.md) ---
describe("Breakeven probability", () => {
  it("UD 2-pick standard: BE = 53.45% (matches parlay_breakeven_table.md)", () => {
    const payouts = getPayoutByHits("UD_2P_STD");
    expect(payouts).toBeDefined();
    expect(payouts![2]).toBe(3.5);
    const p = solveBreakevenProbability(2, payouts!);
    expect(Math.round(p * 10000) / 100).toBe(53.45);
  });

  it("PP 6-fold Flex: BE = 54.21% (matches parlay_breakeven_table.md)", () => {
    const payouts = getPayoutByHits("6F");
    expect(payouts).toBeDefined();
    expect(payouts![6]).toBe(25);
    expect(payouts![5]).toBe(2);
    expect(payouts![4]).toBe(0.4);
    const p = solveBreakevenProbability(6, payouts!);
    expect(Math.round(p * 10000) / 100).toBe(54.21);
  });
});

// --- Suite 4: Composite line (synthesizeCompositeOdds / PRA line) ---
describe("Composite line", () => {
  it("pts=22.5, reb=8.5, ast=5.5 → PRA line = 36.5", () => {
    const line = compositePRALine(22.5, 8.5, 5.5);
    expect(line).toBe(36.5);
  });

  it("correlation weight is applied to EV/prob, not to the line", () => {
    expect(COMPOSITE_CORR_WEIGHT).toBe(0.6);
    const line = compositePRALine(10, 5, 3);
    expect(line).toBe(18);
    expect(COMPOSITE_CORR_WEIGHT).toBeLessThanOrEqual(1);
    expect(COMPOSITE_CORR_WEIGHT).toBeGreaterThan(0);
  });
});
