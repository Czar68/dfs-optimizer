// Simple static dashboard deployment
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2-sftp-client');

const config = {
  host: process.env.SFTP_SERVER || 'access-5019362808.webspace-host.com',
  port: 22,
  username: process.env.FTP_USERNAME || 'a901580',
  password: process.env.FTP_PASSWORD,
  remotePath: '/dfs/'
};

if (!config.password) {
  console.error('❌ FTP_PASSWORD not set. Please set environment variable:');
  console.error('   process.env.FTP_PASSWORD = "your-password"');
  process.exit(1);
}

const sftp = new Client();

async function deploy() {
  try {
    console.log('=== DEPLOYING STATIC DASHBOARD ===');
    
    const distDir = path.join(__dirname, '../web-dashboard/dist');
    const indexFile = path.join(distDir, 'index.html');
    const dataDir = path.join(distDir, 'data');
    
    if (!fs.existsSync(indexFile)) {
      console.error('❌ Static dashboard not found at', indexFile);
      process.exit(1);
    }
    
    // Verify it's the static dashboard
    const content = fs.readFileSync(indexFile, 'utf8');
    if (content.includes('SlipStrength – DFS Optimizer Dashboard')) {
      console.log('✅ Static dashboard confirmed');
    } else {
      console.error('❌ Static dashboard content not detected');
      process.exit(1);
    }
    
    console.log('🚀 Connecting to IONOS...');
    console.log('   Server:', config.host);
    console.log('   Path:', config.remotePath);
    console.log('   User:', config.username);
    
    await sftp.connect(config);
    
    console.log('📁 Uploading files...');
    
    // Upload index.html
    await sftp.put(indexFile, path.join(config.remotePath, 'index.html'));
    console.log('✅ index.html uploaded');
    
    // Upload data files
    if (fs.existsSync(dataDir)) {
      const dataFiles = fs.readdirSync(dataDir);
      for (const file of dataFiles) {
        const localPath = path.join(dataDir, file);
        const remotePath = path.join(config.remotePath, 'data', file);
        await sftp.put(localPath, remotePath);
        console.log(`✅ data/${file} uploaded`);
      }
    }
    
    console.log('');
    console.log('✅ Static dashboard deployed successfully!');
    console.log('🌐 URL: https://dfs.gamesmoviesmusic.com');
    console.log('📋 Dashboard features:');
    console.log('   • Real-time card loading');
    console.log('   • Platform filtering (PP/UD/Both)');
    console.log('   • EV% sorting');
    console.log('   • Copy slip functionality');
    console.log('   • Auto-refresh every 5 minutes');
    
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
  } finally {
    await sftp.end();
  }
}

deploy();
