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

// LOCK: server root is /. Deploy DFS app to /dfs/ only (IONOS subdomain dfs.* maps here).
const REMOTE_ROOT = '/';
const APP_PATH = 'dfs';

const ftpConfig = {
  host: process.env.SFTP_SERVER || process.env.FTP_SERVER,
  port: parseInt(process.env.FTP_PORT || process.env.SFTP_PORT || '22', 10),
  username: process.env.FTP_USERNAME,
  password: process.env.FTP_PASSWORD,
};

if (!ftpConfig.host) {
  console.error('Missing SFTP_SERVER or FTP_SERVER in .env');
  process.exit(1);
}
if (!ftpConfig.username || !ftpConfig.password) {
  console.error('Missing FTP_USERNAME or FTP_PASSWORD in .env');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const PUBLIC_DATA = path.join(ROOT, 'web-dashboard', 'public', 'data');
const DATA_FILES = [
  'prizepicks-cards.csv',
  'prizepicks-legs.csv',
  'underdog-cards.csv',
  'underdog-legs.csv',
  'last_fresh_run.json',
];

function copyRootDataToPublic() {
  if (!fs.existsSync(PUBLIC_DATA)) fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  let copied = 0;
  for (const name of DATA_FILES) {
    let src = path.join(ROOT, name);
    if (name === 'last_fresh_run.json' && !fs.existsSync(src))
      src = path.join(ROOT, 'artifacts', name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PUBLIC_DATA, name));
      copied++;
    }
  }
  if (copied) console.log('Copied', copied, 'data file(s) → web-dashboard/public/data/');
}

async function deploy() {
  try {
    const serverDir = REMOTE_ROOT + APP_PATH + '/';
    console.log('FTP Config:', { host: ftpConfig.host, port: ftpConfig.port, username: ftpConfig.username });
    console.log('Deploy target (root):', serverDir, '(uploading to /dfs/ directly from server root)');

    copyRootDataToPublic();
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
    const distData = path.join(distPath, 'data');
    if (fs.existsSync(distData)) {
      const names = ['prizepicks-legs.csv', 'underdog-legs.csv', 'prizepicks-cards.csv', 'underdog-cards.csv'];
      const counts = names.map((n) => {
        const p = path.join(distData, n);
        if (!fs.existsSync(p)) return `${n}: missing`;
        const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).length;
        return `${n}: ${Math.max(0, lines - 1)} rows`;
      });
      console.log('dist/data:', counts.join(' | '));
    }

    const sftp = new Client();
    await sftp.connect({
      host: ftpConfig.host,
      port: ftpConfig.port,
      username: ftpConfig.username,
      password: ftpConfig.password,
    });

    const deployTarget = REMOTE_ROOT + APP_PATH;
    try {
      await sftp.mkdir(deployTarget, { recursive: true });
    } catch (e) {
      if (e.message && !e.message.includes('already exists')) throw e;
    }

    const remoteAssets = deployTarget + '/assets';
    try {
      const existing = await sftp.list(remoteAssets);
      if (existing.length) {
        console.log(`Deleting ${existing.length} old file(s) in server ${remoteAssets}/ before upload`);
        await sftp.rmdir(remoteAssets, true);
      }
    } catch { /* directory may not exist yet */ }

    console.log('Uploading dist/ → server', deployTarget + '/', '(root → /dfs/)');
    await sftp.uploadDir(distPath, deployTarget);

    await sftp.end();

    const domain = process.env.LIVE_DOMAIN || 'gamesmoviesmusic.com';
    console.log('Deploy to server', deployTarget + '/', '✓ SUCCESS');
    console.log('--- Upload targets from root ---');
    console.log('  /dfs/ (this deploy)');
    console.log('--- BROWSER URL (IONOS subdomain) ---');
    console.log('  DFS: https://dfs.' + domain);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

deploy();
