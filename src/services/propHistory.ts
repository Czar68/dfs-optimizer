import fs from "fs";
import path from "path";

import { getDataPath, NBA_PROPS_MASTER_CSV, MLB_PROPS_MASTER_CSV } from "../constants/paths";
import type { EvPick, Sport, Site } from "../types";

export type PropHistoryAppendOptions = { platform?: "PP" | "UD" };

type HistoryRow = {
  date: string;
  snapshot_time: string;
  sport: string;
  player: string;
  team: string;
  opponent: string;
  game_id: string;
  prop_type: string;
  line: string;
  sportsbook_odds: string;
  implied_probability: string;
  projection: string;
  ev: string;
  tier: string;
  dfs_platform: string;
  match_type: string;
  market_line: string;
  closing_line: string;
  line_movement: string;
  snapshot_source: string;
};

/** Canonical CSV column order; single source of truth for warehouse schema. */
export const HEADER_COLUMNS: (keyof HistoryRow)[] = [
  "date",
  "snapshot_time",
  "sport",
  "player",
  "team",
  "opponent",
  "game_id",
  "prop_type",
  "line",
  "sportsbook_odds",
  "implied_probability",
  "projection",
  "ev",
  "tier",
  "dfs_platform",
  "match_type",
  "market_line",
  "closing_line",
  "line_movement",
  "snapshot_source",
];

function getDatasetPath(sport: Sport): string | null {
  switch (sport) {
    case "NBA":
      return getDataPath(NBA_PROPS_MASTER_CSV);
    case "MLB":
      return getDataPath(MLB_PROPS_MASTER_CSV);
    default:
      return null;
  }
}

function parseRunTimestamp(runTimestamp: string): { date: string; snapshot_time: string } {
  // runTimestamp format: "YYYY-MM-DDTHH:MM:SS ET"
  const [datePart, timePartRaw] = runTimestamp.split("T");
  let snapshotTime = "";
  if (timePartRaw) {
    const timePart = timePartRaw.split(" ")[0] ?? "";
    snapshotTime = timePart.slice(0, 5); // HH:MM
  }
  return { date: datePart ?? "", snapshot_time: snapshotTime };
}

function buildGameId(team: string, opponent: string, date: string): string {
  if (!team && !opponent) return "";
  const t = (team || "").toUpperCase();
  const o = (opponent || "").toUpperCase();
  if (!t || !o || !date) return "";
  return `${t}_${o}_${date.replace(/-/g, "")}`;
}

function toHistoryRow(leg: EvPick, runTimestamp: string): HistoryRow {
  const { date, snapshot_time } = parseRunTimestamp(runTimestamp);
  const sport = leg.sport;
  const player = leg.player;
  const team = leg.team ?? "";
  const opponent = leg.opponent ?? "";
  const game_id = buildGameId(team, opponent, date);
  const prop_type = String(leg.stat);
  const line = Number.isFinite(leg.line) ? String(leg.line) : "";
  const sportsbookOdds = leg.overOdds != null ? String(leg.overOdds) :
    (leg.underOdds != null ? String(leg.underOdds) : "");
  const impliedProb = Number.isFinite(leg.trueProb) ? String(leg.trueProb) : "";
  const projection = ""; // Placeholder: pipeline does not yet expose explicit projection per leg
  const ev = Number.isFinite(leg.legEv) ? String(leg.legEv) : "";
  const tier = ""; // Tier is card-level; leave blank at prop level for now
  const dfsPlatform: Site = leg.site;
  const matchType = leg.matchType ?? "";
  const market_line = line;
  const closing_line = "";
  const line_movement = "";
  const snapshot_source = String(dfsPlatform);

  return {
    date,
    snapshot_time,
    sport: String(sport),
    player,
    team,
    opponent,
    game_id,
    prop_type,
    line,
    sportsbook_odds: sportsbookOdds,
    implied_probability: impliedProb,
    projection,
    ev,
    tier,
    dfs_platform: String(dfsPlatform),
    match_type: matchType,
    market_line,
    closing_line,
    line_movement,
    snapshot_source,
  };
}

