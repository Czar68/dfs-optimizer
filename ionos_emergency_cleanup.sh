#!/bin/bash
# IONOS Emergency Cleanup Script
# Run this in IONOS SSH terminal or File Manager

echo "=== IONOS EMERGENCY CLEANUP ==="

# SECURITY: Remove public .env file immediately
echo "🚨 REMOVING SECURITY RISK: .env file"
rm /.env

# Remove broken/misnamed files
echo "🗑️  Removing broken files"
rm /dfsdashboard.html
rm /index.html

# Archive unrelated project
echo "📦 Archiving unrelated project"
mv /ebay-automation /ebay-automation-backup-$(date +%Y%m%d)

# Move working files to correct web root
echo "🚀 Moving files to web root (/htdocs/)"
cp -r /dfs/* /htdocs/

# Set correct permissions
echo "🔐 Setting permissions"
chmod 644 /htdocs/*.html
chmod 644 /htdocs/data/*.csv
chmod 755 /htdocs/data

echo "✅ CLEANUP COMPLETE!"
echo ""
echo "📋 Test URLs:"
echo "   https://dfs.gamesmoviesmusic.com/"
echo "   https://dfs.gamesmoviesmusic.com/dashboard.html"
echo ""
echo "🔍 If dashboard still doesn't work, check:"
echo "   1. Browser console (F12) for errors"
echo "   2. Network tab for failed requests"
echo "   3. Debug panel at top of page"
