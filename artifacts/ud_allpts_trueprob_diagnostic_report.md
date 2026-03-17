# UD All-PTS Cards and trueProb Inflation — Diagnostic Report

**Run:** 2026-03-13 17:09 UD output (live).  
**Scope:** Diagnose only; no code changes.

---

## Diagnostic 1 — trueProb distribution on UD legs

**Source:** `data/output_logs/underdog-legs.csv`

| Metric | Value |
|--------|--------|
| **Total row count** | 50 |
| **trueProb min** | 0.5053 |
| **trueProb max** | 0.8361 |
| **trueProb mean** | 0.5718 |
| **trueProb median** | 0.5203 |
| **trueProb p25** | 0.5130 |
| **trueProb p75** | 0.5835 |
| **trueProb p90** | 0.8094 |
| **Legs with trueProb > 0.70** | 7 |
| **Legs with trueProb > 0.75** | 5 |
| **Legs with trueProb > 0.80** | 5 |

**Top UD card legs (player, stat, line, trueProb, edge, matchType):**

`underdog-legs.csv` does **not** contain a `matchType` column. matchType is only in `merge_report_underdog.csv`. From the merge report, all of the following picks are **matched (Y, main)**:

| Player | Stat | Line | trueProb | edge | matchType (from merge report) |
|--------|------|------|----------|------|-------------------------------|
| Anthony Edwards | points | 19.5 | 0.8238 | 0.3238 | main |
| Scoot Henderson | points | 7.5 | 0.8094 | 0.3094 | main |
| Toumani Camara | points | 7.5 | 0.8361 | 0.3361 | main |
| Julius Randle | points | 11.5 | 0.8169 | 0.3169 | main |
| Rudy Gobert | points | 5.5 | 0.8302 | 0.3302 | main |
| Donte DiVincenzo | points | 7.5 | 0.7256 | 0.2256 | main |
| Naz Reid | points | 8.5 | 0.7076 | 0.2076 | main |
| Deni Avdija | points | 18.5 | 0.6940 | 0.1940 | main |

**Finding:** The top card legs have trueProb in the **0.69–0.84** range. These correspond to **heavy favorite odds** in the legs file (e.g. Anthony Edwards -750, Rudy Gobert -800, Toumani Camara -850). trueProb is derived from de-vigged implied probability, so the values are consistent with the odds; the “inflation” is that we are matching to **very low PTS lines** (e.g. Ant 19.5, Gobert 5.5) that books price as heavy favorites, and using those odds as-is for card EV. Compounding 8 such legs yields card EV in the +1600–1735% range (e.g. 0.78^8 × high payout multiplier).

---

## Diagnostic 2 — matchType breakdown on UD legs

**Note:** `underdog-legs.csv` has no `matchType` column. Match outcomes live only in `merge_report_underdog.csv` (one row per **raw** UD pick, 823 rows).

**From merge_report_underdog.csv:**

| reason | count |
|--------|-------|
| line_diff | 418 |
| ok | 326 |
| juice | 32 |
| ok_fallback | 25 |
| no_candidate | 22 |

| matchType | count |
|-----------|-------|
| (blank) | 472 |
| main | 326 |
| fallback_ud | 25 |

Only **matched** picks (main or fallback_ud) get odds and flow into `evPicks` → EV filter → `underdog-legs.csv`. So the **50 legs in underdog-legs.csv are all from matched picks** (351 matched total; 50 passed the EV filter). We cannot compute “avg trueProb for line_diff/juice legs” from the legs file because those picks never appear there.

**Are the top card legs matched or unmatched?**  
**All matched (main).** They have high trueProb because the **matched odds** are extreme favorites (e.g. -750, -800). Anthony Edwards 19.5 is matched to bestOddsLine 20.5 (main, 0.00 altDelta in report); Julius Randle 11.5 to 12.5; etc. So we are using main-line (or near) odds for very low lines that books price as heavy favorites.

---

## Diagnostic 3 — Stat distribution on UD legs

**Source:** `data/output_logs/underdog-legs.csv` (50 rows)

| stat | count | avgTrueProb | avgEdge |
|------|-------|-------------|---------|
| assists | 10 | 0.5389 | 0.0389 |
| points | 31 | 0.5980 | 0.0980 |
| rebounds | 9 | 0.5182 | 0.0182 |

