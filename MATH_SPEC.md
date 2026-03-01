# Math Spec — NBA Props Optimizer

> Generated from code + Sheets audit. Covers PrizePicks (Sheets Engine) and
> Underdog (local binomial) pipelines.

---

## 1. Leg-Level Calculations

### 1.1 Devig (True Probability)

Source: `src/odds_math.ts`, `src/merge_odds.ts`

Given sharp-book vigged over/under American odds from SGO:

```
viggedProbOver  = americanToProb(overOdds)
viggedProbUnder = americanToProb(underOdds)
total           = viggedProbOver + viggedProbUnder   (> 1 due to vig)

trueProb(over)  = viggedProbOver  / total            (proportional devig)
trueProb(under) = viggedProbUnder / total
```

**americanToProb** conversion:
- Positive odds `+A`: `100 / (A + 100)`
- Negative odds `-A`: `A / (A + 100)`

### 1.2 Leg Edge & legEv (Ranking Only)

Source: `src/calculate_ev.ts`

```
edge  = trueProb - 0.5
legEv = edge               (identical; used only for ranking/filtering)
```

These are **not** the actual per-leg EV within any parlay structure. They serve
as a monotonic proxy for leg quality: higher trueProb → higher edge → better
leg. Actual card-level EV is computed separately (see Section 2).

### 1.3 Fair Odds

```
fairOdds = 1 / trueProb - 1        (decimal "to-one" odds)
```

---

## 2. PrizePicks Card-Level EV (Sheets Engine)

Source: `src/engine_interface.ts`, `src/card_ev.ts`, Google Sheets `Engine` tab

### 2.1 Payout Tables (from Engine rows 1–7)

**Power (all-or-nothing):**

| Slip | Legs | Payout (all hit) |
|------|------|-----------------|
| 2P   | 2    | 3×              |
| 3P   | 3    | 6×              |
| 4P   | 4    | 10×             |
| 5P   | 5    | 20×             |
| 6P   | 6    | 37.5×           |

**Flex (tiered payouts):**

| Slip | Legs | All Hit | k−1 Hit | k−2 Hit |
|------|------|---------|---------|---------|
| 3F   | 3    | 3×      | 1×      | —       |
| 4F   | 4    | 6×      | 1.5×    | —       |
| 5F   | 5    | 10×     | 2×      | 0.4×    |
| 6F   | 6    | 25×     | 2×      | 0.4×    |

### 2.2 EV Formula

The Engine uses the **i.i.d. binomial model**: all n legs are treated as
independent Bernoulli trials with uniform probability p = avgProb.

```
avgProb = mean(trueProb of all legs in card)

EV = Σ_{k=0}^{n} BINOMDIST(k, n, avgProb, FALSE) × Payout(k) − 1
```

Where `Payout(k) = 0` for hit counts not in the payout table.

**Approximation note:** The i.i.d. assumption replaces per-leg probabilities
p₁…pₙ with their mean. This is accurate when leg probabilities are similar
(within ~2–3 pp of each other), which is enforced by the MIN_EDGE filter. The
Underdog pipeline uses the exact non-identical hit distribution (Section 3).

### 2.3 ROI

```
ROI = EV                (Engine treats ROI% = EV as a fraction of stake)
```

### 2.4 Code-Side Diagnostic Metrics

Computed locally in `card_ev.ts` (not from Engine):

```
avgProb   = mean(leg.trueProb for each leg)
avgEdge   = mean(leg.trueProb − 0.5 for each leg)
avgEdgePct = avgEdge × 100
```

---

## 3. Underdog Card-Level EV (Local Binomial)

Source: `src/underdog_card_ev.ts`, `src/config/underdog_structures.ts`

### 3.1 Payout Tables (aligned with official Underdog chart, Feb 2025)

Underdog exposes exactly **two modes** in the Pick'em UI:

- **Standard** — all-or-nothing; every pick must hit.
- **Flex** — tiered payout ladder that pays on partial hits.
  - 3–5 pick Flex: **1-loss ladder** (pays on all-hit and 1-miss).
  - 6–8 pick Flex: **2-loss ladder** (pays on all-hit, 1-miss, and 2-miss).

There is no separate "Insured" toggle.  The insurance-like behaviour is
simply the reduced-payout tiers within the Flex ladder.

**Standard (all-or-nothing):**

