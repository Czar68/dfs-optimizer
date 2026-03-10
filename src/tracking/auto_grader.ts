/**
 * src/tracking/auto_grader.ts
 * Uses Odds API Scores to find completed games, then ESPN box scores for player stats,
 * to grade pending_cards.json legs as Win/Loss/Push.
 */

import fs from "fs";
import path from "path";
import type { TrackedCard, TrackedLeg, LegResult } from "./tracker_schema";

const SPORT_KEY = "basketball_nba";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ESPN_SCOREBOARD = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ESPN_SUMMARY = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary";

const TRACKING_DIR = path.join(process.cwd(), "data", "tracking");
const PENDING_PATH = path.join(TRACKING_DIR, "pending_cards.json");

/** Odds API Scores response item (completed game). */
interface OddsApiScoreEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: { name: string; score: string }[] | null;
}

/** Fetch completed NBA games from Odds API Scores (daysFrom 1–3). */
export async function fetchOddsApiScores(daysFrom: number = 1): Promise<OddsApiScoreEvent[]> {
  const apiKey = process.env.ODDS_API_KEY ?? process.env.ODDSAPI_KEY ?? "";
  if (!apiKey) {
    console.warn("[AutoGrader] No ODDS_API_KEY; skipping Odds API Scores.");
    return [];
  }
  const url = `${ODDS_API_BASE}/sports/${SPORT_KEY}/scores/?apiKey=${apiKey}&daysFrom=${Math.min(3, Math.max(1, daysFrom))}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[AutoGrader] Odds API Scores HTTP", res.status);
    return [];
  }
  const data = (await res.json()) as OddsApiScoreEvent[];
  const completed = (data || []).filter((e) => e.completed === true);
  console.log(`[AutoGrader] Odds API Scores: ${completed.length} completed games (daysFrom=${daysFrom}).`);
  return completed;
}

/** Get unique game dates (YYYY-MM-DD) from completed events. */
function getCompletedDates(events: OddsApiScoreEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    try {
      const d = new Date(e.commence_time);
      set.add(d.toISOString().slice(0, 10));
    } catch {
      // skip
    }
  }
  return Array.from(set);
}

/** Normalize player name for matching (lowercase, no Jr/III, single spaces). */
function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .replace(/\s*(Jr\.?|III?|IV|II)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Map our market (stat) to ESPN box score field / combo. */
function getStatValueFromBox(stats: Record<string, number> | null, market: string): number {
  if (!stats) return 0;
  const s = (market || "").toLowerCase().replace(/[\s_-]/g, "");
  const pts = stats.points ?? 0;
  const reb = stats.rebounds ?? 0;
  const ast = stats.assists ?? 0;
  const threes = stats.threePointFieldGoalsMade ?? 0;
  const stl = stats.steals ?? 0;
  const blk = stats.blocks ?? 0;
  const tov = stats.turnovers ?? 0;
  if ((s.includes("point") || s === "pts") && !s.includes("3") && !s.includes("reb") && !s.includes("ast")) return pts;
  if (s.includes("rebound") || s === "reb") return reb;
  if (s.includes("assist") || s === "ast") return ast;
  if (s.includes("three") || ["3pm", "3pt", "threes"].includes(s)) return threes;
  if (s.includes("steal") || s === "stl") return stl;
  if (s.includes("block") || s === "blk") return blk;
  if (s.includes("turnover") || ["to", "tov"].includes(s)) return tov;
  if (["pra", "pts+reb+ast", "points_rebounds_assists"].includes(s)) return pts + reb + ast;
  if (["pr", "pts+reb"].includes(s)) return pts + reb;
  if (["pa", "pts+ast"].includes(s)) return pts + ast;
  if (["ra", "reb+ast"].includes(s)) return reb + ast;
  if (["stocks", "stl+blk"].includes(s)) return stl + blk;
  return 0;
}

/** Parse ESPN summary box score into player_key -> stats. */
function parseEspnBoxScore(summary: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const box = (summary as Record<string, unknown>)?.boxscore as Record<string, unknown> | undefined;
  if (!box) return out;

  const playersArr = box.players as Array<{ statistics?: Array<{ labels?: string[]; athletes?: Array<{ athlete?: { displayName?: string }; stats?: unknown[] }> }> }> | undefined;
  if (Array.isArray(playersArr)) {
    for (const teamGroup of playersArr) {
      for (const cat of teamGroup.statistics || []) {
        const labels = ((cat.labels || []) as string[]).map((x) => String(x).toLowerCase());
        const athletes = cat.athletes || [];
        for (const ath of athletes) {
          const displayName =
            (ath.athlete as { displayName?: string } | undefined)?.displayName ||
            (ath as { displayName?: string }).displayName ||
            "";
          if (!displayName) continue;
          const key = normalizeName(displayName);
          const existing = out[key] ?? {
            points: 0,
            rebounds: 0,
            assists: 0,
            threePointFieldGoalsMade: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
          };
          const statsArr = ath.stats as unknown[] | undefined;
          const labelToField: Record<string, string> = {
            pts: "points",
            reb: "rebounds",
            ast: "assists",
            "3pm": "threePointFieldGoalsMade",
            stl: "steals",
            blk: "blocks",
            to: "turnovers",
          };
          if (Array.isArray(statsArr)) {
            labels.forEach((label, i) => {
              const field = labelToField[label] ?? (label.includes("point") && !label.includes("3") ? "points" : null);
              if (field && typeof statsArr[i] === "number") (existing as Record<string, number>)[field] = statsArr[i] as number;
            });
          }
          out[key] = existing;
        }
      }
    }
  }
  return out;
}

/** Fetch ESPN scoreboard for date; return list of event IDs. */
async function getEspnGameIds(date: string): Promise<string[]> {
  const datesParam = date.replace(/-/g, "").slice(0, 8);
  const url = `${ESPN_SCOREBOARD}?dates=${datesParam}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: Array<{ id?: string }> };
  const events = data.events || [];
  return events.map((e) => e.id).filter(Boolean) as string[];
}

