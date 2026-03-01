// src/payout_math.ts

import { CardHitDistribution } from "./types";
import type { FlexType } from "./types";
import {
  FlexPayout,
  FLEX3_PAYOUTS,
  FLEX4_PAYOUTS,
  FLEX5_PAYOUTS,
  FLEX6_PAYOUTS,
  POWER2_PAYOUTS,
  POWER3_PAYOUTS,
  POWER4_PAYOUTS,
  POWER5_PAYOUTS,
  POWER6_PAYOUTS,
} from "./payouts";

const POWER_SCHEDULES: Record<string, FlexPayout[]> = {
  "2P": POWER2_PAYOUTS,
  "3P": POWER3_PAYOUTS,
  "4P": POWER4_PAYOUTS,
  "5P": POWER5_PAYOUTS,
  "6P": POWER6_PAYOUTS,
};
const FLEX_SCHEDULES: Record<string, FlexPayout[]> = {
  "3F": FLEX3_PAYOUTS,
  "4F": FLEX4_PAYOUTS,
  "5F": FLEX5_PAYOUTS,
  "6F": FLEX6_PAYOUTS,
};

export function getPayoutSchedule(
  legCount: number,
  flexType: FlexType
): FlexPayout[] {
  const fromPower = POWER_SCHEDULES[flexType];
  if (fromPower) return fromPower;
  const fromFlex = FLEX_SCHEDULES[flexType];
  if (fromFlex) return fromFlex;
  return [];
}

/**
 * Compute card expected value from hit distribution and payout schedule
 * 
 * This function implements the core EV calculation for PrizePicks slips:
 * 
 * For each possible outcome (0 to n hits):
 *   profit = (payout_multiplier * stake) - stake  [if payout exists]
 *   profit = -stake                              [if no payout]
 *   contribution_to_EV = profit * probability
 * 
 * Final EV = sum(contributions) / stake
 * 
 * Key outputs:
 * - cardEv: Expected profit per 1 unit staked (e.g., 0.05 = +5% edge)
 *           This is what becomes "CardEV%" in Sheets as: cardEv * 100
 * - winProbCash: Probability of the top/cash outcome (profit > 0)
 * - winProbAny: Probability of any positive return (including partial payouts)
 * 
 * @param stake - Amount staked (typically 1 for per-unit calculations)
 * @param distribution - Hit count → probability mapping
 * @param payoutSchedule - PrizePicks payout structure for this slip type
 * @returns EV metrics for the card
 */
export function computeCardEvFromDistribution(
  stake: number,
  distribution: CardHitDistribution,
  payoutSchedule: FlexPayout[]
): {
  cardEv: number;
  winProbCash: number;
  winProbAny: number;
} {
  let ev = 0;
  let winProbCash = 0;
  let winProbAny = 0;

  // Iterate through all possible hit outcomes
  for (const [hitsStr, prob] of Object.entries(distribution)) {
    const hits = Number(hitsStr);
    const probNum = Number(prob);
    if (!Number.isFinite(hits) || !Number.isFinite(probNum) || probNum <= 0) {
      continue;
    }

    // Find payout for this hit count (if any)
    const payout = payoutSchedule.find((p) => p.hits === hits);
    
    let profit: number;
    if (payout) {
      // Payout exists: calculate profit as (return amount - stake)
      const returnAmount = payout.multiplier * stake;
      profit = returnAmount - stake;
    } else {
      // No payout: lose the entire stake
      profit = -stake;
    }

    // Add this outcome's contribution to overall EV
    ev += profit * probNum;

    // Track probability metrics
    if (profit > 0) {
      winProbCash += probNum; // Probability of cash/top outcome
    }
    if (payout && payout.multiplier * stake > 0) {
      winProbAny += probNum; // Probability of any positive return
    }
  }

  // Return per-unit EV and probability metrics
  return {
    cardEv: ev / stake, // Expected profit per 1 unit staked
    winProbCash,
    winProbAny,
  };
}
