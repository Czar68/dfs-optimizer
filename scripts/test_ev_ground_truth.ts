/**
 * Ground truth EV validation: compare DP EV, Monte Carlo EV, and manual EV
 * for a simple 2P parlay with two 55% legs. Do not modify existing code.
 * Run: npx ts-node scripts/test_ev_ground_truth.ts
 */

import { computeLocalEvDP } from "../math_models/ev_dp_prizepicks";
import { runMonteCarloParlay } from "../math_models/monte_carlo_parlays";
import { getPayoutByHits } from "../src/config/parlay_structures";

const flexType = "2P";
const legs = [
  { trueProb: 0.55 },
  { trueProb: 0.55 },
];
const stake = 1;

// A) DP EV
const dpEv = computeLocalEvDP(flexType, legs.map((l) => l.trueProb));

// B) Monte Carlo EV
const payouts = getPayoutByHits(flexType);
if (!payouts) throw new Error("getPayoutByHits(2P) returned undefined");
const mc = runMonteCarloParlay(legs, payouts, stake, 50000);

// C) Manual EV: P(2 hits) = 0.55 * 0.55; payout 2 hits = 3x
const pHitAll = 0.55 * 0.55;
const manualEv = pHitAll * 3 - 1;

console.log({
  dpEv,
  monteCarloEv: mc.monteCarloEV,
  manualEv,
});
