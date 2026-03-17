import fs from "fs";
import { EvPick } from "../types";

export interface TierOneParlayRow {
  runTimestamp: string;
  gameKey: string;
  legCount: number;
  jointTrueProb: number;
  avgEdge: number;
  legIds: string;
  players: string;
}

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

function gameKeyForLeg(leg: EvPick): string {
  if (leg.gameId && String(leg.gameId).trim()) return String(leg.gameId).trim();
  const team = String(leg.team ?? "").trim();
  const opp = String(leg.opponent ?? "").trim();
  if (team && opp) return `${team} vs ${opp}`;
  if (team) return team;
  if (leg.startTime && String(leg.startTime).trim()) return `start:${String(leg.startTime).trim()}`;
  return "UNKNOWN_GAME";
}

export function buildTierOneParlays(legs: EvPick[], runTimestamp: string): TierOneParlayRow[] {
  const grouped = new Map<string, EvPick[]>();
  for (const leg of legs) {
    const key = gameKeyForLeg(leg);
    const arr = grouped.get(key) ?? [];
    arr.push(leg);
    grouped.set(key, arr);
  }

  const rows: TierOneParlayRow[] = [];
  for (const [gameKey, gameLegs] of grouped.entries()) {
    if (gameLegs.length < 2) continue; // Parlay requires at least 2 legs.
    const uniqueLegs = [...new Map(gameLegs.map((l) => [l.id, l])).values()];
    if (uniqueLegs.length < 2) continue;
    const jointTrueProb = uniqueLegs.reduce(
      (acc, leg) => acc * Math.max(0, Math.min(1, Number(leg.trueProb) || 0)),
      1
    );
    const avgEdge =
      uniqueLegs.reduce((sum, leg) => sum + (Number(leg.edge) || 0), 0) / uniqueLegs.length;
    rows.push({
      runTimestamp,
      gameKey,
      legCount: uniqueLegs.length,
      jointTrueProb,
      avgEdge,
      legIds: uniqueLegs.map((l) => l.id).join("|"),
      players: uniqueLegs.map((l) => l.player).join(" | "),
    });
  }

  return rows.sort((a, b) => b.jointTrueProb - a.jointTrueProb);
}

export function writeParlaysCsv(rows: TierOneParlayRow[], outPath: string): void {
  const header = [
    "runTimestamp",
    "gameKey",
    "legCount",
    "jointTrueProb",
    "avgEdge",
    "legIds",
    "players",
  ];
  const lines: string[] = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.runTimestamp,
        row.gameKey,
        row.legCount,
        row.jointTrueProb,
        row.avgEdge,
        row.legIds,
        row.players,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
}

export function buildAndWriteTierOneParlays(
  legs: EvPick[],
  outPath: string,
  runTimestamp: string
): TierOneParlayRow[] {
  const rows = buildTierOneParlays(legs, runTimestamp);
  writeParlaysCsv(rows, outPath);
  return rows;
}

