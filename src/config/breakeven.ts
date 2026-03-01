// src/config/breakeven.ts
// ⛔ GOSPEL REFERENCE — DO NOT MODIFY WITHOUT USER AUTHORIZATION
// Complete PP vs UD payout + breakeven comparison
// Last verified: PP Feb 22, 2026 | UD Dec 31, 2025 + Feb 2026 boost

import { PP_PAYOUTS } from "./pp_payouts";
import { UD_PAYOUTS } from "./ud_payouts";

/*
=============================================================
PP POWER vs UD STANDARD
=============================================================
Picks | PP Power | PP BE%  | UD Standard | UD BE%  | Winner
------|----------|---------|-------------|---------|-------
2     | 3.0x     | 57.74%  | 3.5x        | 53.45%  | UD ✅
3     | 6.0x     | 55.03%  | 6.5x        | 49.83%  | UD ✅
4     | 10x      | 56.23%  | 10x         | 56.23%  | EQUAL
5     | 20x      | 57.44%  | 20x         | 57.44%  | EQUAL
6     | 37.5x    | 57.43%  | 35x         | 57.65%  | PP ✅
7     | N/A      | N/A     | 65x         | 57.64%  | UD ONLY
8     | N/A      | N/A     | 120x        | 57.65%  | UD ONLY

=============================================================
PP FLEX vs UD FLEX
=============================================================
Str | PP Tiers                | PP BE%  | PP Odds | UD Tiers                | UD BE%  | UD Odds | Winner
----|-------------------------|---------|---------|-------------------------|---------|---------|-------
3F  | 3/3=3x, 2/3=1x         | 59.80%  | -149    | 3/3=3.25x, 2/3=1.09x   | 57.00%  | -133    | UD ✅
4F  | 4/4=6x, 3/4=1.5x       | 56.90%  | -132    | 4/4=6x, 3/4=1.5x       | 55.67%  | -126    | UD ✅ (slight)
5F  | 5/5=10x,4/5=2x,3/5=0.4x| 54.25%  | -119    | 5/5=10x, 4/5=2.5x      | 54.26%  | -119    | UD ✅ (better miss)
6F  | 6/6=25x,5/6=2x,4/6=0.4x| 54.21%  | -119    | 6/6=25x,5/6=2.6x       | 53.45%  | -115    | UD ✅

=============================================================
STRUCTURAL DIFFERENCES
=============================================================
Rule                    | PrizePicks          | Underdog
------------------------|---------------------|---------------------------
3F miss payout          | 2/3 = 1.0x          | 2/3 = 1.09x ✅
4F miss payout          | 3/4 = 1.5x          | 3/4 = 1.5x (equal)
5F miss payout          | 3/5 = 0.4x          | NO 3/5 payout ⚠️
5F one-miss payout      | 4/5 = 2.0x          | 4/5 = 2.5x ✅
6F one-miss payout      | 5/6 = 2.0x          | 5/6 = 2.6x ✅
6F two-miss payout      | 4/6 = 0.4x          | NO 4/6 payout ⚠️
6F minimum cash         | 4 of 6              | 4 of 6 (2 losses allowed)
Max picks               | 6                   | 8 ✅
7/8-pick available      | ❌                  | ✅ (65x / 120x)
Decimal odds minimum    | N/A                 | > 1.0 (< 1.0 excluded)

=============================================================
STRATEGIC RULES (HARDCODED INTO OPTIMIZER LOGIC)
=============================================================
1. 2-3 leg parlays: PREFER UD (3.5x/6.5x > PP 3x/6x)
2. 6-leg power:     PREFER PP (37.5x > UD 35x)
3. 5F/6F flex:      PREFER UD (better miss payouts: 2.5x/2.6x vs 2.0x)
4. 4+ legs power:   EQUAL — optimize by leg EV only
5. UD 7/8-pick:     HIGH VARIANCE — only use legs with trueProb >= 0.70
6. UD 5F:           No 3/5 consolation — higher variance than PP 5F
7. PP 6F:           No 3/6 consolation — minimum cash = 4 of 6
8. UD decimal < 1.0: ALWAYS EXCLUDE — invalid implied probability

*/

export const BREAKEVEN_TABLE = {
  pp: { ...PP_PAYOUTS },
  ud: { ...UD_PAYOUTS },
} as const;
