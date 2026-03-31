# DFS Optimizer Complete Data Pipeline Solution

## 🔍 Problem Analysis

### **Current Issues Identified:**

1. **Missing Underdog Cards**: `sheets_push_cards.py` reports "UD: 0" because no Underdog cards are being generated
2. **No Local CSV Files**: CSV files are generated to project root, but dashboard expects them in `/data/` folder
3. **Missing Upload Pipeline**: No automated FTP upload to server's `/dfs/data/` directory
4. **Data Flow Gap**: Optimizer generates CSV → Sheets push reads CSV → Dashboard needs CSV on server

### **Root Cause:**
- Underdog optimizer generates cards but may not be exporting them properly
- CSV files are written to project root, not copied to `/data/` folder for dashboard
- No automated pipeline to upload generated CSVs to server

---

## 🛠️ Complete Solution Implemented

### **✅ Scripts Created:**

1. **`scripts/sync_csv_to_data.js`** - Copies CSV files to data folders
2. **`scripts/upload_csv_to_server.js`** - Uploads CSV files to IONOS server via FTP
3. **`scripts/complete_pipeline.js`** - Runs complete pipeline: generate → sync → upload

### **✅ NPM Scripts Added:**

```json
"sync:csv": "node scripts/sync_csv_to_data.js",
"upload:csv": "node scripts/upload_csv_to_server.js", 
"pipeline:complete": "node scripts/complete_pipeline.js"
```

---

## 🚀 Step-by-Step Solution

### **Step 1: Diagnose Underdog Cards Issue**

**Check if Underdog optimizer is generating cards:**

```bash
npm run generate:production
```

**Look for output like:**
```
[UD] Wrote X cards to unified schema at [timestamp]
[UD] CSV: underdog-cards.csv
```

**If no UD cards are generated, the issue is in the Underdog optimizer, not the CSV pipeline.**

### **Step 2: Run Complete Pipeline**

**One-command solution:**

```bash
npm run pipeline:complete
```

**This runs:**
1. `npm run generate:production` - Generate all CSV files
2. `node scripts/sync_csv_to_data.js` - Copy to data folders
3. `node scripts/upload_csv_to_server.js` - Upload to server

### **Step 3: Manual Steps (if needed)**

**Generate CSV files:**
```bash
npm run generate:production
```

**Sync to data folders:**
```bash
npm run sync:csv
```

**Upload to server:**
```bash
npm run upload:csv
```

---

## 🔧 FTP Configuration

### **Required .env variables:**

```env
FTP_HOST=access-5019362808.webspace-host.com
FTP_USER=a901580
FTP_PASSWORD=your_password
FTP_PORT=22
```

### **Upload Details:**
- **Server**: IONOS FTP/SFTP
- **Remote directory**: `/dfs/data/`
- **Files**: 4 CSV files
- **Protocol**: SFTP (port 22)

---

## 📊 Expected Results

### **After successful pipeline:**

```
=== DFS Optimizer Complete Pipeline ===
1. Generate CSV files from optimizer
2. Sync CSV files to data folders  
3. Upload CSV files to server
4. Dashboard should show complete data

🚀 Running: npm run generate:production
✅ Command completed successfully

📁 Step 2: Syncing CSV files to data folders...
✅ Copied prizepicks-cards.csv to data/
✅ Copied prizepicks-legs.csv to data/
✅ Copied underdog-cards.csv to data/
✅ Copied underdog-legs.csv to data/

📤 Step 3: Uploading CSV files to server...
🔌 Connecting to FTP server...
✅ Connected to FTP server
✅ Uploaded prizepicks-cards.csv to /dfs/data/prizepicks-cards.csv
✅ Uploaded prizepicks-legs.csv to /dfs/data/prizepicks-legs.csv
✅ Uploaded underdog-cards.csv to /dfs/data/underdog-cards.csv
✅ Uploaded underdog-legs.csv to /dfs/data/underdog-legs.csv

🎉 Complete pipeline finished successfully!
```

### **Dashboard should show:**
- **PrizePicks cards**: ~400 cards with EV data
- **Underdog cards**: Variable (depends on optimizer output)
- **PrizePicks legs**: ~90 legs with EV data
- **Underdog legs**: ~136 legs with EV data

---

## 🚨 Troubleshooting

### **If Underdog cards are still missing:**

1. **Check optimizer output for UD cards:**
   ```bash
   npm run generate:production | grep "UD"
   ```

2. **Verify CSV files exist:**
   ```bash
   ls -la *.csv
   ```

3. **Check Underdog optimizer configuration:**
   - Review `src/run_underdog_optimizer.ts`
   - Ensure UD platform is included in generation

### **If FTP upload fails:**

1. **Check .env credentials:**
   ```bash
   cat .env | grep FTP
   ```

2. **Test FTP connection manually:**
   ```bash
   sftp a901580@access-5019362808.webspace-host.com
   ```

3. **Check remote directory permissions:**
   ```bash
   sftp> ls /dfs/data/
   ```

### **If dashboard still shows no data:**

1. **Check CSV files on server:**
   ```bash
   sftp> ls -la /dfs/data/
   ```

2. **Check browser console for errors:**
   - Open https://dfs.gamesmoviesmusic.com/dashboard.html
   - F12 → Console tab
   - Look for JavaScript errors

3. **Check network requests:**
   - F12 → Network tab
   - Reload page
   - Look for CSV file requests and status codes

---

## 🔄 Automation Setup

### **For automated daily runs:**

**Add to Windows Task Scheduler:**
```powershell
# Run daily at 8 AM
npm run pipeline:complete
```

**Or add to existing PowerShell scripts:**
```powershell
# In scripts/daily_betting_run.ps1
npm run pipeline:complete
```

---

## 📋 Verification Checklist

### **✅ Before running:**
- [ ] `.env` file contains FTP credentials
- [ ] Node.js dependencies installed (`npm install`)
- [ ] SSH2 SFTP client installed (`npm install ssh2-sftp-client`)

### **✅ After running:**
- [ ] CSV files exist in project root
- [ ] CSV files copied to `data/` folder
- [ ] CSV files uploaded to `/dfs/data/` on server
- [ ] Dashboard shows complete data
- [ ] No JavaScript errors in browser console

---

## 🎯 Expected Dashboard URLs

**Landing page:** https://dfs.gamesmoviesmusic.com/
**Dashboard:** https://dfs.gamesmoviesmusic.com/dashboard.html

**The dashboard should now display:**
- Real EV values (not 5% placeholders)
- Complete PrizePicks and Underdog data
- Working filters and functionality
- Debug panel showing successful data loading

---

## 📞 Support

**If issues persist:**
1. Check the individual script outputs
2. Verify FTP credentials and connectivity
3. Ensure Underdog optimizer is generating cards
4. Check browser console for JavaScript errors

**The complete pipeline should resolve all data flow issues and provide a fully functional dashboard!** 🎉
