# IONOS Deploy Checklist — DFS Dashboard (Live March 6)

**Server path:** `/kunden/homepages/14/d4299584407/htdocs/dfs/`  
**Tool:** FileZilla (or cron-generate.py for data-only refresh)

---

## 1. Verify + Fresh (DONE 2026-03-06)

- [x] Fresh pipeline run: PP 491 cards / 143 legs, UD 800 cards / 14 legs
- [x] Results export: 1291 cards → `results.db` + `results/cards_2026-03-06.csv`
- [x] Sheets push: 1291 cards, 6869 rows
- [x] Dashboard build: `index-DciHqGtf.css`, `index-y4n8kjTP.js`

---

## 2. npm run build (local)

```bash
cd "C:\Users\Media-Czar Desktop\Dev\dfs-optimizer\web-dashboard"
npm run build
```

**Expected:** `dist/index.html`, `dist/assets/index-*.js`, `dist/assets/index-*.css`, `dist/data/*.csv`, `dist/data/last_fresh_run.json`, `dist/launcher.html`.

---

## 3. FileZilla — Upload to IONOS

Upload **contents** of `web-dashboard/dist/` into `htdocs/dfs/` (overwrite):

| Local (dist/)           | Remote (dfs/)        |
|-------------------------|----------------------|
| index.html              | dfs/index.html       |
| launcher.html           | dfs/launcher.html    |
| bankroll.html           | dfs/bankroll.html    |
| assets/index-*.js       | dfs/assets/          |
| assets/index-*.css      | dfs/assets/          |
| data/prizepicks-cards.csv | dfs/data/          |
| data/prizepicks-legs.csv  | dfs/data/          |
| data/underdog-cards.csv   | dfs/data/          |
| data/underdog-legs.csv    | dfs/data/          |
| data/last_fresh_run.json  | dfs/data/          |

**Optional:** Delete old asset files from `dfs/assets/` (e.g. `index-BBQjXNqQ.css`) to avoid 404s if bookmarked.

---

## 4. Post-upload checks

- [ ] Open `https://yourdomain.com/dfs/` (or `/dfs/index.html`)
- [ ] F12 → Console: `[Dashboard] Live data validation: { PP: { cards: 491, legs: 143 }, UD: { cards: 800, legs: 14 } }`
- [ ] Header: "Last fresh: … | PP:491 UD:800"
- [ ] Scroll table: data aligned under headers, sticky header
- [ ] Click ▼ on a row: expand shows 3 options (slip / player links / Copy Parlay)
- [ ] Copy Parlay → paste elsewhere: "Player STAT o1.5, ..."
- [ ] Refresh Data button: copies instructions (or open `/dfs/launcher.html` for one-click commands)

---

## 5. Refresh Data (cron or manual)

**On IONOS (server):** Run your cron job or manually:

```bash
# If you have cron-generate.py on server:
python cron-generate.py
# Then re-upload dist/data/*.csv and dist/data/last_fresh_run.json
```

**Local (full refresh):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fresh_data_run.ps1
# Then re-upload dist/ (or at least dist/data/ + dist/index.html + dist/assets/)
```

---

## 6. Portfolio (post-fresh)

- Top 30 stake: **≤ 12% of $600** (~$72 max target)
- Kelly: 1.5x conservative, $1–$25 per card
- Numbers box: Must Play / Strong / All / Lottery (day; week/month from results when available)
