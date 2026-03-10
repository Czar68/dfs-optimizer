# Iron-Clad Root Lockdown — Deployment Confirmation

## Server root structure (after deploy)

The **server root** `/` should contain only:

| Item | Description |
|------|--------------|
| **.htaccess** | HTTPS redirect + `Options -Indexes` (deployed by `npm run menu`) |
| **index.html** | Empire Menu with absolute subdomain links (deployed by `npm run menu`) |
| **/dfs/** | DFS app (built + deployed by `npm run deploy:ftp` or `npm run empire`) |
| **/ebay-automation/** | Your eBay app (deploy separately; not part of this repo’s scripts) |

No `dist/`, `assets/`, `js/`, `css/`, or old dashboard `index.html` at root.  
`npm run menu` removes legacy `dist`, `assets`, `js`, `css` from server root before uploading.

---

## Source files (this repo)

| Purpose | Source file | Deploys to |
|---------|-------------|------------|
| Root .htaccess | `scripts/htdocs-root.htaccess` | `/` (server root) |
| Empire Menu | `scripts/htdocs-index.html` | `/index.html` |
| DFS app + data | `web-dashboard/dist/` (build output) | `/dfs/` |
| DFS .htaccess | `web-dashboard/public/.htaccess` | `/dfs/.htaccess` |

---

## Root .htaccess (HTTPS + no directory listing)

```
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
Options -Indexes
```

---

## Empire Menu links (absolute URLs)

All use `LIVE_DOMAIN` from root `.env`:

- **DFS:** `https://dfs.{{LIVE_DOMAIN}}`
- **eBay:** `https://ebay.{{LIVE_DOMAIN}}`
- **Logs:** `https://logs.{{LIVE_DOMAIN}}`

No relative paths.

---

## /dfs/ .htaccess (no-cache only)

Only cache-control for `.csv` and `.json`. No SSL/HTTPS (root handles that).

---

## Deployment sequence

1. **Lobby (root):**  
   `npm run menu`  
   → Uploads `index.html` + `.htaccess` to `/`, removes legacy root dirs.

2. **DFS app:**  
   `npm run deploy:ftp` or `npm run empire`  
   → Builds `web-dashboard`, uploads to `/dfs/` only.

3. **eBay:**  
   Deploy your eBay app to `/ebay-automation/` with your own process.

---

## Ready for deploy

- [x] Legacy `dist/` and root `index.html` removed from **project** root.
- [x] Root .htaccess: HTTPS redirect + `Options -Indexes`.
- [x] Empire menu: absolute URLs via `LIVE_DOMAIN`.
- [x] DFS .htaccess: cache-control only.
- [x] Menu deploy cleans server root legacy dirs before upload.

Run: `npm run menu` then `npm run deploy:ftp` (or `npm run empire`).