function historyRowToCsv(row: HistoryRow): string {
  return HEADER_COLUMNS
    .map((key) => {
      const value = row[key];
      if (value == null) return "";
      const s = String(value);
      return s.includes(",") || s.includes("\"")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

function buildKey(row: HistoryRow): string {
  return [
    row.date,
    row.snapshot_time,
    row.player.toLowerCase(),
    row.prop_type.toLowerCase(),
    row.line,
    row.dfs_platform.toLowerCase(),
  ].join("|");
}

function loadExistingKeys(filePath: string): Set<string> {
  const keys = new Set<string>();
  if (!fs.existsSync(filePath)) return keys;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    if (lines.length <= 1) return keys;
    const header = lines[0].split(",").map((c) => c.trim().toLowerCase());
    const idx = (name: string) => header.findIndex((h) => h === name.toLowerCase());

    const dateIdx = idx("date");
    const snapIdx = idx("snapshot_time");
    const playerIdx = idx("player");
    const propIdx = idx("prop_type");
    const lineIdx = idx("line");
    const dfsIdx = idx("dfs_platform");

    if ([dateIdx, snapIdx, playerIdx, propIdx, lineIdx, dfsIdx].some((i) => i < 0)) {
      return keys;
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
      const date = cols[dateIdx] ?? "";
      const snapshot_time = cols[snapIdx] ?? "";
      const player = (cols[playerIdx] ?? "").toLowerCase();
      const prop_type = (cols[propIdx] ?? "").toLowerCase();
      const lineVal = cols[lineIdx] ?? "";
      const dfs_platform = (cols[dfsIdx] ?? "").toLowerCase();
      const key = [date, snapshot_time, player, prop_type, lineVal, dfs_platform].join("|");
      keys.add(key);
    }
  } catch (err) {
    console.warn("[PROP_HISTORY] Failed to load existing keys:", err);
  }

  return keys;
}

export function appendPropsToHistory(
  legs: EvPick[],
  runTimestamp: string,
  options?: PropHistoryAppendOptions
): void {
  if (!legs || legs.length === 0) return;

  const platform = options?.platform ?? "";

  // Group legs by sport so we can write to NBA vs MLB datasets separately.
  const bySport = new Map<Sport, EvPick[]>();
  for (const leg of legs) {
    const sport = leg.sport;
    if (!bySport.has(sport)) bySport.set(sport, []);
    bySport.get(sport)!.push(leg);
  }

  for (const [sport, sportLegs] of bySport.entries()) {
    const datasetPath = getDatasetPath(sport);
    if (!datasetPath) {
      continue;
    }

    const dir = path.dirname(datasetPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn(`[PROP_HISTORY] Failed to create directory ${dir}:`, err);
        continue;
      }
    }

    let existingKeys: Set<string>;
    try {
      existingKeys = loadExistingKeys(datasetPath);
    } catch (err) {
      console.warn("[PROP_HISTORY] Failed to load existing dataset; proceeding without duplicate filter:", err);
      existingKeys = new Set<string>();
    }

    const newLines: string[] = [];
    let skippedDuplicates = 0;

    for (const leg of sportLegs) {
      const row = toHistoryRow(leg, runTimestamp);
      const key = buildKey(row);
      if (existingKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }
      existingKeys.add(key);
      newLines.push(historyRowToCsv(row));
    }

    if (newLines.length === 0) {
      if (skippedDuplicates > 0) {
        console.log(
          `[PROP_HISTORY] ${sport}: no new rows to append (${skippedDuplicates} duplicates skipped).`
        );
      }
      if (platform) {
        const total = existingKeys.size;
        console.log(`PROPHISTORY append platform=${platform} sport=${sport} added=0 skipped=${skippedDuplicates} total=${total}`);
      }
      continue;
    }

    try {
      if (!fs.existsSync(datasetPath)) {
        const headerLine = HEADER_COLUMNS.join(",");
        const all = [headerLine, ...newLines].join("\n");
        fs.writeFileSync(datasetPath, all, "utf8");
      } else {
        const payload = "\n" + newLines.join("\n");
        fs.appendFileSync(datasetPath, payload, "utf8");
      }
      const finalRaw = fs.readFileSync(datasetPath, "utf8");
      const rowCount = Math.max(0, finalRaw.split(/\r?\n/).filter((l) => l.trim()).length - 1);
      if (platform) {
        console.log(`PROPHISTORY append platform=${platform} sport=${sport} added=${newLines.length} skipped=${skippedDuplicates} total=${rowCount}`);
      }
      console.log(
        `[PROP_HISTORY] ${sport}: appended ${newLines.length} rows to ${datasetPath}` +
          (skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicates skipped)` : "")
      );
    } catch (err) {
      console.warn(`[PROP_HISTORY] Failed to append to ${datasetPath}:`, err);
    }
  }
}

export function updateClosingLine(
  sport: Sport,
  player: string,
  propType: string,
  gameId: string,
  closingLine: number
): void {
  const datasetPath = getDatasetPath(sport);
  if (!datasetPath || !fs.existsSync(datasetPath)) return;
  try {
    const raw = fs.readFileSync(datasetPath, "utf8");
    const lines = raw.split(/\r?\n/);
    if (lines.length <= 1) return;
    const header = lines[0].split(",");
    const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    const playerIdx = idx("player");
    const propIdx = idx("prop_type");
    const gameIdx = idx("game_id");
    const closingIdx = idx("closing_line");
    const movementIdx = idx("line_movement");
    const lineIdx = idx("line");
    if ([playerIdx, propIdx, gameIdx, closingIdx, movementIdx, lineIdx].some((i) => i < 0)) return;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row.trim()) continue;
      const cols = row.split(",");
      if (
        (cols[playerIdx] ?? "").trim() === player &&
        (cols[propIdx] ?? "").trim() === propType &&
        (cols[gameIdx] ?? "").trim() === gameId
      ) {
        const baseLine = parseFloat((cols[lineIdx] ?? "").replace(/^"|"$/g, "").trim());
        cols[closingIdx] = String(closingLine);
        if (Number.isFinite(baseLine)) {
          cols[movementIdx] = String(closingLine - baseLine);
        }
        lines[i] = cols.join(",");
      }
    }
    fs.writeFileSync(datasetPath, lines.join("\n"), "utf8");
  } catch (err) {
    console.warn("[PROP_HISTORY] Failed to update closing line:", err);
  }
}


