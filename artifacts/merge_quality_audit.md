# PP/UD Merge Quality Audit (Report Only)

**Date:** 2026-03-12  
**Hypothesis:** PP/UD main lines are failing to match because sharp books only carry that line as an **alt line**, not a main line.

**Data sources:**  
- `data/output_logs/merge_report_underdog.csv`  
- `data/output_logs/merge_report_prizepicks.csv` (when present; otherwise combined from `merge_report.csv` by site)  
- `data/odds_cache.json` (and `cache/oddsapi_props_cache_basketball_nba.json` if present) for cross-reference

---

## 1. Merge report summary (stale cache, initial audit)

### PrizePicks (PP)

| Metric | Value |
|--------|--------|
| **Total rows** | 518 |
| **Matched (Y)** | 338 |
| **Unmatched (N)** | 180 |
| **Match rate** | **65.3%** |

**Unmatched by reason:**

| Reason | Count |
|--------|--------|
| no_candidate | 169 |
| line_diff | 11 |

**Unmatched by stat (disproportionate):**

| Stat | Count |
|------|--------|
| points | 61 |
| threes | 33 |
| rebounds | 25 |
| points_assists | 20 |
| assists | 20 |
| steals | 13 |
| pra | 8 |

### Underdog (UD)

| Metric | Value |
|--------|--------|
| **Total rows** | 775 |
| **Matched (Y)** | 1 |
| **Unmatched (N)** | 774 |
| **Match rate** | **0.1%** |

**Unmatched by reason:**

| Reason | Count |
|--------|--------|
| no_candidate | 763 |
| line_diff | 11 |

**Unmatched by stat:**

| Stat | Count |
|------|--------|
| points | 650 |
| rebounds | 124 |

**Conclusion:** UD merge rate was effectively zero with a stale 4-row cache; almost all failures were `no_candidate`.

---

## 2. Merge pass order in `merge_odds.ts`

### First pass (main)

- **Function:** `findBestMatchForPickWithReason`.
- **Candidates:** **All** `oddsMarkets` rows (both main and alt). No filter on `isMainLine`; exact line first, then nearest within `MAX_LINE_DIFF` (0.5 by default).
- So the **first** pass does **not** use "main lines only"; it can already match on an alt line if the line is exact or within 0.5.

### Second pass (alt) -- `findBestAltMatch`

- **When:** Only when the first pass returns **`reason === "line_diff"`** (nearest candidate was beyond 0.5). No other flag; it is always triggered for line_diff.
- **What it searches:** Only rows with **`isMainLine === false`** (Phase 1 "confirmed" alt lines from OddsAPI).
- **Books:** All books in `oddsMarkets`; no restriction to specific books.
- **Tolerance:** `UD_ALT_LINE_MAX_DELTA` (2.5).
- **Stats:** Only stats in `UD_ALT_MATCH_STATS` (points, rebounds, assists, threes, steals, blocks, turnovers, pra, points_rebounds, points_assists, rebounds_assists).

So:

- First pass: main + alt, all books.
- Alt pass: **only** `isMainLine === false`, all books, only for `line_diff`, only for certain stats.

---

## Fresh Cache Audit -- 2026-03-12

### Run parameters

- **Command:** `node dist/src/run_optimizer.js --platform both --innovative --bankroll 700 --providers PP,UD --sports NBA --include-alt-lines`
- **EXPORT_MERGE_REPORT=1**, **FORCE_REFRESH=1**, caches deleted before run.
- **Quota cost:** used=1908 remaining=18092 (~86 tokens this run).
- **Alt markets confirmed in request:** `player_points_alternate, player_rebounds_alternate, player_assists_alternate, player_threes_alternate`.
- **Exit code:** 0.

### Fresh cache profile

| Metric | Value |
|--------|-------|
| Total OddsAPI rows | 5,784 |
| Main-line rows | 4,421 |
| Alt-line rows (`isMainLine=false`) | 1,363 |
| Unique players | 133 |
| Books | FanDuel (1748), theScore Bet (1037), DraftKings (804), PrizePicks (610), BetMGM (585), Underdog (453), DK Pick6 (380), Pinnacle (167) |

Rows by stat: points 1641, rebounds 964, threes 688, assists 597, pra 524, points_rebounds 523, points_assists 406, rebounds_assists 312, blocks 82, steals 47.

### Merge results (fresh)

#### PrizePicks -- unchanged at 65.3% (mock legs, not re-merged)

PP unmatched by reason: no_candidate 169, line_diff 11.
PP unmatched by stat: points 61, threes 33, rebounds 25, points_assists 20, assists 20, steals 13, pra 8.

#### Underdog

| Metric | Stale cache | Fresh cache |
|--------|------------|-------------|
| Total rows | 775 | 662 |
| Matched | 1 | 247 |
| Unmatched | 774 | 415 |
| Match rate | 0.1% | **37.3%** |

UD unmatched by reason: line_diff 287, no_candidate 78, juice 50.
UD unmatched by stat: points 356, assists 24, steals 18, rebounds 11, blocks 6.

### Cross-reference (fresh cache, 5,784 rows)

| Category | PP | UD |
|----------|-----|-----|
| No OddsAPI data at all | 153 | 61 |
| Main close (within 0.5) but still failed | 18 | 20 |
| Main wrong line, no alt close | 8 | 295 |
| **No main close, ALT WOULD MATCH (within 0.5)** | **1** | **39** |
| Neither | 0 | 0 |

