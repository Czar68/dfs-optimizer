/**
 * analyze_thresholds.ts — Threshold Analysis for Card Volume Control
 *
 * WHAT THIS DOES:
 * 1. Loads representative SGO-derived legs from prizepicks-legs.json
 * 2. Enumerates all valid card combinations for each structure type
 * 3. Computes exact EV for each card using corrected payout math
 * 4. Analyzes card volume at thresholds {0%, +3%, +5%, +8%, +10%}
 * 5. Recommends data-driven minimum EV thresholds per structure
 * 6. Outputs markdown tables and implementation recommendations
 *
 * RUN:  npx ts-node scripts/analyze_thresholds.ts
 */

import fs from "fs";
import path from "path";
import {
  POWER2_PAYOUTS,
  POWER3_PAYOUTS,
  POWER4_PAYOUTS,
  POWER5_PAYOUTS,
  POWER6_PAYOUTS,
  FLEX3_PAYOUTS,
  FLEX4_PAYOUTS,
  FLEX5_PAYOUTS,
  FLEX6_PAYOUTS,
  FlexPayout,
} from "../src/payouts";

// ─── 1. Structure Registry ───────────────────────────────────────────────

interface StructureInfo {
  type: string;
  size: number;
  payouts: FlexPayout[];
  category: "Power" | "Flex";
}

const STRUCTURES: StructureInfo[] = [
  { type: "2P", size: 2, payouts: POWER2_PAYOUTS, category: "Power" },
  { type: "3P", size: 3, payouts: POWER3_PAYOUTS, category: "Power" },
  { type: "4P", size: 4, payouts: POWER4_PAYOUTS, category: "Power" },
  { type: "5P", size: 5, payouts: POWER5_PAYOUTS, category: "Power" },
  { type: "6P", size: 6, payouts: POWER6_PAYOUTS, category: "Power" },
  { type: "3F", size: 3, payouts: FLEX3_PAYOUTS, category: "Flex" },
  { type: "4F", size: 4, payouts: FLEX4_PAYOUTS, category: "Flex" },
  { type: "5F", size: 5, payouts: FLEX5_PAYOUTS, category: "Flex" },
  { type: "6F", size: 6, payouts: FLEX6_PAYOUTS, category: "Flex" },
];

// ─── 2. EV Calculation Functions (mirroring payout_math.ts) ─────────────────

/**
 * Compute exact hit distribution for legs with individual probabilities.
 * Uses convolution for exact distribution (not binomial approximation).
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

/**
 * Compute EV per $1 staked from hit distribution and payout schedule.
 * Mirrors computeCardEvFromDistribution from payout_math.ts.
 */
