#!/usr/bin/env node
// upload_csv_to_server.js - Upload CSV files to IONOS server via SFTP

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const SftpClient = require('ssh2-sftp-client');

// Use your actual .env variable names
const config = {
  host: process.env.SFTP_SERVER,
  port: parseInt(process.env.FTP_PORT) || 22,
  username: process.env.FTP_USERNAME,
  password: process.env.FTP_PASSWORD
};

const CSV_FILES = [
  'prizepicks-cards.csv',
  'prizepicks-legs.csv',
  'underdog-cards.csv',
  'underdog-legs.csv'
];

async function uploadCsvFiles() {
  console.log('=== CSV Upload to IONOS Server ===');

  console.log('Config loaded:', {
    host: config.host ? '✓' : '✗',
    username: config.username ? '✓' : '✗',
    password: config.password ? '✓' : '✗',
    port: config.port
  });

  if (!config.host || !config.username || !config.password) {
    console.error('❌ Missing SFTP credentials in .env file');
    console.log('Required: SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD');
    return false;
  }

  const sftp = new SftpClient();
  const PROJECT_ROOT = process.cwd();
  let uploaded = 0;
  let failed = 0;

  try {
    console.log(`🔌 Connecting to SFTP server: ${config.host}:${config.port}...`);
    await sftp.connect(config);
    console.log('✅ Connected to SFTP server');

    const remoteDir = '/dfs/data';
    try {
      await sftp.mkdir(remoteDir, true);
      console.log(`✅ Ensured remote directory exists: ${remoteDir}`);
    } catch (err) {
      console.log(`ℹ️ Remote directory ${remoteDir} already exists`);
    }

    for (const file of CSV_FILES) {
      const localPath = path.join(PROJECT_ROOT, 'data', file);
      const remotePath = `${remoteDir}/${file}`;

      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        console.log(`📤 Uploading ${file} (${Math.round(stats.size / 1024)} KB)...`);
        try {
          await sftp.put(localPath, remotePath);
          console.log(`✅ Uploaded ${file}`);
          uploaded++;
        } catch (err) {
          console.error(`❌ Failed to upload ${file}:`, err.message);
          failed++;
        }
      } else {
        console.log(`⚠️ Local file missing: ${localPath}`);
        failed++;
      }
    }

    console.log(`\n📊 Upload Summary:`);
    console.log(`  ✅ Uploaded: ${uploaded} files`);
    console.log(`  ❌ Failed: ${failed} files`);

    if (uploaded > 0) {
      console.log(`\n🎉 CSV files uploaded to server!`);
      console.log(`   Dashboard: https://dfs.gamesmoviesmusic.com/dashboard.html`);
    }

  } catch (err) {
    console.error('❌ SFTP connection failed:', err.message);
    failed++;
  } finally {
    try {
      await sftp.end();
      console.log('🔌 SFTP connection closed');
    } catch (err) {
      // ignore
    }
  }

  return uploaded > 0 && failed === 0;
}

if (require.main === module) {
  uploadCsvFiles();
}

module.exports = { uploadCsvFiles };