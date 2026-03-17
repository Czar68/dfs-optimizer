/**
 * Audit merge_report.csv and suggest improvements (aliases, line_diff summary).
 *
 * Prerequisites:
 * 1. Run the pipeline with EXPORT_MERGE_REPORT=1 so merge_report.csv exists.
 *
 * RUN:  npx ts-node scripts/audit_merge_report.ts
 *
 * Output: merge_audit_report.md in project root (and summary to console).
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MERGE_REPORT = path.join(ROOT, "merge_report.csv");
const MERGE_REPORT_UD = path.join(ROOT, "merge_report_underdog.csv");
const MERGE_REPORT_PP = path.join(ROOT, "merge_report_prizepicks.csv");
const PRIZEPICKS_IMPORTED = path.join(ROOT, "prizepicks_imported.csv");
const AUDIT_OUTPUT = path.join(ROOT, "merge_audit_report.md");

// ─── CSV parse (handles quoted fields) ─────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => (row[h] = vals[j] ?? ""));
    rows.push(row);
  }
  return { headers, rows };
}

// Same normalizations as merge_odds for alias key/value (no dependency on merge_odds)
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function stripNameSuffix(s: string): string {
  return s
    .replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, "")
    .trim();
}
function normalizeForMatch(name: string): string {
  return stripNameSuffix(stripAccents(normalizeName(name)));
}
// ─── Main ─────────────────────────────────────────────────────────────────
interface MergeRow {
  site?: string;
  player: string;
  stat: string;
  line: number;
  sport: string;
  matched: string;
  reason: string;
  bestOddsLine: string;
  bestOddsPlayerNorm: string;
  matchType?: string;
  altDelta?: string;
}

function loadMergeReport(filePath: string): MergeRow[] {
  const { rows } = readCsv(filePath);
  return rows.map((r) => ({
    site: r.site ?? "",
    player: r.player ?? "",
    stat: r.stat ?? "",
    line: Number(r.line) || 0,
    sport: r.sport ?? "",
    matched: r.matched ?? "",
    reason: r.reason ?? "",
    bestOddsLine: r.bestOddsLine ?? "",
    bestOddsPlayerNorm: r.bestOddsPlayerNorm ?? "",
    matchType: r.matchType ?? "",
    altDelta: r.altDelta ?? "",
  }));
}

/** Stat-level match% breakdown for a set of rows — used in triple A/B matrix */
function statMatchMatrix(rows: MergeRow[]): Record<string, { total: number; matched: number }> {
  const out: Record<string, { total: number; matched: number }> = {};
  for (const r of rows) {
    if (!out[r.stat]) out[r.stat] = { total: 0, matched: 0 };
    out[r.stat].total++;
    if (r.matched === "Y") out[r.stat].matched++;
  }
  return out;
}

