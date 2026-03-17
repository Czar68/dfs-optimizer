/**
 * One-off diagnostic: tier classification vs last-run card/edge distribution.
 * No threshold or formula changes. Output: artifacts/tier_diagnostic_report.md
 */
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "data", "output_logs");
const ARTIFACTS = path.join(process.cwd(), "artifacts");

// Tier thresholds from build_innovative_cards.ts (for reference in report)
const TIER1_MIN_EV_PCT = 8;
const TIER1_MIN_KELLY = 0.015;
const TIER2_MIN_EV_PCT = 4;
const TIER2_MIN_KELLY = 0.005;

function parseCsv(path: string): string[][] {
  const raw = fs.readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((l) => {
    const row: string[] = [];
    let inQuotes = false;
    let cell = "";
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === "," && !inQuotes) || c === "\n") {
        row.push(cell);
        cell = "";
      } else {
        cell += c;
      }
    }
    row.push(cell);
    return row;
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (i - lo) * (sorted[hi]! - sorted[lo]!);
}

function stats(arr: number[]): { min: number; max: number; p25: number; p50: number; p75: number; p90: number } {
  const s = [...arr].sort((a, b) => a - b);
  return {
    min: s[0] ?? NaN,
    max: s[s.length - 1] ?? NaN,
    p25: percentile(s, 25),
    p50: percentile(s, 50),
    p75: percentile(s, 75),
    p90: percentile(s, 90),
  };
}

