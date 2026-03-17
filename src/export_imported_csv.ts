// src/export_imported_csv.ts
// Write CSVs of all imported data (OddsAPI, PrizePicks, Underdog) for merge debugging.

import fs from "fs";
import path from "path";
import { getOutputPath, PP_IMPORTED_CSV, UD_IMPORTED_CSV, MERGE_REPORT_CSV, ODDSAPI_IMPORTED_CSV } from "./constants/paths";

function escapeCsv(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsvRows(filePath: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => row.map((c) => escapeCsv(c)).join(","));
  fs.writeFileSync(filePath, [headerLine, ...dataLines].join("\n"), "utf8");
  console.log(`[Export] Wrote ${rows.length} rows to ${path.basename(filePath)}`);
}

export interface OddsRowForExport {
  source: string;
  player: string;
  player_normalized: string;
  sport: string;
  league: string;
  stat: string;
  line: number;
  overOdds: number;
  underOdds: number;
  book: string;
  eventId: string | null;
  team: string | null;
  opponent: string | null;
}

export function writeOddsImportedCsv(
  rows: { player: string; sport: string; league: string; stat: string; line: number; overOdds: number; underOdds: number; book: string; eventId?: string | null; team?: string | null; opponent?: string | null }[],
  source: "OddsAPI",
  normalizePlayer: (id: string) => string
): void {
  const filePath = getOutputPath(ODDSAPI_IMPORTED_CSV);
  const headers = ["source", "player", "player_normalized", "sport", "league", "stat", "line", "overOdds", "underOdds", "book", "eventId", "team", "opponent"];
  const data = rows.map((o) => [
    source,
    o.player,
    normalizePlayer(o.player),
    o.sport,
    o.league,
    o.stat,
    o.line,
    o.overOdds,
    o.underOdds,
    o.book,
    o.eventId ?? "",
    o.team ?? "",
    o.opponent ?? "",
  ]);
  writeCsvRows(filePath, headers, data);
}

export interface RawPickForExport {
  source: string;
  player: string;
  player_lower: string;
  sport: string;
  league: string;
  stat: string;
  line: number;
  projectionId: string;
  gameId: string | null;
  team: string | null;
  opponent: string | null;
  site: string;
  isPromo: boolean;
  isNonStandardOdds?: boolean;
}

export function writePrizePicksImportedCsv(
  picks: { player: string; sport: string; league: string; stat: string; line: number; projectionId: string; gameId?: string | null; team?: string | null; opponent?: string | null; site?: string; isPromo?: boolean }[]
): void {
  const filePath = getOutputPath(PP_IMPORTED_CSV);
  const headers = ["source", "player", "player_lower", "sport", "league", "stat", "line", "projectionId", "gameId", "team", "opponent", "site", "isPromo"];
  const data = picks.map((p) => [
    "PrizePicks",
    p.player,
    p.player.trim().toLowerCase(),
    p.sport,
    p.league,
    p.stat,
    p.line,
    p.projectionId ?? "",
    p.gameId ?? "",
    p.team ?? "",
    p.opponent ?? "",
    p.site ?? "prizepicks",
    p.isPromo ? "1" : "0",
  ]);
  writeCsvRows(filePath, headers, data);
}

/** Optional: set EXPORT_MERGE_REPORT=1 to write merge_report.csv (one row per pick, matched Y/N, reason, best odds line, site).
 *  If filePath is provided, writes to that path (e.g. merge_report_underdog.csv); otherwise writes to merge_report.csv. */
export function writeMergeReportCsv(
  rows: {
    site?: string; player: string; stat: string; line: number; sport: string;
    matched: string; reason: string; bestOddsLine: string; bestOddsPlayerNorm: string;
    matchType?: string; altDelta?: string;
  }[],
  filePathOverride?: string
): void {
  const filePath = filePathOverride ?? getOutputPath(MERGE_REPORT_CSV);
  // Phase 2: matchType and altDelta columns added (backward-compatible — older readers ignore extra columns)
  const headers = ["site", "player", "stat", "line", "sport", "matched", "reason", "bestOddsLine", "bestOddsPlayerNorm", "matchType", "altDelta"];
  const data = rows.map((r) => [
    r.site ?? "", r.player, r.stat, r.line, r.sport, r.matched, r.reason,
    r.bestOddsLine, r.bestOddsPlayerNorm,
    r.matchType ?? "", r.altDelta ?? "",
  ]);
  writeCsvRows(filePath, headers, data);
}

export function writeUnderdogImportedCsv(
  picks: { player: string; sport: string; league: string; stat: string; line: number; projectionId?: string; gameId?: string | null; team?: string | null; opponent?: string | null; isNonStandardOdds?: boolean }[]
): void {
  const filePath = getOutputPath(UD_IMPORTED_CSV);
  const headers = ["source", "player", "player_lower", "sport", "league", "stat", "line", "projectionId", "gameId", "team", "opponent", "isNonStandardOdds"];
  const data = picks.map((p) => [
    "Underdog",
    p.player,
    p.player.trim().toLowerCase(),
    p.sport,
    p.league,
    p.stat,
    p.line,
    p.projectionId ?? "",
    p.gameId ?? "",
    p.team ?? "",
    p.opponent ?? "",
    p.isNonStandardOdds ? "1" : "0",
  ]);
  writeCsvRows(filePath, headers, data);
}
