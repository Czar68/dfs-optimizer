/**
 * Phase AM — One-shot capture of Underdog API `RawPick[]` to a JSON file for pinned A/B replay.
 * Usage:
 *   npx ts-node scripts/capture_ud_raw_picks_snapshot.ts artifacts/phase_am/ud_raw_picks_pinned.json
 */
import "../src/load_env";
import fs from "fs";
import path from "path";
import { fetchUnderdogRawProps } from "../src/fetch_underdog_props";
import type { Sport } from "../src/types";

const outArg = process.argv[2];
if (!outArg) {
  console.error("Usage: npx ts-node scripts/capture_ud_raw_picks_snapshot.ts <output.json>");
  process.exit(2);
}

const outPath = path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg);
const sports: Sport[] = ["NBA"];

async function main() {
  const raw = await fetchUnderdogRawProps(sports);
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(raw, null, 2), "utf8");
  console.log(`Wrote ${raw.length} RawPick rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
