# Tier diagnostic report (diagnostic only, no changes)

## 1. Tier classification logic (from code)

- **Location**: `src/build_innovative_cards.ts`
- **Function**: `classifyTier(cardEV, kellyFrac, fragile)`
- **Tier1**: cardEV ≥ 8%, kellyFrac ≥ 1.5%, **and non-fragile**. Fragile cards cap at Tier2.
- **Tier2**: cardEV ≥ 4%, kellyFrac ≥ 0.5%.
- **Tier3**: else.
- **Thresholds**: Hardcoded constants `TIER1_MIN_EV = 0.08`, `TIER1_MIN_KELLY = 0.015`, `TIER2_MIN_EV = 0.04`, `TIER2_MIN_KELLY = 0.005`. Not configurable via CLI.

## 2. Underdog cards (from underdog-cards.csv)

- **Row count (data)**: 400
- **cardEv units**: percent (e.g. 8.46 = 8.46%)

### 2a. Distribution of AvgEdge% (avgEdgePct)
| min | max | p25 | p50 | p75 | p90 |
|-----|-----|-----|-----|-----|-----|
| 16.79 | 27.83 | 18.69 | 20.27 | 22.01 | 23.78 |

### 2b. Distribution of cardEV (same units as tier threshold)
| min | max | p25 | p50 | p75 | p90 |
|-----|-----|-----|-----|-----|-----|
| 4.06 | 8.46 | 4.45 | 4.97 | 5.65 | 6.47 |

### 2c. Cards within 1%, 2%, 3% of Tier1 EV threshold (8%)
| Band | Count |
|------|-------|
| ≥ threshold (≥ 8%) | 6 |
| within 1% below (7% ≤ EV < 8%) | 16 |
| within 2% below | 56 |
| within 3% below | 187 |

### 3. If Tier1 EV threshold were lowered by 1%
- New threshold: 7%. Cards with cardEV ≥ 7%: **22**.
- With same Kelly gate (kellyFrac ≥ 1.5%): **22** (UD CSV has no fragile flag; true tier1 count would be ≤ this).

## 2d. PrizePicks cards (from prizepicks-cards.csv)
- No data rows (header only); PP card distribution N/A for this run.

## 4. Kelly stake for Tier2 (from code)

- **Single formula for all tiers**: `kellyStake = min(maxBetPerCard, bankroll × kellyFrac × kellyMultiplier)`.
- **kellyMultiplier** is one global (default **0.5** = half-Kelly), passed into `buildInnovativeCards(opts)`. Not tier-dependent.
- So **Tier2 cards use the same 0.5-Kelly as Tier1**; there is no separate full-Kelly for T1 and half-Kelly for T2.
- **Location**: `src/build_innovative_cards.ts` ~L469–471, and `opts.kellyMultiplier` default 0.5 at ~L388.

## 5. Findings (no changes made)

- Tier thresholds are **hardcoded** in `build_innovative_cards.ts`; consider making them configurable if you want to tune without code edits.
- If the **last live run** had 0 tier1 and 6 tier2, that is from the **PP** pipeline (tier1.csv / tier2.csv from `writeTieredCsvs`). UD cards are not classified into tier1/tier2 by the same logic (UD export has no tier column).
- The **sensitivity** (how many cards would qualify if tier1 EV were lowered by 1%) is reported above from the current underdog-cards.csv.
- **Miscalibration flag**: In this UD run, only 6 cards have cardEV ≥ 8%; 16 are in the 7–8% band. Lowering the tier1 EV threshold by 1% would yield 22 cards qualifying by EV+Kelly. The tier1 threshold is a **binding constraint**; a 1% relaxation would roughly quadruple tier1 count. The bulk of cards are below 8% (median ~5%), so the slate has few tier1-quality cards by current rules.
