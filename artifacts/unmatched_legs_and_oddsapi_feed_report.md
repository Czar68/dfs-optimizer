# Unmatched Legs Fate & PP/UD OddsAPI Feed — Investigation Report

**Date:** 2026-03-13  
**Scope:** Report only; no code changes.

---

## PART 1 — What Happens to Unmatched Legs Today

### 1.1 Trace: fate of unmatched props in merge_odds.ts

- **When `matched = N`:** The prop is **not** added to the `merged` array. The merge loop does:
  - If `findBestMatchForPickWithReason` returns a **failure** (`"reason" in result`): it increments diagnostics (`noCandidate`, `lineDiff`, or `juice`), pushes a row to `mergeReportRows` with `matched: "N"` and `reason`, then **`continue`** — so it never reaches `merged.push(...)`.
  - Only when the result is a **success** (has `result.match`) does the code compute `trueOverProb`/`trueUnderProb` and push to `merged`.
- **Conclusion:** Unmatched props are **excluded from the merged output**. They do **not** get a fallback trueProb and do **not** appear in legs/cards.

### 1.2 Where merge output is consumed (run_optimizer.ts)

- `mergeResult = await mergeWithSnapshot(raw, oddsSnapshot.rows, ...)` → `merged = mergeResult.odds`.
- `merged` is then passed to `calculateEvForMergedPicks(merged)` → `withEv`.
- Only **merged** picks get EV calculated and flow into legs/cards. Unmatched picks never enter this pipeline.

Relevant lines:

- 1208–1211: `mergeResult = await mergeWithSnapshot(...)`, `merged = mergeResult.odds`, `crashStats.mergedLegs = merged.length`
- 1220–1226: PP guardrail uses `mergeResult.platformStats?.prizepicks`
- 1244: `withEv = await calculateEvForMergedPicks(merged)`

### 1.3 MIN_MATCH_RATE guardrail

- **Yes.** There is a guardrail that can kill the whole run:
  - **PP:** `GUARDRAIL_PP_MERGE_MIN_RATIO = 0.12` (12%). If `(mergedExact + mergedNearest) / rawProps < 0.12`, the process exits with a fatal error and does not ship.
  - **UD:** In `run_underdog_optimizer.ts`, `GUARDRAIL_UD_MERGE_MIN_RATIO = 0.10` (10%). Same idea.
- So if too many props are unmatched, the run aborts (unless `--no-guardrails` is used).

### 1.4 Fallback trueProb for unmatched?

- **No.** Unmatched props are never pushed to `merged`, so they never get `trueProb`, `fairOverOdds`, or `fairUnderOdds`. They are simply dropped from the EV/leg/card pipeline.

### 1.5 Exact fate of an unmatched prop

| Aspect | Behavior |
|--------|----------|
| **In merged array** | No — dropped. |
| **In merge report CSV** | Yes — when `EXPORT_MERGE_REPORT=1`, a row is written with `matched: "N"`, `reason` (no_candidate / line_diff / juice), `bestOddsLine`, `bestOddsPlayerNorm`. |
| **Console log** | Only if `debugMatching` is on: `[MATCH_FAIL] no_candidate: ...` or `[MATCH_FAIL] line_diff: ...`. No dedicated log for juice-only failures. |
| **Summary** | **Dropped from pipeline, with a row in the merge report CSV; optional console log only in debug.** |

---

## PART 2 — PP/UD Lines in the OddsAPI Feed

### 2.1 Cache structure and script note

- OddsAPI data is stored in:
  - **Quota cache:** `data/odds_cache.json` — shape `{ ts, ttl, remaining, data: PlayerPropOdds[] }`.
  - **Per-sport cache:** `cache/oddsapi_props_cache_basketball_nba.json` — shape `{ fetchedAt, data: PlayerPropOdds[] }`.
- Each row uses **`player`** and **`book`** (not `playerName`). Scripts must use `r.player` and `r.book`.

### 2.2 Current cache vs. fresh run (from merge_quality_audit.md)

- **Current repo `data/odds_cache.json`:** Mock data only (4 rows, all DraftKings). So **PP rows: 0, UD rows: 0** in the checked-in cache.
- **From a fresh run with full OddsAPI fetch** (artifacts/merge_quality_audit.md):
  - **Total OddsAPI rows:** 5,784 (main + alt).
  - **PrizePicks:** 610 rows.
  - **Underdog:** 453 rows.
  - **Books in feed:** FanDuel, theScore Bet, DraftKings, **PrizePicks**, **Underdog**, BetMGM, DK Pick6, Pinnacle, etc.
  - **Stats covered:** points, rebounds, threes, assists, pra, points_rebounds, points_assists, rebounds_assists, blocks, steals (same markets as in REQUIRED_MARKETS + alternate).

So when the pipeline runs with a **live** fetch, PP and UD **are** present in the OddsAPI feed.

### 2.3 Odds shape of PP/UD rows in the feed

- **PlayerPropOdds** (and thus OddsAPI cache rows) include:
  - `overOdds`, `underOdds` (American odds).
  - **No** stored implied probability field; implied prob is derived via `americanToProb()` in merge_odds when building trueProb.
- So PP/UD rows in the feed **do** have `overOdds` and `underOdds`. We can devig them to get an implied/true probability.

### 2.4 Cross-reference: unmatched props vs. PP/UD rows in OddsAPI

