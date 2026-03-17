/**
 * Load .env from absolute project root (never assume process.cwd() is project root).
 * Uses path.resolve(__dirname, ...) so CLI, cron, and IDE runs all use the same file.
 *
 * Logs "Attempting to load .env from [Path]"; if file is missing, logs and returns loaded: false.
 * Exits(1) only if .env exists but dotenv.config() fails. run_optimizer enforces .env existence
 * and ODDSAPI_KEY (or --api-key) and exits(1) before any business logic.
 */
import path from "path";
import fs from "fs";

const _loadEnvDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(process.argv[1] ?? ".");

/** Project root: one level up from src/, two levels up from dist/src/. */
function getProjectRoot(): string {
  const oneUp = path.resolve(_loadEnvDir, "..");
  const parentName = path.basename(oneUp);
  if (parentName === "dist") {
    return path.resolve(_loadEnvDir, "..", "..");
  }
  return oneUp;
}

/** Absolute path to .env at project root. */
export function getEnvPath(): string {
  return path.resolve(getProjectRoot(), ".env");
}

/**
 * Load .env from project root. Logs path. Returns loaded: false if .env missing; exits(1) if load fails.
 * Does not assume current directory is project root.
 */
export function loadEnvFromProjectRoot(): { projectRoot: string; loaded: boolean; path: string } {
  const projectRoot = getProjectRoot();
  const envPath = path.resolve(projectRoot, ".env");

  console.log(`[ENV] Attempting to load .env from ${envPath}`);

  if (!fs.existsSync(envPath)) {
    console.log(`[ENV] .env file not found at ${envPath}.`);
    return { projectRoot, loaded: false, path: envPath };
  }

  try {
    const dotenv = require("dotenv");
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error(`[ENV] Failed to load .env: ${result.error.message}`);
      process.exit(1);
    }
    console.log(`[ENV] Loaded .env from ${envPath}`);
    return { projectRoot, loaded: true, path: envPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ENV] Failed to load .env: ${msg}`);
    process.exit(1);
  }
}

let _loaded = false;

/** Run once; safe to call from multiple modules. */
export function ensureEnvLoaded(): string {
  if (_loaded) return getProjectRoot();
  loadEnvFromProjectRoot();
  _loaded = true;
  return getProjectRoot();
}

// Side-effect when module is imported: load .env so any entry point gets it.
ensureEnvLoaded();
