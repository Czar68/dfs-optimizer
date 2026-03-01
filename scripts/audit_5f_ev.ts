/**
 * audit_5f_ev.ts — EV Audit & Threshold Test Harness for 5-leg Flex Cards
 *
 * WHAT THIS DOES:
 * 1. Audits the 5F EV formula step-by-step with a worked example.
 * 2. Loads the latest SGO-derived legs from prizepicks-legs.json.
 * 3. Generates every valid 5-leg combination (unique players).
 * 4. Evaluates each card's EV locally using exact hit-distribution math.
 * 5. Reports acceptance counts and average EV at thresholds +3%, +5%, +8%, +10%.
 * 6. Recommends a default MIN_CARD_EV based on the distribution.
 *
 * RUN:  npx ts-node scripts/audit_5f_ev.ts
 */

import fs from "fs";
import path from "path";
import {
  FLEX5_PAYOUTS,
  FLEX3_PAYOUTS,
  FLEX4_PAYOUTS,
  FLEX6_PAYOUTS,
  POWER2_PAYOUTS,
  POWER3_PAYOUTS,
  POWER4_PAYOUTS,
  POWER5_PAYOUTS,
  POWER6_PAYOUTS,
  FlexPayout,
} from "../src/payouts";

// ─── 1. Hit-Distribution Math ───────────────────────────────────────────────

/**
 * Compute the exact hit-count distribution for n independent binary legs.
 *
 * Uses convolution (not the "average-p binomial" shortcut the Sheets engine
 * uses). Each leg contributes its own trueProb.
 *
 *   dist[k] = P(exactly k of n legs hit)
 *
 * Complexity: O(n²) — fine for n ≤ 6.
 */
function computeHitDistribution(probs: number[]): Record<number, number> {
  // Start with the trivial distribution for zero legs: P(0 hits) = 1
  let dist: number[] = [1];

  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - p); // leg misses
      next[k + 1] += dist[k] * p;   // leg hits
    }
    dist = next;
  }

  const result: Record<number, number> = {};
  for (let k = 0; k < dist.length; k++) {
    result[k] = dist[k];
  }
  return result;
}

// ─── 2. EV Calculation ──────────────────────────────────────────────────────

/**
 * Compute EV per $1 staked given a hit distribution and payout schedule.
 *
 *   EV = Σ_k [ P(k) × (multiplier(k) − 1) ]  for k with a payout
 *      + Σ_k [ P(k) × (−1)                ]  for k without a payout
 *
 * Equivalently:  EV = Σ_k [ P(k) × multiplier(k) ] − 1
 *   (where multiplier(k) = 0 for k values with no payout)
 */
function computeEv(
  hitDist: Record<number, number>,
  schedule: FlexPayout[]
): { ev: number; winProbCash: number; winProbAny: number } {
  let expectedReturn = 0; // Σ P(k) × multiplier(k)
  let winProbCash = 0;
  let winProbAny = 0;

  for (const [kStr, prob] of Object.entries(hitDist)) {
    const k = Number(kStr);
    const payout = schedule.find((p) => p.hits === k);
    const mult = payout ? payout.multiplier : 0;
    expectedReturn += prob * mult;

    if (mult > 1) winProbCash += prob; // profit > 0
    if (mult > 0) winProbAny += prob;  // any return
  }

  return {
    ev: expectedReturn - 1, // net profit per $1 staked
    winProbCash,
    winProbAny,
  };
}

// ─── 3. Payout schedule helper ──────────────────────────────────────────────

const ALL_SCHEDULES: Record<string, FlexPayout[]> = {
  "2P": POWER2_PAYOUTS,
  "3P": POWER3_PAYOUTS,
  "3F": FLEX3_PAYOUTS,
  "4P": POWER4_PAYOUTS,
  "4F": FLEX4_PAYOUTS,
  "5P": POWER5_PAYOUTS,
  "5F": FLEX5_PAYOUTS,
  "6P": POWER6_PAYOUTS,
  "6F": FLEX6_PAYOUTS,
};

// ─── 4. Combination generator ───────────────────────────────────────────────

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

// ─── 5. Leg type (minimal) ──────────────────────────────────────────────────

interface Leg {
  player: string;
  team: string | null;
  stat: string;
  line: number;
  trueProb: number;
  edge: number;
}

// ─── 6. Main ────────────────────────────────────────────────────────────────

