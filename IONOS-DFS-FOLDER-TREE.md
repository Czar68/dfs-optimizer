# IONOS /dfs/ folder — complete file tree

Your domain **Target = /dfs**, so the **dfs** folder is the site root. This is the exact layout to have on the server. No `dist` folder.

---

## Folder structure (exactly)

```
dfs/
├── .htaccess
├── .htpasswd
├── credentials.json
├── token.json
├── package.json
├── cron-generate.py
├── sheets_push_legs.py
├── sheets_push_cards.py
├── sheets_push_underdog_legs.py
├── sheets_push_underdog_cards.py
├── index.html
├── bankroll.html
├── assets/
│   ├── index-Ba0xcbKA.js
│   └── index-Bp19Zl4m.css
├── data/
│   ├── prizepicks-cards.csv
│   ├── prizepicks-legs.csv
│   ├── underdog-cards.csv
│   └── underdog-legs.csv
└── artifacts/
    └── merge_audit_report.md
```

---

## Rules

1. **Nothing inside a `dist` folder** — `index.html`, `bankroll.html`, `assets/`, and `data/` are **directly inside dfs/**.
2. **One `index.html`** — only at dfs root (next to `assets` and `data`).
3. **`index.html` must use `/assets/`** — not `/dfs/assets/` (because the site root is already dfs).

---

## Exact content of dfs/index.html

Because the site root is dfs, the script and link must point to **/assets/...**:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Props Kelly Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" crossorigin src="/assets/index-Ba0xcbKA.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-Bp19Zl4m.css">
  </head>
  <body class="bg-gray-900">
    <div id="root"></div>
  </body>
</html>
```

---

## Permissions

| Path              | Permission |
|-------------------|------------|
| **dfs/**          | 755        |
| **dfs/assets/**   | 755        |
| **dfs/data/**     | 755        |
| **dfs/artifacts/**| 755        |
| **dfs/index.html** | 644      |
| **dfs/bankroll.html** | 644    |
| **dfs/.htaccess** | 644        |
| **dfs/.htpasswd** | 644        |
| **dfs/cron-generate.py** | 755  |
| All other **.py**, **.json** | 644 |

---

## Where to get the files (local project)

| On server (dfs/)     | Source on your PC |
|----------------------|-------------------|
| index.html           | Use the exact HTML above, or after `npm run build`: `web-dashboard\dist\index.html` (then fix paths to `/assets/` if they say `/dfs/assets/`) |
| bankroll.html        | `web-dashboard\dist\bankroll.html` |
| assets/*.js, *.css   | `web-dashboard\dist\assets\` |
| data/*.csv           | `web-dashboard\dist\data\` (or leave empty / regenerate later) |
| .htaccess            | Project root `.htaccess` |
| .htpasswd            | Project root `.htpasswd` |
| credentials.json     | Project root `credentials.json` |
| token.json           | Project root `token.json` |
| package.json         | Project root `package.json` |
| cron-generate.py     | Project root `cron-generate.py` |
| sheets_push_*.py     | Project root (all 4 files) |
| artifacts/merge_audit_report.md | `artifacts\merge_audit_report.md` |

---

## One-time setup on IONOS

1. Delete everything inside the **dfs** folder on the server (or delete and recreate **dfs**).
2. Recreate the structure above: create **assets**, **data**, **artifacts**.
3. Upload each file into the correct place (no `dist`).
4. Paste the **exact** index.html content above into **dfs/index.html**.
5. Set permissions as in the table.
6. Open **http://gamesmoviesmusic.com/** and hard-refresh (Ctrl+Shift+R).

---

## Quick check

- **dfs/** has 2 HTML files: `index.html`, `bankroll.html`.
- **dfs/assets/** has exactly 2 files: `index-Ba0xcbKA.js`, `index-Bp19Zl4m.css`.
- **dfs/index.html** contains `src="/assets/` and `href="/assets/` (no `dfs` in the path).
- There is **no** folder named **dist** inside dfs.
