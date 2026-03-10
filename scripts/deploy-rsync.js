#!/usr/bin/env node
/**
 * Build web-dashboard, then deploy dist/ to IONOS /dfs/ (server root) via rsync (SSH).
 * Requires: .env with FTP_USERNAME, SFTP_SERVERdfs (e.g. host:/dfs for server root /dfs/).
 * Usage: npm run deploy
 * Fallback if rsync not found: npm run deploy:ftp
 */

const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const user = process.env.FTP_USERNAME;
const target = process.env.SFTP_SERVERdfs;

if (!user || !target) {
  console.error('Missing FTP_USERNAME or SFTP_SERVERdfs in .env');
  process.exit(1);
}

const webDashboard = path.join(__dirname, '..', 'web-dashboard');
const distPath = path.join(webDashboard, 'dist');
const remote = `${user}@${target.replace(/\/+$/, '')}/`;

console.log('Building...');
execSync('npm run build', { cwd: webDashboard, stdio: 'inherit' });

console.log('Deploying', distPath, '→', remote);
try {
  execSync(`rsync -avz --delete "${distPath}/" "${remote}"`, {
    stdio: 'inherit',
    shell: true,
  });
  console.log('Deployed to /dfs/ ✓');
} catch (e) {
  console.error('rsync failed. On Windows use: npm run deploy:ftp (REMOTE_PATH=dfs)');
  process.exit(1);
}