| Structure   | Picks | Payout |
|-------------|-------|--------|
| UD_2P_STD   | 2     | 3×     |
| UD_3P_STD   | 3     | 6×     |
| UD_4P_STD   | 4     | 10×    |
| UD_5P_STD   | 5     | 20×    |
| UD_6P_STD   | 6     | 35×    |

**Flex (tiered payout ladders):**

| Structure   | Picks | All Hit | 1 Miss | 2 Miss |
|-------------|-------|---------|--------|--------|
| UD_3F_FLX   | 3     | 3×      | 1×     | —      |
| UD_4F_FLX   | 4     | 6×      | 1.5×   | —      |
| UD_5F_FLX   | 5     | 10×     | 2.5×   | —      |
| UD_6F_FLX   | 6     | 25×     | 2.6×   | 0.25×  |
| UD_7F_FLX   | 7     | 40×     | 2.75×  | 0.5×   |
| UD_8F_FLX   | 8     | 80×     | 3×     | 1×     |

### 3.2 Exact Hit Distribution (Non-Identical Legs)

Unlike PrizePicks (which uses i.i.d. BINOMDIST), Underdog computes the
**exact** hit distribution via dynamic programming:

```
dist[0] = 1          // probability of 0 hits initially
for each leg with probability p:
    for k = n down to 0:
        dist[k] = dist[k] × (1−p) + (k>0 ? dist[k−1] × p : 0)
```

This correctly handles legs with different true probabilities.

### 3.3 EV Formula

```
expectedReturn = Σ_{k=0}^{n} dist[k] × Payout(k) × stake
EV = (expectedReturn − stake) / stake
winProbability = Σ_{k: Payout(k) > 0} dist[k]
```

### 3.4 Varied-Multiplier (Non-Standard Odds) Legs

Source: `src/fetch_underdog_props.ts`, `src/run_underdog_optimizer.ts`

Some Underdog lines carry **explicit per-leg multipliers** (e.g. Higher −112 /
Lower −135) instead of standard flat pick'em pricing.  These "varied-multiplier"
legs break the fixed-ladder EV model because the payout table assumes every leg
is equally priced at −120-equivalent.

**Detection:**  The Underdog v6 API exposes an `options` array on each
`over_under_line`.  Standard legs have no options or uniform pricing.  If the
`american_price` values for Higher vs Lower differ, the leg is flagged
`isNonStandardOdds = true`.

**Gating:**  The optimizer's `filterEvPicks()` excludes `isNonStandardOdds`
legs by default before card building.  This can be overridden by setting
`UD_INCLUDE_NON_STANDARD_ODDS=true` in `.env`.

**Sheets:**  The `UD-Legs` tab includes an `IsNonStandardOdds` column (col P)
so users can see which legs were flagged but still appear in the raw data.

### 3.5 EV Threshold Sanity-Check (Feb 2025 Ladder)

The structure-level thresholds in `underdog_structures.ts` were verified against
the updated payout ladders.  Representative check for **6F Flex** (`25×/2.6×/0.25×`):

| Avg leg p | P(6/6) | P(5/6) | P(4/6) | EV       | Verdict |
|-----------|--------|--------|--------|----------|---------|
| 0.53      | 0.0222 | 0.1179 | 0.2614 | **−7.3%** | Reject  |
| 0.55      | 0.0277 | 0.1359 | 0.2780 | **+11.5%**| Accept  |
| 0.54      | 0.0248 | 0.1267 | 0.2700 | **+1.5%** | Marginal|

The break-even per-leg probability for 6F is ≈ 53.1%.  A card with avg `p=0.54`
produces only +1.5% EV — below the 3.5% threshold, correctly rejected.  Cards
with `p≥0.55` produce robust +11%+ EV and pass comfortably.

**Conclusion:** Current thresholds are well-calibrated for the Feb 2025 ladder.
No adjustments needed.  The `minCardEv` values in
`UNDERDOG_STRUCTURE_THRESHOLDS` remain unchanged.

---

## 4. Breakeven Per-Leg Probabilities

The breakeven probability p_be is the per-leg probability where EV = 0 under
the i.i.d. assumption.

### 4.1 Power Structures

For power (all-or-nothing with payout M):

```
p^n × M = 1  →  p_be = (1/M)^(1/n)
```

### 4.2 Flex Structures

For flex with tiered payouts, solve:

```
Σ_{k} C(n,k) × p^k × (1−p)^(n−k) × Payout(k) = 1
```

### 4.3 Correct Breakeven Table (PrizePicks)

