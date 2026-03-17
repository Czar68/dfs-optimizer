# UD Fallback Match Logic — Audit

**Context (PROJECT_STATE):** UD merge 216 total, 50 matched (23.1%), 166 fallback attempts, 0 fallback hits. PP at 76% so merge framework works; UD-specific logic is under audit.

**Suspect areas:** Name normalization, stat key translation, line tolerance in the fallback path.

---

## 1. Files that handle UD leg merging or fallback

| File | Role |
|------|------|
| **src/merge_odds.ts** | All merge logic: main match, alt pass, **fallback pass** (PP/UD same-book), name/stat normalization, merge loop, merge report row push. |
| **src/export_imported_csv.ts** | Writes merge report CSV (columns, row content). |
| **src/fetch_underdog_props.ts** | Produces UD RawPicks: `mapStatType(ou.appearance_stat.stat, sportId)` → `pick.stat`; player from appearances/players join. |
| **src/run_underdog_optimizer.ts** | Fetches UD raw props, calls into merge (via OddsSnapshotManager); does not define merge logic. |
| **src/normalize_stats.ts** | `normalizeStatType()` — used elsewhere; **merge_odds does not use it**. Merge uses its own `STAT_MAP` / `normalizeStatForMerge`. |

No separate `mergeUd`, `matchUd`, or `matchLeg` functions; UD is handled inside the single merge loop in `merge_odds.ts` by `pickSite(pick)` (underdog vs prizepicks).

---

## 2. src/merge_odds.ts — Implementations and audit notes

### 2a. Name normalization (both sides)

**Pick side (UD player):**
```ts
// Lines 51-52, 128-131, 214-217, 953
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
// Full normalization for name comparison: lower, accents off, apostrophes stripped, suffixes off
function normalizeForMatch(name: string): string {
  const withAccents = stripAccents(normalizeName(name));
  const noApostrophe = withAccents.replace(/'/g, "");
  return stripNameSuffix(noApostrophe);
}
function resolvePlayerNameForMatch(normalizedFromPick: string): string {
  return PLAYER_NAME_ALIASES[normalizedFromPick] ?? normalizedFromPick;
}
// Usage for fallback:
const targetNameFallback = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
```
- **Pick pipeline:** `pick.player` → `normalizeName` (trim + lower) → `resolvePlayerNameForMatch` (alias lookup) → `normalizeForMatch` (stripAccents, strip `'`, stripNameSuffix).
- **stripNameSuffix** (lines 116-124): strips ` jr.`, ` sr.`, ` iii`, ` ii`, ` iv` (case-insensitive).
- **stripAccents** (111-113): NFD + remove diacritics.
- **Apostrophe:** removed in `normalizeForMatch` so "Kel'el Ware" → "kel el ware" (alias then maps to "kelel ware").

**Odds side (OddsAPI row player):**
```ts
// Lines 219-227, 961
function normalizeOddsPlayerName(id: string): string {
  const parts = id.split("_");
  if (parts.length <= 2) {
    return normalizeName(id);
  }
  const nameParts = parts.slice(0, -2);
  return normalizeName(nameParts.join(" "));
}
// In fallback filter:
const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
return oddsName === targetNameFallback;
```
- **Odds pipeline:** `o.player` → `normalizeOddsPlayerName` (handle `KEVIN_DURANT_1_NBA` style or else trim+lower) → `normalizeForMatch` (stripAccents, strip `'`, stripNameSuffix).
- **No alias applied to odds.** Alias map is only used for the pick: `resolvePlayerNameForMatch(normalizeName(pick.player))`. Odds name is never run through `PLAYER_NAME_ALIASES`.

<!-- [AUDIT] Name normalization: both sides lowercased? Yes (normalizeName). Accents stripped? Yes (stripAccents in normalizeForMatch). Jr./Sr. suffix removed? Yes (stripNameSuffix). Gap: alias map applied only to pick; odds side not run through PLAYER_NAME_ALIASES → e.g. "T.J. McConnell" (odds) vs "tj mcconnell" (pick) never match. -->

---

### 2b. Stat key matching

