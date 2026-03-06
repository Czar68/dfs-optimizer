# DFS — Deploy Fresh Build to Server

**Do not touch:** .htaccess, .htpasswd, auth, cron-generate.py, or server routing.

---

## 1. Exact upload list (7 files)

| # | Local path | → Server path (dfs/) |
|---|------------|----------------------|
| 1 | `web-dashboard/dist/index.html` | `index.html` |
| 2 | `web-dashboard/dist/assets/index-Cg088Hr1.js` | `assets/index-Cg088Hr1.js` |
| 3 | `web-dashboard/dist/assets/index-Bp19Zl4m.css` | `assets/index-Bp19Zl4m.css` |
| 4 | `web-dashboard/dist/data/underdog-cards.csv` | `data/underdog-cards.csv` |
| 5 | `web-dashboard/dist/data/underdog-legs.csv` | `data/underdog-legs.csv` |
| 6 | `web-dashboard/dist/data/prizepicks-cards.csv` | `data/prizepicks-cards.csv` |
| 7 | `web-dashboard/dist/data/prizepicks-legs.csv` | `data/prizepicks-legs.csv` |

---

## 2. Upload order

1. **assets/** (so index.html’s references resolve)
   - `assets/index-Cg088Hr1.js`
   - `assets/index-Bp19Zl4m.css`
2. **data/** (so dashboard can load CSVs)
   - `data/underdog-cards.csv`
   - `data/underdog-legs.csv`
   - `data/prizepicks-cards.csv`
   - `data/prizepicks-legs.csv`
3. **index.html** (last, so it points at current assets)

---

## 3. Test URL (after upload)

**http://gamesmoviesmusic.com/**

(or **https://gamesmoviesmusic.com/** if SSL is working)

---

## 4. Old file cleanup (optional)

If present on server, **remove** (no longer referenced by index.html):

- `dfs/assets/index-Ba0xcbKA.js`

Leave `index-Bp19Zl4m.css`; it is still in use.

---

## 5. Expected success result

- **F12 → Network:**  
  - `index.html` → 200  
  - `index-Cg088Hr1.js` → 200  
  - `index-Bp19Zl4m.css` → 200  
  - `underdog-cards.csv` (from `/data/`) → 200  
- **Page:** Auth popup → Props Kelly Dashboard with table rows (e.g. 800 UD + 499 PP cards; filter by “All” or sport).  
- **Console:** No 404s, no red errors.  
- **“Last update”** and **Auto-refresh 60s** visible at bottom.

---

## 6. One-line summary

Upload the 7 files in the order above to `dfs/`, then open **http://gamesmoviesmusic.com/** and confirm the dashboard loads with data; delete `dfs/assets/index-Ba0xcbKA.js` if it exists.
