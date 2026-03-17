# PrizePicks (PP) Merge Logic — Audit

**Context:** PP merge 421 total legs, 320 matched (76.0%), ~101 unmatched. PP uses the **same** merge path as UD.

---

## 1. Files that handle PP leg merging

| File | Role |
|------|------|
| **src/merge_odds.ts** | Single merge loop for **both** PP and UD. `pickSite(pick)` returns `"prizepicks"` for PP (default when `site` unset) or `"underdog"` for UD. All matching, fallback, and normalization logic is shared. |
| **src/run_optimizer.ts** | Calls `fetchPrizePicksRawProps` → `mergeWithSnapshot(raw, oddsSnapshot.rows, ...)` with PP raw picks. PP goes through merge_odds.ts. |
| **src/export_imported_csv.ts** | Writes merge report CSV (same columns for PP and UD). |
| **src/fetch_props.ts** | Produces PP RawPicks via `mapJsonToRawPicks`; player from `included` (first_name + last_name or name); stat via `mapStatType(attr.stat_type)`. |

**There is no separate mergePP, mergePrizePicks, or matchPP function.** PP and UD share the same merge loop; only `pickSite(pick)` and `wantBook` differ.

---

## 2. PP merge path details

### 2a. How PP player names arrive (raw format)

**Source:** `fetch_props.ts` → `buildPlayerMaps` → `mapJsonToRawPicks`.

- **API shape:** `included` array has `new_player` items with `attributes.first_name`, `attributes.last_name`, `attributes.name`.
- **Name resolution:** `name = nameAttr || [first, last].filter(Boolean).join(" ")`. So `attributes.name` is preferred; else `"FirstName LastName"`.
- **Raw format:** Full display names, e.g. "Devin Booker", "Royce O'Neale", "Nikola Jokić", "Kel'el Ware", "P.J. Washington", "C.J. McCollum", "Nickeil Alexander-Walker".

// [AUDIT-PP] Name format: PP sends full names (first + last or display name). Same normalization gaps as UD: accents stripped, Jr./Sr. stripped, apostrophe stripped. **Alias applied only to pick side** (same as UD). Dots/initials (e.g. "P.J.") not normalized — "P.J. Washington" vs "pj washington" (alias) can mismatch if odds use different spelling.

---

### 2b. How PP stat labels arrive and map to canonical stats

**Source:** PrizePicks API `attributes.stat_type` — e.g. `"Points"`, `"Pts+Reb+Ast"`, `"Fantasy Score"` (title case, display strings).

**PP mapStatType (fetch_props.ts lines 120–200):**
- Lowercases and strips `(combo)` from input.
- Maps: `"points"`/`"pts"` → `"points"`; `"rebounds"`/`"rebs"` → `"rebounds"`; `"assists"`/`"asts"` → `"assists"`; `"pts_rebs_asts"`/`"pra"`/`"pts+rebs+asts"` → `"pra"`; `"pts_rebs"`/`"pr"`/`"points_rebounds"` → `"points_rebounds"`; etc.
- Returns `StatCategory` (e.g. `"points"`, `"rebounds"`, `"points_rebounds"`, `"pra"`, `"fantasy_score"`).

**Merge uses:** `merge_odds.ts` → `STAT_MAP` / `normalizeStatForMerge` for **both** pick and odds. OddsAPI stats come from `MARKET_KEY_TO_STAT` (e.g. `player_points` → `"points"`).

// [AUDIT-PP] Stat map: PP `mapStatType` outputs canonical StatCategory. merge_odds `STAT_MAP` covers PP labels (points, rebounds, assists, pra, points_rebounds, etc.) and OddsAPI `MARKET_KEY_TO_STAT` keys. PP stat labels are covered. `PP_STATS_NOT_IN_ODDS_FALLBACK` = `fantasy_score`, `fantasy` — dynamic detection for any PP-only stats.

---

### 2c. PLAYER_NAME_ALIASES: applied to pick side only

Same as UD: `resolvePlayerNameForMatch(normalizeName(pick.player))` is used for the **pick** side. The **odds** side uses `normalizeForMatch(normalizeOddsPlayerName(o.player))` — **no alias lookup**.