function main(): void {
  // Prefer Underdog-specific report for investigation; fall back to merge_report.csv
  const hasUdReport = fs.existsSync(MERGE_REPORT_UD);
  const hasPpReport = fs.existsSync(MERGE_REPORT_PP);
  const hasAny = hasUdReport || hasPpReport || fs.existsSync(MERGE_REPORT);
  if (!hasAny) {
    console.error("No merge report found. Run the pipeline with EXPORT_MERGE_REPORT=1 first.");
    process.exit(1);
  }

  // Load all available reports and combine (for by-site summary); primary = Underdog for "where UD fails most"
  const allRows: MergeRow[] = [];
  if (hasUdReport) allRows.push(...loadMergeReport(MERGE_REPORT_UD).map((r) => ({ ...r, site: "underdog" })));
  if (hasPpReport) allRows.push(...loadMergeReport(MERGE_REPORT_PP).map((r) => ({ ...r, site: "prizepicks" })));
  if (allRows.length === 0 && fs.existsSync(MERGE_REPORT)) {
    const rows = loadMergeReport(MERGE_REPORT);
    allRows.push(...rows);
  }
  const mergeRows = allRows.length > 0 ? allRows : loadMergeReport(MERGE_REPORT);
  const udRows = mergeRows.filter((r) => (r.site ?? "").toLowerCase() === "underdog");
  const ppRows = mergeRows.filter((r) => (r.site ?? "").toLowerCase() === "prizepicks");
  const primaryForAudit = udRows.length > 0 ? udRows : mergeRows;

  const total = mergeRows.length;
  const matched = mergeRows.filter((r) => r.matched === "Y").length;
  const noCandidate = mergeRows.filter((r) => r.reason === "no_candidate").length;
  const lineDiff = mergeRows.filter((r) => r.reason === "line_diff").length;
  const juice = mergeRows.filter((r) => r.reason === "juice").length;

  // Underdog-only failure breakdown (where Underdog is failing the most)
  const udTotal = primaryForAudit.length;
  const udMatched = primaryForAudit.filter((r) => r.matched === "Y").length;
  const udNoCandidate = primaryForAudit.filter((r) => r.reason === "no_candidate").length;
  const udLineDiff = primaryForAudit.filter((r) => r.reason === "line_diff").length;
  const udJuice = primaryForAudit.filter((r) => r.reason === "juice").length;
  const udUnmatched = udTotal - udMatched;
  const udTopReason =
    udUnmatched === 0
      ? "none"
      : [["no_candidate", udNoCandidate], ["line_diff", udLineDiff], ["juice", udJuice]].sort((a, b) => (b[1] as number) - (a[1] as number))[0];

  // Stat-level breakdown for no_candidate
  const ncByStat: Record<string, number> = {};
  primaryForAudit.filter((r) => r.reason === "no_candidate").forEach((r) => {
    ncByStat[r.stat] = (ncByStat[r.stat] || 0) + 1;
  });
  const ncStatsSorted = Object.entries(ncByStat).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Fully absent players (all props = no_candidate)
  const playerTotals: Record<string, { total: number; nc: number }> = {};
  primaryForAudit.forEach((r) => {
    if (!playerTotals[r.player]) playerTotals[r.player] = { total: 0, nc: 0 };
    playerTotals[r.player].total++;
    if (r.reason === "no_candidate") playerTotals[r.player].nc++;
  });
  const fullyAbsent = Object.entries(playerTotals).filter(([, s]) => s.nc === s.total && s.total > 0).map(([p]) => p);

  const suggestedAliases = new Map<string, string>();

  // Line-diff sample: picks where we had a name match but line was off by >1
  const lineDiffSample = primaryForAudit
    .filter((r) => r.reason === "line_diff")
    .slice(0, 20)
    .map((r) => ({ player: r.player, stat: r.stat, line: r.line, bestOddsLine: r.bestOddsLine }));

  // Build markdown report
  const lines: string[] = [];
  lines.push("# Merge audit report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Stat merge matrix: per-stat breakdown of match outcomes
  const statMatrix: Record<string, { total: number; matched: number; nc: number; ld: number; juice: number }> = {};
  primaryForAudit.forEach((r) => {
    if (!statMatrix[r.stat]) statMatrix[r.stat] = { total: 0, matched: 0, nc: 0, ld: 0, juice: 0 };
    statMatrix[r.stat].total++;
    if (r.matched === "Y") statMatrix[r.stat].matched++;
    else if (r.reason === "no_candidate") statMatrix[r.stat].nc++;
    else if (r.reason === "line_diff") statMatrix[r.stat].ld++;
    else if (r.reason === "juice") statMatrix[r.stat].juice++;
  });

  // One-sentence Underdog focus summary at the very top
  if (udTotal > 0) {
    const matchPct = ((100 * udMatched) / udTotal).toFixed(1);
    const topLabel = udTopReason === "none" ? "none" : `${udTopReason[0]} (${udTopReason[1]} of ${udUnmatched})`;
    lines.push(`> **Underdog focus:** ${udMatched}/${udTotal} picks matched (${matchPct}%); dominant failure = **${topLabel}**.`);
    lines.push("");
  }

  // Underdog failure breakdown (where Underdog is failing the most)
  if (udTotal > 0) {
    lines.push("## Underdog failure breakdown");
    lines.push("");
    lines.push("Where Underdog picks are failing the merge (use this to fix aliases, stat mapping, or line tolerance):");
    lines.push("");
    lines.push("| Metric | Count | % of total |");
    lines.push("|--------|-------|------------|");
    lines.push(`| Total Underdog picks | ${udTotal} | 100% |`);
    lines.push(`| Matched | ${udMatched} | ${udTotal ? ((100 * udMatched) / udTotal).toFixed(1) : 0}% |`);
    lines.push(`| No candidate (name/stat not in odds) | ${udNoCandidate} | ${udTotal ? ((100 * udNoCandidate) / udTotal).toFixed(1) : 0}% |`);
    lines.push(`| Line diff > 1 | ${udLineDiff} | ${udTotal ? ((100 * udLineDiff) / udTotal).toFixed(1) : 0}% |`);
    lines.push(`| Juice too extreme | ${udJuice} | ${udTotal ? ((100 * udJuice) / udTotal).toFixed(1) : 0}% |`);
    lines.push("");
    if (udUnmatched > 0 && udTopReason) {
      lines.push(`**Where Underdog fails most:** \`${udTopReason[0]}\` (${udTopReason[1]} of ${udUnmatched} unmatched).`);
      lines.push("");
    }

    // Stat-level breakdown for no_candidate
    if (ncStatsSorted.length > 0) {
      lines.push("### Top stat types driving no_candidate failures");
      lines.push("");
      lines.push("| Stat | no_candidate count |");
      lines.push("|------|---------------------|");
      for (const [stat, cnt] of ncStatsSorted) {
        const note =
          stat === "turnovers" || stat === "steals" || stat === "blocks"
            ? " ← not in odds feed (pre-filtered in v2+)"
            : stat === "points"
            ? " ← likely absent players"
            : "";
        lines.push(`| ${stat} | ${cnt}${note} |`);
      }
      lines.push("");
    }

    // Fully absent players
    if (fullyAbsent.length > 0) {
      lines.push("### Players with 0% match rate (all props = no_candidate)");
      lines.push("");
      lines.push("These players have no odds coverage. No alias fix can help — they simply have no odds data.");
      lines.push("");
      lines.push(fullyAbsent.map((p) => `- ${p}`).join("\n"));
      lines.push("");
    }

    // Stat merge matrix
    const matrixStats = Object.entries(statMatrix).sort((a, b) => b[1].total - a[1].total);
    if (matrixStats.length > 0) {
      lines.push("### Stat merge matrix");
      lines.push("");
      lines.push("| Stat | Total | Matched | Match% | no_candidate | line_diff | juice |");
      lines.push("|------|-------|---------|--------|--------------|-----------|-------|");
      for (const [stat, m] of matrixStats) {
        const pct = m.total > 0 ? ((100 * m.matched) / m.total).toFixed(0) + "%" : "—";
        lines.push(`| ${stat} | ${m.total} | ${m.matched} | ${pct} | ${m.nc} | ${m.ld} | ${m.juice} |`);
      }
      lines.push("");
      lines.push("> **Guide:** `no_candidate` = player/stat not in odds feed; `line_diff` = Underdog alt lines (unfixable); `juice` = steep chalk (REB/AST expected).");
      lines.push("");
    }
  }

  if (udRows.length > 0 && ppRows.length > 0) {
    lines.push("## By site");
    lines.push("");
    lines.push("| Site | Total | Matched | no_candidate | line_diff | juice |");
    lines.push("|-----|-------|---------|--------------|-----------|-------|");
    for (const [name, rows] of [["underdog", udRows], ["prizepicks", ppRows]] as const) {
      const m = rows.filter((r) => r.matched === "Y").length;
      const nc = rows.filter((r) => r.reason === "no_candidate").length;
      const ld = rows.filter((r) => r.reason === "line_diff").length;
      const j = rows.filter((r) => r.reason === "juice").length;
      lines.push(`| ${name} | ${rows.length} | ${m} | ${nc} | ${ld} | ${j} |`);
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Total picks | ${total} |`);
  lines.push(`| Matched | ${matched} |`);
  lines.push(`| No candidate (name/stat missing in odds) | ${noCandidate} |`);
  lines.push(`| Line diff > 1 | ${lineDiff} |`);
  lines.push(`| Juice too extreme | ${juice} |`);
  lines.push("");

  if (suggestedAliases.size > 0) {
    lines.push("## Suggested aliases");
    lines.push("");
    lines.push("Add these to `PLAYER_NAME_ALIASES` in `src/merge_odds.ts` if the mapping is correct (same player, different spelling):");
    lines.push("");
    const sorted = [...suggestedAliases.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [key, value] of sorted) {
      lines.push(`- \`"${key}": "${value}"\``);
    }
    lines.push("");
  } else if (noCandidate > 0) {
    lines.push("## No-candidate picks (no alias suggested)");
    lines.push("");
    lines.push("No match found for these. Compare `merge_report_underdog.csv` / `merge_report_prizepicks.csv` with odds data and add manual aliases in `src/merge_odds.ts`.");
    lines.push("");
    const sample = primaryForAudit.filter((r) => r.reason === "no_candidate").slice(0, 30);
    lines.push("| player | stat | line | sport |");
    lines.push("|--------|------|------|-------|");
    for (const r of sample) {
      lines.push(`| ${r.player} | ${r.stat} | ${r.line} | ${r.sport} |`);
    }
    if (noCandidate > 30) lines.push(`| ... and ${noCandidate - 30} more | | | |`);
    lines.push("");
  }

  if (lineDiff > 0) {
    lines.push("## Line-diff sample");
    lines.push("");
    const escalatorCount = primaryForAudit.filter((r) => r.reason === "line_diff" && r.stat === "points" && r.line <= 2.5).length;
    const farAltCount = primaryForAudit.filter((r) => r.reason === "line_diff" && Math.abs(r.line - Number(r.bestOddsLine)) > 5).length;
    lines.push("Name matched but odds line differed by more than 1.");
    if (escalatorCount > 0) lines.push(`- **${escalatorCount}** are Underdog "points escalator" lines (pick line ≤ 2.5) — pre-filtered in v2+ pipeline.`);
    if (farAltCount > 0) lines.push(`- **${farAltCount}** are alternate prop lines far from the main odds line (delta > 5) — expected and unfixable without per-alt-line odds.`);
    lines.push("");
    lines.push("| player | stat | pick line | best odds line | delta |");
    lines.push("|--------|------|-----------|----------------|-------|");
    for (const r of lineDiffSample) {
      const delta = Math.abs(r.line - Number(r.bestOddsLine)).toFixed(1);
      lines.push(`| ${r.player} | ${r.stat} | ${r.line} | ${r.bestOddsLine} | ${delta} |`);
    }
    if (lineDiff > 20) lines.push(`| ... and ${lineDiff - 20} more | | | |`);
    lines.push("");
  }

  // Juice section
  if (juice > 0) {
    lines.push("## Juice failures");
    lines.push("");
    const juiceByStat: Record<string, number> = {};
    primaryForAudit.filter((r) => r.reason === "juice").forEach((r) => { juiceByStat[r.stat] = (juiceByStat[r.stat] || 0) + 1; });
    const juiceStatsSorted = Object.entries(juiceByStat).sort((a, b) => b[1] - a[1]);
    lines.push("Line matched but odds were too steep (worse than -250 implied probability). These are correctly filtered — the edge is not real.");
    lines.push("");
    lines.push("| Stat | Count |");
    lines.push("|------|-------|");
    for (const [stat, cnt] of juiceStatsSorted) lines.push(`| ${stat} | ${cnt} |`);
    lines.push("");
    lines.push("> **Note:** rebounds and assists for role players are often heavily juiced. This is expected behavior, not a data issue.");
    lines.push("");
  }

  const report = lines.join("\n");
  fs.writeFileSync(AUDIT_OUTPUT, report, "utf8");
  console.log(`Wrote ${AUDIT_OUTPUT}`);
  if (udTotal > 0) {
    const udAltTotal = udRows.filter((r) => r.matchType === "alt" && r.matched === "Y").length;
    const altNote = udAltTotal > 0 ? `, alt_rescued=${udAltTotal}` : "";
    console.log(`Underdog: ${udMatched}/${udTotal} matched${altNote}; failures: no_candidate=${udNoCandidate}, line_diff=${udLineDiff}, juice=${udJuice} (top: ${udTopReason?.[0] ?? "n/a"})`);
  }
  console.log(`Overall: ${matched}/${total} matched; no_candidate=${noCandidate}, line_diff=${lineDiff}, juice=${juice}`);
  if (suggestedAliases.size > 0) {
    console.log(`Suggested ${suggestedAliases.size} alias(es) — see merge_audit_report.md`);
  }

  // ── v3 exports ────────────────────────────────────────────────────────────

  // 1. Full Underdog player inventory (v3 version with stat matrix per player)
  exportUdInventoryV3(primaryForAudit);

  // 2. Alias suggestions CSV for manual review
  exportAliasSuggestions(suggestedAliases, primaryForAudit);
}

