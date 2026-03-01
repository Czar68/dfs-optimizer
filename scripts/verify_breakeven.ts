// scripts/verify_breakeven.ts
// After npm test and print_breakeven_table: assert artifacts/parlay_breakeven_table.md
// contains UD_2P_STD and 53.45 (CI-invariant check). Cross-platform (no grep).

import * as fs from "fs";
import * as path from "path";

const tablePath = path.join(process.cwd(), "artifacts", "parlay_breakeven_table.md");

if (!fs.existsSync(tablePath)) {
  console.error("Missing artifacts/parlay_breakeven_table.md. Run: npx ts-node scripts/print_breakeven_table.ts");
  process.exit(1);
}

const content = fs.readFileSync(tablePath, "utf8");
const hasUd2p = content.includes("UD_2P_STD");
const has5345 = content.includes("53.45");

if (!hasUd2p || !has5345) {
  console.error("Invariant check failed: table must contain UD_2P_STD and 53.45%.");
  console.error("UD_2P_STD present:", hasUd2p, "53.45 present:", has5345);
  process.exit(1);
}

console.log("Breakeven table invariant OK: UD_2P_STD 53.45% found.");