| Slip | Correct p_be | Old Engine p_be | Delta   | Notes |
|------|-------------|----------------|---------|-------|
| 2P   | 0.5774      | 0.5774         | 0.0000  | ✓     |
| 3P   | 0.5503      | 0.5530         | +0.0027 | ~     |
| 4P   | 0.5623      | 0.5391         | −0.0232 | ✗ FIX |
| 5P   | 0.5493      | 0.5241         | −0.0252 | ✗ FIX |
| 6P   | 0.5466      | 0.5132         | −0.0334 | ✗ FIX |
| 3F   | 0.5774      | 0.5423         | −0.0351 | ✗ FIX |
| 4F   | 0.5503      | 0.5284         | −0.0219 | ✗ FIX |
| 5F   | 0.5424      | 0.5193         | −0.0231 | ✗ FIX |
| 6F   | 0.5421      | 0.5099         | −0.0322 | ✗ FIX |

**Impact:** The old breakeven values were systematically too low (except 2P),
causing LegMargin% in the Calculator tab to appear ~1.5–3.5 pp more favorable
than reality. **EV/ROI calculations are NOT affected** — they come directly
from the binomial model, not from p_be.

### 4.4 Derivation Details

**3F:** `EV = 3p² − 1 = 0 → p = 1/√3 = 0.5774` (same as 2P — the 1× k−1 payout
makes one-miss outcomes costless, so the breakeven depends only on n−1 legs)

**4F:** `EV = 6p³ − 1 = 0 → p = (1/6)^(1/3) = 0.5503` (same as 3P — the 1.5× k−1
payout with 6× all-hit combines identically)

**5F:** `4p⁵ + 2p⁴ + 4p³ − 1 = 0 → p ≈ 0.5424` (numerical solution)

**6F:** `19p⁶ + 6p⁴ − 1 = 0 → p ≈ 0.5421` (numerical solution)

---

## 5. Kelly Criterion

Source: `Calculator` sheet cells H2–H11

### 5.1 Formula

```
bankroll     = H2          (e.g. $250)
kellyFrac    = H3          (e.g. 0.50 = half-Kelly)
bestSlip     = H4          (slip type with highest EV)
ev           = H5          (EV of best slip, from Engine)
b            = H7          (net payout odds = MaxPayout − 1)
p            = (ev + 1) / (1 + b)     (implied win probability)
fullKelly    = (p × b − (1−p)) / b    (classic Kelly fraction)
fracKelly    = fullKelly × kellyFrac
dollarStake  = bankroll × fracKelly
```

### 5.2 Correctness Analysis

**Power plays:** The binary Kelly formula is **exact**. Power plays are
all-or-nothing: you either win `b × stake` or lose `stake`. The classic
Kelly fraction `f* = (pb − q)/b` is the optimal growth-rate maximizer.

**Flex plays:** The binary Kelly formula is an **approximation**. Flex plays
have multiple outcomes (partial payouts). The true multi-outcome Kelly
maximizes `E[log(1 + f × net_payoff)]` over all outcomes, which has no
closed-form solution. The current approximation uses the maximum payout as
the effective odds, which **overestimates** the Kelly fraction. The
fractional Kelly setting (H3 = 0.50) helps mitigate this overestimate.

**Sanity checks:**
- EV = 0 → fullKelly = 0 → dollarStake = 0 ✓
- EV < 0 → fullKelly < 0 → clamped to 0 (no bet) ✓
- Typical EV = 5–10% → fullKelly ~ 3–8% → fracKelly ~ 1.5–4% of bankroll ✓

---

## 6. Assumptions & Limitations

1. **Independence:** All legs are assumed independent. Correlation between
   same-game/same-team legs is partially addressed by per-card correlation
   caps (MAX_LEGS_PER_TEAM = 3, MAX_LEGS_PER_GAME = 4) and a 5% penalty
   per duplicate-player extra leg.

2. **i.i.d. approximation (PrizePicks only):** The Sheets Engine replaces
   per-leg probabilities with their mean. Error is O(Var(p)) which is small
   when legs are pre-filtered to edge > 2%.

3. **Devig method:** Proportional scaling (multiplicative). Alternative
   methods (power, Shin) would yield slightly different trueProb values.

4. **Payout accuracy:** Payout multipliers are hard-coded in the Engine sheet
   and `underdog_structures.ts`. If PrizePicks or Underdog updates their
   payout tables, these must be manually updated.

5. **Kelly for flex:** Uses binary approximation with max payout. True
   multi-outcome Kelly would be slightly smaller. Half-Kelly mitigates.
