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
const OUTPUT_LOGS = path.join(ROOT, 'data', 'output_logs');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const PUBLIC_DATA = path.join(ROOT, 'web-dashboard', 'public', 'data');

// Pipeline output: read from data/output_logs/
const PIPELINE_FILES = [
  'prizepicks-cards.csv',
  'prizepicks-legs.csv',
  'underdog-cards.csv',
  'underdog-legs.csv',
  'tier1.csv',
  'tier2.csv',
];

// Artifacts: read from artifacts/ (last_run is copied explicitly above; match_rate_history for TopBar badges).
const ARTIFACT_FILES = ['match_rate_history.csv'];

function copyPipelineDataToPublic() {
  if (!fs.existsSync(PUBLIC_DATA)) fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  let copied = 0;
  for (const name of PIPELINE_FILES) {
    const src = path.join(OUTPUT_LOGS, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PUBLIC_DATA, name));
      copied++;
    }
  }
  const lastRunSrc = path.join(ARTIFACTS_DIR, 'last_run.json');
  const lastFreshSrc = path.join(ARTIFACTS_DIR, 'last_fresh_run.json');
  if (fs.existsSync(lastRunSrc)) {
    fs.copyFileSync(lastRunSrc, path.join(PUBLIC_DATA, 'last_run.json'));
    copied++;
  } else if (fs.existsSync(lastFreshSrc)) {
    fs.copyFileSync(lastFreshSrc, path.join(PUBLIC_DATA, 'last_run.json'));
    copied++;
  }
  for (const name of ARTIFACT_FILES) {
    const src = path.join(ARTIFACTS_DIR, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(PUBLIC_DATA, name));
      copied++;
    }
  }
  if (copied) console.log('Copied', copied, 'data/artifact file(s) → web-dashboard/public/data/');
}

async function deploy() {
  try {
    const serverDir = REMOTE_ROOT + APP_PATH + '/';
    console.log('FTP Config:', { host: ftpConfig.host, port: ftpConfig.port, username: ftpConfig.username });
    console.log('Deploy target (root):', serverDir, '(uploading to /dfs/ directly from server root)');

    copyPipelineDataToPublic();
    console.log('Building...');
    const webDashboardDir = path.join(__dirname, '..', 'web-dashboard');
    const buildEnv = { ...process.env, VITE_DATA_BASE: 'data' };
    execSync('npm run build', {
      cwd: webDashboardDir,
      stdio: 'inherit',
      env: buildEnv,
    });

    const distPath = path.join(__dirname, '..', 'web-dashboard', 'dist');
    if (!fs.existsSync(distPath)) {
      console.error('web-dashboard/dist/ not found after build');
      process.exit(1);
    }
    const distData = path.join(distPath, 'data');
    if (fs.existsSync(distData)) {
      const names = ['prizepicks-legs.csv', 'underdog-legs.csv', 'prizepicks-cards.csv', 'underdog-cards.csv', 'tier1.csv', 'tier2.csv', 'last_run.json', 'match_rate_history.csv'];
      const counts = names.map((n) => {
        const p = path.join(distData, n);
        if (!fs.existsSync(p)) return `${n}: missing`;
        if (n.endsWith('.json')) return `${n}: ok`;
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
