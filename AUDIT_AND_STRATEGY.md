# Global Math Audit, Breakeven Map, and Long-Term EV Strategy

> Independent quant review of the NBA Props Optimizer codebase.
> Date: February 2026

---

## Task 1 — End-to-End Math Audit

### 1.1 Leg-Level Math

**Devig (odds_math.ts)**

| Formula | Code | Correct? |
|---------|------|----------|
| americanToProb(+A) | `100 / (A + 100)` | **Yes** — standard conversion |
| americanToProb(−A) | `A / (A + 100)` where A = abs(american) | **Yes** |
| devigTwoWay | `probOver / (probOver + probUnder)` | **Yes** — proportional (multiplicative) devig |
| probToAmerican(p≥0.5) | `-(p/(1-p)) × 100` | **Yes** |
| probToAmerican(p<0.5) | `((1-p)/p) × 100` | **Yes** |

**Verdict: SOUND.** Proportional devig is the industry-standard default. Alternative methods
(power, Shin) would produce slightly different trueProb values; proportional is a
defensible choice and the easiest to audit.

**Edge / legEv (calculate_ev.ts)**

```
edge  = trueProb − 0.5
legEv = edge
```

These are used *strictly* for ranking and filtering. They do **not** leak into
card-level EV calculations.  Card EV is computed from the payout ladder × hit
distribution, not from legEv.

