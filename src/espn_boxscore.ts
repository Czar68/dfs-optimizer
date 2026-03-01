// src/espn_boxscore.ts
// ESPN undocumented API: scoreboard by date, summary (box score) by gameId. No key required.

import fetch from "node-fetch";

const ESPN_SCOREBOARD =
  "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ESPN_SUMMARY =
  "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

const RATE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface PlayerGameStats {
  points: number;
  rebounds: number;
  assists: number;
  threePointFieldGoalsMade: number;
  [key: string]: number;
}

/** Fetch scoreboard for date (YYYY-MM-DD or YYYYMMDD). Returns game/event IDs. */
export async function getScoreboardGameIds(date: string): Promise<string[]> {
  const datesParam = date.replace(/-/g, "");
  const url = `${ESPN_SCOREBOARD}?dates=${datesParam}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: { id: string }[] };
  const events = data.events ?? [];
  return events.map((e) => e.id).filter(Boolean);
}

function onePlayerStats(raw: Record<string, unknown>): PlayerGameStats {
  const stats: PlayerGameStats = {
    points: 0,
    rebounds: 0,
    assists: 0,
    threePointFieldGoalsMade: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
  };

  // ESPN summary returns stats in two formats:
  //   1. boxscore.teams[].statistics[].athletes[].stats[] (position-row CSV values)
  //   2. boxscore.players[].statistics.categories[].athletes[].stats[] (same CSV)
  // The CSV row order follows the column "labels" array at the category level.
  // We also handle the named {name, value} format used by some ESPN endpoints.

  const statList = raw.statistics ?? raw.stats;
  if (Array.isArray(statList)) {
    for (const s of statList) {
      const rec = s as Record<string, unknown>;
      const name = ((rec.name ?? rec.label ?? rec.abbreviation ?? "") as string).toLowerCase();
      const val = parseFloat(String(rec.displayValue ?? rec.value ?? 0)) || 0;

      if ((name.includes("point") || name === "pts") && !name.includes("three") && !name.includes("3")) stats.points = val;
      else if (name.includes("rebound") || name === "reb") stats.rebounds = val;
      else if (name.includes("assist") || name === "ast") stats.assists = val;
      else if (name.includes("three") || name === "3pt" || name === "3pm" || name === "3ptm") stats.threePointFieldGoalsMade = val;
      else if (name.includes("steal") || name === "stl") stats.steals = val;
      else if (name.includes("block") || name === "blk") stats.blocks = val;
      else if (name.includes("turnover") || name === "to" || name === "tov") stats.turnovers = val;
    }
  }

  return stats;
}

/** ESPN header label → PlayerGameStats field key. */
const LABEL_TO_FIELD: Record<string, keyof PlayerGameStats> = {
  min: "minutes" as any,
  pts: "points",
  reb: "rebounds",
  ast: "assists",
  stl: "steals",
  blk: "blocks",
  to: "turnovers",
  "3pm": "threePointFieldGoalsMade",
};

/**
 * Parse ESPN summary boxscore into player -> stats.
 *
 * ESPN v2 summary format: boxscore.players[].statistics[].{labels, athletes[]}
 * where each athlete has a `stats` array of CSV values matching `labels` order.
 * Fallback: boxscore.teams[].athletes[] with named statistics.
 */
function parseBoxScorePlayers(summary: unknown): Map<string, PlayerGameStats> {
  const out = new Map<string, PlayerGameStats>();
  const box = (summary as { boxscore?: unknown }).boxscore;
  if (!box || typeof box !== "object") return out;

  // Strategy 1: boxscore.players[].statistics[].{labels, athletes[].stats[]}
  const playersArr = (box as any).players;
  if (Array.isArray(playersArr)) {
    for (const teamGroup of playersArr) {
      const statsCategories = teamGroup.statistics;
      if (!Array.isArray(statsCategories)) continue;
      for (const cat of statsCategories) {
        const labels: string[] = (cat.labels ?? cat.keys ?? []).map((l: string) => l.toLowerCase());
        const athletes = cat.athletes;
        if (!Array.isArray(athletes) || labels.length === 0) continue;
        for (const ath of athletes) {
          const athRec = ath as Record<string, unknown>;
          const athleteObj = athRec.athlete as Record<string, unknown> | undefined;
          const displayName = (
            (athleteObj?.displayName ?? athleteObj?.name ?? athleteObj?.shortName) ??
            (athRec.displayName ?? athRec.name ?? athRec.shortName) ?? ""
          ) as string;
          if (!displayName) continue;

          const statsArr = athRec.stats;
          if (!Array.isArray(statsArr)) continue;

          const playerKey = normalizePlayerName(displayName);
          const existing = out.get(playerKey) ?? {
            points: 0, rebounds: 0, assists: 0,
            threePointFieldGoalsMade: 0, steals: 0, blocks: 0, turnovers: 0,
          };

          for (let i = 0; i < labels.length && i < statsArr.length; i++) {
            const label = labels[i];
            const field = LABEL_TO_FIELD[label];
            if (!field) continue;
            // Stats can be "5" or "1-3" (FG format) — take raw numeric value
            const raw = String(statsArr[i]);
            const val = parseFloat(raw) || 0;
            (existing as any)[field] = val;
          }
          out.set(playerKey, existing);
        }
      }
    }
  }
  if (out.size > 0) return out;

  // Strategy 2: boxscore.teams[].athletes[] (older format)
  const teams = (box as { teams?: { athletes?: unknown[] }[] }).teams;
  if (Array.isArray(teams)) {
    for (const team of teams) {
      const athletes = team.athletes;
      if (!Array.isArray(athletes)) continue;
      for (const a of athletes) {
        const raw = a as Record<string, unknown>;
        const displayName = (raw.displayName ?? raw.name ?? raw.shortName ?? "") as string;
        if (!displayName) continue;
        out.set(normalizePlayerName(displayName), onePlayerStats(raw));
      }
    }
  }
  if (out.size > 0) return out;

  // Strategy 3: recursive walk fallback
  walkForAthletes(box as Record<string, unknown>, out);
  return out;
}

function walkForAthletes(obj: Record<string, unknown>, out: Map<string, PlayerGameStats>): void {
  const displayName = (obj.displayName ?? obj.name ?? obj.shortName ?? "") as string;
  const hasStats = Array.isArray(obj.statistics ?? obj.stats);
  if (displayName && hasStats) {
    out.set(normalizePlayerName(displayName), onePlayerStats(obj));
    return;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) walkForAthletes(v as Record<string, unknown>, out);
    else if (Array.isArray(v)) for (const item of v) if (item && typeof item === "object") walkForAthletes(item as Record<string, unknown>, out);
  }
}

/** Normalize for matching: lowercase, collapse spaces, remove Jr./III/etc. */
function normalizePlayerName(name: string): string {
  return name
    .replace(/\s*(Jr\.?|III?|IV|II)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Fetch summary for one game; return player -> stats. */
export async function getBoxScoreForGame(gameId: string): Promise<Map<string, PlayerGameStats>> {
  const url = `${ESPN_SUMMARY}?event=${gameId}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" },
  });
  if (!res.ok) return new Map();
  const summary = (await res.json()) as unknown;
  return parseBoxScorePlayers(summary);
}

