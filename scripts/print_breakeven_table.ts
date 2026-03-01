// scripts/print_breakeven_table.ts — print binomial-derived BE table + heatmap
import {
  getBreakevenForStructure,
  breakevenTableMarkdown,
  breakevenHeatmapHtml,
} from "../src/config/binomial_breakeven";
import * as fs from "fs";
import * as path from "path";

console.log("=== Validation ===");
const ud2 = getBreakevenForStructure("UD_2P_STD");
console.log("UD 2-Std BE:", (ud2 * 100).toFixed(2) + "% (expect 53.45% → -115)");
const pp6f = getBreakevenForStructure("6F");
console.log("PP 6-Flex BE:", (pp6f * 100).toFixed(2) + "% (expect ~54.2% per GamedayMath)");

console.log("\n=== Full table ===");
console.log(breakevenTableMarkdown());

const outDir = path.join(process.cwd(), "artifacts");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "parlay_breakeven_table.md"), breakevenTableMarkdown(), "utf8");
fs.writeFileSync(path.join(outDir, "parlay_breakeven_heatmap.html"), breakevenHeatmapHtml(), "utf8");
console.log("\nWrote artifacts/parlay_breakeven_table.md and artifacts/parlay_breakeven_heatmap.html");