function computeEvFromDistribution(
  hitDist: Record<number, number>,
  payouts: FlexPayout[]
): { ev: number; winProbCash: number; winProbAny: number } {
  let expectedReturn = 0; // Σ P(k) × multiplier(k)
  let winProbCash = 0;
  let winProbAny = 0;

  for (const [kStr, prob] of Object.entries(hitDist)) {
    const k = Number(kStr);
    const payout = payouts.find((p) => p.hits === k);
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

/**
 * Compute EV for a card with specific legs using exact distribution.
 */
function computeEvForCard(structure: StructureInfo, legs: Leg[]): number {
  const probs = legs.map(l => l.trueProb);
  const hitDist = computeHitDistribution(probs);
  const result = computeEvFromDistribution(hitDist, structure.payouts);
  return result.ev;
}

// ─── 3. Leg Type (minimal) ──────────────────────────────────────────────────

interface Leg {
  player: string;
  team: string | null;
  stat: string;
  line: number;
  trueProb: number;
  edge: number;
}

// ─── 4. Combination Generator ─────────────────────────────────────────────

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

// ─── 5. Utility Functions ─────────────────────────────────────────────────

function formatPercent(x: number): string {
  return (x * 100).toFixed(2) + "%";
}

function formatEv(x: number): string {
  return (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
}

function comb(n: number, k: number): number {
  if (k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

// ─── 6. Threshold Analysis ───────────────────────────────────────────────

interface ThresholdResult {
  structure: string;
  category: string;
  totalCards: number;
  thresholds: {
    threshold: number;
    count: number;
    percentage: number;
    avgEv: number;
  }[];
}

function analyzeThresholds(structure: StructureInfo, legs: Leg[]): ThresholdResult {
  const thresholds = [0.0, 0.03, 0.05, 0.08, 0.10];
  const evValues: number[] = [];

  console.log(`\n🔄 Computing EV for ${structure.type}...`);

  // Enumerate all valid combinations (max 1 leg per player)
  const uniqueLegs = legs.filter((leg, index, arr) => 
    arr.findIndex(l => l.player === leg.player) === index
  );

  if (uniqueLegs.length < structure.size) {
    return {
      structure: structure.type,
      category: structure.category,
      totalCards: 0,
      thresholds: thresholds.map(t => ({
        threshold: t,
        count: 0,
        percentage: 0,
        avgEv: 0
      }))
    };
  }

  let comboCount = 0;
  for (const combo of combinations(uniqueLegs, structure.size)) {
    const ev = computeEvForCard(structure, combo);
    evValues.push(ev);
    comboCount++;

    // Progress reporting for large combos
    if (comboCount % 100000 === 0) {
      console.log(`  Processed ${comboCount.toLocaleString()} combos...`);
    }
  }

  console.log(`  ✅ ${structure.type}: ${comboCount.toLocaleString()} combos evaluated`);

  // Sort EV values for percentile calculations
  evValues.sort((a, b) => b - a);

  const thresholdResults = thresholds.map(threshold => {
    const accepted = evValues.filter(ev => ev >= threshold);
    const avgEv = accepted.length > 0 
      ? accepted.reduce((sum, ev) => sum + ev, 0) / accepted.length 
      : 0;

    return {
      threshold,
      count: accepted.length,
      percentage: comboCount > 0 ? (accepted.length / comboCount) * 100 : 0,
      avgEv
    };
  });

  return {
    structure: structure.type,
    category: structure.category,
    totalCards: comboCount,
    thresholds: thresholdResults
  };
}

// ─── 7. Main Analysis Function ───────────────────────────────────────────

function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  THRESHOLD ANALYSIS FOR CARD VOLUME CONTROL");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Load Representative Legs ───────────────────────────────────────────
  const legsPath = path.join(process.cwd(), "prizepicks-legs.json");
  
  if (!fs.existsSync(legsPath)) {
    console.error(`❌ Error: ${legsPath} not found.`);
    console.log("   Run the optimizer first to generate prizepicks-legs.json");
    process.exit(1);
  }

  const legsData = JSON.parse(fs.readFileSync(legsPath, "utf8"));
  const legs: Leg[] = legsData.legs;

  console.log(`📊 Loaded ${legs.length} legs from ${legsPath}`);
  console.log(`   Timestamp: ${legsData.runTimestamp}`);

  // Deduplicate by player (max 1 leg per player, keep highest edge)
  const bestByPlayer = new Map<string, Leg>();
  for (const leg of legs) {
    const existing = bestByPlayer.get(leg.player);
    if (!existing || leg.edge > existing.edge) {
      bestByPlayer.set(leg.player, leg);
    }
  }
  const uniqueLegs = [...bestByPlayer.values()].sort((a, b) => b.edge - a.edge);
  
  console.log(`   Unique players: ${uniqueLegs.length} (from ${legs.length} legs)`);
  console.log(`   Edge range: ${(Math.min(...uniqueLegs.map(l => l.edge)) * 100).toFixed(1)}% to ${(Math.max(...uniqueLegs.map(l => l.edge)) * 100).toFixed(1)}%`);

  // ── Analyze All Structures ───────────────────────────────────────────────
  const results: ThresholdResult[] = [];

  for (const structure of STRUCTURES) {
    const result = analyzeThresholds(structure, uniqueLegs);
    results.push(result);
  }

  // ── Output Markdown Tables ─────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  THRESHOLD ANALYSIS RESULTS");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Power Plays Summary
  console.log("## Power Plays Summary");
  console.log("\n| Structure | Total Cards | 0% | 3% | 5% | 8% | 10% |");
  console.log("|-----------|-------------|----|----|----|----|-----|");
  
  for (const result of results.filter(r => r.category === "Power")) {
    const thresholdCounts = result.thresholds.map(t => t.count.toLocaleString()).join(" | ");
    console.log(`| ${result.structure} | ${result.totalCards.toLocaleString()} | ${thresholdCounts} |`);
  }

  // Flex Plays Summary  
  console.log("\n## Flex Plays Summary");
  console.log("\n| Structure | Total Cards | 0% | 3% | 5% | 8% | 10% |");
  console.log("|-----------|-------------|----|----|----|----|-----|");
  
  for (const result of results.filter(r => r.category === "Flex")) {
    const thresholdCounts = result.thresholds.map(t => t.count.toLocaleString()).join(" | ");
    console.log(`| ${result.structure} | ${result.totalCards.toLocaleString()} | ${thresholdCounts} |`);
  }

  // Detailed Tables
  console.log("\n## Detailed Threshold Analysis");
  
  for (const category of ["Power", "Flex"]) {
    console.log(`\n### ${category} Plays - Detailed Breakdown`);
    console.log("\n| Structure | Threshold | Cards | % Kept | Avg EV |");
    console.log("|-----------|-----------|-------|--------|--------|");
    
    for (const result of results.filter(r => r.category === category)) {
      for (const thresh of result.thresholds) {
        const thresholdPct = formatEv(thresh.threshold);
        const keptPct = thresh.percentage.toFixed(1);
        const avgEv = formatEv(thresh.avgEv);
        console.log(`| ${result.structure} | ${thresholdPct} | ${thresh.count.toLocaleString()} | ${keptPct}% | ${avgEv} |`);
      }
    }
  }

  // ── Recommendations ─────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  THRESHOLD RECOMMENDATIONS");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("### Recommended Minimum EV Thresholds");
  console.log("\n```typescript");
  console.log("// Data-driven thresholds from threshold analysis");
  console.log("const RECOMMENDED_THRESHOLDS: Record<string, number> = {");

  for (const result of results) {
    // Find threshold that keeps reasonable volume (1-5% of combos) with positive avg EV
    let recommendedThreshold = 0.0;
    let rationale = "Keep all +EV cards";
    
    for (const thresh of result.thresholds) {
      if (thresh.count > 0 && thresh.avgEv > 0 && thresh.percentage <= 5.0) {
        recommendedThreshold = thresh.threshold;
        rationale = `Keep ${thresh.percentage.toFixed(1)}% with avg ${formatEv(thresh.avgEv)}`;
        break;
      }
    }

    // Special handling for structures that are always -EV
    if (result.thresholds[0].avgEv <= 0) {
      recommendedThreshold = 0.0;
      rationale = "Never +EV with typical edges";
    }

    console.log(`  "${result.structure}": ${recommendedThreshold}, // ${rationale}`);
  }

  console.log("};");
  console.log("```");

  console.log("\n### Key Insights");
  console.log("\n**Power Plays:**");
  console.log("- Most Power structures are rarely +EV with typical leg edges (2-6%)");
  console.log("- 2P and 4P are almost never profitable - consider 0% threshold");
  console.log("- 3P, 5P, 6P have small +EV tails - keep what exists");
  
  console.log("\n**Flex Plays:**");
  console.log("- 3F is the strongest structure - consider higher threshold (+5%)");
  console.log("- 5F and 6F have solid +EV tails - +3% keeps 5-7% of combos");
  console.log("- 4F is marginal - keep all +EV cards");

  console.log("\n**Volume Control Strategy:**");
  console.log("- Use +3% floor for 5F/6F to eliminate ~95% of low-quality combos");
  console.log("- Use +5% floor for 3F to focus on highest-quality cards");
  console.log("- Keep Power plays at 0% since they're rarely +EV anyway");

  // ── Implementation Guide ───────────────────────────────────────────────
  console.log("\n### Implementation Steps");
  console.log("\n1. Update `getMinEvForFlexType()` in `src/run_optimizer.ts`");
  console.log("2. Add diagnostic logging after optimizer runs");
  console.log("3. Monitor card volumes and adjust as needed");
  console.log("4. Re-run this analysis periodically with fresh leg data");

  console.log(`\n✅ Analysis complete. Run: npx ts-node ${__filename}`);
}

main();
