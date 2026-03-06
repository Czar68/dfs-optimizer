# Dashboard PP Missing + 8-Leg Domination — Debug & Fix

## Root cause (summary)

1. **PP missing**
   - **If Console shows "Load: PP = 0"** → PP CSV not loading. Check Network: `/data/prizepicks-cards.csv` (or `/{your-base}/data/prizepicks-cards.csv`). 404 = file not on server or wrong path; 200 but 0 rows = parse/header mismatch.
   - **If PP count > 0 but table shows only UD** → Sort was by **Kelly $** descending. UD 8-leg stakes (~$80–92) are much higher than PP 6P (~$2.50), so top 50 were all UD. **Fix:** sort by **Card EV** descending, then Kelly $.

2. **8-leg domination**
   - Same as above: sort by Kelly $ favored high-stake UD 8-leg cards. **Fix:** sort by Card EV first so best-EV cards (mix of PP/UD and leg counts) appear first.

3. **Duplicate stats**
   - Possible duplicate cards from merge. **Fix:** dedupe by `site + flexType + sorted(legIds)` before setting state.

4. **Console / debug**
   - Debug block shows Load PP/UD, sport filter, EV threshold, cards by site. Console logs: `prizepicksCards.length`, `underdogCards.length`, merged/deduped counts, and CSV URLs used.

---

## Files changed

- **`web-dashboard/src/App.tsx`**
  - **CSV base path:** `getDataBase()` from current script URL so subpath deploy (e.g. `/dfs/`) resolves `/data/*.csv` correctly.
  - **Numeric coercion:** `cardEv`, `kellyStake`, `avgEdgePct` normalized to numbers in `normalizeRow` so sort/filter never see NaN.
  - **Site normalization:** `site` forced to `'PP'` or `'UD'` from CSV (handles `site`/`Site` and case).
  - **Dedupe:** after merging PP + UD, dedupe by `cardKey(c)` (site + flexType + sorted leg IDs including leg7/8).
  - **Sort:** `filteredCards` sorted by **Card EV descending**, then **Kelly $** descending (so top 50 mix sites/leg counts by EV).
  - **Site column:** table has a **Site** column (PP/UD).
  - **Debug:** Console logs CSV URLs and deduped count; debug row text updated to “sorted by Card EV ↓ then Kelly $”.
  - **Counts by site:** use `String(c.site).toUpperCase() === 'PP'` so PP is counted even if CSV has `"PP"` or `"pp"`.

---

## New JS bundle

- **Hash:** `index-DxGFscny.js` (and `index-BvVGqQrD.css`).
- **Path:** `web-dashboard/dist/assets/index-DxGFscny.js`.

---

## Deploy checklist (server-side)

1. **Upload assets**
   - `dist/assets/index-DxGFscny.js`
   - `dist/assets/index-BvVGqQrD.css`
   - Update `index.html` to reference these (or use your existing deploy that copies `dist` into `dfs/` and rewrites script/link tags).

2. **Ensure both CSVs under `data/`**
   - `data/prizepicks-cards.csv` (e.g. 499 rows after header)
   - `data/underdog-cards.csv`
   - If the app is served from a subpath (e.g. `https://domain.com/dfs/`), the script URL will be under that path; `getDataBase()` will return `/dfs/`, so requests go to `https://domain.com/dfs/data/prizepicks-cards.csv`. Ensure `data/` lives under that same path (e.g. `dfs/data/`).

3. **No code change needed on server** if both CSVs are already at the same path the app uses for `/data/` (or `{base}data/`).

---

## Test steps to verify mixed PP/UD table

1. **Console**
   - Open DevTools → Console. You should see:
     - `[Dashboard] prizepicksCards.length: 499 | underdogCards.length: … | merged: … | deduped: …`
     - `[Dashboard] CSV URLs: /data/prizepicks-cards.csv /data/underdog-cards.csv` (or with `/dfs/` if subpath).
     - `[Dashboard] sportFilter: All | EV threshold: none | filteredCount: …`

2. **Network**
   - In Network tab, filter by “cards” or “csv”. Both `prizepicks-cards.csv` and `underdog-cards.csv` should be **200** and non‑empty.

3. **Debug block**
   - “Load: PP = 499, UD = …” (or your actual counts).
   - “Cards by site: PP = 499, UD = …”.
   - No red “Error” if both CSVs load.

4. **Table**
   - First column **Site**: mix of **PP** and **UD** (no longer only UD).
   - Top rows should be **by Card EV** (high EV first), so PP and UD and different leg counts (6P, 6F, 7P, 8P, etc.) can all appear in top 50.
   - **Kelly $** in a reasonable range for $600 bankroll (e.g. single‑digit to low tens for PP; UD can be higher).
   - Debug row: “Showing top 50 (sorted by Card EV ↓ then Kelly $)”.

5. **Dedupe**
   - If Console shows “Deduped: X -> Y” with Y < X, duplicates were removed; table should have no duplicate cards (same site + same legs).

6. **Sport filter**
   - Set filter to “NBA”; counts and table should only show NBA cards. Reset to “All” to see both sites again.
