// src/run_sgo_only.ts
// Phase 2: SGO-cache-only EV leg runner.
// Reads the raw SGO market cache (0 quota hits) and produces EV legs and a
// merge report that can be compared against PP + UD in the triple A/B audit.
//
// Usage:
//   node dist/run_sgo_only.js
//   EXPORT_MERGE_REPORT=1 node dist/run_sgo_only.js

import fs from "fs";
import path from "path";
import { SgoPlayerPropOdds, MergedPick, EvPick, StatCategory, Sport } from "./types";
import { americanToProb, devigTwoWay, probToAmerican } from "./odds_math";
import { writeMergeReportCsv } from "./export_imported_csv";
import { PP_MAX_JUICE, UD_MAX_JUICE } from "./merge_odds";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "cache");
const RAW_CACHE_PATTERN = /^(nba|nfl|nhl|mlb)_sgo_props_cache\.json$/i;

const PREFERRED_BOOKS = ["fanduel", "draftkings", "caesars", "betmgm", "espn_bet"];

// Min edge to include a leg in sgo_only output (same as main optimizer)
const SGO_ONLY_MIN_EDGE = 0.01;
// Max juice: use UD threshold as this is an unconstrained odds set
const SGO_ONLY_MAX_JUICE = UD_MAX_JUICE;

interface SgoRawCache {
  fetchedAt: string;
  leagueID: string;
  totalRows: number;
  mainLineCount: number;
  altLineCount: number;
  data: SgoPlayerPropOdds[];
}

function loadAllSgoCaches(): SgoPlayerPropOdds[] {
  if (!fs.existsSync(CACHE_DIR)) {
    console.error(`[SGO-Only] Cache dir not found: ${CACHE_DIR}`);
    console.error("[SGO-Only] Run the full pipeline once to populate the raw cache (Phase 1).");
    process.exit(1);
  }

  const markets: SgoPlayerPropOdds[] = [];
  const files = fs.readdirSync(CACHE_DIR).filter((f) => RAW_CACHE_PATTERN.test(f));

  if (files.length === 0) {
    console.error("[SGO-Only] No raw SGO cache files found in ./cache/");
    console.error("[SGO-Only] Run the full pipeline with includeAltLines=true (Phase 1) first.");
    process.exit(1);
  }

  for (const file of files) {
    try {
      const raw: SgoRawCache = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8"));
      const age = (Date.now() - new Date(raw.fetchedAt).getTime()) / 60000;
      console.log(
        `[SGO-Only] Loaded ${file}: ${raw.totalRows} rows ` +
        `(${raw.mainLineCount} main + ${raw.altLineCount} alt, ${age.toFixed(0)}m old)`
      );
      markets.push(...raw.data);
    } catch (err) {
      console.warn(`[SGO-Only] Failed to parse ${file}:`, err);
    }
  }

  console.log(`[SGO-Only] Total SGO markets loaded: ${markets.length}`);
  return markets;
}

/** For each unique (player, stat, league) in SGO, take the line with best EV
 *  (closest to 50/50 after devigging). One leg per player+stat+line combo. */
