# DFS Optimizer Data Flow Analysis

## 🔍 Dashboard Data Loading Flow

### **Current Dashboard Fetch Logic:**
```javascript
// From dashboard.html - loadData() function
const [ppCards, udCards, ppLegs, udLegs] = await Promise.all([
    fetch('./data/prizepicks-cards.csv'),     // ✅ Relative path
    fetch('./data/underdog-cards.csv'),       // ✅ Relative path  
    fetch('./data/prizepicks-legs.csv'),       // ✅ Relative path
    fetch('./data/underdog-legs.csv')          // ✅ Relative path
]);
```

### **Expected Request URLs:**
- Dashboard location: `https://dfs.gamesmoviesmusic.com/dashboard.html`
- CSV files should load from: `https://dfs.gamesmoviesmusic.com/data/prizepicks-cards.csv`
- Server location: `/dfs/data/prizepicks-cards.csv` ✅

---

## 📊 Google Sheets Push Scripts

### **Scripts Found:**
- `sheets_push_cards.py` - Push PP+UD cards to Google Sheets
- `sheets_push_legs.py` - Push PP+UD legs to Google Sheets  
- `sheets_push_underdog_cards.py` - Push UD cards only
- `sheets_push_underdog_legs.py` - Push UD legs only

### **Script Execution Locations:**

#### **1. Local Execution (Windows PowerShell Scripts):**
- `scripts/daily_betting_run.ps1` - Main automation script
- `scripts/refresh.ps1` - Manual refresh script
- `scripts/run_optimizer.ps1` - Optimizer runner

#### **2. Execution Flow:**
```powershell
# From daily_betting_run.ps1
python sheets_push_cards.py           # Push PrizePicks + Underdog cards
python sheets_push_underdog_legs.py   # Push Underdog legs
python sheets_push_singles.py         # Push single bets
```

#### **3. Script Purpose:**
```python
# From sheets_push_cards.py
PP_CSV         = "prizepicks-cards.csv"     # Reads local CSV
UD_CSV         = "underdog-cards.csv"       # Reads local CSV
SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"  # Pushes to Google Sheets
```

---

## 🔄 Complete Data Pipeline

### **Data Generation (Local):**
1. **Optimizer runs locally** → Generates CSV files
2. **CSV files created** in local project directory
3. **Sheets push scripts read local CSVs** → Push to Google Sheets

### **Data Deployment (Server):**
1. **CSV files uploaded** to `/dfs/data/` on IONOS server
2. **Dashboard fetches from `/dfs/data/`** → Loads data
3. **Dashboard displays EV calculations** → Shows optimized parlays

---

## 🚨 Current Issue Analysis

### **Problem: Dashboard Not Loading Data**

**✅ Correct Fetch Paths:** Dashboard uses `./data/` (relative)  
**✅ Correct Server Location:** Files are in `/dfs/data/`  
**✅ Correct URL Structure:** Should resolve to `https://dfs.gamesmoviesmusic.com/data/`

### **Debugging Steps Needed:**

#### **1. Browser Network Tab Check:**
```
Open: https://dfs.gamesmoviesmusic.com/dashboard.html
F12 → Network tab → Reload
Look for: prizepicks-cards.csv request
Check: Request URL (should be https://dfs.gamesmoviesmusic.com/data/prizepicks-cards.csv)
Check: Status code (should be 200)
```

#### **2. Console Error Check:**
```
F12 → Console tab
Look for: JavaScript errors
Look for: Fetch errors
Look for: PapaParse errors
```

#### **3. File Path Verification:**
```
Dashboard: https://dfs.gamesmoviesmusic.com/dashboard.html
CSV files: https://dfs.gamesmoviesmusic.com/data/prizepicks-cards.csv
Should resolve to: /dfs/data/prizepicks-cards.csv on server
```

---

## 📋 Execution Environment

### **Google Sheets Scripts:**
- **Run locally** on Windows machine
- **Executed by PowerShell scripts** in `scripts/` folder
- **Read local CSV files** → Push to Google Sheets
- **NOT server-side** - they're local automation

### **Dashboard:**
- **Runs on server** (IONOS hosting)
- **Fetches CSV files from server** `/dfs/data/`
- **Displays data in browser** - client-side JavaScript

### **Data Sync:**
1. **Local optimizer** → generates CSV files
2. **Local sheets_push** → uploads to Google Sheets  
3. **Deploy script** → uploads CSV to server
4. **Dashboard** → loads from server CSV files

---

## 🔧 Potential Issues

### **1. CSV File Sync:**
- Local CSV files might be different from server CSV files
- Need to verify latest data is deployed to server

### **2. Path Resolution:**
- Relative paths `./data/` should work from `/dfs/dashboard.html`
- But might need absolute paths `/data/` depending on server config

### **3. File Permissions:**
- CSV files in `/dfs/data/` need proper read permissions
- Web server must be able to serve the files

---

## 🎯 Immediate Actions

### **Check Browser Network Tab:**
1. Visit `https://dfs.gamesmoviesmusic.com/dashboard.html`
2. Open F12 → Network tab
3. Reload page
4. Find CSV file requests
5. Check request URLs and status codes

### **Verify File Accessibility:**
1. Try accessing `https://dfs.gamesmoviesmusic.com/data/prizepicks-cards.csv` directly
2. Should show CSV content or download file
3. If 404 error, path resolution issue

### **Check Console Errors:**
1. F12 → Console tab
2. Look for JavaScript errors
3. Look for fetch failures
4. Look for PapaParse parsing errors

**The key insight: Google Sheets scripts run LOCALLY, dashboard runs on SERVER. The issue is likely path resolution or file permissions on the server side.**