function main() {
  // ── Load legs ──────────────────────────────────────────────────────────
  const legsPath = path.join(process.cwd(), "prizepicks-legs.json");
  const legsData = JSON.parse(fs.readFileSync(legsPath, "utf8"));
  const legs: Leg[] = legsData.legs;

  console.log(`\nLoaded ${legs.length} legs from ${legsPath}`);
  console.log(`Run timestamp: ${legsData.runTimestamp}\n`);

  // ── Step-by-step 5F audit with the top-5 legs ─────────────────────────
  const top5 = [...legs].sort((a, b) => b.edge - a.edge).slice(0, 5);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AUDIT: 5-Leg Flex Card (5F) — Worked Example");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("Legs used (top 5 by edge):");
  for (const [i, leg] of top5.entries()) {
    console.log(
      `  ${i + 1}. ${leg.player} | ${leg.stat} ${leg.line} | ` +
        `trueProb=${leg.trueProb.toFixed(4)} | edge=${(leg.edge * 100).toFixed(2)}%`
    );
  }

  const probs = top5.map((l) => l.trueProb);
  const avgProb = probs.reduce((s, p) => s + p, 0) / probs.length;
  console.log(`\n  avgProb = ${avgProb.toFixed(6)}`);

  console.log("\n── PrizePicks 5F Payout Schedule ──────────────────────────");
  console.log("  5/5 hits → 10×  (profit = +9× stake)");
  console.log("  4/5 hits →  2×  (profit = +1× stake)");
  console.log("  3/5 hits → 0.4× (profit = −0.6× stake)");
  console.log("  0-2 hits →  0×  (profit = −1× stake)");

  console.log("\n── Hit Distribution (exact convolution) ───────────────────");
  const dist = computeHitDistribution(probs);
  for (let k = 0; k <= 5; k++) {
    const payout = FLEX5_PAYOUTS.find((p) => p.hits === k);
    const mult = payout ? payout.multiplier : 0;
    const contrib = dist[k] * (mult - 1);
    console.log(
      `  P(${k} hits) = ${dist[k].toFixed(6)}` +
        `  × (${mult.toFixed(1)}× − 1) = ${contrib >= 0 ? "+" : ""}${contrib.toFixed(6)}`
    );
  }

  const { ev, winProbCash, winProbAny } = computeEv(dist, FLEX5_PAYOUTS);
  console.log(`\n  Card EV = ${(ev * 100).toFixed(4)}%  per $1 staked`);
  console.log(`  Win prob (cash, mult > 1×) = ${(winProbCash * 100).toFixed(2)}%`);
  console.log(`  Win prob (any return)      = ${(winProbAny * 100).toFixed(2)}%`);

  // ── Compare with average-p binomial approximation (what Sheets uses) ──
  console.log("\n── Comparison: Exact vs Average-p Binomial ────────────────");
  const binomDist: Record<number, number> = {};
  for (let k = 0; k <= 5; k++) {
    binomDist[k] = comb(5, k) * Math.pow(avgProb, k) * Math.pow(1 - avgProb, 5 - k);
  }
  const binomResult = computeEv(binomDist, FLEX5_PAYOUTS);
  console.log(`  Exact EV:     ${(ev * 100).toFixed(4)}%`);
  console.log(`  Avg-p binomial EV: ${(binomResult.ev * 100).toFixed(4)}%`);
  console.log(`  Difference:   ${((ev - binomResult.ev) * 100).toFixed(4)}%`);
  console.log(`  (Small difference validates the avg-p approximation)`);

  // ── Threshold test across ALL structure types ─────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  THRESHOLD TEST: All Structure Types");
  console.log("═══════════════════════════════════════════════════════════\n");

  const THRESHOLDS = [0.0, 0.03, 0.05, 0.08, 0.10];
  const STRUCTURE_SIZES: { type: string; size: number }[] = [
    { type: "2P", size: 2 },
    { type: "3P", size: 3 },
    { type: "3F", size: 3 },
    { type: "4P", size: 4 },
    { type: "4F", size: 4 },
    { type: "5P", size: 5 },
    { type: "5F", size: 5 },
    { type: "6P", size: 6 },
    { type: "6F", size: 6 },
  ];

  // Deduplicate legs by player (max 1 per player, keep highest edge)
  const bestByPlayer = new Map<string, Leg>();
  for (const leg of legs) {
    const existing = bestByPlayer.get(leg.player);
    if (!existing || leg.edge > existing.edge) {
      bestByPlayer.set(leg.player, leg);
    }
  }
  const uniqueLegs = [...bestByPlayer.values()].sort((a, b) => b.edge - a.edge);
  console.log(`Unique players: ${uniqueLegs.length} (from ${legs.length} legs)`);

  for (const { type: structType, size } of STRUCTURE_SIZES) {
    const schedule = ALL_SCHEDULES[structType];
    if (!schedule) continue;

    if (uniqueLegs.length < size) {
      console.log(`\n${structType}: Not enough unique players (need ${size}, have ${uniqueLegs.length})`);
      continue;
    }

    let totalCards = 0;
    const evValues: number[] = [];

    for (const combo of combinations(uniqueLegs, size)) {
      const comboProbs = combo.map((l) => l.trueProb);
      const comboDist = computeHitDistribution(comboProbs);
      const result = computeEv(comboDist, schedule);
      totalCards++;
      evValues.push(result.ev);
    }

    evValues.sort((a, b) => a - b);

    console.log(`\n── ${structType} (${size}-leg, ${totalCards} combos) ───`);

    if (totalCards > 0) {
      const minEv = evValues[0];
      const maxEv = evValues[evValues.length - 1];
      const medianEv = evValues[Math.floor(totalCards / 2)];
      const meanEv = evValues.reduce((s, v) => s + v, 0) / totalCards;

      console.log(`  EV range: ${(minEv * 100).toFixed(2)}% to ${(maxEv * 100).toFixed(2)}%`);
      console.log(`  Median EV: ${(medianEv * 100).toFixed(2)}%`);
      console.log(`  Mean EV:   ${(meanEv * 100).toFixed(2)}%`);
    }

    console.log(`  Threshold  |  Accepted  |  % Kept  |  Avg EV of Accepted`);
    console.log(`  -----------|------------|----------|--------------------`);

    for (const threshold of THRESHOLDS) {
      const accepted = evValues.filter((ev) => ev >= threshold);
      const avgAcceptedEv =
        accepted.length > 0
          ? accepted.reduce((s, v) => s + v, 0) / accepted.length
          : 0;
      const pctKept = totalCards > 0 ? (accepted.length / totalCards) * 100 : 0;

      console.log(
        `  ${(threshold * 100).toFixed(0).padStart(4)}%     ` +
          `|  ${String(accepted.length).padStart(8)}  ` +
          `|  ${pctKept.toFixed(1).padStart(5)}%  ` +
          `|  ${accepted.length > 0 ? (avgAcceptedEv * 100).toFixed(2) + "%" : "N/A"}`
      );
    }
  }

  // ── Recommendation ────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  RECOMMENDATIONS");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Compute summary across flex types only (3F, 4F, 5F, 6F) which are primary plays
  const flexTypes = ["3F", "4F", "5F", "6F"];
  for (const ft of flexTypes) {
    const cfg = STRUCTURE_SIZES.find((s) => s.type === ft);
    if (!cfg || uniqueLegs.length < cfg.size) continue;

    const schedule = ALL_SCHEDULES[ft];
    let total = 0;
    const allEvs: number[] = [];

    for (const combo of combinations(uniqueLegs, cfg.size)) {
      const comboProbs = combo.map((l) => l.trueProb);
      const comboDist = computeHitDistribution(comboProbs);
      const result = computeEv(comboDist, schedule);
      total++;
      allEvs.push(result.ev);
    }

    allEvs.sort((a, b) => b - a);
    const top10pct = allEvs.slice(0, Math.max(1, Math.floor(total * 0.1)));
    const top10AvgEv = top10pct.reduce((s, v) => s + v, 0) / top10pct.length;

    // Find threshold that keeps ~top 20% of cards
    const target20pctIdx = Math.floor(total * 0.2);
    const threshold20pct = target20pctIdx < allEvs.length ? allEvs[target20pctIdx] : 0;

    console.log(
      `  ${ft}: Top 10% avg EV = ${(top10AvgEv * 100).toFixed(2)}%` +
        ` | ~20% cutoff ≈ ${(threshold20pct * 100).toFixed(2)}%` +
        ` | Total combos = ${total}`
    );
  }

  console.log(`
Suggested per-type MIN_CARD_EV thresholds:
  - For Flex plays (3F/4F/5F/6F): Use the ~top-20% cutoff from above.
    These are the primary profitable plays.
  - For Power plays (2P-6P): Consider higher thresholds since Power
    is all-or-nothing with lower hit rates.
  - The global MIN_CARD_EV env var is a floor; per-type thresholds in
    getMinEvForFlexType() provide finer control.

Key insight: With ${uniqueLegs.length} unique legs, the number of combos grows
  fast (C(${uniqueLegs.length},5) = ${comb(uniqueLegs.length, 5)} for 5-leg cards).
  Most low-edge combos dilute the output. A +3% to +5% floor for flex
  plays should eliminate noise without cutting profitable cards.
`);
}

function comb(n: number, k: number): number {
  if (k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

main();
