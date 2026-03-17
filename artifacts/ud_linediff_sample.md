# UD line_diff Sample Analysis

**Source:** `data/output_logs/merge_report_underdog.csv` (read-only)  
**Date:** 2026-03-11  
**Scope:** All 281 rows with `reason=line_diff`. No code changes.

---

## 1. Ten sample line_diff rows

| player            | stat   | pickLine | bestOddsLine | delta  |
|-------------------|--------|----------|--------------|--------|
| Cooper Flagg      | points | 32.5     | 29.5         | -3.00  |
| Cooper Flagg      | points | 11.5     | 13.5         | 2.00   |
| Cooper Flagg      | points | 4.5      | 13.5         | 9.00   |
| Donovan Mitchell  | points | 10.5     | 19.5         | 9.00   |
| James Harden      | points | 5.5      | 14.5         | 9.00   |
| Donovan Mitchell  | points | 8.5      | 19.5         | 11.00  |
| James Harden      | points | 7.5      | 14.5         | 7.00   |
| Evan Mobley       | points | 31.5     | 25.5         | -6.00  |
| Klay Thompson     | points | 15.5     | 12.5         | -3.00  |
| Khris Middleton   | points | 17.5     | 11.5         | -6.00  |

**Delta** = bestOddsLine − pickLine (sharp main line minus UD pick line).

---

## 2. Aggregate patterns (281 line_diff rows)

### Most common pickLine values (UD)

| pickLine | count |
|----------|-------|
| 3.5      | 32    |
| 4.5      | 28    |
| 5.5      | 27    |
| 6.5      | 24    |
| 7.5      | 14    |
| 8.5      | 13    |
| 20.5     | 10    |
| 11.5     | 9     |
| 10.5     | 9     |
| 9.5      | 8     |
| 15.5     | 7     |
| 16.5     | 7     |
| 22.5     | 6     |
| 18.5     | 6     |
| 13.5     | 6     |

UD pick lines cluster at **low values (3.5–8.5)** and a few mid/high (e.g. 20.5).

### Most common bestOddsLine values (sharp / OddsAPI main)

| bestOddsLine | count |
|--------------|-------|
| 12.5         | 37    |
| 10.5         | 29    |
| 17.5         | 24    |
| 13.5         | 21    |
| 11.5         | 21    |
| 15.5         | 20    |
| 9.5          | 15    |
| 21.5         | 15    |
| 19.5         | 14    |
| 7.5          | 14    |
| 14.5         | 13    |
| 20.5         | 11    |
| 24.5         | 8     |
| 26.5         | 7     |
| 29.5         | 4     |

Sharp main lines cluster in the **10–21** range. There is no sharp main at 3.5, 4.5, 5.5, 6.5 in this set — those are UD-only lines.

### Delta direction

- **Positive (sharp > UD):** 171 rows — UD pick line **below** sharp main (e.g. UD 5.5 vs sharp 17.5).
- **Negative (sharp < UD):** 110 rows — UD pick line **above** sharp main (e.g. UD 32.5 vs sharp 29.5).
- **Zero:** 0 rows.

Direction is **mixed**: both “UD easier” (lower line) and “UD harder” (higher line) appear. So the gap is not one-sided.

---

## 3. Player patterns

- **Unique players in line_diff:** 94.
- **Rough split:** ~76 rows from a “stars” subset (Cooper Flagg, Donovan Mitchell, James Harden, Cade Cunningham, Devin Booker, Jalen Brunson, Anthony Edwards, Scottie Barnes, Julius Randle, Rudy Gobert, Donte DiVincenzo, Naz Reid, Scoot Henderson, Kawhi Leonard, Kevin Durant, Zion Williamson, etc.), ~205 from other players.
- **Conclusion:** line_diff is **not** limited to stars; it affects both high-volume scorers and role players. So it’s not only “boosted star lines” but a broad mix of player types.

---

## 4. Cross-check: three high-delta examples

We don’t have live “today’s slate” or UD vs OddsAPI side-by-side here; inference is from the report only.

### Example 1 — Anthony Edwards, points (delta +16)

- **UD pickLine:** 3.5  
- **bestOddsLine (sharp):** 19.5  
- **Interpretation:** UD is offering a **very low** line (3.5). OddsAPI’s main market for this player/stat is at 19.5. So UD is a **different product** (e.g. “over 3.5” vs “over 19.5”) — not the same line with a small mismatch.

### Example 2 — Kawhi Leonard, points (delta +16)

- **UD pickLine:** 5.5  
- **bestOddsLine (sharp):** 21.5  
- **Interpretation:** Same pattern: UD 5.5 vs sharp 21.5. UD is offering an alternate / “boost” style line; sharp main is the standard points line.

### Example 3 — Donovan Clingan, points (delta −17.85)

- **UD pickLine:** 35.35  
- **bestOddsLine (sharp):** 17.5  
- **Interpretation:** UD is offering a **very high** line (35.35). Sharp main is 17.5. Again a different product (e.g. “over 35.35” vs “over 17.5”), not a rounding or data artifact.

**Cross-check summary:** For these three, UD and OddsAPI are **different products** (different line levels). UD posts many lines (low and high) that do not coincide with the sharp main line; the gap is **product difference**, not a small data/matching error.

---

## 5. Conclusion

- **Structural (UD intentionally different lines):**  
  - UD offers many **alternate** lines (e.g. 3.5–8.5 and high lines like 33–43) that are not the main market in OddsAPI (10–21 for points).  
  - Delta is **mixed** (positive and negative); both “UD easier” and “UD harder” lines appear.  
  - 94 players and both stars and non-stars are involved.

- **Not primarily a matching artifact:**  
  - The report compares **UD pick line** to **nearest sharp main line**. When UD posts 5.5 and sharp main is 17.5, that’s a real product gap (different lines), not something fixable by tightening match logic.  
  - We can only “fix” in our pipeline by: (1) using **alt-line** OddsAPI data when available (already attempted), or (2) accepting **wider line tolerance** and labeling as alt (e.g. alt_ud) so we don’t drop those legs — at the cost of using a different line’s odds for trueProb.

**Bottom line:** The line_diff gap is **mostly structural** — UD intentionally offers many lines that are not the sharp main line. Our merge correctly flags them as line_diff when they’re beyond tolerance. Recovery (e.g. alt_ud within 1.5) helps only when UD’s line is close to a main or alt line we have; it does not fix the large, intentional product differences like 3.5 vs 19.5.