/** Fetch one game box score from ESPN summary. */
async function getEspnBoxScore(eventId: string): Promise<Record<string, Record<string, number>>> {
  const url = `${ESPN_SUMMARY}?event=${eventId}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "NBA-Props-Optimizer/1.0" } });
  if (!res.ok) return {};
  const summary = await res.json();
  return parseEspnBoxScore(summary);
}

/** Aggregate player stats for a date (all games that day). Last game wins if player played multiple. */
export async function fetchEspnPlayerStatsForDate(date: string): Promise<Record<string, Record<string, number>>> {
  const gameIds = await getEspnGameIds(date);
  const merged: Record<string, Record<string, number>> = {};
  for (const id of gameIds) {
    await new Promise((r) => setTimeout(r, 300));
    const box = await getEspnBoxScore(id);
    for (const [k, v] of Object.entries(box)) {
      merged[k] = v;
    }
  }
  return merged;
}

/** Find stats for a player in date-indexed stats (try exact normalized name, then last name). */
function findPlayerStats(
  statsByDate: Record<string, Record<string, Record<string, number>>>,
  playerName: string
): Record<string, number> | null {
  const norm = normalizeName(playerName || "");
  if (!norm) return null;
  for (const dateStats of Object.values(statsByDate)) {
    if (dateStats[norm]) return dateStats[norm];
    const last = norm.split(" ").pop() || "";
    for (const [key, st] of Object.entries(dateStats)) {
      if (key.endsWith(" " + last) || key === last) return st;
    }
  }
  return null;
}

/** Grade one leg: actual vs line + pick → Win | Loss | Push. */
function gradeLeg(actual: number, line: number, pick: "Over" | "Under"): LegResult {
  if (actual > line) return pick === "Over" ? "Win" : "Loss";
  if (actual < line) return pick === "Under" ? "Win" : "Loss";
  return "Push";
}

/** Load pending_cards.json. */
export function loadPendingCards(): { timestamp: string | null; cards: TrackedCard[] } {
  if (!fs.existsSync(PENDING_PATH)) {
    return { timestamp: null, cards: [] };
  }
  const raw = fs.readFileSync(PENDING_PATH, "utf8");
  const data = JSON.parse(raw) as { timestamp?: string; cards?: unknown[] };
  return {
    timestamp: data.timestamp ?? null,
    cards: Array.isArray(data.cards) ? (data.cards as TrackedCard[]) : [],
  };
}

/** Save pending_cards.json. */
export function savePendingCards(payload: { timestamp: string; cards: TrackedCard[] }): void {
  if (!fs.existsSync(TRACKING_DIR)) {
    fs.mkdirSync(TRACKING_DIR, { recursive: true });
  }
  fs.writeFileSync(PENDING_PATH, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * Run auto-grader: fetch Odds API Scores → completed dates → ESPN box scores →
 * grade each Pending leg and update pending_cards.json.
 */
export async function runAutoGrader(options?: { daysFrom?: number }): Promise<{ graded: number; totalLegs: number }> {
  const daysFrom = options?.daysFrom ?? 1;
  const events = await fetchOddsApiScores(daysFrom);
  const dates = getCompletedDates(events);
  const statsByDate: Record<string, Record<string, Record<string, number>>> = {};
  for (const date of dates) {
    statsByDate[date] = await fetchEspnPlayerStatsForDate(date);
    await new Promise((r) => setTimeout(r, 400));
  }

  const { timestamp, cards } = loadPendingCards();
  let graded = 0;
  let totalLegs = 0;

  const updated = cards.map((card) => ({
    ...card,
    legs: card.legs.map((leg) => {
      totalLegs += 1;
      if (leg.result !== "Pending") return leg;
      const playerStats = findPlayerStats(statsByDate, leg.playerName);
      const actual = getStatValueFromBox(playerStats, leg.market);
      const result = gradeLeg(actual, leg.line, leg.pick);
      if (result !== "Pending") graded += 1;
      return { ...leg, result };
    }),
  }));

  savePendingCards({
    timestamp: timestamp || new Date().toISOString(),
    cards: updated,
  });

  console.log(`[AutoGrader] Graded ${graded} legs (${totalLegs} total).`);
  return { graded, totalLegs };
}
