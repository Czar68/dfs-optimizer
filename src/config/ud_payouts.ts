// src/config/ud_payouts.ts
// ⛔ GOSPEL — DO NOT MODIFY WITHOUT USER AUTHORIZATION
// ✅ Verified: Underdog Fantasy Help Center Dec 31, 2025
// ✅ Feb 2026 PERMANENT BOOST: 2P 3x→3.5x, 3P 6x→6.5x

export const UD_PAYOUTS = {

  // STANDARD — ALL picks must be correct
  standard: {
    2: { payout: 3.5,   breakeven: 0.5345, impliedOdds: -115 },
    3: { payout: 6.5,   breakeven: 0.4983, impliedOdds: -99  },
    4: { payout: 10.0,  breakeven: 0.5623, impliedOdds: -129 },
    5: { payout: 20.0,  breakeven: 0.5744, impliedOdds: -135 },
    6: { payout: 35.0,  breakeven: 0.5765, impliedOdds: -136 },
    7: { payout: 65.0,  breakeven: 0.5764, impliedOdds: -136 },
    8: { payout: 120.0, breakeven: 0.5765, impliedOdds: -136 },
  },

  // FLEX — can miss 1 (3–5 picks) or 2 (6–8 picks)
  flex: {
    3: {
      tiers:       { 3: 3.25, 2: 1.09, 1: 0, 0: 0 },
      breakeven:   0.5700,
      impliedOdds: -133,
      minCash:     2,
    },
    4: {
      tiers:       { 4: 6.0, 3: 1.5, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5567,
      impliedOdds: -126,
      minCash:     3,
    },
    5: {
      // ⚠️ No 3/5 payout — minimum cash is 4 of 5
      tiers:       { 5: 10.0, 4: 2.5, 3: 0, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5426,
      impliedOdds: -119,
      minCash:     4,
    },
    6: {
      // ⚠️ Allows 2 losses — minimum cash is 4 of 6 (NO 4/6 consolation payout)
      tiers:       { 6: 25.0, 5: 2.6, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5345,
      impliedOdds: -115,
      minCash:     4,
    },
    7: {
      // ⚠️ Allows 2 losses — minimum cash is 5 of 7 (NO 5/7 consolation payout)
      tiers:       { 7: 40.0, 6: 2.75, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5421,
      impliedOdds: -119,
      minCash:     5,
    },
    8: {
      // ⚠️ Allows 2 losses — minimum cash is 6 of 8 (NO 6/8 consolation payout)
      tiers:       { 8: 80.0, 7: 3.0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 },
      breakeven:   0.5503,
      impliedOdds: -122,
      minCash:     6,
    },
  },

  // Leg validity rule — exclude decimal odds below 1.0
  MIN_DECIMAL_ODDS: 1.0,

} as const;