// ── v3: Underdog inventory export ──────────────────────────────────────────
function exportUdInventoryV3(rows: MergeRow[]): void {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = path.join(ROOT, `underdog_nba_full_inventory_v3_${today}.csv`);

  const playerMap: Record<string, {
    player: string; total: number; matched: number;
    nc: number; ld: number; juice: number;
    statTypes: Set<string>;
    notes: string[];
  }> = {};

  for (const r of rows) {
    if (!playerMap[r.player]) {
      playerMap[r.player] = { player: r.player, total: 0, matched: 0, nc: 0, ld: 0, juice: 0, statTypes: new Set(), notes: [] };
    }
    const p = playerMap[r.player];
    p.total++;
    p.statTypes.add(r.stat);
    if (r.matched === "Y") p.matched++;
    else if (r.reason === "no_candidate") p.nc++;
    else if (r.reason === "line_diff") p.ld++;
    else if (r.reason === "juice") p.juice++;
  }

  // Annotate
  for (const p of Object.values(playerMap)) {
    if (p.matched === 0 && p.nc === p.total) p.notes.push("ABSENT_FROM_ODDS");
    if (p.juice > 0 && p.nc === 0 && p.ld === 0) p.notes.push("JUICE_ONLY");
    if (p.ld > 5 && p.matched > 0) p.notes.push("ALT_LINES_DOMINANT");
  }

  const csvLines = ["Player,TotalProps,Matched,Match%,no_candidate,line_diff,juice,StatTypes,Notes"];
  const sorted = Object.values(playerMap).sort((a, b) => b.total - a.total);
  for (const p of sorted) {
    const pct = p.total > 0 ? ((100 * p.matched) / p.total).toFixed(0) + "%" : "0%";
    csvLines.push([
      p.player, p.total, p.matched, pct, p.nc, p.ld, p.juice,
      [...p.statTypes].join("|"),
      p.notes.join("|") || "ok",
    ].join(","));
  }

  fs.writeFileSync(outPath, csvLines.join("\n"), "utf8");
  console.log(`Wrote ${outPath} (${sorted.length} players)`);
}

