# IONOS File Structure Cleanup Script

## Current Issues Identified:
- Root level has misnamed files and old content
- `.env` file is publicly accessible (security risk)
- Multiple conflicting directories
- Old React template files mixed with new static files

## Cleanup Steps for IONOS File Manager:

### 1. DELETE these files from ROOT (/):
- [ ] `\dfsdashboard.html` (misnamed file)
- [ ] `index.html` (old 374-byte React template)
- [ ] `.env` (SECURITY RISK - contains credentials)

### 2. INVESTIGATE these directories:
- [ ] Check `/htdocs/` contents (likely true web root)
- [ ] Check `/dfs/` contents (may have old versions)
- [ ] Archive or delete `/ebay-automation/` if not needed
- [ ] Keep `/kunden/` and `/logs/` (hosting system files)

### 3. CLEAN STRUCTURE TARGET:
```
/htdocs/ (web root)
├── index.html          (21KB landing page)
├── dashboard.html      (45KB optimizer dashboard)
├── data/
│   ├── prizepicks-cards.csv
│   ├── prizepicks-legs.csv
│   ├── underdog-cards.csv
│   └── underdog-legs.csv
└── .htaccess          (authentication, if needed)
```

### 4. DEPLOYMENT VERIFICATION:
After cleanup, test:
- https://dfs.gamesmoviesmusic.com/ (should show landing page)
- https://dfs.gamesmoviesmusic.com/dashboard.html (should work)

### 5. SECURITY ACTIONS:
- [ ] Ensure `.env` is removed from public access
- [ ] Move any credentials to secure location
- [ ] Verify authentication is working properly

## Commands to Run (if SSH access available):

```bash
# Remove problematic files
rm /dfsdashboard.html
rm /index.html  
rm /.env

# Check current structure
ls -la /
ls -la /htdocs/
ls -la /dfs/

# Deploy clean structure
cp -r web-dashboard/* /htdocs/
```

## Notes:
- The current deployment script uploads to `/dfs/` but site may serve from `/htdocs/`
- Need to verify which directory is actually the web root
- After cleanup, update deployment script to target correct directory