**Merge (main, alt, and fallback) uses:**
```ts
// Lines 56-108, 271, 337, 954, 957
const STAT_MAP: Record<string, StatCategory> = {
  points: "points", pts: "points", player_points: "points",
  rebounds: "rebounds", rebs: "rebounds", player_rebounds: "rebounds",
  assists: "assists", asts: "assists", player_assists: "assists",
  threes: "threes", threes_made: "threes", "3pm": "threes", player_threes: "threes",
  steals: "steals", player_steals: "steals",
  blocks: "blocks", player_blocks: "blocks",
  turnovers: "turnovers", to: "turnovers", player_turnovers: "turnovers",
  pra: "pra", points_rebounds_assists: "pra", player_pra: "pra",
  points_rebounds: "points_rebounds", pr: "points_rebounds", player_points_rebounds: "points_rebounds",
  points_assists: "points_assists", pa: "points_assists", player_points_assists: "points_assists",
  rebounds_assists: "rebounds_assists", ra: "rebounds_assists", player_rebounds_assists: "rebounds_assists",
  stocks: "stocks", steals_blocks: "stocks",
  fantasy_score: "fantasy_score", fantasy: "fantasy_score",
  // ...
};
function normalizeStatForMerge(stat: string): string {
  return STAT_MAP[stat] ?? stat;
}
// Fallback:
const pickStatNormFallback = normalizeStatForMerge(pick.stat);
// ...
if (normalizeStatForMerge(o.stat) !== pickStatNormFallback) return false;
```

- **UD pick.stat:** Set in `fetch_underdog_props.ts` via `mapStatType(ou.appearance_stat.stat, sportId)` → returns `StatCategory` (e.g. "points", "rebounds", "pra", "points_rebounds"). So UD sends canonical stats.
- **OddsAPI o.stat:** Set in `fetch_oddsapi_props.ts` from `MARKET_KEY_TO_STAT[mkt.key]` (e.g. `player_points` → "points", `player_points_rebounds_assists` → "pra"). So OddsAPI rows use the same canonical stat names.
- **Comparison:** Both sides go through `normalizeStatForMerge`. Unmapped keys pass through as-is (`STAT_MAP[x] ?? x`), so if UD ever used a key not in STAT_MAP it would only match if OddsAPI had the same raw string.

<!-- [AUDIT] Stat key map: single STAT_MAP (canonical StatCategory) for both pick and odds; no separate UD→OddsAPI map. UD stats canonicalized in fetch_underdog_props mapStatType; OddsAPI via MARKET_KEY_TO_STAT. Raw string compare only for keys not in STAT_MAP. -->

---

### 2c. Line tolerance

**Main match (findBestMatchForPickWithReason):**
- Exact line preferred: `c.line === pick.line`.
- Else nearest within `MAX_LINE_DIFF`: `bestDiff > MAX_LINE_DIFF` → return `line_diff`.  
- `MAX_LINE_DIFF = cliArgs.exactLine ? 0 : 0.5` (line 231).

**Alt match (findBestAltMatch):**
- `Math.abs(o.line - pick.line) <= UD_ALT_LINE_MAX_DELTA` (2.5) for alt candidates only.

**Fallback (same block as audit):**
```ts
// Lines 959-960
if (Math.abs(o.line - pick.line) > 0.5) return false;
if (o.isMainLine !== true) return false;
```
- Fallback uses a **±0.5** window (hardcoded), and **main lines only** (`isMainLine === true`).

<!-- [AUDIT] Line tolerance: fallback uses ±0.5 window (hardcoded); main lines only. Not exact match unless --exact-line sets MAX_LINE_DIFF=0 for main (fallback still 0.5). -->

---

### 2d. Full fallback filter (excerpt)

```ts
// Lines 952-963
diag.fallbackAttempts++;
const targetNameFallback = normalizeForMatch(resolvePlayerNameForMatch(normalizeName(pick.player)));
const pickStatNormFallback = normalizeStatForMerge(pick.stat);
const wantBook = site === "prizepicks" ? "prizepicks" : "underdog";
const fallbackCandidates = oddsMarkets.filter((o) => {
  if ((o.book ?? "").toLowerCase() !== wantBook) return false;
  if (normalizeStatForMerge(o.stat) !== pickStatNormFallback) return false;
  if (o.sport !== pick.sport || (o.league ?? "").toUpperCase() !== pick.league.toUpperCase()) return false;
  if (Math.abs(o.line - pick.line) > 0.5) return false;
  if (o.isMainLine !== true) return false;
  const oddsName = normalizeForMatch(normalizeOddsPlayerName(o.player));
  return oddsName === targetNameFallback;
});
```

