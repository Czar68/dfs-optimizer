/**
 * Upload web-dashboard/dist/ to IONOS via SFTP (ssh2-sftp-client).
 * Loads .env from project root. Requires: SFTP_SERVER, FTP_USERNAME, FTP_PASSWORD, SFTP_PATH, FTP_PORT.
 * Usage: npm run web:deploy (build + this) or npm run web:deploy:only (this only).
 */

import path from "path";
import fs from "fs";
import SftpClient from "ssh2-sftp-client";

const ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT, "web-dashboard", "dist");
const ENV_PATH = path.join(ROOT, ".env");

function loadEnv(): void {
  if (!fs.existsSync(ENV_PATH)) {
    console.error("[DEPLOY] .env not found at", ENV_PATH);
    process.exit(1);
  }
  try {
    const dotenv = require("dotenv");
    const result = dotenv.config({ path: ENV_PATH });
    if (result.error) {
      console.error("[DEPLOY] Failed to load .env:", result.error.message);
      process.exit(1);
    }
  } catch (err) {
    console.error("[DEPLOY] Failed to load .env:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const REQUIRED = ["SFTP_SERVER", "FTP_USERNAME", "FTP_PASSWORD", "SFTP_PATH", "FTP_PORT"] as const;

function requireEnv(): Record<(typeof REQUIRED)[number], string> {
  loadEnv();
  const out: Record<string, string> = {};
  for (const key of REQUIRED) {
    const v = process.env[key];
    if (v == null || String(v).trim() === "") {
      console.error("[DEPLOY] Missing required env:", key);
      process.exit(1);
    }
    out[key] = String(v).trim();
  }
  return out as Record<(typeof REQUIRED)[number], string>;
}

function countFiles(dir: string): number {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
}

async function main(): Promise<void> {
  if (!fs.existsSync(DIST_DIR)) {
    console.error("[DEPLOY] web-dashboard/dist/ not found. Run npm run web:build first.");
    process.exit(1);
  }

  const env = requireEnv();
  const host = env.SFTP_SERVER;
  const username = env.FTP_USERNAME;
  const password = env.FTP_PASSWORD;
  const port = parseInt(env.FTP_PORT, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[DEPLOY] Invalid FTP_PORT (must be 1–65535):", env.FTP_PORT);
    process.exit(1);
  }
  const remotePath = env.SFTP_PATH.replace(/\\/g, "/").replace(/\/+$/, "") || "/";

  const fileCount = countFiles(DIST_DIR);
  console.log(`[DEPLOY] Uploading ${DIST_DIR} → ${remotePath} (${fileCount} files)`);

  const startMs = Date.now();
  const client = new SftpClient();

  try {
    await client.connect({
      host,
      port,
      username,
      password,
    });

    await client.uploadDir(DIST_DIR, remotePath);
    await client.end();

    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`[DEPLOY] Done. ${fileCount} files uploaded in ${elapsedSec}s`);
  } catch (err) {
    await client.end().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[DEPLOY] Error:", msg);
    process.exit(1);
  }
}

main();
