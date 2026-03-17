# Slip type, ranking, cardEV formula, risk-adjusted EV, and UD leg-count distribution — diagnostic audit

**Report only. No code changes.**

---

## 1. Slip type label ("8P" / "2P" / "6F" etc.) — where set and full logic

### Where it’s set

- **PP (innovative cards):** `src/build_innovative_cards.ts`. The slip type is the **`flexType`** field on each card. It is set from the **`FLEX_CONFIGS`** loop: each candidate card is built from a `{ size, type }` pair; `type` is the slip label (e.g. `"2P"`, `"6F"`).
- **UD (underdog cards):** `src/run_underdog_optimizer.ts`. The slip type is derived from the Underdog **structure id** via `mapUnderdogStructureToFlexType(structureId)` and written as `flexType` (and used in `Site-Leg`, e.g. `ud-8p`).

### Full logic for P vs F and leg count

**PP (build_innovative_cards.ts):**

- **FLEX_CONFIGS** (lines 354–360) is the single source of (leg count, slip type):

```ts
const FLEX_CONFIGS: { size: number; type: FlexType }[] = [
  { size: 2, type: "2P" },
  { size: 3, type: "3P" }, { size: 3, type: "3F" },
  { size: 4, type: "4P" }, { size: 4, type: "4F" },
  { size: 5, type: "5P" }, { size: 5, type: "5F" },
  { size: 6, type: "6P" }, { size: 6, type: "6F" },
];
```

- **P vs F:**  
  - **P** = Power (all-or-nothing; single payout tier).  
  - **F** = Flex (tiered payout ladder; partial hits pay).  
  Same leg count can have both (e.g. 3P and 3F); the **type** string is literally `"XP"` or `"XF"` where X is the number of legs.
- **Leg count:** Comes from **`size`** in each config (2–6). For each `(size, type)`, the code builds all k-subsets of the leg pool of size `size`, then evaluates each combo with `evaluateSyncCard(combo, type)` where `type` is the slip label. So slip type and leg count are fixed by the config row; there is no separate “max leg count” check beyond the fact that only sizes 2–6 appear in **FLEX_CONFIGS**.

**UD (run_underdog_optimizer.ts):**

- **mapUnderdogStructureToFlexType** (lines 150–159):

```ts
function mapUnderdogStructureToFlexType(structureId: string): FlexType {
  if (structureId.includes('F_FLX')) {
    const size = structureId.match(/(\d)F/)?.[1];
    return `${size}F` as FlexType;   // e.g. UD_6F_FLX → "6F"
  } else {
    const size = structureId.match(/(\d)P/)?.[1];
    return `${size}P` as FlexType;   // e.g. UD_8P_STD → "8P"
  }
}
```

- **P** = Standard (all-or-nothing) structures: ids like `UD_6P_STD`, `UD_7P_STD`, `UD_8P_STD` → `"6P"`, `"7P"`, `"8P"`.
- **F** = Flex (tiered ladder) structures: ids like `UD_6F_FLX` → `"6F"`.
- **Leg count:** Comes from Underdog structure definitions in `src/config/underdog_structures.ts`: Standard has 2–8 picks (UD_2P_STD … UD_8P_STD), Flex has 3–8 (UD_3F_FLX … UD_8F_FLX). So UD slip type and leg count are determined by which structure is used for that card.

### Maximum leg count per platform

- **PP (innovative):** **6 legs max.** Only sizes 2–6 appear in **FLEX_CONFIGS**; there is no 7 or 8. So PP innovative cards are only 2P, 3P, 3F, 4P, 4F, 5P, 5F, 6P, 6F.
- **UD:** **8 legs max.** Underdog structures go up to 8 (e.g. UD_8P_STD, UD_8F_FLX). No code enforces a lower cap; the structure list defines what’s built.

### Does UD have a cap on Power play legs?

