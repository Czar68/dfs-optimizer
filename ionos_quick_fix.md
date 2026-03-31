# IONOS Quick Fix Commands
# Run these in IONOS File Manager or SSH terminal

## 🚨 IMMEDIATE SECURITY FIXES:
# Remove public .env file (contains credentials!)
rm /.env

# Remove broken files
rm /dfsdashboard.html
rm /index.html

# Archive unrelated project
mv /ebay-automation /ebay-automation-backup

## 🚀 MOVE FILES TO CORRECT WEB ROOT:
# Copy working files from /dfs/ to /htdocs/ (true web root)
cp -r /dfs/* /htdocs/

## 📋 VERIFICATION:
# Check web root contents
ls -la /htdocs/

# Should show:
# - index.html (21KB)
# - dashboard.html (45KB) 
# - data/ folder with 4 CSV files

## 🔐 SET PERMISSIONS:
chmod 644 /htdocs/*.html
chmod 644 /htdocs/data/*.csv
chmod 755 /htdocs/data

## ✅ TEST URLs:
# https://dfs.gamesmoviesmusic.com/
# https://dfs.gamesmoviesmusic.com/dashboard.html

## 🧹 CLEANUP OLD DIRECTORY (OPTIONAL):
# After confirming everything works:
# rm -rf /dfs/
