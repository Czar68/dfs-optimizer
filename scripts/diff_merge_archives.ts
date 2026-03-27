/**
 * Phase 47 — Read-only diff of two archived merge snapshot directories.
 * Usage: npx ts-node scripts/diff_merge_archives.ts --left <dir> --right <dir> [--json-out <file>]
 */
import fs from "fs";
import path from "path";
import type { MergeArchiveDiffReport } from "../src/reporting/merge_archive_diff";
import {
  buildMergeArchiveDiffReport,
  formatMergeArchiveDiffMarkdown,
} from "../src/reporting/merge_archive_diff";
import { stableStringifyForObservability } from "../src/reporting/final_selection_observability";

function parseArgs(argv: string[]): { cwd: string; left: string; right: string; jsonOut?: string } {
  let cwd = process.cwd();
  let left: string | undefined;
  let right: string | undefined;
  let jsonOut: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd" && argv[i + 1]) {
      cwd = path.resolve(argv[++i]);
    } else if (a === "--left" && argv[i + 1]) {
      left = argv[++i];
    } else if (a === "--right" && argv[i + 1]) {
      right = argv[++i];
    } else if (a === "--json-out" && argv[i + 1]) {
      jsonOut = argv[++i];
    }
  }
  if (!left || !right) {
    console.error("Usage: diff_merge_archives.ts --left <snapshotDir> --right <snapshotDir> [--cwd <dir>] [--json-out <path>]");
    process.exit(2);
  }
  return { cwd, left: path.resolve(cwd, left), right: path.resolve(cwd, right), jsonOut };
}

const { cwd, left, right, jsonOut } = parseArgs(process.argv.slice(2));
const report: MergeArchiveDiffReport = buildMergeArchiveDiffReport(left, right);
const md = formatMergeArchiveDiffMarkdown(report);
console.log(md);
if (jsonOut) {
  const outAbs = path.resolve(cwd, jsonOut);
  const dir = path.dirname(outAbs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outAbs, stableStringifyForObservability(report), "utf8");
  console.error(`Wrote JSON: ${path.relative(cwd, outAbs).replace(/\\/g, "/")}`);
}