- There is **no extra “cap on Power legs”** in code. UD offers Standard (Power) structures from **2 to 8 picks** (UD_2P_STD … UD_8P_STD). Which structures are actually used depends on the optimizer’s structure loop and EV thresholds (e.g. `UNDERDOG_STRUCTURE_THRESHOLDS`), not a separate leg-count cap for Power. So **Power is allowed up to 8 legs**; the only “cap” is that structures above 8 are not defined.

---

## 2. Where cards are ranked/sorted before CSV and Telegram; field used

### Innovative cards (tier CSVs + Telegram)

- **Where:** `src/build_innovative_cards.ts` **Phase 2** (lines 517–521): after building all candidates, they are sorted once:

  `allCandidates.sort((a, b) => b.compositeScore - a.compositeScore);`

- **Field used:** **`compositeScore`** (descending).  
  Composite score is defined on each candidate as (line 465):

  `compositeScore = cardEV * diversity * (1 - correlation) * liquidity`

- That same sorted order is preserved through **Phase 3** (greedy portfolio selection): cards are taken in **compositeScore** order subject to player/stat/Kelly caps. So the **innovative** deck (and thus tier1/tier2 CSVs and the list passed to Telegram) is ordered by **compositeScore**, not raw cardEV or Kelly stake.
- **Telegram:** `src/telegram_pusher.ts` (lines 206–208): it filters to tier-1 cards then takes the first five: `tierOneCards = cards.filter(c => c.tier === 1)`, `top5 = tierOneCards.slice(0, 5)`. So the “ranking” for Telegram is **whatever order the cards are in when passed in** — which is the **compositeScore** order from `buildInnovativeCards` (tier1 is a subset of that ordered list). So effectively **compositeScore** (desc) is the ranking for Telegram top-5.

### Main PP cards (prizepicks-cards.csv export)

- **Where:** `src/run_optimizer.ts` (lines 1572–1591).
- **Sort:**  
  - Primary: **`cardEv`** descending.  
  - Secondary: **`winProbCash`** descending.  
  - Tertiary: deterministic leg-id key for ties.
- So for the **main PP cards CSV** (and any export that uses `sortedCards` / `exportCards`), the ranking field is **cardEv**, then **winProbCash**.

**Summary**

| Output | Ranking field(s) |
|--------|------------------|
| Innovative tier CSVs + Telegram top-5 | **compositeScore** (desc) |
| Main PP cards CSV (export) | **cardEv** (desc), then **winProbCash** (desc) |

---

## 3. cardEV formula — how it’s calculated from leg EVs; does leg count inflate longer parlays?

### Where it’s calculated

- **PP:** `src/build_innovative_cards.ts` → `evaluateSyncCard(combo, type)` (lines 102–133) uses **`computeLocalEvDP(flexType, probs)`** with `probs = legs.map(l => l.trueProb)`. The math lives in **`math_models/ev_dp_prizepicks.ts`**.
- **UD:** `src/underdog_card_ev.ts` uses hit distribution + **`computeCardEvFromPayouts(hitProbs, payouts, stake)`**; **`expectedValue = (expectedReturn - stake) / stake`** in **`math_models/card_ev_underdog.ts`**.

### Formula (PP — ev_dp_prizepicks.ts)

- **Not additive and not multiplicative in leg EVs.** It’s **distribution-based**:
  1. **Hit distribution:** DP over leg **trueProbs** (not leg EVs):  
     `dp[j] = P(exactly j hits)` via recurrence `next[j] += dp[j]*(1-p)`, `next[j+1] += dp[j]*p`.
  2. **Expected return:**  
     `expectedReturn = Σ_{k=0..n} P(k hits) × payout(k)`  
     where `payout(k)` comes from the structure’s payout table (e.g. PP_PAYOUTS[flexType]).
  3. **cardEV:**  
     `cardEV = expectedReturn - 1`  
     (same as “expected value per unit staked”).

So cardEV is **expected return minus 1**, with expected return computed from the **exact hit distribution** and the **structure-specific payout table**. Leg EVs are not multiplied together; they influence the result only indirectly because **trueProb** per leg drives the hit distribution, and leg EV is a function of trueProb and the line.

### Does leg count “inflate” longer parlays?

