#!/usr/bin/env node
/**
 * Sync dist/ and web-dashboard/dist/ to remote via SFTP.
 * For GitHub Actions: SFTP_SERVER, SFTP_USERNAME, SFTP_PASSWORD.
 * Remote path: REMOTE_PATH or default /kunden/homepages/14/d4299584407/htdocs/dfs
 */

const path = require("path");
const Client = require("ssh2-sftp-client");

const ROOT = path.join(__dirname, "..");
const REMOTE_PATH = process.env.REMOTE_PATH || "/kunden/homepages/14/d4299584407/htdocs/dfs";

const config = {
  host: process.env.SFTP_SERVER,
  port: parseInt(process.env.SFTP_PORT || "22", 10),
  username: process.env.SFTP_USERNAME,
  password: process.env.SFTP_PASSWORD,
};

if (!config.host || !config.username || !config.password) {
  console.error("Missing SFTP_SERVER, SFTP_USERNAME, or SFTP_PASSWORD");
  process.exit(1);
}

async function main() {
  const sftp = new Client();
  await sftp.connect(config);
  try {
    await sftp.mkdir(REMOTE_PATH, { recursive: true });
    const distPath = path.join(ROOT, "dist");
    const webDistPath = path.join(ROOT, "web-dashboard", "dist");
    if (require("fs").existsSync(distPath)) {
      console.log("Uploading dist/ →", REMOTE_PATH);
      await sftp.uploadDir(distPath, REMOTE_PATH);
    }
    if (require("fs").existsSync(webDistPath)) {
      console.log("Uploading web-dashboard/dist/ →", REMOTE_PATH);
      await sftp.uploadDir(webDistPath, REMOTE_PATH);
    }
    console.log("Deploy done.");
  } finally {
    await sftp.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
