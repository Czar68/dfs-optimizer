# NBA Pipeline - One-Click Deploy Checklist

## Quick Start

### 1. Run Full Pipeline
```powershell
.\run-nba.ps1
```

**What it does:**
- ✅ Compiles TypeScript (`npx tsc -p .`)
- ✅ Runs optimizer (`node dist/run_optimizer.js --sports NBA`)
- ✅ Pushes to Sheets (if SA configured)
- ✅ Builds dashboard (`cd web-dashboard && npm run build`)

**Output:**
- `prizepicks-legs.csv` - All optimized legs
- `prizepicks-cards.csv` - Generated cards
- `web-dashboard/dist/` - Built dashboard ready for Netlify

### 2. Link repo (first time only)
1. **app.netlify.com/sites/dynamic-gingersnap-3ee837** → **Site configuration** → **Build & deploy** → **Repository**
2. **Link to repo** → **GitHub** → **Czar68/nba-props-dashboard** → **Authorize** → **main** → **Save**
3. **Deploy settings** → **Clear cache and deploy site** (triggers test build)

### 3. Deploy to Netlify (git push → auto-build)
```powershell
.\run-nba.ps1 -Sport NBA   # Generates web-dashboard/dist/
git add .
git commit -m "fix: netlify deploy Feb 19 NBA"
git push origin main        # Auto-builds on Netlify
```

Or use the deploy script (build + optional commit + push):
```powershell
.\deploy-nba.ps1            # Build + push
.\deploy-nba.ps1 -Commit     # Build + add/commit + push
.\deploy-nba.ps1 -SkipBuild  # Push only (Netlify builds from source)
```

### 4. Verify live
- **Deploys** tab → **Latest** → **Published**
- `curl -sI https://dynamic-gingersnap-3ee837.netlify.app` → expect **200 OK**

### 5. Schedule Daily Run (6 PM)
```powershell
.\setup-scheduler.ps1
```

**Options:**
- `.\setup-scheduler.ps1` - Default 6 PM, NBA
- `.\setup-scheduler.ps1 -Time "15:00"` - 3 PM
- `.\setup-scheduler.ps1 -Sport NCAAB` - NCAAB instead

**Verify:**
```powershell
Get-ScheduledTask -TaskName "NBA Props Optimizer Daily"
```

**Run Manually:**
```powershell
Start-ScheduledTask -TaskName "NBA Props Optimizer Daily"
```

---

## Parameters

### run-nba.ps1
- `-Sport`: `NBA` (default), `NCAAB`, `All`
- `-Date`: `YYYY-MM-DD` (future: game filtering)
- `-Games`: `"HOU@CHA,BKN@CLE"` (future: specific games)

**Examples:**
```powershell
.\run-nba.ps1 -Sport NBA
.\run-nba.ps1 -Sport NCAAB
.\run-nba.ps1 -Sport All
```

---

## Verification Steps

### After Pipeline Run
1. ✅ Check `prizepicks-legs.csv` exists and has rows
2. ✅ Check `web-dashboard/dist/index.html` exists
3. ✅ Check `web-dashboard/dist/data/*.csv` updated
4. ✅ Verify Sheets push (if SA configured)

### After Netlify Deploy
1. ✅ **Deploys** tab → Latest deploy → **Published**
2. ✅ `curl -sI https://dynamic-gingersnap-3ee837.netlify.app` → **200 OK**
3. ✅ Open live URL in browser → dashboard loads (e.g. Feb 19 NBA slate)
4. ✅ API / Sheets if used

---

## Troubleshooting

### Compilation Fails
- Check `tsconfig.json` paths
- Run `npm install` to ensure dependencies
- Check TypeScript version: `npx tsc --version`

### Optimizer Returns 0 Legs
- Check TheRundown API quota (20,000/day)
- Verify markets configured (29, 35, 38, 39, 93, 99, 297, 298)
- Check `MIN_LEG_EV` and `MIN_EDGE_PER_LEG` thresholds
- Run with `--force-rundown` if quota exhausted

### Sheets Push Fails
- Verify `GOOGLE_APPLICATION_CREDENTIALS` env var set
- Or place SA JSON at `.\config\local-sa.json`
- Check `TEST_SPREADSHEET_ID` matches your sheet
- Non-critical - pipeline continues if Sheets fails

### Dashboard Build Fails
- Check `web-dashboard/package.json` dependencies
- Run `cd web-dashboard && npm install`
- Verify `web-dashboard/vite.config.ts` configured
- Check for TypeScript errors in dashboard code

### Netlify build fails (no web-dashboard/dist)
- **Build settings**: Site configuration → Build & deploy → Build settings → confirm:
  - **Build command:** `cd web-dashboard && npm install && npm run build`
  - **Publish directory:** `web-dashboard/dist`
- **Trigger**: Deploy settings → **Clear cache and deploy site**
- Pipeline uses **sample data** when optimizer fails (SGO rate limit, etc.) so dashboard still builds; push → full slate when live data returns.

### Task Scheduler Not Running
- Run PowerShell as Administrator
- Check task exists: `Get-ScheduledTask -TaskName "NBA Props Optimizer Daily"`
- Verify task enabled: Task Scheduler → NBA Props Optimizer Daily → Properties → General → Enabled
- Check task history: Task Scheduler → Task Scheduler Library → NBA Props Optimizer Daily → History

---

## Environment Variables

### Required (Local)
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Service Account JSON (optional, for Sheets)

### Required (Netlify)
- `GOOGLE_APPLICATION_CREDENTIALS` - Full SA JSON content (multiline string)
- `TEST_SPREADSHEET_ID` - Google Sheet ID (optional, for testing)

**Set in Netlify:**
1. Go to: https://app.netlify.com/sites/dynamic-gingersnap-3ee837/settings/env
2. Add variable: `GOOGLE_APPLICATION_CREDENTIALS`
3. Value: Paste full SA JSON (all lines, including `{}`)
4. Save

---

## File Structure

```
nba-props-optimizer/
├── run-nba.ps1              # Main pipeline script
├── deploy-nba.ps1           # Netlify deploy helper
├── setup-scheduler.ps1      # Task Scheduler setup
├── prizepicks-legs.csv      # Output: optimized legs
├── prizepicks-cards.csv     # Output: generated cards
├── web-dashboard/
│   └── dist/                # Built dashboard (deploy this)
│       ├── index.html
│       └── data/
│           └── *.csv        # Dashboard data files
└── docs/
    └── DEPLOY_CHECKLIST_NBA.md  # This file
```

---

## Success Criteria

✅ **Pipeline Success:**
- TypeScript compiles without errors
- Optimizer produces legs CSV with > 0 rows
- Dashboard builds successfully
- `dist/` folder contains `index.html` and data files

✅ **Deploy Success:**
- Netlify site loads without errors
- Dashboard displays today's games
- Data files load correctly
- API endpoints respond (if applicable)

✅ **Scheduler Success:**
- Task runs at scheduled time
- No errors in Task Scheduler history
- CSVs generated in project root
- Dashboard rebuilt automatically

---

## Next Steps

After successful deploy:
1. Monitor first scheduled run (6 PM)
2. Verify Sheets push working
3. Check Netlify site updates daily
4. Adjust `MIN_LEG_EV` thresholds if needed
5. Add game filtering if required
