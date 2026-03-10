#!/usr/bin/env node
/**
 * Root lockdown: upload Empire menu + root .htaccess (HTTPS) to server root /.
 * Injects current date at {{DATE}}. Uses same SFTP credentials as deploy:ftp.
 * Usage: npm run menu
 */

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Client = require('ssh2-sftp-client');

const REMOTE_ROOT = '/';

const config = {
  host: process.env.SFTP_SERVER || process.env.FTP_SERVER,
  port: parseInt(process.env.FTP_PORT || process.env.SFTP_PORT || '22', 10),
  username: process.env.FTP_USERNAME,
  password: process.env.FTP_PASSWORD,
};

const LIVE_DOMAIN = process.env.LIVE_DOMAIN || '';
if (!LIVE_DOMAIN) {
  console.error('LIVE_DOMAIN is required in project root .env for Empire menu links');
  process.exit(1);
}

async function main() {
  if (!config.host || !config.username || !config.password) {
    console.error('Missing SFTP_SERVER, FTP_USERNAME, or FTP_PASSWORD in .env');
    process.exit(1);
  }

  const templatePath = path.join(__dirname, 'htdocs-index.html');
  const htaccessPath = path.join(__dirname, 'htdocs-root.htaccess');
  if (!fs.existsSync(templatePath)) {
    console.error('scripts/htdocs-index.html not found');
    process.exit(1);
  }
  if (!fs.existsSync(htaccessPath)) {
    console.error('scripts/htdocs-root.htaccess not found');
    process.exit(1);
  }

  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace(/\{\{LIVE_DOMAIN\}\}/g, LIVE_DOMAIN).replace(/\{\{DATE\}\}/g, date);
  const htaccess = fs.readFileSync(htaccessPath, 'utf8');

  const sftp = new Client();
  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
    });

    // Iron-clad root: remove legacy folders from server root (if present)
    const legacyDirs = ['dist', 'assets', 'js', 'css'];
    for (const dir of legacyDirs) {
      try {
        const list = await sftp.list(REMOTE_ROOT + dir);
        if (list && list.length > 0) {
          await sftp.rmdir(REMOTE_ROOT + dir, true);
          console.log('Removed legacy from server root:', dir + '/');
        }
      } catch (_) { /* not present */ }
    }

    await sftp.put(Buffer.from(html, 'utf8'), REMOTE_ROOT + 'index.html');
    await sftp.put(Buffer.from(htaccess, 'utf8'), REMOTE_ROOT + '.htaccess');
    console.log('Lobby deployed → server root /', '(index.html + .htaccess)');
    console.log('Updated:', date);
    console.log('--- BROWSER URLS (Empire menu links) ---');
    console.log('Lobby:  https://' + LIVE_DOMAIN + '/');
    console.log('DFS:    https://dfs.' + LIVE_DOMAIN);
    console.log('eBay:   https://ebay.' + LIVE_DOMAIN);
    console.log('Logs:   https://logs.' + LIVE_DOMAIN);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  } finally {
    await sftp.end();
  }
}

main();