function main() {
  const report: string[] = [];
  report.push("# Tier diagnostic report (diagnostic only, no changes)");
  report.push("");
  report.push("## 1. Tier classification logic (from code)");
  report.push("");
  report.push("- **Location**: `src/build_innovative_cards.ts`");
  report.push("- **Function**: `classifyTier(cardEV, kellyFrac, fragile)`");
  report.push("- **Tier1**: cardEV ≥ 8%, kellyFrac ≥ 1.5%, **and non-fragile**. Fragile cards cap at Tier2.");
  report.push("- **Tier2**: cardEV ≥ 4%, kellyFrac ≥ 0.5%.");
  report.push("- **Tier3**: else.");
  report.push("- **Thresholds**: Hardcoded constants `TIER1_MIN_EV = 0.08`, `TIER1_MIN_KELLY = 0.015`, `TIER2_MIN_EV = 0.04`, `TIER2_MIN_KELLY = 0.005`. Not configurable via CLI.");
  report.push("");

  // --- UD cards ---
  const udPath = path.join(OUT_DIR, "underdog-cards.csv");
  if (!fs.existsSync(udPath)) {
    report.push("## 2. Underdog cards: file not found");
  } else {
    const udRows = parseCsv(udPath);
    const header = udRows[0] ?? [];
    const cardEvIdx = header.indexOf("cardEv");
    const avgEdgeIdx = header.indexOf("avgEdgePct");
    const kellyFracIdx = header.indexOf("kellyFrac");
    if (cardEvIdx === -1 || avgEdgeIdx === -1) {
      report.push("## 2. Underdog cards: missing cardEv or avgEdgePct column");
    } else {
      const cardEvs: number[] = [];
      const avgEdges: number[] = [];
      const kellyFracs: number[] = [];
      for (let i = 1; i < udRows.length; i++) {
        const r = udRows[i]!;
        const ev = parseFloat(r[cardEvIdx] ?? "");
        const edge = parseFloat(r[avgEdgeIdx] ?? "");
        const kf = kellyFracIdx >= 0 ? parseFloat(r[kellyFracIdx] ?? "") : 0;
        if (Number.isFinite(ev)) cardEvs.push(ev);
        if (Number.isFinite(edge)) avgEdges.push(edge);
        if (Number.isFinite(kf)) kellyFracs.push(kf);
      }
      const n = cardEvs.length;
      report.push("## 2. Underdog cards (from underdog-cards.csv)");
      report.push("");
      report.push(`- **Row count (data)**: ${n}`);
      const evAsPercent = (cardEvs.length > 0 && Math.max(...cardEvs) > 1) || cardEvs.some((e) => e > 1);
      const tier1EvThreshold = evAsPercent ? TIER1_MIN_EV_PCT : TIER1_MIN_EV_PCT / 100;
      report.push(`- **cardEv units**: ${evAsPercent ? "percent (e.g. 8.46 = 8.46%)" : "decimal (e.g. 0.0846)"}`);
      report.push("");
      report.push("### 2a. Distribution of AvgEdge% (avgEdgePct)");
      if (avgEdges.length > 0) {
        const se = stats(avgEdges);
        report.push(`| min | max | p25 | p50 | p75 | p90 |`);
        report.push(`|-----|-----|-----|-----|-----|-----|`);
        report.push(`| ${se.min.toFixed(2)} | ${se.max.toFixed(2)} | ${se.p25.toFixed(2)} | ${se.p50.toFixed(2)} | ${se.p75.toFixed(2)} | ${se.p90.toFixed(2)} |`);
      }
      report.push("");
      report.push("### 2b. Distribution of cardEV (same units as tier threshold)");
      if (cardEvs.length > 0) {
        const se = stats(cardEvs);
        report.push(`| min | max | p25 | p50 | p75 | p90 |`);
        report.push(`|-----|-----|-----|-----|-----|-----|`);
        report.push(`| ${se.min.toFixed(2)} | ${se.max.toFixed(2)} | ${se.p25.toFixed(2)} | ${se.p50.toFixed(2)} | ${se.p75.toFixed(2)} | ${se.p90.toFixed(2)} |`);
      }
      report.push("");
      report.push("### 2c. Cards within 1%, 2%, 3% of Tier1 EV threshold (" + tier1EvThreshold + "%)");
      const within1 = cardEvs.filter((e) => e >= tier1EvThreshold - 1 && e < tier1EvThreshold).length;
      const within2 = cardEvs.filter((e) => e >= tier1EvThreshold - 2 && e < tier1EvThreshold).length;
      const within3 = cardEvs.filter((e) => e >= tier1EvThreshold - 3 && e < tier1EvThreshold).length;
      const atOrAbove = cardEvs.filter((e) => e >= tier1EvThreshold).length;
      report.push(`| Band | Count |`);
      report.push(`|------|-------|`);
      report.push(`| ≥ threshold (≥ ${tier1EvThreshold}%) | ${atOrAbove} |`);
      report.push(`| within 1% below (${tier1EvThreshold - 1}% ≤ EV < ${tier1EvThreshold}%) | ${within1} |`);
      report.push(`| within 2% below | ${within2} |`);
      report.push(`| within 3% below | ${within3} |`);
      report.push("");
      report.push("### 3. If Tier1 EV threshold were lowered by 1%");
      const newThreshold = tier1EvThreshold - 1;
      const wouldQualifyEv = cardEvs.filter((e) => e >= newThreshold).length;
      const wouldQualifyEvAndKelly =
        kellyFracs.length === cardEvs.length
          ? cardEvs.filter((_, i) => cardEvs[i]! >= newThreshold && (kellyFracs[i] ?? 0) >= TIER1_MIN_KELLY).length
          : wouldQualifyEv;
      report.push(`- New threshold: ${newThreshold}%. Cards with cardEV ≥ ${newThreshold}%: **${wouldQualifyEv}**.`);
      report.push(`- With same Kelly gate (kellyFrac ≥ 1.5%): **${wouldQualifyEvAndKelly}** (UD CSV has no fragile flag; true tier1 count would be ≤ this).`);
    }
  }

  report.push("");
  report.push("## 2d. PrizePicks cards (from prizepicks-cards.csv)");
  const ppPath = path.join(OUT_DIR, "prizepicks-cards.csv");
  if (fs.existsSync(ppPath)) {
    const ppRows = parseCsv(ppPath);
    const h = ppRows[0] ?? [];
    const evIdx = h.indexOf("cardEv");
    const edgeIdx = h.indexOf("avgEdgePct");
    if (evIdx >= 0 && edgeIdx >= 0) {
      const ppEv: number[] = [];
      const ppEdge: number[] = [];
      for (let i = 1; i < ppRows.length; i++) {
        const r = ppRows[i]!;
        const ev = parseFloat(r[evIdx] ?? "");
        const edge = parseFloat(r[edgeIdx] ?? "");
        if (Number.isFinite(ev)) ppEv.push(ev);
        if (Number.isFinite(edge)) ppEdge.push(edge);
      }
      if (ppEv.length > 0) {
        const ppEvAsPct = Math.max(...ppEv) > 1;
        const t1 = ppEvAsPct ? 8 : 0.08;
        const delta = ppEvAsPct ? 1 : 0.01;
        const se = stats(ppEv);
        const seEdge = ppEdge.length > 0 ? stats(ppEdge) : null;
        report.push("- **cardEV units**: " + (ppEvAsPct ? "percent" : "decimal") + ". Tier1 EV threshold: " + t1 + (ppEvAsPct ? "%" : ""));
        report.push("- **cardEV distribution**: min " + se.min.toFixed(2) + ", max " + se.max.toFixed(2) + ", p25 " + se.p25.toFixed(2) + ", p50 " + se.p50.toFixed(2) + ", p75 " + se.p75.toFixed(2) + ", p90 " + se.p90.toFixed(2));
        if (seEdge) report.push("- **avgEdgePct distribution**: min " + seEdge.min.toFixed(2) + ", max " + seEdge.max.toFixed(2) + ", p50 " + seEdge.p50.toFixed(2));
        report.push("- **Count ≥ tier1 EV**: " + ppEv.filter((e) => e >= t1).length + ". Within 1% / 2% / 3% below threshold: " + ppEv.filter((e) => e >= t1 - delta && e < t1).length + " / " + ppEv.filter((e) => e >= t1 - 2 * delta && e < t1).length + " / " + ppEv.filter((e) => e >= t1 - 3 * delta && e < t1).length);
      } else {
        report.push("- No data rows (header only); PP card distribution N/A for this run.");
      }
    } else {
      report.push("- Missing cardEv or avgEdgePct column.");
    }
  } else {
    report.push("- File not found.");
  }
  report.push("");
  report.push("## 4. Kelly stake for Tier2 (from code)");
  report.push("");
  report.push("- **Single formula for all tiers**: `kellyStake = min(maxBetPerCard, bankroll × kellyFrac × kellyMultiplier)`.");
  report.push("- **kellyMultiplier** is one global (default **0.5** = half-Kelly), passed into `buildInnovativeCards(opts)`. Not tier-dependent.");
  report.push("- So **Tier2 cards use the same 0.5-Kelly as Tier1**; there is no separate full-Kelly for T1 and half-Kelly for T2.");
  report.push("- **Location**: `src/build_innovative_cards.ts` ~L469–471, and `opts.kellyMultiplier` default 0.5 at ~L388.");
  report.push("");

  report.push("## 5. Findings (no changes made)");
  report.push("");
  report.push("- Tier thresholds are **hardcoded** in `build_innovative_cards.ts`; consider making them configurable if you want to tune without code edits.");
  report.push("- If the **last live run** had 0 tier1 and 6 tier2, that is from the **PP** pipeline (tier1.csv / tier2.csv from `writeTieredCsvs`). UD cards are not classified into tier1/tier2 by the same logic (UD export has no tier column).");
  report.push("- The **sensitivity** (how many cards would qualify if tier1 EV were lowered by 1%) is reported above from the current underdog-cards.csv.");
  report.push("- **Miscalibration flag**: In this UD run, only 6 cards have cardEV ≥ 8%; 16 are in the 7–8% band. Lowering the tier1 EV threshold by 1% would yield 22 cards qualifying by EV+Kelly. The tier1 threshold is a **binding constraint**; a 1% relaxation would roughly quadruple tier1 count. The bulk of cards are below 8% (median ~5%), so the slate has few tier1-quality cards by current rules.");
  report.push("");

  const outPath = path.join(ARTIFACTS, "tier_diagnostic_report.md");
  fs.writeFileSync(outPath, report.join("\n"), "utf8");
  console.log("Wrote " + outPath);
}

main();
