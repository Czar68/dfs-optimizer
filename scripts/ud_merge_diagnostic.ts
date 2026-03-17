/**
 * One-off diagnostic: parse merge_report_underdog.csv and report
 * line_diff delta distribution, stat breakdown, and recoverable counts.
 * Run: npx ts-node scripts/ud_merge_diagnostic.ts
 */
import * as fs from "fs";
import * as path from "path";

const DEFAULT_CSV = path.join(process.cwd(), "data", "output_logs", "merge_report_underdog.csv");
const CSV_PATH = process.argv[2] || DEFAULT_CSV;

interface Row {
  site: string;
  player: string;
  stat: string;
  line: number;
  reason: string;
  bestOddsLine: string;
}

function parseCsv(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const rec: Record<string, string> = {};
    headers.forEach((h, j) => {
      rec[h] = values[j] ?? "";
    });
    const lineNum = parseFloat(rec.line);
    if (isNaN(lineNum)) continue;
    rows.push({
      site: rec.site ?? "",
      player: rec.player ?? "",
      stat: rec.stat ?? "",
      line: lineNum,
      reason: rec.reason ?? "",
      bestOddsLine: rec.bestOddsLine ?? "",
    });
  }
  return rows;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error("Missing:", CSV_PATH);
    process.exit(1);
  }
  const rows = parseCsv(CSV_PATH);
  const lineDiff = rows.filter((r) => r.reason === "line_diff");
  const juice = rows.filter((r) => r.reason === "juice");
  const matched = rows.filter((r) => r.reason === "ok" || r.reason === "ok_alt" || r.reason === "ok_fallback");

  console.log("=== UD Merge Diagnostic ===\n");
  console.log("Total rows:", rows.length);
  console.log("Matched (ok/ok_alt/ok_fallback):", matched.length);
  console.log("line_diff:", lineDiff.length);
  console.log("juice:", juice.length);
  console.log("");

  // 1) Distribution of |pickLine - bestOddsLine| for line_diff
  const deltas: number[] = [];
  for (const r of lineDiff) {
    const best = parseFloat(r.bestOddsLine);
    if (!isNaN(best)) deltas.push(Math.abs(r.line - best));
  }
  deltas.sort((a, b) => a - b);
  const dist: Record<string, number> = {};
  for (const d of deltas) {
    const bucket = d <= 1.0 ? "<=1.0" : d <= 1.5 ? "1.0-1.5" : d <= 2.0 ? "1.5-2.0" : d <= 2.5 ? "2.0-2.5" : ">2.5";
    dist[bucket] = (dist[bucket] ?? 0) + 1;
  }
  console.log("1) line_diff: distribution of |pickLine - bestOddsLine|");
  console.log("   (bestOddsLine = nearest main-line candidate; line_diff means that distance was > 1.0)");
  Object.entries(dist)
    .sort((a, b) => (a[0] === "<=1.0" ? -1 : b[0] === "<=1.0" ? 1 : a[0].localeCompare(b[0])))
    .forEach(([k, v]) => console.log("   ", k, ":", v));
  const within15 = deltas.filter((d) => d > 1.0 && d <= 1.5).length;
  const within10 = deltas.filter((d) => d <= 1.0).length;
  console.log("   (Note: line_diff implies no main match within 1.0; so delta is always > 1.0 in practice.)");
  console.log("   Recoverable if main-pass tolerance widened to 1.5 (1.0 < delta <= 1.5):", within15);
  console.log("");

  // 2) Stat distribution for line_diff
  const statCount: Record<string, number> = {};
  for (const r of lineDiff) {
    statCount[r.stat] = (statCount[r.stat] ?? 0) + 1;
  }
  console.log("2) line_diff: stat distribution");
  const singleStats = ["points", "rebounds", "assists", "threes", "blocks", "steals", "turnovers"];
  let singleCount = 0;
  let comboCount = 0;
  Object.entries(statCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([stat, count]) => {
      if (singleStats.includes(stat)) singleCount += count;
      else comboCount += count;
      console.log("   ", stat, ":", count);
    });
  console.log("   Single stats (PTS, REB, AST, etc.) total:", singleCount);
  console.log("   Combo stats (PRA, PR, PA, RA) total:", comboCount);
  console.log("");

  // 3) Juice: report doesn't contain underOdds; we only know count
  console.log("3) juice rows:", juice.length);
  console.log("   (Report does not include underOdds value; threshold is UD_MAX_JUICE=200, reject when underOdds <= -200.)");
  console.log("   Cannot compute distribution of |juice - threshold| from CSV alone.");
  console.log("");

  // 4) line_diff with bestOddsLine within 1.5 of pick
  const lineDiffWithBest = lineDiff.filter((r) => {
    const best = parseFloat(r.bestOddsLine);
    return !isNaN(best) && Math.abs(r.line - best) <= 1.5;
  });
  console.log("4) line_diff rows where |pickLine - bestOddsLine| <= 1.5:", lineDiffWithBest.length);
  console.log("   (These could be recovered if UD main-pass tolerance were 1.5 and we accepted as alt.)");
  console.log("");
  console.log("Done.");
}

main();