**Observation:** Only **points**, **rebounds**, and **assists** appear in this run’s legs file. No **threes**, **blocks**, or **steals** in the 50 legs. The merge report does contain steals/blocks for some players (e.g. Rudy Gobert blocks 1.5, Toumani Camara steals 1.5), so UD offers those markets; they either did not pass the merge (line_diff/juice/no_candidate) or did not pass the EV filter. So non-PTS stats **are** present in the UD market and in the merge report, but **only PTS/REB/AST** appear in the 50 filtered legs, and **PTS dominates** (31/50) and has the highest average edge (0.098). So nothing is filtering out non-PTS by stat name; the EV filter and the ordering by `udAdjustedLegEv` favor high-edge legs, which in this slate are mostly PTS (and often very low, heavy-favorite PTS lines).

---

## Diagnostic 4 — Stat diversity enforcement on UD cards

**Where UD 8-leg cards are built:** `src/run_underdog_optimizer.ts`, function `buildUdCardsFromFiltered()` (lines 409–475).

**Logic (summary):**

1. Legs are sorted by **udAdjustedLegEv** (desc).
2. For each structure (standard + flex), `legsForStructure(sortedEv, structureId)` returns legs that meet minLegEv and (outside volume mode) trueProb ≥ breakeven + edgeFloor. **No stat-based filter.**
3. Cards are built by iterating **kCombinationsUd(legs, size, maxAttempts)**. The only constraint inside the combo loop is **no duplicate player** (`players.size < combo.length`).
4. **No stat diversity constraint:** no statBalance, no diversityScore, no cap on how many legs can share the same stat.
5. **No compositeScore.** Cards are sorted only by **card EV**:  
   `allCards.sort((a, b) => b.card.cardEv - a.card.cardEv);`
6. There is no use of diversity, correlation, liquidity, or avgScoringWeight for UD cards.

**Answers:**

- **Is there a stat diversity constraint on UD cards?**  
  **No.** There is no equivalent to PP’s statBalance or diversityScore. Any combo of 8 distinct players is allowed regardless of stat mix.

- **Is the same compositeScore formula (cardEV × diversity × (1−correlation) × liquidity × avgScoringWeight) applied to UD cards?**  
  **No.** UD card building does not use compositeScore. It uses **cardEv only** for ordering.

- **Does UD card building use a different path that lacks diversity enforcement?**  
  **Yes.** UD uses `buildUdCardsFromFiltered()` in `run_underdog_optimizer.ts` only. That path has **no** diversity or stat-balance enforcement; it purely maximizes card EV over combos of top `udAdjustedLegEv` legs (with distinct players). So all-PTS 8-leg cards dominate when PTS legs have the highest edge.

---

## Summary

1. **trueProb “inflation”:** The top UD card legs have trueProb 0.69–0.84 because they are **matched to very heavy favorite lines** (e.g. -750, -800). The math is consistent; the issue is that stacking 8 such legs and using the full payout table produces card EVs of +1600–1735%.
2. **All-PTS cards:** Legs are sorted by **udAdjustedLegEv**; the highest-edge legs in this slate are mostly **PTS** (and often very low PTS lines). With **no stat diversity** and **sort by card EV only**, the top 8P cards are 8 distinct players all on PTS.
3. **Non-PTS in legs file:** REB and AST are present (9 and 10 legs); no threes/blocks/steals in the 50 legs. So non-PTS are not removed by stat; they are just lower edge and get outranked by PTS in combo selection.

---

## Recommended fixes (from findings; do not implement in this task)

1. **Stat diversity for UD cards:** Add a constraint or penalty so that UD cards cannot be 100% one stat (e.g. require at least 2 distinct stat categories, or cap same-stat legs per card, or add a diversity term to a UD composite score).
2. **Cap or dampen extreme trueProb for card EV:** Consider capping per-leg trueProb (e.g. max 0.70) when computing card EV, or using a damped probability so that 8 × 0.82 legs don’t produce 0.78^8 and huge EV.
3. **UD composite score (optional):** Introduce a UD-side composite score (e.g. cardEV × diversity × …) and rank/serve cards by it so that stat-diverse cards can outrank all-PTS cards when EV is similar.
4. **Audit match line vs pick line:** For picks matched with altDelta or bestOddsLine ≠ pick line, consider whether using the matched line’s odds for the pick’s line inflates trueProb (e.g. 19.5 pick matched to 20.5 odds) and whether to adjust or flag.
