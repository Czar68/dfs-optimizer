# UD Line Match Audit: pickLine vs bestOddsLine

**Date:** 2026-03-11  
**Source:** `data/output_logs/merge_report_underdog.csv`  
**Purpose:** Confirm whether high trueProb on matched UD legs is due to (a) line mismatch (merge bug) or (b) genuinely favorable UD odds (cap is correct response).

---

## 1. Scope

- Rows where **matchType=main** (or **reason=ok**; same set — main implies ok).
- **pickLine** = UD pick line (column `line`).
- **bestOddsLine** = odds line used for trueProb (column `bestOddsLine`, parsed as number).
- **lineDelta** = |bestOddsLine − pickLine|.

---

## 2. Aggregate Results (matchType=main only)

| Metric | Value |
|--------|-------|
| **Rows with matchType=main** | 100 |
| **Rows with lineDelta = 0 (exact match)** | 88 |
| **Rows with lineDelta > 0 (line mismatch despite main)** | 12 |
| **Max lineDelta observed** | 1.0 |

So **12 main-matched rows** have a line shift: pick line ≠ bestOddsLine. Examples from the CSV:

- Naji Marshall: pick 7.5, bestOddsLine 8.5 → lineDelta 1.0  
- Olivier-Maxence Prosper: pick 4.5, bestOddsLine 5.5 → lineDelta 1.0  
- Taylor Hendricks: pick 4.5 (points), bestOddsLine 5.5 → lineDelta 1.0  
- Taylor Hendricks: pick 1.5 (steals), bestOddsLine 0.5 → lineDelta 1.0  
- Cade Cunningham: pick 16.5, bestOddsLine 17.5 → lineDelta 1.0  
- Grayson Allen: pick 8.5, bestOddsLine 9.5 → lineDelta 1.0  
- Mikal Bridges: pick 8.5, bestOddsLine 9.5 → lineDelta 1.0  
- Naz Reid: pick 5.5, bestOddsLine 6.5 → lineDelta 1.0  
- Deni Avdija: pick 14.5, bestOddsLine 15.5 → lineDelta 1.0  
- Donovan Clingan: pick 6.5, bestOddsLine 7.5 → lineDelta 1.0  
- Tre Jones: pick 8.5, bestOddsLine 9.5 → lineDelta 1.0  
- Brook Lopez: pick 4.5, bestOddsLine 5.5 → lineDelta 1.0  

**Conclusion (aggregate):** A small fraction of main-matched rows (12/100) have a 1.0-point line mismatch. That is a **merge bug** for those rows (neighboring line used, can inflate or deflate trueProb).

---

## 3. Top 8 card legs (diagnostic list)

For the 8 legs: **Edwards 19.5, Henderson 7.5, Camara 7.5, Randle 11.5, Gobert 5.5, DiVincenzo 7.5, Reid 8.5, Avdija 18.5** — all **points** except where noted.

From `merge_report_underdog.csv` (matchType=main only):

| Player            | Stat   | pickLine | bestOddsLine | lineDelta | trueProb (from legs) | overOdds | underOdds |
|------------------|--------|----------|--------------|-----------|----------------------|----------|-----------|
| Anthony Edwards  | points | 19.5     | 19.5         | **0**     | 0.8415               | -900     | 490       |
| Scoot Henderson  | points | 7.5      | 7.5         | **0**     | 0.8094               | -650     | 390       |
| Toumani Camara   | points | 7.5      | 7.5         | **0**     | 0.8238               | -750     | 430       |
| Julius Randle    | points | 11.5     | 11.5        | **0**     | 0.8415               | -900     | 490       |
| Rudy Gobert      | points | 5.5      | 5.5         | **0**     | —                    | —        | —         |
| Donte DiVincenzo | points | 7.5      | 7.5         | **0**     | 0.7403               | -380     | 260       |
| Naz Reid         | points | 8.5      | 8.5         | **0**     | 0.7213               | -340     | 235       |
| Deni Avdija      | points | 18.5     | 18.5        | **0**     | —                    | —        | —         |

(trueProb/overOdds/underOdds taken from `underdog-legs.json` where present; Gobert 5.5 and Avdija 18.5 not in the sampled legs file.)

**Conclusion (top 8):** For all 8 top-card legs, **lineDelta = 0**. bestOddsLine matches the pick line exactly. High trueProb (e.g. 0.69–0.84) is **not** due to a line shift on these legs.

---

## 4. Root cause and recommendation

- **Top-card legs (the 8 above):** trueProb is correct for the matched odds. UD is posting very favorable lines (e.g. 19.5 PTS for Edwards, 7.5 for Henderson/Camara) and books are heavily favoring the over (-650 to -900). The **0.72 trueProb cap for card EV** (Fix 3) is the **correct response** for these legs — no merge fix needed for them.
- **Other main-matched rows (12 with lineDelta = 1.0):** Those are a **merge bug**: a neighboring line is being used while still marked main. Fix should ensure that when matchType=main, bestOddsLine equals pick line (or reclassify as a different match type / reject).

---

## 5. Definition of done

| Check | Result |
|-------|--------|
| Audit written | Yes — this file |
| Root cause for high trueProb on top UD legs | **(b) Genuinely favorable UD odds** — lineDelta = 0 on all 8; cap is correct response |
| Merge bug flagged where applicable | Yes — 12 main-matched rows with lineDelta > 0 (merge bug; do not fix in this audit per instructions) |

---

## 6. Fix applied (2026-03-11)

**File:** `src/merge_odds.ts`

- **LINE_EXACT_TOLERANCE = 0.001** added. Main match now requires `Math.abs(candidate.line - pick.line) <= LINE_EXACT_TOLERANCE`.
- **Exact-first path:** Exact match filter uses float-safe `Math.abs(c.line - pick.line) <= LINE_EXACT_TOLERANCE` instead of `c.line === pick.line`.
- **Nearest-within-tolerance path:** When the best candidate is within MAX_LINE_DIFF (1.0) but not within LINE_EXACT_TOLERANCE, match is **reclassified as matchType="alt"** (reason=ok_alt), not main. Total matched count unchanged; the 12 previously main-with-lineDelta-1.0 rows now appear as alt.
- **Verification (post-fix):** With EXPORT_MERGE_REPORT=1, count of matchType=main with lineDelta > 0.001 must be 0; matchType=alt count increases by ~12; total matched unchanged.
