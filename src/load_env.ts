/**
 * Load `.env` from the project root (never cwd-only).
 * - From `src/load_env.ts`: root is one level above `src/`.
 * - From `dist/src/load_env.js`: root is two levels above (via `dist/`).
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";

function getProjectRoot(): string {
  const norm = __dirname.replace(/\\/g, "/");
  // Compiled: .../dist/src → project root is two levels up
  if (norm.includes("/dist/src")) {
    return path.resolve(__dirname, "..", "..");
  }
  // Source or .../src (not under dist): one level up to project root
  if (norm.endsWith("/src")) {
    return path.resolve(__dirname, "..");
  }
  return path.resolve(__dirname, "..", "..");
}

const projectRoot = getProjectRoot();
const envPath = path.join(projectRoot, ".env");

console.log(`[ENV] Attempting to load .env from ${envPath}`);

if (!fs.existsSync(envPath)) {
  // Missing file: do not exit (callers may enforce .env / keys separately)
} else {
  const result = config({ path: envPath });
  if (result.error) {
    console.error("[ENV] dotenv failed to load .env:", result.error.message);
    process.exit(1);
  }
}

export const LOAD_ENV_PROJECT_ROOT = projectRoot;