/** Get all player stats for a date (scoreboard + one summary per game with 1s delay). One player appears in at most one game. */
export async function fetchAllPlayerStatsForDate(
  date: string
): Promise<Map<string, PlayerGameStats>> {
  const gameIds = await getScoreboardGameIds(date);
  const allStats = new Map<string, PlayerGameStats>();
  for (const gameId of gameIds) {
    await delay(RATE_DELAY_MS);
    const gameStats = await getBoxScoreForGame(gameId);
    for (const [name, stats] of gameStats) allStats.set(name, stats);
  }
  return allStats;
}

/** Map our stat key to ESPN box value. Supports all NBA categories + combos. */
export function getStatValueFromBox(stats: PlayerGameStats, stat: string): number {
  const s = stat.toLowerCase().replace(/[\s_-]+/g, "");

  // Single stats
  if ((s.includes("point") || s === "pts") && !s.includes("3") && !s.includes("three") && !s.includes("rebound") && !s.includes("assist"))
    return stats.points ?? 0;
  if (s.includes("rebound") || s === "reb") return stats.rebounds ?? 0;
  if (s.includes("assist") || s === "ast") return stats.assists ?? 0;
  if (s.includes("three") || s === "3pm" || s === "3pt" || s === "threes" || s === "threesmade" || s === "threepointersmade")
    return stats.threePointFieldGoalsMade ?? 0;
  if (s.includes("steal") || s === "stl") return stats.steals ?? 0;
  if (s.includes("block") || s === "blk") return stats.blocks ?? 0;
  if (s.includes("turnover") || s === "to" || s === "tov") return stats.turnovers ?? 0;

  // Combo stats
  if (s === "pra" || s === "pointsreboundsassists" || s === "pts+reb+ast")
    return (stats.points ?? 0) + (stats.rebounds ?? 0) + (stats.assists ?? 0);
  if (s === "pr" || s === "pointsrebounds" || s === "pts+reb")
    return (stats.points ?? 0) + (stats.rebounds ?? 0);
  if (s === "pa" || s === "pointsassists" || s === "pts+ast")
    return (stats.points ?? 0) + (stats.assists ?? 0);
  if (s === "ra" || s === "reboundsassists" || s === "reb+ast")
    return (stats.rebounds ?? 0) + (stats.assists ?? 0);
  if (s === "stocks" || s === "stealsblocks" || s === "stl+blk")
    return (stats.steals ?? 0) + (stats.blocks ?? 0);

  return 0;
}