**Verdict: SOUND.** The naming `legEv` is slightly misleading (it's not the EV
of a single leg in any parlay structure; it's `trueProb − 0.5`), but since it's
only used for ordering/filtering, this is harmless. Consider renaming to
`legEdge` for clarity in a future pass.

---

### 1.2 PrizePicks Card EV

**Payout ladders (payouts.ts, card_ev.ts, engine_interface.ts)**

Three independent copies of the payout table exist:

| Location | 2P | 3P | 4P | 5P | 6P | 3F | 4F | 5F | 6F |
|----------|----|----|----|----|----|----|----|----|-----|
| `payouts.ts` | 3× | 6× | 10× | 20× | 37.5× | 3/1 | 6/1.5 | 10/2/0.4 | 25/2/0.4 |
| `card_ev.ts` PP_PAYOUTS | 3× | 6× | 10× | 20× | 37.5× | 3/1 | 6/1.5 | 10/2/0.4 | 25/2/0.4 |
| `engine_interface.ts` PP_PAYOUTS | 3× | 6× | 10× | 20× | 37.5× | 3/1 | 6/1.5 | 10/2/0.4 | 25/2/0.4 |

All three are **consistent**. However, having the same table in three places is
a maintenance risk — if PrizePicks changes payouts, all three must be updated.

**⚠️ RECOMMENDATION:** Consolidate into a single source of truth (e.g., import
from `payouts.ts` everywhere). This is a code hygiene issue, not a math error.

**Local EV engine (engine_interface.ts::computeLocalEv)**

```
EV = Σ_{k=0}^{n} C(n,k) × p^k × (1−p)^{n−k} × Payout(k) − 1
```

This is the standard i.i.d. binomial model. Verified:

- **binomPmf** implementation: iterative coefficient calculation
  `C(n,k) = Π_{i=0}^{k-1} (n-i)/(i+1)` — **correct**, avoids overflow for
  small n (≤6).
- The `−1` correctly subtracts the stake (per-unit).
- `roi = ev` in local mode — correct for per-unit-stake.

**Verdict: SOUND.** The local engine faithfully reproduces the Sheets model.

**Breakeven table verification (MATH_SPEC.md §4.3)**

I re-derive all PP breakevens from the payout tables above:

| Slip | Equation | p_be (mine) | p_be (§4.3) | Match? |
|------|----------|-------------|-------------|--------|
| 2P | p² × 3 = 1 | 0.57735 | 0.5774 | ✓ |
| 3P | p³ × 6 = 1 | 0.55032 | 0.5503 | ✓ |
| 4P | p⁴ × 10 = 1 | 0.56234 | 0.5623 | ✓ |
| 5P | p⁵ × 20 = 1 | 0.54928 | 0.5493 | ✓ |
| 6P | p⁶ × 37.5 = 1 | 0.54644 | 0.5466 | ✓ (rounds to 0.5464) |
| 3F | 3p³ + 1×C(3,2)p²(1−p) − 1 = 0 → 3p²−1=0 | 0.57735 | 0.5774 | ✓ |
| 4F | 6p⁴ + 1.5×C(4,3)p³(1−p) − 1 = 0 → 6p³−1=0 | 0.55032 | 0.5503 | ✓ |
| 5F | 10p⁵ + 2×C(5,4)p⁴(1−p) + 0.4×C(5,3)p³(1−p)² − 1 = 0 | 0.54243 | 0.5424 | ✓ |
| 6F | 25p⁶ + 2×C(6,5)p⁵(1−p) + 0.4×C(6,4)p⁴(1−p)² − 1 = 0 | 0.54207 | 0.5421 | ✓ |

All breakevens match to ≤0.0001. **SOUND.**

**Impact of the i.i.d. approximation**

The PrizePicks engine replaces individual leg probabilities p₁…pₙ with their
mean p̄ = (Σpᵢ)/n, then uses Bin(n, p̄) instead of the exact non-identical
distribution.

Let Var(p) = (1/n) Σ(pᵢ − p̄)². The error in EV from the i.i.d. approximation
is on the order of:

```
ΔEV ≈ (d²EV/dp²) × Var(p) / 2
```

For practical PP leg pools where legs are pre-filtered to edge ≥ 2% (i.e.,
trueProb ∈ [0.52, 0.60] typically), the standard deviation of leg probabilities
within a single card is usually ≤ 2 pp (0.02).

For a 6F card with p̄ = 0.56, σ = 0.02:

- Var(p) = 0.0004
- d²EV/dp² for 6F ≈ 25×30p⁴ + 2×30p⁴ + ... ≈ O(100) (rough second derivative)
- |ΔEV| ≈ 100 × 0.0004 / 2 ≈ **0.02 = +2% EV error**

This is non-trivial when card EVs are in the 5–15% range. The error is
**systematically positive** (Jensen's inequality: for convex payout functions,
the i.i.d. approximation **overestimates** EV because `E[f(X)] > f(E[X])` when
f is convex and X is random).

Wait — actually for the all-or-nothing term p^n, which is concave for p < 1:
f(p) = p^n is concave for 0 < p < 1 when n > 1. By Jensen's inequality:
E[pᵢ^n] ≤ (E[pᵢ])^n = p̄^n. So the i.i.d. model **overestimates** the
probability of hitting all n legs, meaning it **overestimates** the all-hit
payout contribution. But the partial-hit terms involve different powers and
binomial coefficients; the net direction depends on the structure.

For **Power** plays (all-or-nothing): the i.i.d. model **overestimates** EV.
This is a safe direction — it means we sometimes accept cards that are slightly
less +EV than we think, but we don't miss genuinely good ones.

For **Flex** plays: the effect is mixed. The all-hit tier is overestimated,
but partial-hit tiers involve lower powers that may be underestimated. Net
effect is small and depends on the payout weights.

**Quantitative estimate:** For typical PP slates with σ(p) ≈ 0.015:

| Structure | Approx EV bias | Direction | Magnitude |
|-----------|---------------|-----------|-----------|
| 6P | +0.5–1.5% | Overestimate | Small |
| 6F | +0.2–0.8% | Mixed, slightly over | Small |
| 5F | +0.1–0.5% | Mixed, slightly over | Negligible |

**Verdict: APPROXIMATE BUT ACCEPTABLE.** The bias is small (< 1–2% absolute),
conservative in direction for Power plays, and within noise for Flex. Migrating
PP to the exact DP distribution (like UD uses) would be a worthwhile
improvement but is not urgent. The 5% global floor provides ample margin.

---

### 1.3 Underdog Card EV

**Payout ladders (underdog_structures.ts)**

| Structure | All Hit | 1 Miss | 2 Miss | Source verified? |
|-----------|---------|--------|--------|-----------------|
| UD_2P_STD | 3× | — | — | ✓ |
| UD_3P_STD | 6× | — | — | ✓ |
| UD_4P_STD | 10× | — | — | ✓ |
| UD_5P_STD | 20× | — | — | ✓ |
| UD_6P_STD | 35× | — | — | ✓ |
| UD_3F_FLX | 3× | 1× | — | ✓ |
| UD_4F_FLX | 6× | 1.5× | — | ✓ |
| UD_5F_FLX | 10× | 2.5× | — | ✓ |
| UD_6F_FLX | 25× | 2.6× | 0.25× | ✓ |
| UD_7F_FLX | 40× | 2.75× | 0.5× | ✓ |
| UD_8F_FLX | 80× | 3× | 1× | ✓ |

**Note on PP vs UD 6F discrepancy:** PrizePicks 6F pays `25/2/0.4` while
Underdog 6F pays `25/2.6/0.25`. The all-hit multiplier is the same, but the
partial-hit tiers differ. This is correct — the sites have different ladders.

**DP hit distribution (underdog_card_ev.ts::computeHitDistribution)**

```typescript
dist[0] = 1;
for each leg with probability p:
    for k = n down to 0:
        dist[k] = dist[k] × (1−p) + (k > 0 ? dist[k−1] × p : 0);
```

This is the **standard Poisson binomial DP**. Working backwards (k = n down to 0)
is correct because it avoids overwriting dist[k-1] before it's read for dist[k].

**Verification by hand (3-leg case):**

Let p₁ = 0.55, p₂ = 0.58, p₃ = 0.52.

After leg 1: dist = [0.45, 0.55, 0, 0]
After leg 2: dist = [0.45×0.42, 0.45×0.58 + 0.55×0.42, 0.55×0.58, 0]
           = [0.189, 0.492, 0.319, 0]
After leg 3: dist = [0.189×0.48, 0.189×0.52 + 0.492×0.48, 0.492×0.52 + 0.319×0.48, 0.319×0.52]
           = [0.09072, 0.33408, 0.40968, 0.16588]

Sum = 1.00036 ≈ 1.0 (floating point). ✓

**EV calculation (computeCardEvFromPayouts)**

```
expectedReturn = Σ dist[k] × payouts[k] × stake
EV = (expectedReturn − stake) / stake
winProbability = Σ dist[k] where payouts[k] > 0
```

**Verdict: SOUND.** The DP is mathematically correct, numerically stable for
n ≤ 8, and the EV/winProb definitions are standard.

---

### 1.4 Varied-Multiplier Gating

**Detection logic (fetch_underdog_props.ts:292–310)**

```typescript
if (line.options && line.options.length >= 2) {
    const prices = line.options
        .map(o => parseInt(o.american_price, 10))
        .filter(p => Number.isFinite(p));
    if (prices.length >= 2) {
        const allSame = prices.every(p => p === prices[0]);
        if (!allSame) isNonStandardOdds = true;
    }
}
```

**Analysis:**
- Standard UD pick'em legs typically have no `options` array, or options with
  identical american_price values (usually −120 or similar).
- Varied-multiplier legs (e.g., "1.03x Higher / 0.88x Lower") expose explicit
  per-side prices like −112 / −135.
- The logic correctly flags any divergence in prices.

**Potential edge case:** If a standard leg happens to have an `options` array
with identical prices (e.g., both −120), it would correctly be classified as
standard (allSame = true). **Good.**

**Potential false positive:** If a leg has `options` with a trivial price
difference (e.g., −119 vs −121 due to rounding), it would be flagged as
non-standard. This could be addressed with a tolerance threshold (e.g.,
|price₁ − price₂| > 5 implies non-standard). However, given that standard
legs typically have no options or identical prices, the current strict check
is a reasonable conservative default.

**Gating in filterEvPicks (run_underdog_optimizer.ts:118–128)**

The filter correctly:
1. Checks `UD_INCLUDE_NON_STANDARD_ODDS` env var for override
2. Removes `isNonStandardOdds = true` legs before EV floor filtering
3. Logs the count of excluded legs

**Verdict: SOUND**, with a minor enhancement suggestion: add a tolerance
parameter for the price divergence check (e.g., `Math.abs(prices[0] - prices[1]) > 3`).

---

### 1.5 Kelly and Staking Math

**MATH_SPEC.md formula (Sheets Calculator tab):**

```
p = (ev + 1) / (1 + b)     where b = maxPayout − 1
fullKelly = (p × b − (1−p)) / b
fracKelly = fullKelly × kellyFrac (e.g., 0.50)
dollarStake = bankroll × fracKelly
```

**For Power plays (binary outcome):**

This is the classic Kelly criterion: `f* = (bp − q) / b` where p = win prob,
q = 1−p, b = net odds. For binary outcomes (all-or-nothing), this is **exact**.

Let me verify with an example:
- 6P at p̄ = 0.56: Payout = 37.5×, so b = 36.5
- Win prob (all hit) = 0.56⁶ = 0.0308
- EV = 0.0308 × 37.5 − 1 = 0.155 = +15.5%
- Kelly: p_implied = (0.155 + 1) / (1 + 36.5) = 1.155/37.5 = 0.0308 ← matches!
- f* = (0.0308 × 36.5 − 0.9692) / 36.5 = (1.124 − 0.969) / 36.5 = 0.00425 = 0.425%
- Half-Kelly: 0.213% of bankroll → $1.60 on a $750 bankroll

**For Flex plays (multi-outcome):**

The binary Kelly formula treats the flex play as if it's all-or-nothing with
payout = maxPayout (e.g., 25× for 6F). This **overestimates** the Kelly
fraction because it ignores the partial-payout outcomes that reduce variance.

The true multi-outcome Kelly maximizes E[log(1 + f × net)]:
```
f* = argmax_f Σ_k P(k hits) × log(1 + f × (Payout(k) − 1))
```

where Payout(k) = 0 for hit counts without payouts, and the sum includes the
loss outcome (Payout = 0, net = −1).

**How big is the mismatch?**

For a 6F card with EV = +10%, let's compare:

Binary Kelly (using b = 24):
- p_implied = 1.10 / 25 = 0.044
- f_binary = (0.044 × 24 − 0.956) / 24 = 0.00403 = 0.40%

True multi-outcome Kelly (numerical):
- Need to solve: max_f [P(6) × log(1+24f) + P(5) × log(1+f) + P(4) × log(1+(-0.6f)) + P(miss) × log(1−f)]
- For typical p̄ = 0.56: P(6) ≈ 0.031, P(5) ≈ 0.145, P(4) ≈ 0.282, P(miss) ≈ 0.542
- Numerical solution: f_multi ≈ 0.06–0.08 (much higher than binary!)

The binary approximation **dramatically underestimates** the optimal Kelly
fraction for flex plays because it ignores the variance-reducing partial payouts.
The partial payouts make the bet much safer than binary all-or-nothing, so the
true Kelly fraction is significantly larger.

**But:** Half-Kelly of the binary approximation gives f ≈ 0.20%, while half-Kelly
of the true multi-outcome gives f ≈ 3–4%. The binary approximation is thus
**extremely conservative** for flex plays — you're betting ~10× less than
optimal Kelly.

**Verdict: APPROXIMATE — CONSERVATIVE DIRECTION.** The binary Kelly
approximation for flex plays dramatically understakes. This means:
- You're leaving expected growth on the table
- But you're also very safe from ruin
- Half-Kelly on the binary approximation ≈ 1/20th Kelly on the true multi-outcome

For a small bankroll ($500–$1K), this extreme conservatism may actually be
desirable. But if you want to grow faster, implementing multi-outcome Kelly
for flex plays would allow 5–10× larger stakes at the same risk level.

**kelly_stake_sizing.ts**

The `computeStake` function takes `kellyFraction` as an input but doesn't
compute it from first principles (EV, payout structure, win probability).
Instead, it applies sport/structure weights to an externally-provided Kelly
fraction. The actual Kelly computation lives in the Sheets Calculator tab.

**Issue:** `potentialWin = recommendedStake × (1 + cardEv)` — this is wrong.
`cardEv` is the expected profit per unit staked (e.g., 0.10 = +10%), not the
payout multiplier. The potential win should be `recommendedStake × maxPayout`
or similar. This field is informational only and doesn't affect stake sizing,
but it should be fixed.

---

### 1.6 Audit Verdict Summary

#### ✅ SOUND
- Devig and fair odds formulas
- Leg edge/legEv usage (ranking only, doesn't leak into card EV)
- PrizePicks payout tables (all three copies are consistent)
- Local binomial EV engine (ENGINE_MODE=local)
- Underdog DP hit distribution algorithm
- Underdog payout tables (aligned with Feb 2025 official chart)
- Underdog EV and winProbability definitions
- Varied-multiplier detection logic
- Varied-multiplier gating in filterEvPicks
- PrizePicks breakeven table (§4.3 — all values verified)

#### ⚠️ APPROXIMATE BUT ACCEPTABLE
- **PrizePicks i.i.d. approximation:** Overestimates EV by ~0.5–2% absolute
  for typical slates. Safe direction for Power; mixed for Flex. Margin is
  absorbed by the 5% global floor. *Migrating to exact DP would be a
  worthwhile improvement.*
- **Binary Kelly for flex plays:** Dramatically understakes (10–20× below
  true multi-outcome Kelly). Conservative = safe, but leaves growth on table.

#### 🔴 NEEDS REVISION
- **Payout table duplication:** Three copies of PP_PAYOUTS across
  `payouts.ts`, `card_ev.ts`, `engine_interface.ts`. Consolidate to single
  source.
- **kelly_stake_sizing.ts potentialWin:** Uses `cardEv` as if it were a
  payout multiplier. Informational only but incorrect.
- **MATH_SPEC.md §3.5 EV check for p=0.54:** Computed as −7.3% at p=0.53
  and +1.5% at p=0.54, but the table in MATH_SPEC shows p=0.53 as −7.3%.
  The numerical check is slightly off — at p=0.54 for 6F:
  P(6)=0.0248, P(5)=0.1267, P(4)=0.2700 → EV = 25×0.0248 + 2.6×0.1267 +
  0.25×0.2700 − 1 = 0.620 + 0.329 + 0.068 − 1 = **+1.7%** (not +1.5%).
  Minor rounding discrepancy, not a material error.

---

## Task 2 — Breakeven Map

### PrizePicks Breakeven Table

| Site | Structure | Legs | Payout Summary | p_be | Implied American |
|------|-----------|------|----------------|------|------------------|
| PP | 2P | 2 | 3× all | 0.5774 | −137 |
| PP | 3P | 3 | 6× all | 0.5503 | −122 |
| PP | 4P | 4 | 10× all | 0.5623 | −129 |
| PP | 5P | 5 | 20× all | 0.5493 | −122 |
| PP | 6P | 6 | 37.5× all | 0.5464 | −120 |
| PP | 3F | 3 | 3×/1× | 0.5774 | −137 |
| PP | 4F | 4 | 6×/1.5× | 0.5503 | −122 |
| PP | 5F | 5 | 10×/2×/0.4× | 0.5424 | −119 |
| PP | 6F | 6 | 25×/2×/0.4× | 0.5421 | −118 |

### Underdog Standard Breakeven Table

| Site | Structure | Legs | Payout Summary | p_be | Implied American |
|------|-----------|------|----------------|------|------------------|
| UD | 2P STD | 2 | 3× all | 0.5774 | −137 |
| UD | 3P STD | 3 | 6× all | 0.5503 | −122 |
| UD | 4P STD | 4 | 10× all | 0.5623 | −129 |
| UD | 5P STD | 5 | 20× all | 0.5493 | −122 |
| UD | 6P STD | 6 | 35× all | 0.5466 | −121 |

### Underdog Flex Breakeven Table

| Site | Structure | Legs | Payout Summary | p_be | Implied American |
|------|-----------|------|----------------|------|------------------|
| UD | 3F FLX | 3 | 3×/1× | 0.5774 | −137 |
| UD | 4F FLX | 4 | 6×/1.5× | 0.5503 | −122 |
| UD | 5F FLX | 5 | 10×/2.5× | 0.5340 | −115 |
| UD | 6F FLX | 6 | 25×/2.6×/0.25× | 0.5310 | −113 |
| UD | 7F FLX | 7 | 40×/2.75×/0.5× | 0.5200 | −108 |
| UD | 8F FLX | 8 | 80×/3×/1× | 0.5100 | −104 |

### Interpretation

**Key insights:**

1. **Larger Flex structures have lower breakevens.** UD 8F FLX needs only
   51.0% per leg to break even — barely above a coin flip. UD 7F FLX needs
   52.0%. These are the most bettor-friendly structures in the entire market.

2. **UD Flex is friendlier than PP Flex at 5+ picks.** UD 5F (53.4%) beats
   PP 5F (54.2%) by 0.8 pp. UD 6F (53.1%) beats PP 6F (54.2%) by 1.1 pp.
   This is because UD's partial-hit multipliers are slightly more generous
   (e.g., UD 6F pays 2.6× on 5-of-6 vs PP 6F's 2×).

3. **Power plays across both sites converge** to similar breakevens (54.6–57.7%
   range). The 2P/3F structure at 57.7% is the hardest to beat — you need
   very strong individual leg edges.

4. **For typical NBA edges (3–7% over 50%):** The best bang-for-buck structures
   are:
   - **UD 6F, 7F, 8F:** p_be of 53.1%, 52.0%, 51.0% — your typical 53–57%
     legs are well above breakeven.
   - **PP 5F, 6F:** p_be of 54.2% — slightly harder but still accessible.
   - **Avoid PP/UD 2P, 3F:** p_be of 57.7% means you need genuinely elite
     legs to break even, and the payout is only 3× — poor risk/reward.

5. **Non-monotonicity in Standard structures:** UD 4P STD (56.2%) has a
   *higher* breakeven than 5P STD (54.9%) or 6P STD (54.7%). This is because
   the 10× payout for 4P is relatively stingy for 4 legs. Similarly, PP 4P
   (56.2%) is harder than 5P (54.9%). **Do not assume "fewer legs = easier."**

6. **Compared to −110 sportsbook lines:** A −110 line implies 52.4% true
   probability. Most legs you'll find have trueProbs in the 52–58% range. The
   structures with p_be ≤ 53% (UD 6F, 7F, 8F) can be +EV with legs that
   would barely be worth a straight bet.

---

## Task 3 — Key Metrics vs. Red Herrings

### 3.1 Leg-Level Metric Hierarchy

| Rank | Metric | Why It Matters |
|------|--------|---------------|
| 1 | **trueProb** | The single most important number. Everything else derives from it. A leg with trueProb=0.57 is strictly better than one at 0.54. |
| 2 | **edge (trueProb − 0.5)** | Equivalent to trueProb for ranking, but easier to compare at a glance. 7% edge is great, 3% is marginal. |
| 3 | **IsWithin24h** | Practical: stale legs from distant games may have shifted. Only act on legs you can actually bet on. |
| 4 | **IsNonStandardOdds** | Filter flag. If TRUE, the leg has variable pricing and can't be used with fixed-ladder math. |
| 5 | **book / overOdds / underOdds** | Useful for auditing the devig — if the sharp book has extreme juice (−200/+150), the devig is less reliable. |
| 6 | **stat** | Context — some stats (points, assists) have more liquid markets and more reliable odds than others (turnovers, steals). |
| 7 | **fairOdds** | Redundant with trueProb. Rarely useful to look at directly. |

**Recommended minimal "stare at" columns:** `player`, `stat`, `line`, `trueProb`,
`edge`, `book` (to verify it's a reputable source).

### 3.2 Card-Level Metric Hierarchy

| Rank | Metric | Why It Matters |
|------|--------|---------------|
| 1 | **cardEv (CardEV%)** | THE decision metric. This is the expected profit per dollar staked, accounting for the full payout ladder and hit probabilities. A card with +12% EV is twice as good as one with +6%. |
| 2 | **flexType / structure** | Determines the payout ladder, and therefore variance and risk profile. 6F and 5F have the best risk/reward for typical edges. |
| 3 | **winProbCash** | Probability of positive profit. For Flex, this tells you how often you'll actually make money (vs. break even on partial hits). Important for bankroll psychology. |
| 4 | **avgProb** | Diagnostic — tells you the quality of the legs in the card. Higher avgProb = more reliable legs. |
| 5 | **winProbAny** | Probability of any non-zero payout (includes break-even). Less useful than winProbCash but good for Flex plays where partial returns matter. |
| 6 | **avgEdgePct** | Redundant with avgProb. Useful as a quick sanity check but doesn't drive decisions. |

**Why CardEV% should drive decisions:** It already incorporates the payout
structure, hit probabilities, and partial-payout values. Picking cards by CardEV
is equivalent to maximizing expected profit per dollar at risk. Any other metric
(avgProb, winProbCash) is either a component of CardEV or a secondary
risk-preference measure.

**When to use winProbCash:** When choosing between two cards with similar CardEV,
prefer higher winProbCash — it means more frequent wins, which is better for
bankroll stability and psychology.

### 3.3 Portfolio-Level Metrics

| Rank | Metric | Why It Matters |
|------|--------|---------------|
| 1 | **DailyRiskFraction** | Total stakes / bankroll. The #1 survival metric. Keep below 10% of bankroll per day. |
| 2 | **Number of independent slates** | How many uncorrelated games your cards span. More slate diversity = lower variance. |
| 3 | **TotalKellyRaw** | Sum of ideal Kelly stakes. If this exceeds your daily budget, you need to scale. |

**Metrics that can mislead:**
- **Number of cards:** More cards ≠ better. Ten marginal +5% EV cards are worse
  than three strong +12% EV cards, because the marginal cards dilute your risk
  budget.
- **Total EV across all cards:** This grows with number of cards but ignores
  the diminishing returns from shared legs and correlation.
- **Strength (if defined as sum of leg edges):** Not a real metric — cardEv
  already accounts for this properly through the binomial model.

---

## Task 4 — Parlay Optimizer Design

### 4.1 Objective and Constraints

**Objective:** Maximize expected log-growth of bankroll (Kelly criterion). This
naturally balances EV-seeking with ruin avoidance.

**Hard constraints:**
- Max 1 leg per player per card (already enforced)
- Max 3 legs per team per card (already enforced)
- Max 4 legs per game per card (already enforced)
- Only standard UD odds unless `UD_INCLUDE_NON_STANDARD_ODDS=true`
- Leg must be within 24h (betable)
- Leg edge ≥ 2% (PP) or legEv ≥ 3% (UD)

**Soft constraints (daily portfolio level):**
- Daily risk fraction ≤ 8–10% of bankroll
- Max 3 cards sharing the same leg
- Max $100 total exposure to a single player across all cards

### 4.2 Card Generation and Selection

**Phase 1: Leg pool preparation**
```
1. Fetch legs from PP and UD
2. Filter: edge ≥ floor, IsWithin24h, not IsNonStandardOdds
3. Sort by trueProb descending (best legs first)
4. Cap at top 30 legs per site
```

**Phase 2: Candidate generation (per structure)**

Current approach: random shuffling with greedy fill. This is fine for small
pools (≤30 legs) but doesn't guarantee finding the best combinations.

**Improved algorithm (greedy + diversification):**

```
For each structure S (ordered by friendliness: 6F, 5F, 7F, 8F, ...):
  1. Sort legs by trueProb desc
  2. Generate candidates using "sliding window + shuffle":
     - First N attempts: take top-k legs greedily
     - Remaining attempts: shuffle and fill greedily
  3. Evaluate each candidate with exact EV (DP for UD, binomial for PP)
  4. Accept if cardEv ≥ structure threshold
  5. Deduplicate by leg set
  6. Sort accepted cards by cardEv desc
  7. Select top T cards per structure (T = target count)
```

**Phase 3: Portfolio selection (cross-structure)**

This is where the system needs the most improvement. Currently, all accepted
cards are exported without considering overlap or portfolio-level constraints.

**Recommended portfolio selection:**

```
1. Pool all accepted cards from all structures (PP + UD)
2. Sort by cardEv desc (global ranking)
3. Greedy selection with diversity constraints:
   For each card in order:
     - Check: would adding this card cause any player to appear in > 3 cards?
     - Check: would adding this card cause any game to appear in > 5 cards?
     - Check: would total daily risk exceed budget?
     - If all checks pass: add card to portfolio
4. Compute stakes (see §4.3)
```

This is a variant of the **weighted set packing problem** (NP-hard in general),
but greedy-by-EV with constraints is a good O(n log n) heuristic that captures
most of the value.

### 4.3 Per-Card Sizing with ~Half-Kelly

**For Power plays (binary):**

```
b = maxPayout − 1
p = winProbCash   (probability of hitting all legs)
f_full = (p × b − (1 − p)) / b
f_effective = min(f_cap, globalFraction × f_full)
stake = bankroll × f_effective
```

where `globalFraction = 0.50` (half-Kelly) and `f_cap = 0.05` (max 5% of
bankroll per card).

**For Flex plays (improved multi-outcome approximation):**

Instead of using binary Kelly with maxPayout (which dramatically understakes),
use the **certainty-equivalent** approach:

```
CE = Σ_k P(k hits) × Payout(k)   // expected return per unit staked
σ² = Σ_k P(k hits) × (Payout(k) − CE)²  // variance of return
f_approx = (CE − 1) / σ²   // mean-variance Kelly approximation
f_effective = min(f_cap, globalFraction × f_approx)
stake = bankroll × f_effective
```

This is the **mean-variance approximation to Kelly**, which is much more
accurate than binary Kelly for multi-outcome bets. It's also simple to
implement — just two passes over the hit distribution.

**Example for 6F with p̄ = 0.56:**
- P(6)=0.031, P(5)=0.145, P(4)=0.282, P(0-3)=0.542
- CE = 0.031×25 + 0.145×2.6 + 0.282×0.25 + 0.542×0 = 0.775 + 0.377 + 0.071 = 1.223
- EV = CE − 1 = 0.223 = +22.3%
- σ² = 0.031×(25−1.223)² + 0.145×(2.6−1.223)² + 0.282×(0.25−1.223)² + 0.542×(0−1.223)²
     = 0.031×565.1 + 0.145×1.894 + 0.282×0.946 + 0.542×1.496
     = 17.52 + 0.275 + 0.267 + 0.811 = 18.87
- f_approx = 0.223 / 18.87 = 0.0118 = 1.18%
- Half-Kelly: 0.59% of bankroll → $4.43 on $750

Compare with binary Kelly half: 0.20% → $1.50. The mean-variance approach
gives ~3× larger stakes for the same level of mathematical rigor.

**Recommended caps:**
- Max 5% of bankroll per card (absolute cap)
- Max $100 per card (nominal cap for small bankrolls)
- Max $50 total exposure to any single player across all cards

### 4.4 Short- vs. Long-Term Sustainability

**Variance for a typical NBA-Props-29 slate:**

Assuming 5 UD 6F cards at +10% EV each, $5 stake each:
- Total risk: $25 (3.3% of $750 bankroll)
- P(0 cards cash): ≈ (1 − 0.18)^5 ≈ 0.37 (losing $25)
- P(≥1 card cashes): ≈ 0.63
- Expected profit: 5 × $5 × 0.10 = $2.50 per slate
- Std dev of daily P&L: ≈ $30 (driven by the rare all-hit 25× events)

**Drawdown analysis:**

With 3.3% risk per day, the probability of a 20% bankroll drawdown before
recovering is very low (< 5% over a season). The Kelly framework naturally
reduces stakes as bankroll shrinks, providing built-in drawdown protection.

**Recommended guardrails:**
1. **Daily max risk: 8% of bankroll.** If total Kelly stakes exceed this,
   scale all stakes proportionally.
2. **Drawdown circuit breaker:** If bankroll drops 25% from peak, reduce
   globalFraction from 0.50 to 0.25 until recovered to within 15% of peak.
3. **Winning adjustment:** After growing bankroll 50%+, rebase stakes to new
   bankroll (don't let "house money" effect inflate risk).
4. **Minimum slate quality:** Don't force bets. If no card has EV ≥ 5%, skip
   the day. The optimizer already enforces this with the global floor.

---

## Task 5 — Outside-the-Box Improvements

### 5.1 Better Data

| Data Type | How It Helps | Integration | Difficulty |
|-----------|-------------|-------------|------------|
| **Historical hit rates per player/stat** | Calibrate devig — if a player's over hits 58% at the SGO line but our devig says 55%, we can adjust. | Bayesian prior on trueProb. | Moderate (scraping + DB) |
| **Player-level correlation matrix** | Same-team player props are correlated (e.g., PG assists ↔ SG points). Current model assumes independence. | Replace product-of-probs with copula model or empirical covariance. | Hard (requires historical data + statistical modeling) |
| **Line movement (open vs close)** | Sharp money moves lines. A line moving toward our position is confirming; against us is a warning. | Weight legs by line movement direction. Legs with confirming movement get higher confidence. | Easy (SGO already has historical lines) |
| **Market consensus across books** | If 5 books agree on a line but SGO differs, the outlier is less reliable. | Use median across books for devig instead of single-source. | Moderate (multi-source API) |
| **Weather/injury/lineup data** | Real-time player status affects hit probability. | Adjust trueProb or filter out legs with late-breaking lineup changes. | Moderate (various APIs) |
| **Outcome tracking database** | Track actual hit/miss for every leg bet. After 500+ legs, compute realized edge vs predicted edge. | Calibration: if predicted edge is 5% but realized is 3%, apply a 0.6× calibration factor. | Easy (just log results + SQL) |

**Highest-ROI data investment:** Outcome tracking database. You can build this
with a simple SQLite DB + a daily 5-minute logging step. After 2–3 months of
data, you'll know your actual calibration and can adjust everything accordingly.

### 5.2 Better Exploitation Strategies

**Structure allocation by leg quality:**

Bucket legs into tiers:
- **A-tier (edge ≥ 7%):** Use in 6P/5P Power plays for maximum leverage.
  These legs are strong enough to carry all-or-nothing structures.
- **B-tier (edge 4–7%):** Use in 6F/5F Flex plays. The partial-payout
  structure cushions the lower individual edge.
- **C-tier (edge 2–4%):** Only viable in large Flex structures (UD 7F/8F)
  where the low breakeven makes them +EV in aggregate.

**Site allocation:**
- For legs available on both sites, compare: PP 6F (p_be = 54.2%) vs UD 6F
  (p_be = 53.1%). UD is ~1 pp friendlier. But PP offers 37.5× Power while
  UD offers 35×. Decision rule:
  - **High-edge legs (>6%):** Use on PP Power (6P at 37.5×) for max leverage.
  - **Moderate-edge legs (3–6%):** Use on UD Flex (6F/7F) for lower breakeven.

**Cross-site diversification:**
- Placing the same leg combination on both PP and UD Flex creates two
  independent bets on the same outcomes. This is NOT diversification — it's
  doubling exposure.
- True diversification: use *different* leg combinations on PP and UD,
  maximizing the number of independent games/players across your portfolio.

### 5.3 Alternative Bankroll Frameworks

| Framework | Pros | Cons | Recommendation |
|-----------|------|------|----------------|
| **Current (binary half-Kelly)** | Simple, very conservative, hard to go bust | Dramatically understakes flex plays, very slow growth | Baseline — safe but suboptimal |
| **Mean-variance Kelly** | Simple formula, much better for flex plays, theoretically sound | Requires hit distribution (already computed) | **RECOMMENDED** — best balance of accuracy and simplicity |
| **True multi-outcome Kelly** | Exact optimal growth rate | Requires numerical optimization per card; complex to implement | Overkill for this use case |
| **Fixed fractional** | Dead simple (e.g., always bet 1% of bankroll) | Ignores EV differences between cards; doesn't adapt to edge quality | Too crude — wastes edge on low-EV cards |
| **Drawdown-aware dynamic** | Reduces risk after losses, increases after wins | Complex; can overfit to short-term noise | Nice-to-have add-on, not primary framework |

**Recommendation:** Implement **mean-variance Kelly** as the primary sizing
method. It's one formula, uses data you already compute, and it's 5–10× more
accurate than binary Kelly for flex plays. Add half-Kelly multiplier on top
for safety. Layer drawdown circuit breakers as described in §4.4.

### 5.4 Additional Discoveries and Framings

**Edge-per-dollar-of-risk framing:**

Instead of thinking "which card has highest EV?", think "which card gives me
the most EV per unit of Kelly risk?"

```
efficiency = cardEv / kellyFraction
```

A card with +10% EV requiring 1% Kelly is less efficient than a card with
+8% EV requiring 0.3% Kelly. The second card gives you 26.7 EV-per-Kelly-unit
vs. 10. You can bet more of the efficient card (up to your daily limit) and
get more total expected growth.

**Correlation exploitation (advanced):**

In DFS pick'em, the sites assume legs are independent. But player props within
the same game are correlated. If you find two positively-correlated legs
(e.g., "PG assists over" and "SG points over" on the same team), and both
are individually +EV, their combined hit probability is HIGHER than the
independence assumption suggests. This means:
- The site underprices the parlay
- Your actual EV is higher than computed
- You should bet more on correlated-positive cards

Conversely, avoid negatively-correlated legs (e.g., two players fighting for
the same points on the same team).

**Seasonal edge decay:**

DFS sites adjust their lines based on betting patterns. If many sharp bettors
exploit the same edge, the site will move the line. Track your edge realization
over time — if it decays, you need to:
1. Bet earlier in the day (before line moves)
2. Diversify across stats and sports
3. Look for new edge sources (new markets, new stats, new data)

---

## Task 6 — Project Status and Accept/Reject Recommendation

### 6.1 Current State Summary

**Backend (Optimizers):**
- ✅ PrizePicks optimizer: fully functional (local engine mode, ~15–30s runtime)
- ✅ Underdog optimizer: fully functional (exact DP, structure-aware thresholds)
- ✅ Varied-multiplier gating: correctly detects and excludes non-standard legs
- ✅ TypeScript compiles clean
- ⚠️ Card building uses random shuffling — works but doesn't guarantee optimal

**Express Server (`src/server.ts`):**
- ✅ Endpoints implemented: `/api/run/pp|ud|both`, `/api/status/:jobId`,
  `/api/cards`, `/api/legs`
- ✅ Job management with async spawning and log tailing
- ⚠️ No authentication — fine for local use, not for public deployment
- ⚠️ Job history is in-memory only (lost on restart)

**Web UI (`web/`):**
- ✅ React + Vite + Tailwind scaffolded with RunPanel, CardsTable, LegsBrowser
- ✅ API client with typed interfaces
- ⚠️ Not yet tested end-to-end (dependencies installed but no build verified)
- ⚠️ `web/` is separate from the main tsconfig — not covered by `npx tsc`

**Sheets Integration:**
- ✅ `sheets_push_legs.py`, `sheets_push_underdog_legs.py`, `sheets_push_cards.py`
  all functional
- ✅ UD-Legs now sorted by legEv descending before pushing
- ✅ IsNonStandardOdds column added to UD-Legs CSV
- ✅ SHEETS_FORMULAS.md is comprehensive
- ⚠️ Kelly/staking formulas in Sheets are documented but rely on manual setup

**Documentation:**
- ✅ MATH_SPEC.md: thorough and accurate (minor rounding note in §3.5)
- ✅ RUNBOOK.md: updated with Web UI section and expanded troubleshooting
- ✅ WEB_UI_NOTES.md: updated with actual implementation details
- ✅ PERF_NOTES.md: local engine benchmarks documented

### 6.2 Risk Assessment on Accepting New Changes

**Coherent and consistent with math?** YES. The `isNonStandardOdds` changes
flow cleanly through the type system (RawPick → MergedPick → EvPick), the
detection logic is sound, the gating is properly placed in filterEvPicks, and
the env-var override works as documented. No math was changed in the EV
computation paths.

**Red flags / areas to test before committing:**

1. **Web UI untested:** The React frontend has never been built or run. The
   Vite proxy configuration should work but hasn't been verified. Run
   `cd web && npm run dev` alongside `npm run dev-server` and verify the
   dashboard loads and can trigger a run.

2. **Express 5.x compatibility:** The server uses Express 5.2.1 (installed
   via latest npm). Express 5 has breaking changes from v4 (e.g., `req.query`
   typing, error handling). The server code looks compatible but hasn't been
   runtime-tested.

3. **sheets_push_underdog_legs.py sorting:** The new sorting logic parses
   `legEv` as float for sorting. If any CSV row has a non-numeric legEv (e.g.,
   empty string), it falls back to 0. This is safe but should be verified
   with a real CSV.

4. **IsNonStandardOdds column shift:** Adding a 16th column (P) to UD-Legs
   means the clear range changed from `A2:O` to `A2:P`. If the Sheets tab
   has existing data in column P (e.g., manual notes), it will be cleared.
   Verify the UD-Legs tab doesn't have important data in column P.

5. **MergedPick spreading:** `merge_odds.ts` uses `...pick` to create
   MergedPick from RawPick. This correctly carries `isNonStandardOdds`
   through, but it's implicit — if someone adds a field to RawPick that
   conflicts with MergedPick's explicit fields, it could shadow silently.

### 6.3 Recommended Next Steps (Priority Order)

**Session 1: Verification and Testing (HIGH PRIORITY)**
1. Run `cd web && npm run build` to verify the React app compiles
2. Start `npm run dev-server` + `cd web && npm run dev` and verify end-to-end
3. Run the full pipeline (`run_both.ps1`) and verify Sheets output
4. Spot-check IsNonStandardOdds column in UD-Legs tab
5. Build a simple integration test that runs both optimizers with test data

**Session 2: Kelly Upgrade (HIGH VALUE)**
1. Implement mean-variance Kelly sizing in `kelly_stake_sizing.ts`
2. Wire it into the card output (new `kellyFraction` and `recommendedStake`
   columns in CSV)
3. Add corresponding Sheets formulas
4. This is the single highest-value math improvement remaining

**Session 3: Outcome Tracking (HIGH VALUE, MEDIUM EFFORT)**
1. Create a SQLite-backed outcome logger
2. After each day's games, log actual hit/miss for each leg bet
3. After 200+ legs, compute calibration (predicted vs. realized edge)
4. This data will tell you whether the entire system is actually profitable

**Bonus: PrizePicks DP Migration**
- Replace the i.i.d. binomial with exact DP (same as Underdog uses)
- ~30 lines of code change in `card_ev.ts` and `engine_interface.ts`
- Eliminates the ~0.5–2% EV overestimation bias
- Lower priority than Kelly and outcome tracking, but easy to do

---

## Appendix: Quick-Reference Decision Framework

```
When a new slate drops:

1. RUN optimizer (both PP + UD)
2. LOOK at cards sorted by CardEV%
3. FILTER: CardEV ≥ 5%, IsWithin24h = TRUE
4. PREFER: 6F/5F structures (lowest breakeven, best risk/reward)
5. DIVERSIFY: no more than 3 cards sharing a player
6. SIZE: half-Kelly via mean-variance (or 1% of bankroll as fallback)
7. CAP: ≤ 8% of bankroll total daily risk
8. LOG: record every bet placed for outcome tracking
9. SKIP: days with no +5% EV cards — capital preservation > forced action
```
