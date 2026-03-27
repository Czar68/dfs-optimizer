/**
 * Deterministic game-start time candidates from JSON legs + oddsapi_today (Phase 68).
 * Extracted from backfill_perf_tracker for reuse without circular imports.
 */

import fs from "fs";
import path from "path";

export type StartTimeCandidate = {
  source: string;
  gameStartTime: string;
  team?: string;
  opponent?: string;
};

function readJsonArray(filePath: string): unknown[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function makeMarketKey(player: string, stat: string, line: number): string {
  return `${player.trim().toLowerCase()}\t${stat.trim().toLowerCase()}\t${line}`;
}

export function pickCandidate(candidates: StartTimeCandidate[]): StartTimeCandidate | null {
  if (candidates.length === 0) return null;
  const first = candidates[0];
  for (const c of candidates) {
    if (c.gameStartTime !== first.gameStartTime) return null;
  }
  return first;
}

/**
 * Loads start-time candidates from:
 * - prizepicks/underdog legs JSON (root + data/output_logs)
 * - data/oddsapi_today.json (market-key only; no leg id)
 */
export function loadStartTimeCandidates(root: string): {
  byLegId: Map<string, StartTimeCandidate[]>;
  byMarketKey: Map<string, StartTimeCandidate[]>;
} {
  const byLegId = new Map<string, StartTimeCandidate[]>();
  const byMarketKey = new Map<string, StartTimeCandidate[]>();
  const jsonFiles = [
    path.join(root, "prizepicks-legs.json"),
    path.join(root, "underdog-legs.json"),
    path.join(root, "data", "output_logs", "prizepicks-legs.json"),
    path.join(root, "data", "output_logs", "underdog-legs.json"),
  ];
  for (const filePath of jsonFiles) {
    if (!fs.existsSync(filePath)) continue;
    const rows = readJsonArray(filePath) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const start = typeof row.startTime === "string" ? row.startTime.trim() : "";
      const player = typeof row.player === "string" ? row.player.trim() : "";
      const stat = typeof row.stat === "string" ? row.stat.trim() : "";
      const line = typeof row.line === "number" ? row.line : Number(row.line);
      if (!start || !player || !stat || !Number.isFinite(line)) continue;
      const candidate: StartTimeCandidate = {
        source: path.basename(filePath),
        gameStartTime: start,
        team: typeof row.team === "string" ? row.team.trim() || undefined : undefined,
        opponent: typeof row.opponent === "string" ? row.opponent.trim() || undefined : undefined,
      };
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (id) {
        const next = byLegId.get(id) ?? [];
        next.push(candidate);
        byLegId.set(id, next);
      }
      const key = makeMarketKey(player, stat, line);
      const marketNext = byMarketKey.get(key) ?? [];
      marketNext.push(candidate);
      byMarketKey.set(key, marketNext);
    }
  }
  const oddsApiToday = path.join(root, "data", "oddsapi_today.json");
  const oddsRows = readJsonArray(oddsApiToday) as Array<Record<string, unknown>>;
  for (const row of oddsRows) {
    const start = typeof row.commenceTime === "string" ? row.commenceTime.trim() : "";
    const player = typeof row.playerName === "string" ? row.playerName.trim() : "";
    const stat = typeof row.statType === "string" ? row.statType.trim() : "";
    const line = typeof row.line === "number" ? row.line : Number(row.line);
    if (!start || !player || !stat || !Number.isFinite(line)) continue;
    const candidate: StartTimeCandidate = {
      source: path.basename(oddsApiToday),
      gameStartTime: start,
      team:
        typeof row.team === "string" && row.team.trim() && row.team.trim().toUpperCase() !== "UNK"
          ? row.team.trim()
          : undefined,
      opponent:
        typeof row.opponent === "string" && row.opponent.trim() && row.opponent.trim().toUpperCase() !== "UNK"
          ? row.opponent.trim()
          : undefined,
    };
    const key = makeMarketKey(player, stat, line);
    const marketNext = byMarketKey.get(key) ?? [];
    marketNext.push(candidate);
    byMarketKey.set(key, marketNext);
  }
  return { byLegId, byMarketKey };
}
