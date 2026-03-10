// src/payout_math.ts
// computeCardEvFromDistribution delegated to math_models (locked-down canonical source)

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

export { computeCardEvFromDistribution } from "../math_models/card_ev_distribution";

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
