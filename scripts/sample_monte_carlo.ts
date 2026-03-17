/**
 * One-off script: sample Monte Carlo for PP Goblin, UD Flex, and standard structures.
 * Run: npx ts-node scripts/sample_monte_carlo.ts
 */
import { getPayoutByHits, fillZeroPayouts } from "../src/config/parlay_structures";
import { runMonteCarloParlay } from "../math_models/monte_carlo_parlays";

const SAMPLES: { structureId: string; numLegs: number; label: string }[] = [
  { structureId: "6F_GOBLIN", numLegs: 6, label: "PP Goblin 6F" },
  { structureId: "UD_7F_FLX", numLegs: 7, label: "UD Flex 7-pick" },
  { structureId: "3P", numLegs: 3, label: "PP Standard 3P" },
  { structureId: "2P", numLegs: 2, label: "PP Standard 2P" },
  { structureId: "UD_3F_FLX", numLegs: 3, label: "UD Flex 3-pick" },
];

const LEG_TRUE_PROB = 0.55; // same for all legs
const STAKE = 1;
const SIMS = 10_000; // smaller for quick run

console.log("Monte Carlo sample (leg trueProb = 55%, sims = " + SIMS + ")\n");

for (const { structureId, numLegs, label } of SAMPLES) {
  const payoutByHits = getPayoutByHits(structureId);
  if (!payoutByHits) {
    console.log(`[SKIP] ${label} (${structureId}): No payout mapping`);
    continue;
  }
  const normalizedPayouts = fillZeroPayouts(payoutByHits, numLegs);
  const legs = Array.from({ length: numLegs }, () => ({ trueProb: LEG_TRUE_PROB }));
  const result = runMonteCarloParlay(legs, normalizedPayouts, STAKE, SIMS);
  console.log(`${label} (${structureId}):`);
  console.log(`  EV: ${(result.monteCarloEV * 100).toFixed(2)}%  WinProb: ${(result.monteCarloWinProb * 100).toFixed(2)}%  PayoutVariance: ${result.payoutVariance.toFixed(4)}`);
  console.log("");
}

console.log("Done.");