- From the audit (fresh cache, 5,784 rows):
  - **PP unmatched:** 180 total (169 no_candidate, 11 line_diff). Of the 169 no_candidate, **153** are “no OddsAPI data at all” (mostly **combo props** — OddsAPI does not carry multi-player combos). So only a small number of PP unmatched could potentially have a PP book row in OddsAPI for the same player/stat/line.
  - **UD unmatched:** 415 total (line_diff 287, no_candidate 78, juice 50). Many line_diff are **escalator-style lines** (e.g. 4.5, 7.5, 11.5 pts) where sharp main lines are 20.5+; no close line in the feed. For “main close but failed” (20 UD rows): 13 juice, 7 no_candidate (e.g. name mismatch).
- **How many could be “self-matched” to PP/UD OddsAPI rows?**
  - **PP:** Most unmatched are combos (no comparable row in any book) or line_diff. The 610 PP rows in the feed are the **same** lines PP offers; if a PP pick already failed to match a **sharp** book at that line, it could still match the **PP** row in the feed (same player/stat/line). So in theory, many of the non-combo PP unmatched could get a match to a PP OddsAPI row if we allowed “match to same book as site.”
  - **UD:** Similarly, the 453 UD rows could be used to self-match UD picks that currently fail (no_candidate, juice, or line_diff against sharp books only). The audit’s “alt would match” (39 legs) is about matching to **another book’s** alt line; self-matching to UD’s own rows in the feed would be a separate strategy.

So: a substantial share of **currently unmatched** props could be turned into “matched” if we allowed using PP/UD OddsAPI rows as the match source (same player/stat/line), at the cost of using their odds for trueProb instead of sharp books.

### 2.5 Current merge purpose (why we merge against sharp books)

- **Purpose:** Obtain **sharp-book odds** for the same (or near) line, then:
  - **Devig** (`devigTwoWay(americanToProb(overOdds), americanToProb(underOdds))`) to get **trueOverProb** / **trueUnderProb**.
  - Use that **trueProb** as the probability anchor for EV (and optionally multi-book consensus when several sharp books have the same line).
- **Relevant code (merge_odds.ts):**
  - Phase 7.3: “sharp-weighted de-vig across all matching books” — `getEffectiveBookWeight(bm.book, dynamicBookAccuracy)`.
  - Multi-book: weight-averaged devigged probabilities; single-book: devig of that match’s over/under.
- **Book ranker:** `PROP_WEIGHTS` in `book_ranker.ts` lists DraftKings, Pinnacle, FanDuel, BetMGM, etc. **PrizePicks and Underdog are not in the list**; they get `DEFAULT_WEIGHT` (1.0, “unknown” / square).
- So we merge for **both**:
  1. **Line:** find a market at the same (or acceptable) line.
  2. **True probability:** use sharp-book odds to derive a de-vigged trueProb; PP/UD in the feed are not treated as sharp.

### 2.6 Are PP/UD OddsAPI odds good enough for trueProb?

- **Theoretical:** We *can* derive a trueProb from PP/UD rows (they have overOdds/underOdds; we can devig). So technically they are “good enough” to compute a number.
- **Quality:** DFS books (PrizePicks, Underdog) often have **different pricing** (promos, flex payouts, hold). Using them as the **only** source for trueProb would:
  - Anchor our EV to their hold/juice rather than to sharp books.
  - Likely **bias** edge estimates (e.g. overstate edge if PP/UD odds are softer, or understate if they are sharper on some markets).
- **Recommendation (see below):** Use as **fallback** only when no sharp-book match exists, and optionally flag or down-weight such legs.

---

## Summary Table

| Question | Answer |
|----------|--------|
| Unmatched prop returned in merge output? | **No** — dropped. |
| Unmatched prop in merge report CSV? | **Yes** (when EXPORT_MERGE_REPORT=1). |
| Unmatched prop in legs/cards? | **No** — never gets trueProb or EV. |
| MIN_MATCH_RATE guardrail? | **Yes** — PP &lt; 12% or UD &lt; 10% → fatal exit (unless --no-guardrails). |
| Fallback trueProb for unmatched? | **No.** |
| PP rows in OddsAPI feed (fresh run)? | **610** (stats: standard + alternate). |
| UD rows in OddsAPI feed (fresh run)? | **453** (same). |
| Odds shape (overOdds/underOdds)? | **Yes** — American; implied prob derived in code. |
| Could many unmatched self-match to PP/UD rows? | **Yes** — for non-combo PP and for UD picks that currently fail only on sharp-book match. |
| Use PP/UD OddsAPI as direct source for trueProb? | **Not as primary** — sharp books preferred. |
| Use as fallback? | **Reasonable** — use when no sharp match, with optional flag/down-weight. |

---

## Recommendations

1. **Fate of unmatched:** Document clearly that unmatched props are **dropped** (no fallback trueProb), and that the only persistent record is the merge report CSV when `EXPORT_MERGE_REPORT=1`. Optionally add a single summary log line for unmatched count by reason (no_candidate, line_diff, juice) even when debug is off.
2. **PP/UD in OddsAPI feed:**  
   - **Do not** use PP/UD as the **primary** source for trueProb; keep using sharp-book match first.  
   - **Consider** using PP/UD OddsAPI rows as a **fallback** when no sharp-book match exists (same player/stat/line): assign trueProb from devigged PP/UD odds so the leg enters the pipeline, and tag with e.g. `matchType: "fallback_pp"` or `"fallback_ud"` so downstream (EV, cards, reporting) can treat them differently if desired.
3. **Self-match vs. sharp match:** If fallback is implemented, keep the current merge order: try sharp books first; only if that fails, try same-book (PP or UD) from the OddsAPI feed. That preserves sharp-based EV where possible and only uses DFS-book odds where necessary to avoid dropping the leg entirely.
