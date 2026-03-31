#!/usr/bin/env node
// sync_csv_to_data.js - Copy generated CSV files to data folder for dashboard

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DIST_DIR = path.join(PROJECT_ROOT, 'web-dashboard', 'dist', 'data');

// CSV files that need to be synced
const CSV_FILES = [
  'prizepicks-cards.csv',
  'prizepicks-legs.csv', 
  'underdog-cards.csv',
  'underdog-legs.csv'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function syncCsvFiles() {
  console.log('=== CSV Sync to Data Folders ===');
  
  // Ensure target directories exist
  ensureDir(DATA_DIR);
  ensureDir(DIST_DIR);
  
  let copied = 0;
  let missing = 0;
  
  for (const file of CSV_FILES) {
    const sourcePath = path.join(PROJECT_ROOT, file);
    const dataPath = path.join(DATA_DIR, file);
    const distPath = path.join(DIST_DIR, file);
    
    if (fs.existsSync(sourcePath)) {
      // Copy to local data folder
      fs.copyFileSync(sourcePath, dataPath);
      console.log(`✅ Copied ${file} to data/`);
      
      // Copy to dist folder for deployment
      fs.copyFileSync(sourcePath, distPath);
      console.log(`✅ Copied ${file} to web-dashboard/dist/data/`);
      
      copied++;
    } else {
      console.log(`❌ Missing ${file} in project root`);
      missing++;
    }
  }
  
  console.log(`\n📊 Sync Summary:`);
  console.log(`  ✅ Copied: ${copied} files`);
  console.log(`  ❌ Missing: ${missing} files`);
  
  if (missing > 0) {
    console.log(`\n⚠️  Run 'npm run generate:production' to create missing CSV files`);
  }
  
  return copied > 0;
}

if (require.main === module) {
  syncCsvFiles();
}

module.exports = { syncCsvFiles };
