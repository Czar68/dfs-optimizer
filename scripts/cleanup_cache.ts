/**
 * scripts/cleanup_cache.ts
 * Delete files in data/odds_snapshots and cache/ older than 48 hours.
 *
 * Usage: npx ts-node scripts/cleanup_cache.ts
 *        npm run cleanup
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const DIRS = [
  path.join(ROOT, "data", "odds_snapshots"),
  path.join(ROOT, "cache"),
];

function cleanupDir(dirPath: string): { deleted: number; errors: number } {
  let deleted = 0;
  let errors = 0;
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { deleted: 0, errors: 0 };
  }
  const now = Date.now();
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        if (now - stat.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(full);
          deleted += 1;
        }
      } else if (stat.isDirectory()) {
        const sub = cleanupDir(full);
        deleted += sub.deleted;
        errors += sub.errors;
        try {
          if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn("[cleanup] Skip", full, (e as Error).message);
      errors += 1;
    }
  }
  return { deleted, errors };
}

function main(): void {
  console.log("[cleanup] Removing files older than 48h in data/odds_snapshots and cache/ ...");
  let totalDeleted = 0;
  let totalErrors = 0;
  for (const dir of DIRS) {
    const { deleted, errors } = cleanupDir(dir);
    totalDeleted += deleted;
    totalErrors += errors;
    if (deleted > 0) console.log(`[cleanup] ${dir}: removed ${deleted} file(s).`);
  }
  console.log(`[cleanup] Done. Deleted: ${totalDeleted}, errors: ${totalErrors}.`);
}

main();
