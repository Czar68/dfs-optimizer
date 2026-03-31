#!/usr/bin/env node
// complete_pipeline.js - Generate, sync, and upload CSV files for dashboard

const { spawn } = require('child_process');
const { syncCsvFiles } = require('./sync_csv_to_data');
const { uploadCsvFiles } = require('./upload_csv_to_server');

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, { 
      stdio: 'inherit',
      shell: true 
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Command completed successfully`);
        resolve(true);
      } else {
        console.log(`❌ Command failed with exit code ${code}`);
        resolve(false);
      }
    });
    
    child.on('error', (err) => {
      console.error(`❌ Command error: ${err.message}`);
      reject(err);
    });
  });
}

async function runCompletePipeline() {
  console.log('=== DFS Optimizer Complete Pipeline ===');
  console.log('1. Generate CSV files from optimizer');
  console.log('2. Sync CSV files to data folders');
  console.log('3. Upload CSV files to server');
  console.log('4. Dashboard should show complete data\n');
  
  try {
    // Step 1: Generate CSV files
    console.log('\n📊 Step 1: Generating CSV files...');
    const generated = await runCommand('npm', ['run', 'generate:production']);
    
    if (!generated) {
      console.error('❌ Failed to generate CSV files');
      return false;
    }
    
    // Step 2: Sync CSV files
    console.log('\n📁 Step 2: Syncing CSV files to data folders...');
    const synced = syncCsvFiles();
    
    if (!synced) {
      console.error('❌ Failed to sync CSV files');
      return false;
    }
    
    // Step 3: Upload CSV files
    console.log('\n📤 Step 3: Uploading CSV files to server...');
    const uploaded = await uploadCsvFiles();
    
    if (!uploaded) {
      console.error('❌ Failed to upload CSV files');
      return false;
    }
    
    console.log('\n🎉 Complete pipeline finished successfully!');
    console.log('\n📋 Dashboard URLs:');
    console.log('   Landing: https://dfs.gamesmoviesmusic.com/');
    console.log('   Dashboard: https://dfs.gamesmoviesmusic.com/dashboard.html');
    console.log('\n✅ The dashboard should now show complete data for both PrizePicks and Underdog!');
    
    return true;
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  runCompletePipeline();
}

module.exports = { runCompletePipeline };
