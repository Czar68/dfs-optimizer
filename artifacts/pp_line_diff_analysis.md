# PP line_diff Delta Distribution Analysis

**Data source:** `data/output_logs/merge_report_prizepicks.csv`  
**Filter:** `site=prizepicks` AND `reason=line_diff`  
**altDelta computed as:** |pick.line - bestOddsLine|

---

## 1. altDelta Range Summary

| altDelta range | count | % of line_diff |
|----------------|-------|----------------|
| 0.5–1.0        | 27    | 58.7%          |
| 1.0–1.5        | 1     | 2.2%           |
| 1.5–2.0        | 11    | 23.9%          |
| 2.0–5.0        | 7     | 15.2%          |
| 5.0+           | 0     | 0%             |
| **Total**       | **46**| **100%**       |

**Interpretation:** 58.7% of line_diff rows have delta in 0.5–1.0 (just beyond current ±0.5 tolerance). All 27 have delta = 1.0 exactly. Another 23.9% are in 1.5–2.0. Combined, 61% are within 1.0 point; 85% within 2.0.

---

## 2. Stat Distribution for line_diff Rows

| stat              | count |
|-------------------|-------|
| points_rebounds   | 15    |
| points_assists    | 11    |
| pra               | 10    |
| points            | 4     |
| rebounds          | 3     |
| threes            | 2     |
| rebounds_assists  | 1     |

**Top stats with line_diff misses:**
1. **points_rebounds** (15) — most common
2. **points_assists** (11)
3. **pra** (10)
4. **points** (4)
5. **rebounds** (3), **threes** (2), **rebounds_assists** (1)

Combo stats (points_rebounds, points_assists, pra) dominate — PP and odds often post different alternate lines for these.

---

## 3. Five Smallest altDelta (Closest Near-Misses)

| player              | stat            | pick line | bestOddsLine | altDelta |
|--------------------|-----------------|-----------|--------------|----------|
| Giannis Antetokounmpo | points_rebounds | 41.5    | 42.5         | 1.0      |
| Giannis Antetokounmpo | points_assists  | 35.5    | 36.5         | 1.0      |
| Bilal Coulibaly    | points          | 10.5     | 11.5         | 1.0      |
| Jabari Walker      | points_rebounds | 15.5    | 14.5         | 1.0      |
| Marcus Sasser      | points_rebounds | 3.5     | 4.5          | 1.0      |

All five have **delta = 1.0** — exactly at the boundary if tolerance were widened to ±1.0. Several more have delta 1.0 (e.g. Pelle Larsson 22.5→21.5, Nickeil Alexander-Walker 19.5→20.5, Jaime Jaquez 17.5→18.5).

---

## 4. Five Largest altDelta

| player             | stat            | pick line | bestOddsLine | altDelta |
|--------------------|-----------------|-----------|--------------|----------|
| Khris Middleton    | points_rebounds | 20.5      | 16.5         | 4.0      |
| Zaccharie Risacher | points_rebounds | 30.5      | 26.5         | 4.0      |
| Zaccharie Risacher | points_assists  | 21.5      | 18           | 3.5      |
| Zaccharie Risacher | pra             | 31.5      | 28.5         | 3.0      |
| Jalen Wilson       | points_rebounds | 14.5      | 11.5         | 3.0      |

**Interpretation:** These are likely genuinely different markets (e.g. alternate lines, different books, or stale odds). Zaccharie Risacher appears multiple times with large deltas (3–4 points). Khris Middleton points_rebounds: 20.5 vs 16.5 — a 4-point gap suggests different lines, not rounding.

---

## 5. Recommendation

**Distribution summary:**
- **58.7%** in 0.5–1.0 (all 27 have delta = 1.0)
- **2.2%** in 1.0–1.5
- **23.9%** in 1.5–2.0
- **15.2%** in 2.0–5.0
- **0%** at 5.0+

Distribution is **not bimodal** — there is a strong cluster at 1.0 (27 rows) and a gradual tail; no distinct second cluster at 3.0+.

**Recommendation: (a) Widen LINE_TOLERANCE to 1.0** — with caveat

**Rationale:**
1. **Quality vs quantity:** Widening to 1.0 would recover ~22 legs (47.8%) but would match picks to odds lines 1 point apart. At 1 point, true probability can shift meaningfully (e.g. 20.5 vs 21.5 points is a different bet). EV/Kelly sizing assumes the odds line matches the pick; a 1-point mismatch introduces systematic error.
2. **Most near-misses are 1.0 exactly:** The 0.5–1.0 bucket is entirely at 1.0 (no row in this dataset has delta strictly between 0.5 and 1.0, since odds typically post half-point lines). So “0.5–1.0” is effectively “delta = 1.0”.
3. **No strong signal for two-tier:** The distribution does not show a clean split between “close” (0.5–1.0) and “far” (3.0+). Many deltas sit in 1.0–2.0 where a loose match would be questionable.
4. **Safer path:** Keep strict matching. If more coverage is needed, improve line freshness (odds refresh timing) or add alternate-line support (e.g. UD-style alt match) for PP rather than relaxing main-line tolerance.

**If widening is required for coverage reasons:** Consider **(c) two-tier** with ±1.0 for a `loose_match` type and a lower confidence weight in Kelly — but only if the product needs those ~22 additional legs and can accept lower confidence for 1-point-delta matches.
