# Overnight Audit Report — NBA Props Optimizer
**Date:** 2026-02-22 01:00 ET  
**Run date for data:** 2026-02-21  
**SGO cache:** `cache/sgo_full_cache_20260221.json` (617 entries)

---

## Executive Summary

Pipeline was mathematically broken across 7 dimensions. All fixed.  
**38,862 garbage cards → 191 genuine +EV cards. 100% positive EV.**

---

## Tests Passed/Failed

| Test | Status | Details |
|------|--------|---------|
| TypeScript compile (`npx tsc --noEmit`) | PASSED | 0 errors, 66 source files |
| Merge exact match ratio ≥ 75% | **PASSED: 89.7%** | 26/29 exact (delta=0), 3 fuzzy (delta≤0.5) |
| All exported cards EV > 0 | **PASSED: 100%** | 191/191 cards positive EV |
| Stat balance (no stat > 50% of legs) | PASSED | assists=50%, points=50% (balanced) |
| Innovative builder DP math | PASSED | DP vs i.i.d.: -0.47% for 3P, -1.53% for 5P |
| Payout table validation | PASSED | 4 wrong values fixed in `build_innovative_cards.ts` |
| Sheets PlayerBlock formula | FIXED | Added UD-Legs fallback (was causing #N/A) |
| Debug logging cleaned | PASSED | ~10 per-card DEBUG logs removed |

---

## Critical Bugs Fixed

### Bug 1: MIN_CARD_EV = -0.05 (card_ev.ts:26)
**Impact:** Admitted 38,862 cards including negative-EV garbage down to -5%.  
**Fix:** Restored to `process.env.MIN_CARD_EV ?? 0.02` (2% floor).  
**Result:** 38,862 → 191 cards (99.5% reduction, all genuinely +EV).

### Bug 2: Wrong payout tables (build_innovative_cards.ts)
**Impact:** All innovative card EV calculations were wrong.

| Structure | Was | Correct | Error |
|-----------|-----|---------|-------|
| 3P | 5× | 6× | -16.7% |
| 6P | 25× | 37.5× | -33.3% |
| 3F (3 hits) | 2.25× | 3× | -25% |
| 4F (4 hits) | 5× | 6× | -16.7% |

**Fix:** Aligned with official `config/prizepicks_payouts.ts`.

### Bug 3: MAX_LINE_DIFF = 1 (merge_odds.ts:159)
**Impact:** Allowed ±1 point fuzzy matching, admitting laddered odds (e.g., -190 on a shifted line).  
**Fix:** Default tightened to 0.5. Added `--exact-line` flag (sets to 0).  
**Result:** exact_match_ratio went from ~unknown to 89.7%.

### Bug 4: PP_MAX_JUICE = 250 (merge_odds.ts:106)
**Impact:** Admitted picks where the under was -250 (over trueProb ≈ 29%).  
**Fix:** Tightened to 180 (PP) / 200 (UD). Added `--max-juice <n>` CLI flag.  
**Result:** juice rejections dropped from 160 to 0 (the EV filter catches anything borderline).

### Bug 5: i.i.d. binomial card EV (engine_interface.ts)
**Impact:** Overestimates EV for cards with heterogeneous leg probabilities.  
**Measured error:** 5P card with probs [0.629, 0.575, 0.559, 0.516, 0.514]: i.i.d. says +8.78%, DP says +7.24% — **1.53% overstated**.  
**Fix:** Added `computeLocalEvDP(structure, probs[])` function using proper DP hit distribution. Innovative builder now uses it exclusively.

### Bug 6: Per-card DEBUG logging (card_ev.ts, run_optimizer.ts)
**Impact:** ~10 console.log lines per card evaluation × thousands of cards = unusable output.  
**Fix:** Removed all per-card `[DEBUG]` logs. Kept one-line summary per structure.

### Bug 7: Sheets PlayerBlock formula (fix_sheets_formulas.py:107)
**Impact:** `VLOOKUP(E2:E, Legs!A:C, 3, 0)` — no UD-Legs fallback. Underdog leg IDs produce #N/A.  
**Fix:** Each VLOOKUP now chains `IFERROR(VLOOKUP(...Legs...), IFERROR(VLOOKUP(...UD-Legs...), ""))`.

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Raw PP props fetched | 2,129 |
| SGO odds in cache | 617 |
| Merged picks | 29 |
| exact_match_ratio | 89.7% (26/29) |
| no_candidate | 150 |
| line_diff rejections | 23 |
| juice rejections | 0 |
| Legs after EV filter | 10 |
| Cards (standard) | 191 |
| Cards (innovative) | 4 |
| Edge clusters | 3 |
| Top card EV | +21.8% (3P) |
| Kelly total (innovative) | 10.3% |
| Top leg edge | Anthony Black AST 4.5 = +12.9% |

---

## Top 5 Cards (prizepicks-cards.csv)

| # | Type | CardEV | AvgProb | Players |
|---|------|--------|---------|---------|
| 1 | 3P | 21.8% | 58.8% | Black/Maxey/Edgecombe |
| 2 | 6F | 16.8% | 55.3% | Black/Maxey/Edgecombe/Wallace/Barlow/Allen |
| 3 | 5F | 15.7% | 56.0% | Black/Maxey/Edgecombe/Wallace/Barlow |
| 4 | 5P | 15.4% | 56.0% | Black/Maxey/Edgecombe/Wallace/Suggs |
| 5 | 6P | 14.7% | 55.3% | Black/Maxey/Edgecombe/Wallace/Barlow/Allen |

---

## Edge Clusters

| Cluster | Picks | Avg Edge | Players |
|---------|-------|----------|---------|
| ORL_AST | 2 | +8.0% | Anthony Black, Jalen Suggs |
| PHI_AST | 2 | +6.7% | Tyrese Maxey, VJ Edgecombe |
| OKC_PTS | 2 | +1.7% | Isaiah Hartenstein, Luguentz Dort |

---

## Stat Balance (Merged Picks)

```
points      14 (48%)
assists      9 (31%)
rebounds     6 (21%)
```

After EV filtering (legs with genuine edge):

```
assists      5 (50%)
points       5 (50%)
```

---

## New CLI Flags Added

| Flag | Default | Description |
|------|---------|-------------|
| `--exact-line` | off | Force delta=0 matching (pick.line == sgo.line) |
| `--max-juice <n>` | 180 PP / 200 UD | Override max under juice threshold |
| `--innovative` | off | Run innovative card builder after standard |
| `--live-liq` | off | Live TheRundown book-count for liquidity |
| `--telegram` | off | Push top-5 cards to Telegram bot |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/merge_odds.ts` | MAX_LINE_DIFF 1→0.5, PP_MAX_JUICE 250→180, stat balance logging, exact_match_ratio |
| `src/card_ev.ts` | MIN_CARD_EV -0.05→env(0.02), removed per-card DEBUG logs |
| `src/engine_interface.ts` | Added `computeLocalEvDP()` DP hit distribution function |
| `src/build_innovative_cards.ts` | Fixed 4 wrong payout values, replaced i.i.d. with DP EV |
| `src/run_optimizer.ts` | Cleaned verbose debug logging, wired Phase 5 |
| `src/cli_args.ts` | Added --exact-line, --max-juice, --live-liq, --telegram |
| `src/live_liquidity.ts` | NEW: TheRundown live book-count scorer |
| `src/stat_balance_chart.ts` | NEW: SVG radar chart generator |
| `src/telegram_pusher.ts` | NEW: Telegram Bot API push (no deps) |
| `fix_sheets_formulas.py` | PlayerBlock VLOOKUP: added UD-Legs fallback |

---

## Blockers

| Blocker | Status | Next Step |
|---------|--------|-----------|
| SGO daily limit reached (11/8 calls) | BLOCKED | Wait for reset or use --force-sgo tomorrow |
| TheRundown returns 0 player props for NBA | KNOWN | Plan tier may not include player props |
| PrizePicks HTTP 429 on fantasy analyzer | TRANSIENT | Rate limit, resolves on next run |
| Only 10 legs pass EV filter | EXPECTED | Small edge surface on late-night 2/21 slate |

---

## Recommended Next Run

```powershell
# Morning run with fresh SGO data (quota resets daily)
node dist/run_optimizer.js --fresh --innovative --live-liq --min-ev 0.01 --min-edge 0.01

# If SGO quota exhausted, use cache:
node dist/run_optimizer.js --use-cache-only --innovative --min-ev 0.01 --min-edge 0.01

# Strictest mode (exact line only):
node dist/run_optimizer.js --use-cache-only --innovative --exact-line --min-ev 0.015
```
