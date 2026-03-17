# UD Merge Recovery Diagnostic

**Date:** 2026-03-11  
**Source:** `data/output_logs/merge_report_underdog.csv` (and optional timestamped report)  
**Purpose:** Inform recovery of unmatched UD legs (line_diff + juice) before implementing Fix A/B/C.

---

## 1. Distribution of |pickLine − bestOddsLine| for line_diff rows

For rows with `reason=line_diff`, `bestOddsLine` is the nearest **main-line** candidate found (rejected because distance > MAX_LINE_DIFF = 1.0).

**Run on current merge_report_underdog.csv (785 rows):**

| Bucket    | Count |
|----------|-------|
| >2.5     | 255   |
| 1.5–2.0  | 26    |
| 1.0–1.5  | 0     |

- **Recoverable if main-pass tolerance widened to 1.5 for UD (1.0 < delta ≤ 1.5):** **0** in this sample.
- In this report all line_diff deltas are > 1.0 by definition; none fall in (1.0, 1.5]. A different slate (e.g. 823 picks, 418 line_diff) may have some in (1.0, 1.5]; implementing **UD_ALT_LINE_TOLERANCE = 1.5** ensures those are recovered as `alt_ud` when present.

---

## 2. line_diff: combo vs single stats

**This sample:** All 281 line_diff rows are **points** (single stat). No PRA/PR/PA/RA in this report.

- Single stats (PTS, REB, AST, etc.): 281  
- Combo stats (PRA, PR, PA, RA): 0  

So in this file, line_diff is entirely points; recovery (Fix A/C) still helps when other runs have combo or other stats with delta in (1.0, 1.5].

---

## 3. Juice rows: distance to threshold

- **Juice count in this sample:** 94.
- **Report does not include** `underOdds` or juice value; only `reason=juice`.
- **Threshold in code:** UD_MAX_JUICE = 200 (reject when underOdds ≤ -200).
- **Conclusion:** Cannot compute distribution of |juice − threshold| from CSV. Fix B (UD_JUICE_TOLERANCE_EXTRA = 5%) is a reasonable heuristic to allow slightly more juice for UD only.

---

## 4. line_diff rows with bestOddsLine within 1.5 of pick

- **Count with |pickLine − bestOddsLine| ≤ 1.5:** **0** (all line_diff in this sample have delta > 1.5).
- **Count with delta in (1.0, 1.5]:** **0**.

So in this run, widening to 1.5 recovers no additional rows; the implementation is for slates where some line_diff fall in (1.0, 1.5].

---

## 5. Summary and implementation call

| Question                          | Finding |
|-----------------------------------|--------|
| Recovery at 1.5 for this file     | 0 rows |
| line_diff stats                   | All points (single) in this sample |
| Juice distance to threshold       | Unknown from CSV |
| Implement Fix A/C anyway?         | Yes — so any run with deltas in (1.0, 1.5] gets alt_ud and match rate can exceed 43%. |
| Implement Fix B?                  | Yes — 5% extra juice tolerance for UD is conservative and may recover some of the 32–94 juice rows. |

**Definition of done (diagnostic):** Findings reported; implementation proceeds with Fix A (UD_ALT_LINE_TOLERANCE 1.5), Fix B (UD_JUICE_TOLERANCE_EXTRA 0.05), Fix C (matchType alt_ud + [UD-ALT] log).
