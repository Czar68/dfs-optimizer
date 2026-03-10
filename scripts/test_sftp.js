#!/usr/bin/env node
/**
 * Temporary diagnostic script: test SFTP connection using local .env.
 * Uses: SFTP_SERVER, SFTP_USERNAME, SFTP_PASSWORD, optional SFTP_PORT, REMOTE_PATH.
 * Attempts to connect and list the target directory (/dfs or full REMOTE_PATH).
 *
 * Run: node scripts/test_sftp.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Client = require("ssh2-sftp-client");

const REMOTE_PATH = process.env.REMOTE_PATH || "/kunden/homepages/14/d4299584407/htdocs/dfs";
const ALT_PATH = "/dfs"; // common IONOS-style path

const config = {
  host: process.env.SFTP_SERVER || process.env.FTP_SERVER,
  port: parseInt(process.env.SFTP_PORT || process.env.FTP_PORT || "22", 10),
  username: process.env.SFTP_USERNAME || process.env.FTP_USERNAME,
  password: process.env.SFTP_PASSWORD || process.env.FTP_PASSWORD,
};

function classifyError(err) {
  const code = err.code || err.message?.slice(0, 50);
  const msg = (err.message || String(err)).toLowerCase();
  if (err.level === "authentication" || msg.includes("auth") || msg.includes("password") || msg.includes("permission denied")) {
    return "Authentication failed (bad username/password or key)";
  }
  if (err.code === "ETIMEDOUT" || msg.includes("timed out") || msg.includes("timeout")) {
    return "ETIMEDOUT – connection timed out (firewall/network or wrong host)";
  }
  if (err.code === "ECONNREFUSED" || msg.includes("connection refused")) {
    return "ECONNREFUSED – connection refused (wrong port or service not running)";
  }
  if (err.code === "ENOTFOUND" || msg.includes("getaddrinfo") || msg.includes("dns")) {
    return "ENOTFOUND – hostname could not be resolved (check SFTP_SERVER)";
  }
  if (err.code === "ENOENT" || msg.includes("no such file") || msg.includes("does not exist")) {
    return "Path does not exist (remote directory missing or no permission)";
  }
  if (msg.includes("no such file") || msg.includes("not exist")) {
    return "Path does not exist";
  }
  return null;
}

async function main() {
  console.log("SFTP diagnostic (using .env from project root)\n");
  console.log("Config (host/port/user only):", {
    host: config.host || "(missing)",
    port: config.port,
    username: config.username ? config.username.slice(0, 3) + "***" : "(missing)",
  });

  if (!config.host || !config.username || !config.password) {
    console.error("\n[FAIL] Missing credentials. Set in .env: SFTP_SERVER, SFTP_USERNAME, SFTP_PASSWORD");
    process.exit(1);
  }

  const sftp = new Client();

  try {
    console.log("\nConnecting...");
    await sftp.connect(config);
    console.log("Connected.\n");

    for (const labelAndPath of [
      ["REMOTE_PATH (default)", REMOTE_PATH],
      ["/dfs (alternate)", ALT_PATH],
    ]) {
      const [label, dir] = labelAndPath;
      try {
        const list = await sftp.list(dir);
        console.log(`${label}: ${dir}`);
        console.log(`  → OK (${list.length} item(s)):`, list.slice(0, 5).map((e) => e.name).join(", "), list.length > 5 ? "..." : "");
      } catch (listErr) {
        const friendly = classifyError(listErr);
        console.log(`${label}: ${dir}`);
        console.log("  → FAIL:", friendly || listErr.message);
        console.log("  → Raw: code =", listErr.code, "message =", listErr.message);
      }
    }
  } catch (err) {
    const friendly = classifyError(err);
    console.error("\n[FAIL] Connection or operation failed.");
    if (friendly) console.error("Reason:", friendly);
    console.error("Code:", err.code);
    console.error("Message:", err.message);
    if (err.stack) console.error("Stack:", err.stack);
    process.exit(1);
  } finally {
    await sftp.end().catch(() => {});
  }

  console.log("\nDiagnostic finished.");
}

main();
