# Phase I — PP edge formation decomposition

Purpose: decompose PP post-merge edge formation by upstream dimensions to explain why edge mass centers below `0.015` without changing EV formulas, thresholds, or optimizer behavior.

## Assumptions

- The Phase I diagnostic run (live PP fetch + cached fresh OddsAPI rows + merge + EV compute) is representative enough for slice attribution.
- We keep the previously established funnel context from `latest_platform_survival_summary.json` (`705 -> 40` at min-edge) as baseline stage behavior.

## Method (read-only diagnostics)

- Read-only decomposition command executed in repo root:
  - `fetchPrizePicksRawProps(['NBA'])`
  - `mergeOddsWithPropsWithMetadata(raw, cli)`
  - `calculateEvForMergedPicks(mergedPP)`
  - Group EV legs by: `stat`, `book`, `lineBucket`, `fairProbChosenSide` bucket, `side`
  - Compute `n`, `mean edge`, `pass count` (`edge >= 0.015`), `pass rate`, `p90 edge`

## Core results

- Total post-merge PP EV rows: **371**
- Below min-edge (`< 0.015`): **360 / 371 = 97.0%**
- At/above min-edge (`>= 0.015`): **11 / 371 = 3.0%**
- Near-threshold below (`0.0125–0.015`): **5 / 371 = 1.35%**
- Median edge is near zero/negative; mean edge slightly negative.

Interpretation: losses are **broadly low-edge**, not a near-threshold pile-up.

## Dimension breakdown (what explains weak edge formation)

### 1) Fair-probability basis (strongest explanatory axis)

This is the most separative dimension by pass rate:

- `fairProbChosenSide >= 0.50`: **284 rows**, pass **1** (**0.35%**), mean edge **-0.0020**
- `0.48–0.50`: **64 rows**, pass **2** (**3.1%**), mean edge **+0.0035**
- `0.46–0.48`: **20 rows**, pass **5** (**25%**), mean edge **+0.0124**
- `< 0.46`: **3 rows**, pass **3** (**100%**), mean edge **+0.0175**

**Conclusion:** Most PP post-merge legs sit in high fair-probability buckets where computed edge is near/under zero; positive-edge outliers come disproportionately from lower fair-probability buckets.

### 2) Book/source

- Largest volume source is `PrizePicks` book rows (**159**) with pass rate **0.6%**.
- `FanDuel` contributes many of the limited winners: **120 rows**, pass **8** (**6.7%**).
- `DraftKings`: **71 rows**, pass **2** (**2.8%**).
- Remaining books are low-volume and mostly non-passing.

**Conclusion:** Outliers are not evenly distributed; they are mostly tied to specific non-PP book slices (especially FanDuel) while PP-book-dominant rows are mostly sub-threshold.

### 3) Stat family

High-volume stat families (`pra`, `points_rebounds`, `points`, `points_assists`, `rebounds`, `rebounds_assists`) all have low pass rates (mostly ~0–6%).
Only `threes` shows a higher pass rate (**20%**) but on tiny sample size (**10 rows**) and thus does not move total mass.

**Conclusion:** Weakness is broad across major stat families, not isolated to one dominant stat.

### 4) Line bucket

Pass rates are similarly low across major buckets (~2.8–3.8%) with one zero-pass bucket (`15–20`, n=46). No single line bucket dominates both volume and pass.

### 5) Side

All rows are `over` in this post-merge set (`n=371`), so side is not separative for this run.

## Required answers

1. Which upstream dimensions best explain weak PP edge formation?  
   **Fair-probability basis (dominant), then source/book composition.**

2. Dimension breakdown performed?  
   **Yes** — stat family, sportsbook/source, line bucket, fair-prob buckets, side.

3. Worst edge concentration slices?  
   High-volume `fairProbChosenSide >= 0.50` bucket and PP-book-dominant rows.

4. Slices producing limited positive outliers?  
   Lower fair-prob buckets (`<0.48`) and a subset of `FanDuel` rows; minor contribution from small `threes` slice.

5. Single upstream fix target to prioritize next?  
   **Improve PP merged-leg probability basis quality (fair-prob / source mix) so high-volume rows stop clustering around near-zero edge** — this is upstream of min-edge gating and does not require policy tuning.

## Single next fix phase recommendation

**Phase J — PP source/fair-prob quality hardening diagnostics-to-action** (targeted to high-volume PP slices with `fairProbChosenSide >= 0.50` and PP-book dominance), while keeping EV/threshold logic unchanged.