### Key number: "Alt would have matched"

- **PP:** **1** additional leg (combo player prop name mismatch).
- **UD:** **39** additional legs if the alt pass were invoked for these rows.

#### Why the 39 UD "alt would match" rows were NOT rescued

| Merge-fail reason | Count | Root cause |
|-------------------|-------|------------|
| **juice** | 37 | Alt pass only triggers on `line_diff`, not `juice`. A different book's alt line at the same value has acceptable juice, but the code never tries. |
| **no_candidate** | 2 | Name mismatch (Kel'el Ware apostrophe, Nickeil Alexander-Walker hyphen). Pick never matched to any odds row. |

**Examples of UD alt-would-match (juice-blocked):**

| Player | Stat | UD Line | Main Lines | Closest Alt Lines | Fail |
|--------|------|---------|------------|-------------------|------|
| Bobby Portis | assists | 1.5 | (none) | 1.5 | juice |
| Jalen Johnson | points | 29.5 | 20.5, 21.5, 22.5 | 27.5, 28.5, **29.5** | juice |
| Cooper Flagg | points | 29.5 | 20.5, 21.5, 22.5 | 27.5, 28.5, **29.5** | juice |
| Cooper Flagg | points | 27.5 | 20.5, 21.5, 22.5 | 25.5, 26.5, **27.5** | juice |
| Corey Kispert | assists | 2.5 | (none) | 2.5 | juice |
| Zaccharie Risacher | assists | 1.5 | (none) | 1.5 | juice |
| Nickeil Alexander-Walker | points | 21.5 | 16.5, 17.5, 18.5 | 19.5, 20.5, **21.5** | no_candidate |
| Nickeil Alexander-Walker | points | 22.5 | 16.5, 17.5, 18.5 | 20.5, 21.5, **22.5** | no_candidate |

### Deep-dive: 295 "main wrong line, no alt close" UD rows

Delta distribution (closest OddsAPI line to UD pick line):

| Delta range | Count |
|-------------|-------|
| 0.5 - 1.5 | 5 |
| 1.5 - 2.5 | 4 |
| 2.5 - 5.0 | 60 |
| 5.0 - 10.0 | 109 |
| 10.0+ | 117 |

Mostly UD escalator picks (4.5, 7.5, 11.5 pts) where the sharp book main is 20.5+. Structurally unmatchable.

Small-delta examples (potentially rescuable):

| Player | Stat | UD Line | Closest Main | Delta |
|--------|------|---------|-------------|-------|
| Kasparas Jakucionis | points | 7.5 | 8.5 | 1.0 |
| Ousmane Dieng | points | 6.5 | 7.5 | 1.0 |
| Derrick White | points | 14.5 | 15.5 | 1.0 |
| Jaylin Williams | points | 8.5 | 7.5 | 1.0 |
| Payton Pritchard | points | 14.5 | 15.5 | 1.0 |

### Deep-dive: 20 UD "main close but still failed"

| Reason | Count | Explanation |
|--------|-------|-------------|
| juice | 13 | Main matched exactly but odds too extreme (under < -200). |
| no_candidate | 7 | Name mismatch: all **Kel'el Ware** (apostrophe handling). |

### PP no-data (153 rows)

Almost all combo player props ("Player A + Player B stat"). OddsAPI does not carry multi-player combos. Structurally unmatchable.

---

## Answers

**Does UD match rate improve with a full cache?**
YES -- 0.1% to **37.3%** (1 to 247 matched). Merge logic works; the stale audit was misleading.

**How many additional legs from fixing alt matching?**
PP: 1. UD: **39** (37 juice-blocked + 2 name mismatch).

**Stats to prioritize:** assists (low lines, juice-blocked), steals/blocks (same pattern), then the ~20 points picks with delta 1-2.5.

---

## Recommendations

### 1. Trigger alt pass on `juice` failures (high impact, low risk)

Call `findBestAltMatch` when `reason === "juice"`, not just `line_diff`. A different book's alt line at the same pick line may have acceptable juice. **Estimated gain: ~37 legs.**

### 2. Fix name aliases (medium impact, trivial)

- Kel'el Ware: apostrophe normalization issue (alias exists but not applied in all paths).
- Nickeil Alexander-Walker: hyphen normalization issue.

**Estimated gain: ~9 legs.**

### 3. Do NOT widen UD_ALT_LINE_MAX_DELTA beyond 2.5

Escalator lines (delta > 5) are structurally unmatchable. The 60 at delta 2.5-5.0 are marginal. Keep 2.5.

### 4. PP combo props: out of scope for OddsAPI (structural)

153 of 180 PP unmatched are multi-player combos. Accept or synthesize from components (Phase 8 partially implemented).

### 5. Dedicated UD scraper: not required now

With a full cache, UD produces 47 viable legs and 400 cards. Merge logic fixes yield more immediate gain than restoring a scraper.

### Expected improvement

| Fix | Additional legs | Effort |
|-----|----------------|--------|
| Alt pass on juice | +37 | Low |
| Name aliases | +9 | Trivial |
| **Total** | **+46** | ~30 min |

Current UD: 47 legs, 37.3% match rate.
With fixes: ~93 legs (**2x**), ~43% match rate.
