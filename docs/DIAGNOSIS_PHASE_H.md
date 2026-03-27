# Phase H — Post-merge PP edge distribution attribution

Purpose: quantify where PP post-merge edge mass sits vs the `0.015` min-edge bar to determine whether losses are broad weakness, near-threshold clustering, or a narrow subset issue.

## Assumptions

- Two evidence views are used together:
  - **Established funnel run** (`latest_platform_survival_summary.json`, `2026-03-23T18:14:09 ET`): 705 post-EV PP legs, 40 above 0.015.
  - **Direct distribution diagnostic run** (Phase H script): raw->merge->EV on current live PP snapshot, giving full edge histogram.
- No policy changes were made; this phase is diagnosis-only.

## Distribution results (direct Phase H script)

Population analyzed after `calculateEvForMergedPicks`: **377** PP legs.

- Edge percentiles:
  - min **-0.0223**
  - p10 **-0.0081**
  - p25 **-0.0020**
  - p50 **0.0000**
  - p75 **0.0009**
  - p90 **0.0079**
  - p95 **0.0117**
  - max **0.0223**
  - mean **-0.00010**
- Threshold bands vs `0.015`:
  - `< 0.015`: **367 / 377 (97.3%)**
  - `0.0125–0.015` (near below): **5 / 377 (1.3%)**
  - `0.014–0.016` (tight near-threshold): **4 / 377 (1.1%)**
  - `>= 0.015`: **10 / 377 (2.7%)**
  - `>= 0.02`: **1 / 377 (0.3%)**
- Histogram:
  - `<0`: 110
  - `0–0.005`: 201
  - `0.005–0.01`: 36
  - `0.01–0.0125`: 15
  - `0.0125–0.015`: 5
  - `0.015–0.0175`: 3
  - `0.0175–0.02`: 6
  - `>=0.02`: 1

## Attribution of losses at `0.015`

### 1) What is the full post-merge PP edge distribution?

It is heavily concentrated around **zero edge** with a long thin positive tail; most mass sits below 0.01 and a meaningful chunk is negative.

### 2) How much mass is far below / near / comfortably above?

- **Far below 0.015:** dominant (97% below, mostly <= 0.01).
- **Near threshold:** very small (~1–1.3% in near-below bands).
- **Comfortably above:** tiny (2.7% >= 0.015, only 0.3% >= 0.02).

### 3) Are the dropped legs nowhere close, near-threshold, or split?

Predominantly **nowhere close**. The dropped set is not mainly clustered just below 0.015.

### 4) Broad weakness vs small calibration drift vs narrow subset?

Evidence points to **broad edge weakness** in the post-merge PP population, not a small near-threshold calibration drift and not a narrow recoverable subset.

### 5) Single next fix phase (one)

**Phase I — PP edge formation decomposition (upstream-only):** isolate why post-merge PP edges center near zero by decomposing edge inputs at merged-leg level (book/fair-prob basis, stat families, line buckets, and merge-source composition), still without changing thresholds or EV formulas.

## Cross-check with established 705->40 funnel

The established run still shows the same shape at threshold level:

- `afterEvCompute=705`
- `afterMinEdge=40` -> **665 / 705 (94.3%)** below 0.015

This matches the Phase H histogram conclusion: losses are broad, not near-threshold.

## Validation command run

`node -e` diagnostic invoking:
- `fetchPrizePicksRawProps(['NBA'])`
- `mergeOddsWithPropsWithMetadata(...)`
- `calculateEvForMergedPicks(...)`
- edge histogram + percentile/band summary print

No repository logic changes.
