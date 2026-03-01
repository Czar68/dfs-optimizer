// src/payouts.ts
// PrizePicks NBA slip payouts (Power = all-or-nothing, Flex = tiered)
// NOTE: SSOT is src/config/prizepicks_payouts.ts — values here MUST match.
// Only consumer: payout_math.ts.  Will be consolidated in a future step.

export interface FlexPayout {
  hits: number;
  multiplier: number;
}

// Power: all legs must hit for payout
// Updated to match official PrizePicks payout structure
export const POWER2_PAYOUTS: FlexPayout[] = [{ hits: 2, multiplier: 3 }];   // 3× entry fee
export const POWER3_PAYOUTS: FlexPayout[] = [{ hits: 3, multiplier: 6 }];   // 6× entry fee
export const POWER4_PAYOUTS: FlexPayout[] = [{ hits: 4, multiplier: 10 }];  // 10× entry fee
export const POWER5_PAYOUTS: FlexPayout[] = [{ hits: 5, multiplier: 20 }];  // 20× entry fee
export const POWER6_PAYOUTS: FlexPayout[] = [{ hits: 6, multiplier: 37.5 }]; // 37.5× entry fee

// Flex: tiered payouts (All, k-1, k-2)
// Updated to match official PrizePicks payout structure
// 3F: 3×/1× (3 of 3 pays 3×, 2 of 3 pays 1×)
export const FLEX3_PAYOUTS: FlexPayout[] = [
  { hits: 3, multiplier: 3 },    // 3× entry fee
  { hits: 2, multiplier: 1 },     // 1× entry fee (break even)
];
// 4F: 6×/1.5× (4 of 4 pays 6×, 3 of 4 pays 1.5×)
export const FLEX4_PAYOUTS: FlexPayout[] = [
  { hits: 4, multiplier: 6 },     // 6× entry fee
  { hits: 3, multiplier: 1.5 },   // 1.5× entry fee
];
// 5F: 10×/2×/0.4× (5 of 5 pays 10×, 4 of 5 pays 2×, 3 of 5 pays 0.4×)
export const FLEX5_PAYOUTS: FlexPayout[] = [
  { hits: 5, multiplier: 10 },    // 10× entry fee
  { hits: 4, multiplier: 2 },     // 2× entry fee
  { hits: 3, multiplier: 0.4 },    // 0.4× entry fee
];
// 6F: 25×/2×/0.4× (6 of 6 pays 25×, 5 of 6 pays 2×, 4 of 6 pays 0.4×)
export const FLEX6_PAYOUTS: FlexPayout[] = [
  { hits: 6, multiplier: 25 },    // 25× entry fee
  { hits: 5, multiplier: 2 },     // 2× entry fee
  { hits: 4, multiplier: 0.4 },    // 0.4× entry fee
];
