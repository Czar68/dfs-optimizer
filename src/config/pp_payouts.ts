// src/config/pp_payouts.ts
// ⛔ GOSPEL — DO NOT MODIFY WITHOUT USER AUTHORIZATION
// ✅ Verified: PrizePicks Help Center Feb 22, 2026

export const PP_PAYOUTS = {

  // POWER PLAY — ALL picks must be correct
  power: {
    2: { payout: 3.0,  breakeven: 0.5774, impliedOdds: -137 },
    3: { payout: 6.0,  breakeven: 0.5503, impliedOdds: -122 },
    4: { payout: 10.0, breakeven: 0.5623, impliedOdds: -129 },
    5: { payout: 20.0, breakeven: 0.5744, impliedOdds: -135 },
    6: { payout: 37.5, breakeven: 0.5743, impliedOdds: -135 },
  },

  // FLEX PLAY — can miss picks per tier
  flex: {
    3: {
      tiers:       { 3: 3.0, 2: 1.0, 1: 0, 0: 0 },
      breakeven:   0.5980,
      impliedOdds: -149,
      minCash:     2,
    },
    4: {
      tiers:       { 4: 6.0, 3: 1.5, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5690,
      impliedOdds: -132,
      minCash:     3,
    },
    5: {
      tiers:       { 5: 10.0, 4: 2.0, 3: 0.4, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5425,
      impliedOdds: -119,
      minCash:     3,
    },
    6: {
      // ⚠️ NO 3/6 PAYOUT — minimum cash is 4 of 6 correct
      tiers:       { 6: 25.0, 5: 2.0, 4: 0.4, 3: 0, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5421,
      impliedOdds: -119,
      minCash:     4,
    },
  },

} as const;
