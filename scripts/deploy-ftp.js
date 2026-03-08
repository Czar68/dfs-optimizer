#!/usr/bin/env node
/**
 * Build web-dashboard, then upload dist/ to IONOS via SFTP (port 22).
 * Requires: SFTP_SERVER (or FTP_SERVER), FTP_USERNAME, FTP_PASSWORD
 * Usage: npm run deploy:ftp
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Client = require('ssh2-sftp-client');

async function deploy() {
  const username = process.env.FTP_USERNAME;
  const password = process.env.FTP_PASSWORD;

  try {
    console.log('Building...');
    execSync('npm run build', { cwd: path.join(__dirname, '..', 'web-dashboard'), stdio: 'inherit' });

    const distPath = path.join(__dirname, '..', 'web-dashboard', 'dist');
    if (!fs.existsSync(distPath)) {
      console.error('web-dashboard/dist/ not found after build');
      process.exit(1);
    }

    const host = process.env.SFTP_SERVER || process.env.FTP_SERVER;
    if (!host || !username || !password) {
      console.error('Build done. Set SFTP_SERVER (or FTP_SERVER), FTP_USERNAME, FTP_PASSWORD to upload.');
      process.exit(1);
    }

    const sftp = new Client();
    await sftp.connect({
      host,
      port: parseInt(process.env.SFTP_PORT, 10) || 22,
      username: process.env.FTP_USERNAME,
      password: process.env.FTP_PASSWORD,
    });

    const remotePath = process.env.SFTP_REMOTE_PATH || '/';
    console.log('Uploading dist/ →', remotePath);
    await sftp.uploadDir(distPath, remotePath);

    await sftp.end();
    console.log('Uploaded dist/ ✓');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

deploy();
