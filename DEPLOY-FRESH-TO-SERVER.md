# DFS — Deploy Fresh Build to Server (htdocs root flat)

**Do not touch:** .htaccess, .htpasswd, auth, cron-generate.py, or server routing.

---

## 1. Build (local)

```bash
cd web-dashboard && npm run build
```

---

## 2. FileZilla: upload dist/ contents flat to htdocs root

Upload so the **site root** (htdocs) contains `index.html`, `assets/`, and `data/` at top level.

| Local path | → Server path (htdocs root) |
|------------|-----------------------------|
| `web-dashboard/dist/index.html` | `index.html` |
| `web-dashboard/dist/assets/index-*.js` | `assets/index-<hash>.js` |
| `web-dashboard/dist/assets/index-*.css` | `assets/index-<hash>.css` |
| `web-dashboard/dist/data/*.csv` | `data/*.csv` |
| `web-dashboard/dist/data/last_fresh_run.json` | `data/last_fresh_run.json` |
| `web-dashboard/dist/data/results_summary.json` | `data/results_summary.json` |

**Current build (this run):**

- `dist/index.html` → `index.html`
- `dist/assets/index-LphPkF4-.js` → `assets/index-LphPkF4-.js`
- `dist/assets/index-04U58JEK.css` → `assets/index-04U58JEK.css`
- `dist/data/underdog-cards.csv` → `data/underdog-cards.csv`
- `dist/data/underdog-legs.csv` → `data/underdog-legs.csv`
- `dist/data/prizepicks-cards.csv` → `data/prizepicks-cards.csv`
- `dist/data/prizepicks-legs.csv` → `data/prizepicks-legs.csv`
- `dist/data/last_fresh_run.json` → `data/last_fresh_run.json`
- `dist/data/results_summary.json` → `data/results_summary.json`

---

## 3. Upload order (FileZilla)

1. **assets/** first (so index.html script/link resolve)
   - Drag `dist/assets/` → server `assets/`
2. **data/** second
   - Drag `dist/data/` → server `data/`
3. **index.html** last
   - Drag `dist/index.html` → server root (htdocs)

---

## 4. Test URL

**http://gamesmoviesmusic.com/**

---

## 5. Optional cleanup

Remove any old `assets/index-*.js` or `assets/index-*.css` that are no longer referenced by the new `index.html`.

---

## 6. Expected result

- **Network:** index.html, JS, CSS, `/data/*.csv`, `/data/last_fresh_run.json`, `/data/results_summary.json` → 200.
- **Page:** Dashboard with zScore (2–5 range on first page), Kelly $50–80 / $1.50 floor, player column full width, metrics block on right, Past box with Top 100 dropdown.
- **Copy:** Player click → copies "Player STAT oX.X"; parlay → "Leg1, Leg2...". Console shows `[Copy]` and `[Deeplink]` logs.
