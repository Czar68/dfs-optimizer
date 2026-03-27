# Phase J — PP source / fair-prob attribution diagnosis

Purpose: isolate whether PP low-edge mass is mainly PP-source composition, fair-prob construction, or PP-vs-book alignment quality in the dominant `fairProbChosenSide >= 0.50` slice.

## Assumptions

- Read-only diagnostic run (`fetchPrizePicksRawProps` -> `mergeOddsWithPropsWithMetadata` -> `calculateEvForMergedPicks`) is representative for causal attribution.
- Prior funnel findings remain valid context (min-edge is largest drop stage).

## Files inspected

- `docs/CURRENT_STATE.md`
- `docs/ARCHITECTURE_GUARDRAILS.md`
- `docs/OPERATIONS_RUNBOOK.md`
- Runtime diagnostic output from Phase J command (JSON summary printed to terminal)

## Validation commands run

- One read-only command:
  - `node -e` script calling:
    - `fetchPrizePicksRawProps(['NBA'])`
    - `mergeOddsWithPropsWithMetadata(...)`
    - `calculateEvForMergedPicks(...)`
    - grouped summaries by fair-prob bucket/book/stat.

## Results

### 1) Dominant low-edge slice composition (`fairProbChosenSide >= 0.50`)

- Dominant slice size: **284 / 371** EV rows (**76.5%**)
- Slice pass rate (`edge >= 0.015`): **1 / 284 = 0.35%**
- Book shares inside dominant slice:
  - `PrizePicks`: **159** (56.0%)
  - `FanDuel`: **71** (25.0%)
  - `DraftKings`: **38** (13.4%)
  - others: **16** (5.6%)

### 2) Fair-prob/probability-input vs edge in PP-heavy vs non-PP-heavy

Within dominant slice (`fair>=0.50`):

- **PP-book rows**
  - n=159, pass=1 (0.63%)
  - mean edge: **+0.00021**
  - mean fairProb: **0.5000**
  - mean trueProb: **0.5002**
- **Non-PP-book rows**
  - n=125, pass=0 (0.0%)
  - mean edge: **-0.00479**
  - mean fairProb: **0.5122**
  - mean trueProb: **0.5074**

The differential strongly tracks **fairProb vs trueProb gap**:
- PP rows are almost neutral (`trueProb ~ fairProb`).
- Non-PP rows are negative (`trueProb` materially below `fairProb`).

### 3) What is the primary weakness?

**Dominant causal factor: fair-prob basis positioning at/above 0.50 in high-volume rows** (i.e., a broad fair-prob/true-prob alignment problem), not merely PP-source share.

Why:
- The dominant failure slice is defined by fair-prob bucket (`>=0.50`) with near-zero/negative edge mass.
- Both PP and non-PP rows are mostly failing there.
- Non-PP inside that slice is even weaker than PP, so “PP source composition alone” is insufficient.

### 4) Biggest recoverable opportunity slice

The largest opportunity by impact is **high-volume `fair>=0.50` rows where `trueProb` does not exceed fairProb enough to clear 0.015**.

Secondary small upside exists in `0.46–0.48` bucket (better pass rates but much lower volume).

## Required answers

1. In dominant low-edge slice, source/book share?  
   **PP 56%, FanDuel 25%, DraftKings 13.4%, others 5.6%.**

2. Fair-prob/probability/edge comparison PP-heavy vs non-PP-heavy?  
   **PP is near-neutral; non-PP is more negative in same fair>=0.50 slice.**

3. Main weakness?  
   **Fair-prob/true-prob alignment in high-volume fair>=0.50 rows (broad), not PP-source composition alone.**

4. Biggest recoverable slice?  
   **High-volume fair>=0.50 rows.**

5. Single next implementation phase?  
   **Phase K — PP fair-prob/source alignment hardening** focused on dominant fair>=0.50 rows (implementation phase; no EV formula/threshold policy change in this diagnosis phase).

## Files changed

- `docs/DIAGNOSIS_PHASE_J.md` (new)

## Exact behavior changed

- None (diagnosis-only).