Summary: **Book** = underdog (lowercased), **stat** = same canonical stat, **sport/league** = match, **line** = ±0.5, **main line only**, **player** = strict string equality after normalization, with **alias applied only on pick side**.

---

## 3. EXPORT_MERGE_REPORT and merge report CSV

**Where it’s written:**  
`merge_odds.ts` lines 1073-1079: when `exportMergeReport` (env `EXPORT_MERGE_REPORT === "1"`) and `mergeReportRows.length > 0`, calls:
- `writeMergeReportCsv(mergeReportRows)` → default path
- `writeMergeReportCsv(mergeReportRows, getOutputPath(\`merge_report_${reportSite}.csv\`))` → e.g. `merge_report_underdog.csv`
- `writeMergeReportCsv(mergeReportRows, getOutputPath(\`merge_report_${reportSite}_${ts}.csv\`))` → timestamped

**Columns (export_imported_csv.ts 110-126):**
- Headers: `["site", "player", "stat", "line", "sport", "matched", "reason", "bestOddsLine", "bestOddsPlayerNorm", "matchType", "altDelta"]`
- Data: `site, player, stat, line, sport, matched, reason, bestOddsLine, bestOddsPlayerNorm, matchType, altDelta`

**What populates “fallback attempt” vs “matched” rows:**

- **Matched (incl. fallback):** When a fallback candidate is found (lines 1002-1016), a row is pushed with:
  - `matched: "Y"`, `reason: "ok_fallback"`, `bestOddsLine: String(match.line)`, `bestOddsPlayerNorm: normalizeForMatch(normalizeOddsPlayerName(match.player))`, `matchType: matchTypeFallback` ("fallback_ud" for UD), `altDelta: (Math.abs(match.line - pick.line)).toFixed(2)`.

- **Fallback attempt but no match:** When sharp match fails and fallback finds no candidate (lines 1020-1030), a row is pushed with:
  - `matched: "N"`, `reason: result.reason` (no_candidate / line_diff / juice), `bestOddsLine: "bestLine" in result ? String(result.bestLine) : ""`, `bestOddsPlayerNorm: "bestPlayerNorm" in result ? result.bestPlayerNorm : ""`, `matchType: ""`, `altDelta: ""`.

So every “unmatched” row after the main (and alt) pass is a **fallback attempt**; the same row is either “matched” with `reason: "ok_fallback"` and `matchType: "fallback_ud"` or “unmatched” with `matched: "N"` and the original fail reason.

---

## 4. Summary table

| Finding | Location | Detail |
|--------|----------|--------|
| **Name normalization** | merge_odds.ts | Both sides: lower, accents stripped, apostrophe stripped, Jr./Sr. etc. stripped. **Alias applied only to pick;** odds name not run through PLAYER_NAME_ALIASES → possible mismatch for "T.J." vs "TJ", etc. |
| **Stat key map** | merge_odds.ts STAT_MAP | Single canonical map for both pick and odds; no separate UD→OddsAPI map. UD stats come in already canonical from fetch_underdog_props mapStatType. |
| **Line tolerance** | merge_odds.ts fallback block | ±0.5 (hardcoded), main lines only. Same as main-pass MAX_LINE_DIFF. |
| **Merge report columns** | export_imported_csv.ts | site, player, stat, line, sport, matched, reason, bestOddsLine, bestOddsPlayerNorm, matchType, altDelta. |
| **Fallback attempt rows** | merge_odds.ts | All picks that fail main+alt get one row: either matched "Y" + reason "ok_fallback" + matchType "fallback_ud", or matched "N" + reason no_candidate/line_diff/juice + matchType "". |

---

## 5. Recommended next steps (no code changes in this audit)

1. **Name:** Apply alias resolution to the **odds** side for comparison (e.g. run `resolvePlayerNameForMatch(normalizeOddsPlayerName(o.player))` and then `normalizeForMatch`), or add normalization that collapses initials (e.g. "t.j." → "tj") so OddsAPI "T.J. McConnell" can match alias target "tj mcconnell".
2. **Logging:** For a sample of UD fallback attempts (e.g. no_candidate), log `targetNameFallback` vs `oddsName` for Underdog rows with same stat and line within 0.5 to confirm whether the gap is name normalization.
3. **Stat:** Confirm in data that UD raw `pick.stat` values are exactly the StatCategory strings used in STAT_MAP (e.g. "points_rebounds" not "points rebounds") after `mapStatType`.