function buildSgoOnlyLegs(markets: SgoPlayerPropOdds[]): EvPick[] {
  const legs: EvPick[] = [];
  const seenKeys = new Set<string>();

  // Sort by best over odds (ascending = most likely over) to process best lines first
  const sorted = [...markets].sort((a, b) => (b.overOdds ?? -999) - (a.overOdds ?? -999));

  for (const m of sorted) {
    // Juice guard: skip if either side is too extreme
    if (typeof m.overOdds === "number" && m.overOdds <= -SGO_ONLY_MAX_JUICE) continue;
    if (typeof m.underOdds === "number" && m.underOdds <= -SGO_ONLY_MAX_JUICE) continue;
    if (!Number.isFinite(m.overOdds) || !Number.isFinite(m.underOdds)) continue;

    const key = `${m.player}::${m.stat}::${m.league}::${m.line}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const overProbVigged = americanToProb(m.overOdds);
    const underProbVigged = americanToProb(m.underOdds);
    const [trueOverProb] = devigTwoWay(overProbVigged, underProbVigged);

    const edge = trueOverProb - 0.5;
    if (edge < SGO_ONLY_MIN_EDGE) continue; // below edge floor

    const fairOverOdds = probToAmerican(trueOverProb);
    const isAlt = m.isMainLine === false;

    legs.push({
      id: `sgo-only-${m.player}-${m.stat}-${m.line}`,
      sport: m.sport,
      site: "prizepicks", // placeholder — sgo-only has no site
      league: m.league,
      player: m.player,
      team: m.team,
      opponent: m.opponent,
      stat: m.stat,
      line: m.line,
      projectionId: m.eventId ?? "sgo",
      gameId: m.eventId,
      startTime: null,
      outcome: "over",
      trueProb: trueOverProb,
      fairOdds: fairOverOdds,
      edge,
      book: m.book,
      overOdds: m.overOdds,
      underOdds: m.underOdds,
      legEv: edge,
      isNonStandardOdds: isAlt,
    });
  }

  return legs.sort((a, b) => b.edge - a.edge);
}

function writeLegsToFile(legs: EvPick[], filename: string): void {
  const headers = [
    "player", "sport", "league", "stat", "line", "book",
    "overOdds", "underOdds", "trueProb", "edge", "isAlt",
  ];
  const rows = legs.map((l) => [
    l.player, l.sport, l.league, l.stat, l.line, l.book,
    l.overOdds, l.underOdds, l.trueProb.toFixed(4), l.edge.toFixed(4),
    l.isNonStandardOdds ? "1" : "0",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  fs.writeFileSync(filename, csv, "utf8");
  console.log(`[SGO-Only] Wrote ${legs.length} legs → ${filename}`);
}

function writeTripleMergeReport(legs: EvPick[]): void {
  if (process.env.EXPORT_MERGE_REPORT !== "1") return;

  // Synthesize merge-report rows so audit script can include SGO-only in matrix
  const rows = legs.map((l) => ({
    site: "sgo_only",
    player: l.player,
    stat: l.stat,
    line: l.line,
    sport: l.sport,
    matched: "Y",
    reason: l.isNonStandardOdds ? "ok_alt" : "ok",
    bestOddsLine: String(l.line),
    bestOddsPlayerNorm: l.player.toLowerCase(),
    matchType: l.isNonStandardOdds ? "alt" : "main",
    altDelta: "0.00",
  }));

  const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  writeMergeReportCsv(rows, path.join(ROOT, "merge_report_sgo_only.csv"));
  writeMergeReportCsv(rows, path.join(ROOT, `merge_report_sgo_only_${ts}.csv`));
  console.log(`[SGO-Only] Wrote merge_report_sgo_only.csv (${rows.length} rows)`);
}

function writeStatSummary(legs: EvPick[]): void {
  const byStat: Record<string, { total: number; main: number; alt: number }> = {};
  for (const l of legs) {
    if (!byStat[l.stat]) byStat[l.stat] = { total: 0, main: 0, alt: 0 };
    byStat[l.stat].total++;
    if (l.isNonStandardOdds) byStat[l.stat].alt++;
    else byStat[l.stat].main++;
  }
  console.log("\n[SGO-Only] EV legs by stat:");
  console.log("stat           | total | main | alt  | top_edge");
  console.log("---------------|-------|------|------|----------");
  for (const [stat, s] of Object.entries(byStat).sort((a, b) => b[1].total - a[1].total)) {
    const topEdge = Math.max(...legs.filter((l) => l.stat === stat).map((l) => l.edge));
    console.log(`${stat.padEnd(14)} | ${String(s.total).padEnd(5)} | ${String(s.main).padEnd(4)} | ${String(s.alt).padEnd(4)} | ${(topEdge * 100).toFixed(1)}%`);
  }
}

async function main(): Promise<void> {
  console.log("=== SGO-Only EV Runner (Phase 2) ===");
  console.log("Source: raw SGO prop cache (0 API quota hits)\n");

  const markets = loadAllSgoCaches();
  const legs = buildSgoOnlyLegs(markets);

  console.log(`\n[SGO-Only] Found ${legs.length} +EV legs (edge ≥ ${(SGO_ONLY_MIN_EDGE * 100).toFixed(0)}%, juice ≤ -${SGO_ONLY_MAX_JUICE})`);
  writeStatSummary(legs);

  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  writeLegsToFile(legs, path.join(ROOT, `sgo_only_legs.csv`));
  writeLegsToFile(legs, path.join(ROOT, `sgo_only_legs_${ts}.csv`));
  writeTripleMergeReport(legs);

  // Top 20 legs preview
  console.log("\n[SGO-Only] Top 20 legs by edge:");
  console.log("player                         | stat       | line   | book       | edge   | isAlt");
  console.log("-------------------------------|------------|--------|------------|--------|------");
  for (const l of legs.slice(0, 20)) {
    console.log(
      `${l.player.padEnd(30)} | ${l.stat.padEnd(10)} | ${String(l.line).padEnd(6)} | ` +
      `${(l.book ?? "").padEnd(10)} | ${(l.edge * 100).toFixed(1).padEnd(5)}% | ${l.isNonStandardOdds ? "alt" : "main"}`
    );
  }
}

main().catch((err) => {
  console.error("[SGO-Only] Fatal error:", err);
  process.exit(1);
});
