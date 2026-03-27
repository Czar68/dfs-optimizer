#!/usr/bin/env node
/**
 * Sync dashboard JSON into web-dashboard/public, then build + upload dist/ to IONOS /dfs/
 * (https://dfs.<LIVE_DOMAIN>/). Reuses existing deploy scripts — no new hosting stack.
 *
 * Prerequisites (root .env — never commit secrets):
 *   - FTP: SFTP_SERVER or FTP_SERVER + FTP_USERNAME + FTP_PASSWORD → npm run deploy:ftp
 *   - rsync: FTP_USERNAME + SFTP_SERVERdfs (host:/path) + rsync on PATH → npm run deploy
 *
 * Override: DFS_PUBLISH_METHOD=ftp | rsync
 *
 * Usage: npm run publish:dashboard-live
 */

const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.join(__dirname, '..');

function fail(step, detail) {
  console.error(`[publish:dashboard-live] FAILED at: ${step}`);
  if (detail) console.error(detail);
  process.exit(1);
}

console.log('[publish:dashboard-live] Step 1/2: npm run sync:dashboard-reports');
try {
  execSync('npm run sync:dashboard-reports', { cwd: root, stdio: 'inherit' });
} catch {
  fail('sync:dashboard-reports', 'Fix data/reports and sync script, then retry.');
}

const method = (process.env.DFS_PUBLISH_METHOD || '').toLowerCase();
const ftpHost = process.env.SFTP_SERVER || process.env.FTP_SERVER;
const hasFtpCreds =
  Boolean(process.env.FTP_PASSWORD) && Boolean(process.env.FTP_USERNAME) && Boolean(ftpHost);
const hasRsyncTarget =
  Boolean(process.env.SFTP_SERVERdfs) && Boolean(process.env.FTP_USERNAME);

let deployCmd;
if (method === 'rsync') {
  deployCmd = 'npm run deploy';
} else if (method === 'ftp') {
  deployCmd = 'npm run deploy:ftp';
} else if (hasFtpCreds) {
  deployCmd = 'npm run deploy:ftp';
} else if (hasRsyncTarget) {
  deployCmd = 'npm run deploy';
} else {
  fail(
    'configure .env',
    'Set SFTP_SERVER (or FTP_SERVER) + FTP_USERNAME + FTP_PASSWORD for FTP upload,\n' +
      '  or SFTP_SERVERdfs + FTP_USERNAME for rsync (see scripts/deploy-rsync.js).\n' +
      '  Optional: DFS_PUBLISH_METHOD=ftp|rsync to force one path.'
  );
}

console.log(`[publish:dashboard-live] Step 2/2: ${deployCmd} (build + upload web-dashboard/dist → /dfs/)`);
try {
  execSync(deployCmd, { cwd: root, stdio: 'inherit' });
} catch {
  fail(deployCmd, 'Build or upload failed — see messages above.');
}

console.log('[publish:dashboard-live] OK — live site should serve new dist/ (hard-refresh browser if cached).');
