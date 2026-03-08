#!/usr/bin/env node
/**
 * Build web-dashboard, then upload dist/ to IONOS via SFTP (port 22).
 * Loads .env from project root. Requires: SFTP_SERVER (or FTP_SERVER), FTP_USERNAME, FTP_PASSWORD.
 * Usage: npm run deploy:ftp
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Load .env from project root (so SFTP_* / FTP_* are set when run via npm run deploy:ftp)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Client = require('ssh2-sftp-client');

const ftpConfig = {
  host: process.env.SFTP_SERVER || process.env.FTP_SERVER,
  port: parseInt(process.env.FTP_PORT || process.env.SFTP_PORT || '22', 10),
  username: process.env.FTP_USERNAME,
  password: process.env.FTP_PASSWORD,
  remotePath: (process.env.REMOTE_PATH || process.env.SFTP_REMOTE_PATH || '/').replace(/\/+$/, '') || '/',
};

if (!ftpConfig.host) {
  console.error('Missing SFTP_SERVER or FTP_SERVER in .env');
  process.exit(1);
}
if (!ftpConfig.username || !ftpConfig.password) {
  console.error('Missing FTP_USERNAME or FTP_PASSWORD in .env');
  process.exit(1);
}

async function deploy() {
  try {
    console.log('FTP Config:', {
      host: ftpConfig.host,
      port: ftpConfig.port,
      username: ftpConfig.username,
      remotePath: ftpConfig.remotePath,
    });

    console.log('Building...');
    execSync('npm run build', {
      cwd: path.join(__dirname, '..', 'web-dashboard'),
      stdio: 'inherit',
    });

    const distPath = path.join(__dirname, '..', 'web-dashboard', 'dist');
    if (!fs.existsSync(distPath)) {
      console.error('web-dashboard/dist/ not found after build');
      process.exit(1);
    }

    const sftp = new Client();
    await sftp.connect({
      host: ftpConfig.host,
      port: ftpConfig.port,
      username: ftpConfig.username,
      password: ftpConfig.password,
    });

    console.log('Uploading dist/ →', ftpConfig.remotePath);
    await sftp.uploadDir(distPath, ftpConfig.remotePath);

    await sftp.end();
    console.log('Uploaded dist/ ✓ SUCCESS');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

deploy();
