# Improving Our Selection Process (Post 0-for-6)

Going 0-for-6 on a card is statistically rarer than 6-for-6 if our edges are real: it means every leg missed. That can be bad variance, but it can also mean **systematic overestimation of edge** (trueProb too high, or lines moved). This doc outlines concrete changes to reduce fragile picks and improve calibration.

---

## Current Flow (Recap)

1. **Legs:** PP picks merged to SGO odds → `trueProb` from devigged odds → filter by `edge >= 1.5%`, `legEv >= 2%`, max 1 leg per player.
2. **Cards:** Innovative builder scores cards by `cardEV × diversity × (1 - correlation) × liquidity`, then greedy portfolio with player/stat/Kelly caps.
3. **Tiers:** Tier1 = cardEV ≥ 8% and Kelly ≥ 1.5%; Tier2 = 4% / 0.5%; Tier3 = rest. **Fragile cards can still be Tier1.**
4. **Line matching:** We allow PP line to match SGO within `MAX_LINE_DIFF = 0.5` (or exact with `--exact-line`). Alt-line matches are allowed with a second pass.

---

## Root Causes That Can Produce 0-for-6

- **Overstated trueProb:** Devig assumes fair odds; if books are sharp and PP is slow, we overstate edge.
- **Line drift:** We merge at lock time; if PP line is 21.5 and we match to SGO 21.0, we’re effectively betting 21.5 at 21.0 odds (edge overstated).
- **Fragile legs:** Small juice or line move kills EV; we still show them in Tier1.
- **Correlation:** Same game / same team legs can all miss together (we have cluster penalty but don’t exclude).
- **No calibration:** We don’t downweight stats/books that historically hit below expectation.

---

## Recommended Improvements (In Order of Impact)

### 1. **Tier1 = Non-Fragile Only (High Impact, Easy)**

**Idea:** A card is Tier1 only if it meets current EV/Kelly thresholds **and** is not fragile. Fragile cards drop to Tier2 (or stay T2/T3).

**Why:** Fragile cards are exactly the ones where a small line move or juice change collapses EV. They’re the most likely to have been mispriced or to move post-merge.

**Code:** `build_innovative_cards.ts` → `classifyTier()`. Add: if `fragile` then max tier = 2.

```ts
function classifyTier(cardEV: number, kellyFrac: number, fragile?: boolean): CardTier {
  if (fragile) {
    if (cardEV >= TIER2_MIN_EV && kellyFrac >= TIER2_MIN_KELLY) return 2;
    return 3;
  }
  if (cardEV >= TIER1_MIN_EV && kellyFrac >= TIER1_MIN_KELLY) return 1;
  if (cardEV >= TIER2_MIN_EV && kellyFrac >= TIER2_MIN_KELLY) return 2;
  return 3;
}
```

Call with `classifyTier(cardEV, kellyFrac, fragile)` once fragile is computed.

---

### 2. **Stricter Line Matching for “Lock” Legs (High Impact)**

**Idea:** For legs that go into Tier1/Tier2 cards, prefer **exact line match** (or at least tighter than 0.5). Option A: use `--exact-line` in production. Option B: add a “strict” pool: only legs with `matchType === 'main'` and `line delta === 0` (or ≤ 0.25) are eligible for Tier1 cards.

**Why:** Matching 21.5 to 21.0 gives odds for 21.0; we’re really betting 21.5. That overstates edge. Exact (or near-exact) match reduces that bias.

**Code:**  
- Merge already sets `matchType` and we could expose `altMatchDelta` / line delta on `MergedPick`.  
- In `build_innovative_cards`, when building the **pool** for cards that can be Tier1, filter legs to those with exact (or ≤0.25) line match. Or: add a “confidence” multiplier to leg EV when line delta > 0.25 (e.g. legEv *= 0.9 for alt or wide match).

---

### 3. **TrueProb Haircut (Medium Impact)**

**Idea:** Use a conservative haircut on `trueProb` when computing EV for selection only (e.g. `effectiveTrueProb = trueProb - 0.02`), so we require a bit more edge before we call a leg +EV.

**Why:** If books are sharp, our devigged trueProb is slightly optimistic. A 2% haircut makes us pick only legs we’re more confident in.

