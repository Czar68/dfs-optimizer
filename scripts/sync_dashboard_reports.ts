/**
 * Phase 81 / 109 — Copy selected `data/reports/*.json` → `web-dashboard/public/data/reports/` for static dashboard fetch.
 */
import fs from "fs";
import path from "path";
import {
  DASHBOARD_SYNC_OPTIONAL_FILES,
  DASHBOARD_SYNC_REQUIRED_FILES,
} from "../src/reporting/dashboard_sync_contract";

const REQUIRED_FILES = DASHBOARD_SYNC_REQUIRED_FILES;
const OPTIONAL_FILES = DASHBOARD_SYNC_OPTIONAL_FILES;

function main(): void {
  const root = process.cwd();
  const srcDir = path.join(root, "data", "reports");
  const destDir = path.join(root, "web-dashboard", "public", "data", "reports");
  if (!fs.existsSync(srcDir)) {
    console.error(`[sync:dashboard-reports] missing ${path.relative(root, srcDir)}`);
    process.exit(1);
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of REQUIRED_FILES) {
    const from = path.join(srcDir, name);
    if (!fs.existsSync(from)) {
      console.error(`[sync:dashboard-reports] missing ${path.relative(root, from)} — export pipeline reports first.`);
      process.exit(1);
    }
    fs.copyFileSync(from, path.join(destDir, name));
  }
  let optionalCopied = 0;
  for (const name of OPTIONAL_FILES) {
    const from = path.join(srcDir, name);
    if (!fs.existsSync(from)) {
      console.warn(
        `[sync:dashboard-reports] optional missing ${path.relative(root, from)} — run export:feature-validation-overview if needed.`
      );
      continue;
    }
    fs.copyFileSync(from, path.join(destDir, name));
    optionalCopied += 1;
  }
  console.log(
    `[sync:dashboard-reports] OK — copied ${REQUIRED_FILES.length} required + ${optionalCopied} optional file(s) to ${path.relative(root, destDir)}`
  );
}

main();
