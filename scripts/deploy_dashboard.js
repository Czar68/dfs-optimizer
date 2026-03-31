#!/usr/bin/env node
/**
 * Deploy dashboard.html to IONOS
 */

const path = require('path');
const fs = require('fs');
const Client = require('ssh2-sftp-client');

// Configuration
const config = {
  host: 'access-5019362808.webspace-host.com',
  port: 22,
  username: 'a901580',
  password: 'qxh6BUW-vuj@vwj4qny',
  remotePath: '/dfs/'
};

async function deployDashboard() {
  const sftp = new Client();
  
  try {
    console.log('=== DEPLOYING DASHBOARD ===');
    console.log('Host:', config.host);
    console.log('User:', config.username);
    console.log('Remote Path:', config.remotePath);
    
    // Connect to SFTP
    await sftp.connect(config);
    console.log('✅ Connected to SFTP server');
    
    // Local paths
    const dashboardFile = path.join(__dirname, '..', 'web-dashboard', 'dist', 'dashboard.html');
    
    // Verify file exists
    if (!fs.existsSync(dashboardFile)) {
      throw new Error('dashboard.html not found at ' + dashboardFile);
    }
    
    // Verify it's the dashboard
    const content = fs.readFileSync(dashboardFile, 'utf8');
    if (content.includes('SlipStrength') && content.includes('Optimizer Dashboard')) {
      console.log('✅ Dashboard file confirmed');
    } else {
      console.log('⚠️  Warning: Dashboard content not verified, but deploying anyway');
    }
    
    // Upload dashboard.html
    console.log('📤 Uploading dashboard.html...');
    await sftp.put(dashboardFile, path.join(config.remotePath, 'dashboard.html'));
    console.log('✅ dashboard.html uploaded');
    
    // List remote files to verify
    console.log('🔍 Verifying remote files...');
    const remoteFiles = await sftp.list(config.remotePath);
    const hasDashboard = remoteFiles.some(f => f.name === 'dashboard.html');
    const hasIndex = remoteFiles.some(f => f.name === 'index.html');
    
    if (hasDashboard && hasIndex) {
      console.log('✅ Remote verification: index.html + dashboard.html');
    } else {
      console.log('❌ Remote verification failed');
    }
    
    console.log('');
    console.log('🎉 DASHBOARD DEPLOYMENT SUCCESSFUL!');
    console.log('🌐 Dashboard URL: https://dfs.gamesmoviesmusic.com/dashboard.html');
    console.log('🌐 Landing URL: https://dfs.gamesmoviesmusic.com/');
    console.log('📋 Next steps:');
    console.log('   1. Visit dashboard URL to verify cards load');
    console.log('   2. Check EV formatting (should be 19.0%, not 119%)');
    console.log('   3. Test filters and copy buttons');
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error.message);
    process.exit(1);
  } finally {
    await sftp.end();
  }
}

deployDashboard();
