# Merge improvements (imported data evaluation)

Using the exported CSVs (`sgo_imported.csv`, `prizepicks_imported.csv`, `underdog_imported.csv`) you can see why many props don’t merge. Below is what the data shows and concrete ways to improve.

## How matching works today

A PrizePicks or Underdog pick is merged with SGO only if:

1. **Name** – After normalization, they must match exactly.  
   - SGO: `BRANDON_MILLER_1_NBA` → `brandon miller`  
   - PP/UD: `Brandon Miller` → `brandon miller`  
2. **Stat** – Same category (e.g. `points`, `rebounds`, `points_assists`).  
3. **League** – Same (e.g. `NBA`).  
4. **Line** – Odds line within **1** unit of the pick line (`MAX_LINE_DIFF = 1`). We import **all alternate lines** from SGO and TheRundown (every 20.5, 21, 21.5, etc.) so matching within 1 keeps EV accurate.  
5. **Juice** – Odds not beyond the extreme-juice threshold.

## What the imported files show

- **SGO** (`sgo_imported.csv`): `player` is raw ID (e.g. `LAMELO_BALL_1_NBA`), `player_normalized` is what we match on (e.g. `lamelo ball`). One row per book/line; many rows share the same player/stat/line.  
- **PrizePicks** (`prizepicks_imported.csv`): `player` is display name (e.g. `LaMelo Ball`), `player_lower` is what we compare to SGO’s normalized name.  
- **Underdog** (`underdog_imported.csv`): Same idea as PrizePicks.

So the main failure modes are:

1. **Name differences**  
   - SGO has “jalen brunson”, PP has “J. Brunson” → `j. brunson` ≠ `jalen brunson`.  
   - Suffixes: “Jr.”, “III”, etc. can differ.  
   - Accents / spelling: “Nikola Jokić” vs “Nikola Jokic”.  

2. **Line differences**  
   - SGO might have 20.5 and 21; PP might have 20. So 20 is within 3 of both, but we pick the closest. If SGO only has 24 and PP has 20, diff 4 > 3 → no match.  

3. **Stats**  
   - Both sides map to the same internal stats (e.g. `points`, `points_assists`). If PP uses a stat type we don’t map (or SGO doesn’t return), no match.  

4. **Coverage**  
   - SGO returns a subset of games/players. Many PP/UD props simply have no SGO line (no row in `sgo_imported.csv` for that player/stat/line).

## Recommended improvements

1. **Add a “normalized display name” for SGO**  
   - Keep matching on `player_normalized` (e.g. `jalen brunson`) but also build a mapping from common variants to that form, e.g.  
     - `j. brunson` → `jalen brunson`  
     - `brunson, jalen` → `jalen brunson`  
   - You can derive this from the imported CSVs: find PP/UD `player_lower` values that never match and see what the SGO `player_normalized` is for that player when they do appear (e.g. from another stat/line).

2. **Fuzzy or alternate-name matching**  
   - Allow “first initial + last name” to match “first name + last name” when there’s only one SGO player with that last name in the same game/league.  
   - Or use a small lookup table for known mismatches (e.g. “j. brunson” → “jalen brunson”).

3. **Line tolerance: match within 1**  
   - We only merge when the odds line is within **1** unit of the pick line: `|odds line − pick line| ≤ 1`. That avoids false edge (e.g. using 21 odds for a 24 pick).  
   - **Alternate lines:** SGO and TheRundown both offer multiple lines per player/stat (e.g. 20.5, 21, 21.5, 22). We **import all of them**: SGO key is `player::stat::line` (one row per line); TheRundown already returns one row per `participant.lines` entry. So we have plenty of lines to match against; we only accept the row whose line is within 1 of the pick and use that row’s odds.  
   - If a pick still doesn’t match, it’s usually because that exact (or within-1) line isn’t in the odds feed for that player/stat, not because we’re being too strict.

4. **Use the diagnostics**  
   - When you run the optimizer, the log line  
     `no match: no_candidate=X, line_diff=Y, juice=Z`  
     tells you how many picks failed for each reason.  
   - If `no_candidate` is large, focus on name/stat mapping.  
   - If `line_diff` is large, consider relaxing `MAX_LINE_DIFF` or checking SGO line granularity.

5. **Compare CSVs in a spreadsheet**  
   - Put `sgo_imported.csv` and `prizepicks_imported.csv` in sheets.  
   - Sort or filter PP by `player_lower` and SGO by `player_normalized`.  
   - For a given player, compare `stat` and `line`; you’ll see exactly where spelling or wording differs and where lines are just outside the current tolerance.

## Auditing the merge report every morning

See **[docs/MERGE_AUDIT.md](MERGE_AUDIT.md)** for how to run the merge audit (summary, suggested aliases, line-diff sample) and optionally schedule it. Use `npm run audit-merge` after a run with `EXPORT_MERGE_REPORT=1`, or `.\scripts\run_morning_with_audit.ps1` to run the pipeline then the audit in one go.

## Extra improvements from CSV exports

- **Accent normalization** – `stripAccents()` so "Nikola Jokić" and "Nikola Jokic" both match (used in `normalizeForMatch`).  
- **Suffix stripping** – `stripNameSuffix()` removes " Jr.", " III", " II", " IV", " Sr." so "Jaren Jackson Jr" matches "Jaren Jackson".  
- **Merge report CSV** – Set **`EXPORT_MERGE_REPORT=1`** before running. The merge step writes **`merge_report.csv`** (latest run) and **`merge_report_underdog.csv`** / **`merge_report_prizepicks.csv`** (per site) with columns: `site`, `player`, `stat`, `line`, `sport`, `matched` (Y/N), `reason` (ok / no_candidate / line_diff / juice), `bestOddsLine`, `bestOddsPlayerNorm`. Console log is prefixed with **[Underdog]** or **[PrizePicks]** so you can see which run the counts refer to. Use **`merge_report_underdog.csv`** to see where Underdog is failing the most; run **`npm run audit-merge`** to get **Underdog failure breakdown** and by-site summary in `merge_audit_report.md`.

## Where to change code

- **Name normalization**: `src/merge_odds.ts` – `normalizeName`, `normalizeForMatch` (accents + suffixes), `normalizeSgoPlayerId`, and the candidate filter.  
- **Line tolerance**: `src/merge_odds.ts` – `MAX_LINE_DIFF = 1`; SGO alternate lines: `src/fetch_sgo_odds.ts` (key includes `line`).  
- **Player name aliases**: `src/merge_odds.ts` – `PLAYER_NAME_ALIASES`.  
- **Stat mapping**: `src/fetch_props.ts` (`mapStatType`), `src/fetch_sgo_odds.ts` (`mapSgoStatIdToCategory`); keep in sync with `src/config/nba_props.ts`.

After changing anything, run the pipeline again and check the new merge diagnostics and the three imported CSVs to confirm more rows merge without introducing bad matches.