// ── v3: Alias suggestions CSV export ───────────────────────────────────────
function exportAliasSuggestions(
  suggestedAliases: Map<string, string>,
  primaryForAudit: MergeRow[]
): void {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = path.join(ROOT, `alias_suggestions_${today}.csv`);

  const csvLines = ["pick_player_key,suggested_match_form,occurrence_count,action"];

  for (const [key, value] of [...suggestedAliases.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const count = primaryForAudit.filter((r) => normalizeName(r.player) === key && r.reason === "no_candidate").length;
    csvLines.push([`"${key}"`, `"${value}"`, count, "ADD_TO_ALIASES"].join(","));
  }

  // Players with full no_candidate (absent from feed) — mark as ABSENT
  const absentPlayers = primaryForAudit
    .filter((r) => r.reason === "no_candidate" && !suggestedAliases.has(normalizeName(r.player)))
    .reduce((acc, r) => { acc[r.player] = (acc[r.player] || 0) + 1; return acc; }, {} as Record<string, number>);

  for (const [player, count] of Object.entries(absentPlayers).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    csvLines.push([`"${normalizeName(player)}"`, `""`, count, "ABSENT_FROM_ODDS_NO_FIX"].join(","));
  }

  fs.writeFileSync(outPath, csvLines.join("\n"), "utf8");
  console.log(`Wrote ${outPath} (${suggestedAliases.size} alias suggestions + ${Object.keys(absentPlayers).length} absent players)`);
}

main();
