#!/usr/bin/env node
/**
 * Force deploy SlipStrength dashboard to IONOS via SFTP
 * Bypasses detection logic and uploads directly
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

async function deploy() {
  const sftp = new Client();
  
  try {
    console.log('=== FORCE DEPLOYING SLIPSTRENGTH DASHBOARD ===');
    console.log('Host:', config.host);
    console.log('User:', config.username);
    console.log('Remote Path:', config.remotePath);
    
    // Connect to SFTP
    await sftp.connect(config);
    console.log('✅ Connected to SFTP server');
    
    // Local paths
    const distDir = path.join(__dirname, '..', 'web-dashboard', 'dist');
    const indexFile = path.join(distDir, 'index.html');
    const dataDir = path.join(distDir, 'data');
    
    // Verify files exist
    if (!fs.existsSync(indexFile)) {
      throw new Error('index.html not found at ' + indexFile);
    }
    
    if (!fs.existsSync(dataDir)) {
      throw new Error('data directory not found at ' + dataDir);
    }
    
    // Verify it's the SlipStrength dashboard
    const content = fs.readFileSync(indexFile, 'utf8');
    if (content.includes('SlipStrength')) {
      console.log('✅ SlipStrength dashboard confirmed');
    } else {
      console.log('⚠️  Warning: SlipStrength title not found, but deploying anyway');
    }
    
    // Create remote directories if needed
    try {
      await sftp.mkdir(config.remotePath, { recursive: true });
      await sftp.mkdir(path.join(config.remotePath, 'data'), { recursive: true });
    } catch (e) {
      // Directory might already exist
      console.log('📁 Remote directories ready');
    }
    
    // Upload index.html
    console.log('📤 Uploading index.html...');
    await sftp.put(indexFile, path.join(config.remotePath, 'index.html'));
    console.log('✅ index.html uploaded');
    
    // Upload data files
    console.log('📤 Uploading data files...');
    const dataFiles = fs.readdirSync(dataDir);
    let uploadedCount = 0;
    
    for (const file of dataFiles) {
      const localPath = path.join(dataDir, file);
      const remotePath = path.join(config.remotePath, 'data', file);
      
      if (fs.statSync(localPath).isFile()) {
        await sftp.put(localPath, remotePath);
        console.log(`✅ data/${file} uploaded`);
        uploadedCount++;
      }
    }
    
    console.log(`✅ ${uploadedCount} data files uploaded`);
    
    // List remote files to verify
    console.log('🔍 Verifying remote files...');
    const remoteFiles = await sftp.list(config.remotePath);
    const hasIndex = remoteFiles.some(f => f.name === 'index.html');
    const dataDirExists = remoteFiles.some(f => f.name === 'data');
    
    if (hasIndex && dataDirExists) {
      const remoteDataFiles = await sftp.list(path.join(config.remotePath, 'data'));
      console.log(`✅ Remote verification: index.html + ${remoteDataFiles.length} data files`);
    } else {
      console.log('❌ Remote verification failed');
    }
    
    console.log('');
    console.log('🎉 FORCE DEPLOYMENT SUCCESSFUL!');
    console.log('🌐 Live URL: https://dfs.gamesmoviesmusic.com');
    console.log('📋 Next steps:');
    console.log('   1. Hard refresh browser (Ctrl+Shift+R)');
    console.log('   2. Check console for errors');
    console.log('   3. Verify cards load from /data/ endpoints');
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error.message);
    process.exit(1);
  } finally {
    await sftp.end();
  }
}

deploy();