- **Not by a generic leg-count multiplier.** The formula is the same for all lengths: **expectedReturn − 1** from the DP and payout table.
- **Structure payouts** do depend on leg count (and P vs F): longer parlays have different payout curves (e.g. 6P pays only on 6 hits, 6F pays on 4/5/6 hits). So a 6-leg parlay can have higher or lower EV than a 2-leg one **depending on the payout table and the hit distribution**, not because the code multiplies by leg count. So there is **no built-in inflation of EV just from having more legs**; the effect of length is entirely through the defined payout structure and the resulting hit distribution.

---

## 4. Risk-adjusted EV or hit-probability-weighted EV

Search for: **hitProb, hitRate, adjustedEV, riskAdj, expectedValue weighted by probability of winning the full parlay.**

Findings:

- **adjustedEV:** Exists but is **per-leg** (calibration), not card-level risk-adjusted EV. Used in `src/calibrate_leg_ev.ts` (e.g. `adjustedEV(leg.legEv, mult, isUnder, underBonus)`) and applied to legs in `run_optimizer.ts` and `pp_engine.ts` for **historical calibration / under-bonus**, not for “EV weighted by parlay win probability.”
- **hitRate / hitProb:**  
  - **hitRate:** Used in backtest/calibration (e.g. `validation/backtest_engine.ts`, `historical/trend_analyzer.ts`, `merge_odds.ts`, `odds/book_ranker.ts`) for **realized hit rates** and book accuracy, not for a risk-adjusted card EV.  
  - **hitProb / winProb:** Card-level **winProbCash** (and **winProbAny**) is computed in multiple places (e.g. `build_innovative_cards.ts`, `underdog_card_ev.ts`, `card_ev.ts`) as **P(cash / any payout)** from the hit distribution and payout table. It is **not** used as a multiplier on EV to form a single “risk-adjusted EV” metric in one place.
- **riskAdj:** **riskAdjustment** appears in types and **kelly_stake_sizing.ts** / **run_optimizer.ts** / **cardBuilder** as a **label/string** (e.g. from Kelly mean-variance), not as a numeric “risk-adjusted EV” field used for ranking.
- **Weighting EV by win probability:**  
  - **best_bets_score.ts:** Score is **`edge × winProb × kellyFrac × legPenalty × histWeight × fragPen`** (line 62). So **winProb** (winProbCash) is used in a **score**, not as “EV × winProb” as a single risk-adjusted EV number.  
  - **run_optimizer.ts:** Main PP cards are sorted by **cardEv** then **winProbCash** (secondary). So win probability is used for **tie-breaking / ordering**, not as a multiplicative weight on EV.  
  - **portfolio_selector.ts:** Sorts by “efficiency desc, then EV desc, then winProb desc” — again **ordering** by EV and winProb, not a combined “risk-adjusted EV” formula.

**Conclusion:** There is **no** single “risk-adjusted EV” or “hit-probability-weighted EV” that is computed as something like **expectedValue × P(win full parlay)** and used as the main card metric. Win probability is used in **best-bet score** (multiplicatively with edge, Kelly, etc.) and in **sort order** (secondary to cardEV), but not as a single risk-adjusted EV field in the codebase.

---

## 5. Distribution of leg counts (flexType) in underdog-cards.csv

Command run (CSV has **flexType**, not “Slip”):

```powershell
Import-Csv data/output_logs/underdog-cards.csv | Group-Object flexType | Select-Object Name, Count | Sort-Object Count -Descending
```

**Result (400 UD cards):**

| Name (flexType) | Count |
|-----------------|-------|
| 7P              | 109   |
| 8P              | 109   |
| 8F               | 73    |
| 6P               | 70    |
| 6F               | 37    |
| 5P               | 2     |

So in this run, **7P and 8P** dominate (218 of 400), then **8F** (73), **6P** (70), **6F** (37), and **5P** (2). No 2P, 3P, 3F, 4P, 4F, 7F in this sample; the distribution is driven by which structures the optimizer built and exported (and any capping), not by a separate “slip” column name.

---

**End of report. No code changes made.**
