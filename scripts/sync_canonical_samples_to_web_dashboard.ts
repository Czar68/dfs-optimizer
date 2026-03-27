/**
 * Phase 22 — Copy `artifacts/samples/*.json` → `web-dashboard/public/data/canonical_samples/` (byte-identical, deterministic).
 */
import fs from "fs";
import path from "path";

const FILES = ["sample_cards_pp.json", "sample_cards_ud.json", "sample_summary.json"] as const;

function main(): void {
  const root = process.cwd();
  const srcDir = path.join(root, "artifacts", "samples");
  const destDir = path.join(root, "web-dashboard", "public", "data", "canonical_samples");
  if (!fs.existsSync(srcDir)) {
    console.error(`[sync:canonical-samples-dashboard] missing ${path.relative(root, srcDir)} — run npm run generate:canonical-samples first.`);
    process.exit(1);
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of FILES) {
    const from = path.join(srcDir, name);
    if (!fs.existsSync(from)) {
      console.error(`[sync:canonical-samples-dashboard] missing ${name} under artifacts/samples/`);
      process.exit(1);
    }
    const to = path.join(destDir, name);
    fs.copyFileSync(from, to);
  }
  console.log(
    `[sync:canonical-samples-dashboard] OK — copied ${FILES.length} files to ${path.relative(root, destDir)}`
  );
}

main();
