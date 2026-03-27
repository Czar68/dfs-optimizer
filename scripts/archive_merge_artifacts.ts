/**
 * Phase 47 — Copy latest merge JSON artifacts into `data/reports/merge_archive/<snapshotId>/`.
 * Usage: npx ts-node scripts/archive_merge_artifacts.ts [--cwd <dir>] [--snapshot-id <id>] [--label <tag>]
 */
import path from "path";
import { archiveMergeArtifacts } from "../src/reporting/merge_archive_diff";

function parseArgs(argv: string[]): { cwd: string; snapshotId?: string; label?: string } {
  let cwd = process.cwd();
  let snapshotId: string | undefined;
  let label: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd" && argv[i + 1]) {
      cwd = path.resolve(argv[++i]);
    } else if (a === "--snapshot-id" && argv[i + 1]) {
      snapshotId = argv[++i];
    } else if (a === "--label" && argv[i + 1]) {
      label = argv[++i];
    }
  }
  return { cwd, snapshotId, label };
}

const { cwd, snapshotId, label } = parseArgs(process.argv.slice(2));
const { destDir, snapshotId: sid, manifest } = archiveMergeArtifacts(cwd, { snapshotId, label });
console.log(`MERGE ARCHIVE: ${path.relative(cwd, destDir).replace(/\\/g, "/")}`);
console.log(`snapshotId: ${sid}`);
console.log(manifest.entries.map((e) => `${e.copied ? "OK" : "SKIP"} ${e.fromRelative} -> ${e.toFile}`).join("\n"));