**Code:** Either in `calculate_ev.ts` (add optional haircut param) or in `run_optimizer` when filtering: `leg.edge >= MIN_EDGE` with edge computed from `(trueProb - 0.02) - 0.5` for selection. Need to be careful to only use haircut for **selection**, not for display or payout math.

---

### 4. **Prefer Shorter Cards for “Top Plays” (Medium Impact)**

**Idea:** For the single card we push to Telegram or “play of the day”, prefer best **3P or 4P** (or 5P) over 6P when composite score is close. Fewer legs → less variance and fewer chances for one bad leg to sink the card.

**Why:** 6-leg cards have higher variance. One or two bad beats can zero the card. 3–4 leg cards are easier to “get right” and still have good EV.

**Code:** In portfolio selection, when sorting by composite score, add a small bonus for smaller size (e.g. `compositeScore * (1 + 0.05 * (6 - size))` for size 2–6), or simply when building tier1.csv for “top 1” card, pick the best card among 3P/4P/5P first; only use 6P if no strong shorter card.

---

### 5. **Same-Game / Same-Team Cap (Medium Impact)**

**Idea:** We already have cluster penalty (2+ legs same team+stat). Add: for 6-leg cards, cap **same-game** legs (e.g. max 2 legs from the same game). Reduces chance that one game script wipes the card.

**Why:** Same game = correlated outcomes. One blowout or rest night can miss multiple legs at once.

**Code:** In `build_innovative_cards`, when building candidates, reject (or penalize) combos that have more than 2 legs from the same `gameId` (if we have it) or same team pair. We have `team` and `opponent` on EvPick; we could infer “game” as `team + opponent` (sorted).

---

### 6. **Track Leg-Level Results (Calibration, Longer Term)** — Implemented

**Idea:** Log which legs we “played” (e.g. from tier1/tier2) and whether they hit (over hit = 1, under hit = 0). Over time, compute hit rate by stat, book, line-match type (exact vs alt), and adjust: e.g. downweight stats that hit below expectation.

**Why:** If we consistently overstate edge on certain stats or books, calibration will show it and we can tighten filters for those.

**Implementation:** DB: `data/perf_tracker.jsonl`. Init: `scripts/init_perf_tracker.ps1` + `src/backfill_perf_tracker.ts`. Scraper: `src/scrape_nba_leg_results.ts` + **ESPN live** (`src/espn_boxscore.ts`): scoreboard by date, summary box score per game (1s delay), no key. Calibration: `src/calibrate_leg_ev.ts` (buckets, Mult 0.8–1.5, under bias +0.05). Optimizer uses adjEv; CLI: `perf-report.ps1`, `track-results.ps1`. See `docs/PERF_TRACKER_ESPN.md`. Tests in prod.spec.ts (incl. mock ESPN).

**Code (original):** New small module or script: input = tier1/tier2 CSV + post-game results (manual or scraped). Output = hit rate by stat, book, fragile vs not. No change to optimizer until we have enough data; then add optional “calibration multipliers” per stat/book.

---

## Quick Wins to Implement First

1. **Tier1 = non-fragile only** (change `classifyTier` to take `fragile` and cap Tier1).
2. **Optional `--exact-line`** for daily run (or a “strict” mode that only uses legs with line delta 0).
3. **Slight bonus for 3P/4P/5P** in composite score so the “top” card isn’t always 6F.

These three don’t require new data and directly target fragile picks and line-match bias. After that, add same-game cap and trueProb haircut if you want to go further; calibration once you have enough result history.

---

## Summary Table

| Change                 | Impact | Effort | Reduces 0-for-6 by |
|------------------------|--------|--------|---------------------|
| Tier1 non-fragile only | High   | Low    | Fewer fragile legs in “lock” card |
| Stricter line match    | High   | Low–Med| Less overstated edge from line drift |
| TrueProb haircut       | Medium | Low    | Stricter leg filter |
| Prefer 3P/4P/5P for top| Medium | Low    | Lower variance on #1 card |
| Same-game cap          | Medium | Med    | Less correlation blowup |
| Calibration tracking   | High (long term) | Med | Data-driven downweight |

If you want, we can implement (1) Tier1 non-fragile and (2) optional exact-line or strict pool next in code.