// [AUDIT-PP] Alias map: applied to PP pick side only, same as UD. Odds side never goes through `PLAYER_NAME_ALIASES`.

---

### 2d. Dots/initials on both sides

Same as UD: `normalizeForMatch` does **not** collapse initials (e.g. "p.j." → "pj"). Dots remain. If PP sends "P.J. Washington" and alias maps "p.j. washington" → "pj washington", pick becomes "pj washington"; if OddsAPI sends "P.J. Washington", odds stay "p.j. washington" (no alias on odds) → **no match**.

// [AUDIT-PP] Name format: same normalization gaps as UD — dots/initials not collapsed; alias only on pick side.

---

### 2e. Line tolerance for PP

Same as UD: main pass uses `MAX_LINE_DIFF` (0.5 unless `--exact-line`); fallback uses ±0.5 hardcoded; alt pass uses `UD_ALT_LINE_MAX_DELTA` (2.5) for nearest-line rescue.

// [AUDIT-PP] Line tolerance: ±0.5 for main and fallback; same as UD.

---

## 3. Merge report CSV for PP

**Where written:** `merge_odds.ts` → `writeMergeReportCsv(mergeReportRows, getOutputPath(\`merge_report_prizepicks.csv\`))` when `EXPORT_MERGE_REPORT=1`.

**Columns:** `site`, `player`, `stat`, `line`, `sport`, `matched`, `reason`, `bestOddsLine`, `bestOddsPlayerNorm`, `matchType`, `altDelta`.

**Top reason values for PP unmatched rows** (from merge_report_prizepicks.csv):
- **no_candidate:** 55 — no odds row with same book/sharp stat/sport/league/main line (or combo/same-game props, fantasy_score, or low-volume players).
- **line_diff:** 46 — nearest odds line > 0.5 away.
- **juice:** 0 — no juice rejections in this run.

**Fallback for PP:** Same fallback block as UD (`wantBook = "prizepicks"`, `matchType = "fallback_pp"`). This run had **0 fallback_pp** matches (no rows with `reason=ok_fallback`, `matchType=fallback_pp`).

// [AUDIT-PP] Unmatched reason distribution: no_candidate 55, line_diff 46, juice 0.

---

## 4. PP fallback attempt logging

**FALLBACK_DEBUG=1** currently gates logs only when `site === "underdog"`. There is **no** PP-specific fallback diagnostic logging. To debug PP fallback, the same `[UD-FALLBACK]`-style logs would need to be extended to `site === "prizepicks"` (or a shared `FALLBACK_DEBUG` block for both).

---

## 5. fetch_props.ts — raw PP pick shape

**Raw projection (API):**
```ts
// PrizePicksProjection.attributes
line_score: string;        // e.g. "22.5"
stat_type: string;        // e.g. "Points", "Pts+Reb+Ast"
// relationships.new_player → id for lookup in included
```

**Raw pick object (mapJsonToRawPicks output):**
```ts
{
  sport: "NBA",
  site: "prizepicks",
  league: "NBA",
  player: string,    // from included new_player: name || "FirstName LastName"
  team: string | null,
  opponent: string | null,
  stat: StatCategory,  // from mapStatType(attr.stat_type)
  line: number,        // parseFloat(attr.line_score)
  projectionId: string,
  gameId: string | null,
  startTime: string | null,
  isDemon, isGoblin, isPromo, isNonStandardOdds,
}
```

**Stat normalization:** `mapStatType(statTypeRaw)` — lowercases, strips `(combo)`, maps display strings to `StatCategory`. See section 2b.

---

## 6. Summary

| Finding | PP | UD |
|---------|----|----|
| Merge file | merge_odds.ts (shared) | merge_odds.ts (shared) |
| Name normalization | Same pipeline | Same pipeline |
| Alias on pick only | Yes | Yes |
| Dots/initials not collapsed | Yes | Yes |
| Line tolerance | ±0.5 | ±0.5 |
| Unmatched reasons | no_candidate 55, line_diff 46 | (see UD audit) |
| Fallback debug logs | Not gated (UD only) | FALLBACK_DEBUG=1 |
