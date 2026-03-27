/**
 * Shared legs CSV parsing + index (used by perf tracker backfill and Phase 67/68 enrichment).
 */

import fs from "fs";
import path from "path";

export type LegCsvRecord = {
  player: string;
  stat: string;
  line: number;
  book: string;
  league: string;
  trueProb: number;
  legEv: number;
  overOdds?: number;
  underOdds?: number;
  gameStartTime?: string;
  team?: string;
  opponent?: string;
};

export function parseCsv(filePath: string): { headers: string[]; rows: string[][] } {
  if (!fs.existsSync(filePath)) return { headers: [], rows: [] };
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row: string[] = [];
    let rest = lines[i];
    for (let c = 0; c < headers.length; c++) {
      if (rest.startsWith('"')) {
        const end = rest.indexOf('"', 1);
        if (end === -1) {
          row.push(rest.slice(1));
          rest = "";
        } else {
          row.push(rest.slice(1, end));
          rest = rest.slice(end + 1).replace(/^,/, "");
        }
      } else {
        const idx = rest.indexOf(",");
        if (idx === -1) {
          row.push(rest);
          rest = "";
        } else {
          row.push(rest.slice(0, idx));
          rest = rest.slice(idx + 1);
        }
      }
    }
    if (rest) row.push(rest);
    rows.push(row);
  }
  return { headers, rows };
}

export function toRecord(headers: string[], row: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[h] = row[i] ?? "";
  });
  return rec;
}

export function loadLegsMap(filePaths: string[]): Map<string, LegCsvRecord> {
  const map = new Map<string, LegCsvRecord>();
  for (const p of filePaths) {
    const { headers, rows } = parseCsv(p);
    if (headers.length === 0) continue;
    const idIdx = headers.indexOf("id");
    const playerIdx = headers.indexOf("player");
    const statIdx = headers.indexOf("stat");
    const lineIdx = headers.indexOf("line");
    const bookIdx = headers.indexOf("book");
    const leagueIdx = headers.indexOf("league");
    const trueProbIdx = headers.indexOf("trueProb");
    const legEvIdx = headers.indexOf("legEv");
    const overOddsIdx = headers.indexOf("overOdds");
    const underOddsIdx = headers.indexOf("underOdds");
    const gameTimeIdx = headers.indexOf("gameTime");
    const teamIdx = headers.indexOf("team");
    const oppIdx = headers.indexOf("opponent");
    if (
      idIdx === -1 ||
      playerIdx === -1 ||
      statIdx === -1 ||
      lineIdx === -1 ||
      bookIdx === -1 ||
      trueProbIdx === -1 ||
      legEvIdx === -1
    )
      continue;
    for (const row of rows) {
      const id = row[idIdx]?.trim();
      if (!id) continue;
      const lineNum = parseFloat(row[lineIdx] ?? "0") || 0;
      const trueProb = parseFloat(row[trueProbIdx] ?? "0.5") || 0.5;
      const legEv = parseFloat(row[legEvIdx] ?? "0") || 0;
      const overOdds = overOddsIdx >= 0 ? parseFloat(row[overOddsIdx] ?? "") : undefined;
      const underOdds = underOddsIdx >= 0 ? parseFloat(row[underOddsIdx] ?? "") : undefined;
      const leagueRaw = leagueIdx >= 0 ? (row[leagueIdx] ?? "").trim() : "";
      map.set(id, {
        player: (row[playerIdx] ?? "").trim(),
        stat: (row[statIdx] ?? "").trim(),
        line: lineNum,
        book: (row[bookIdx] ?? "").trim(),
        league: leagueRaw || "NBA",
        trueProb,
        legEv,
        overOdds: Number.isFinite(overOdds) ? overOdds : undefined,
        underOdds: Number.isFinite(underOdds) ? underOdds : undefined,
        gameStartTime:
          gameTimeIdx >= 0 && (row[gameTimeIdx] ?? "").trim() ? (row[gameTimeIdx] ?? "").trim() : undefined,
        team: teamIdx >= 0 && (row[teamIdx] ?? "").trim() ? (row[teamIdx] ?? "").trim() : undefined,
        opponent: oppIdx >= 0 && (row[oppIdx] ?? "").trim() ? (row[oppIdx] ?? "").trim() : undefined,
      });
    }
  }
  return map;
}

export function existingLegCsvPaths(root: string): string[] {
  const out: string[] = [];
  for (const rel of [
    "prizepicks-legs.csv",
    "underdog-legs.csv",
    path.join("data", "output_logs", "prizepicks-legs.csv"),
    path.join("data", "output_logs", "underdog-legs.csv"),
    path.join("web-dashboard", "public", "data", "prizepicks-legs.csv"),
    path.join("web-dashboard", "public", "data", "underdog-legs.csv"),
  ]) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) out.push(p);
  }
  const archiveDir = path.join(root, "data", "legs_archive");
  if (fs.existsSync(archiveDir)) {
    const names = fs
      .readdirSync(archiveDir)
      .filter((f) => /^(prizepicks|underdog)-legs-\d{8}\.csv$/i.test(f));
    names.sort((a, b) => a.localeCompare(b));
    for (const f of names) out.push(path.join(archiveDir, f));
  }
  return out;
}

/**
 * Grounded **`EvPick[]`-merge** JSON sources for Phase **101** (same roots as CSV where applicable + dated archives).
 * Order is deterministic; **`mergeLegsFromJsonFiles`** only adds **`id`** keys not already in the map (CSV wins).
 */
export function existingGroundedLegJsonPaths(root: string): string[] {
  const out: string[] = [];
  for (const rel of [
    "prizepicks-legs.json",
    "underdog-legs.json",
    path.join("data", "output_logs", "prizepicks-legs.json"),
    path.join("data", "output_logs", "underdog-legs.json"),
    path.join("web-dashboard", "public", "data", "prizepicks-legs.json"),
    path.join("web-dashboard", "public", "data", "underdog-legs.json"),
  ]) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) out.push(p);
  }
  const archiveDir = path.join(root, "data", "legs_archive");
  if (fs.existsSync(archiveDir)) {
    const names = fs
      .readdirSync(archiveDir)
      .filter((f) => /^(prizepicks|underdog)-legs-\d{8}\.json$/i.test(f));
    names.sort((a, b) => a.localeCompare(b));
    for (const f of names) out.push(path.join(archiveDir, f));
  }
  return out;
}
