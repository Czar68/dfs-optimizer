// src/fantasy_analyzer.ts

import { fetchPrizePicksRawProps } from "./fetch_props";
import { RawPick } from "./types";
import {
  computeFantasyScoreNBA,
  computeFantasyScoreNFL,
  NbaFantasyInputs,
  NflFantasyInputs,
} from "./fantasy";

type LeagueKey = "NBA" | "NFL";

interface PlayerStatLines {
  // NBA
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  // NFL
  pass_yards?: number;
  pass_tds?: number;
  interceptions?: number;
  rush_yards?: number;
  rush_tds?: number;
  receptions?: number;
  rec_yards?: number;
  rec_tds?: number;
  fumbles_lost?: number;
}

interface FantasyProp {
  pick: RawPick;
  fantasyLine: number;
}

interface FantasyComparisonRow {
  league: LeagueKey;
  player: string;
  fantasyLine: number;
  impliedFantasy: number;
  diff: number; // implied - line (positive = over lean)
}

/**
 * Normalize league string to NBA/NFL only; skip everything else for now.
 */
function normalizeLeague(league: string): LeagueKey | null {
  const key = league.toUpperCase();
  if (key === "NBA") return "NBA";
  if (key === "NFL") return "NFL";
  return null;
}

/**
 * Build per-player stat lines and associated fantasy_score props
 * from RawPick list.
 */
function buildPlayerData(
  picks: RawPick[]
): {
  statLinesByPlayer: Map<string, PlayerStatLines>;
  fantasyPropsByPlayer: Map<string, FantasyProp[]>;
} {
  const statLinesByPlayer = new Map<string, PlayerStatLines>();
  const fantasyPropsByPlayer = new Map<string, FantasyProp[]>();

  function playerKey(league: LeagueKey, player: string): string {
    return `${league}::${player.toLowerCase()}`;
  }

  for (const pick of picks) {
    const leagueNorm = normalizeLeague(pick.league);
    if (!leagueNorm) continue;

    const key = playerKey(leagueNorm, pick.player);
    if (!statLinesByPlayer.has(key)) {
      statLinesByPlayer.set(key, {});
    }
    const statLines = statLinesByPlayer.get(key)!;

    // Fantasy props
    if (pick.stat === "fantasy_score") {
      const fantasyLine = pick.line;
      if (!Number.isFinite(fantasyLine)) continue;

      const arr = fantasyPropsByPlayer.get(key) ?? [];
      arr.push({ pick, fantasyLine });
      fantasyPropsByPlayer.set(key, arr);
      continue;
    }

    // Underlying component stats used to derive fantasy
    if (leagueNorm === "NBA") {
      if (pick.stat === "points") {
        statLines.points = pick.line;
      } else if (pick.stat === "rebounds") {
        statLines.rebounds = pick.line;
      } else if (pick.stat === "assists") {
        statLines.assists = pick.line;
      } else if (pick.stat === "steals") {
        statLines.steals = pick.line;
      } else if (pick.stat === "blocks") {
        statLines.blocks = pick.line;
      } else if (pick.stat === "turnovers") {
        statLines.turnovers = pick.line;
      }
    } else if (leagueNorm === "NFL") {
      if (pick.stat === "pass_yards") {
        statLines.pass_yards = pick.line;
      } else if (pick.stat === "pass_tds") {
        statLines.pass_tds = pick.line;
      } else if (pick.stat === "interceptions") {
        statLines.interceptions = pick.line;
      } else if (pick.stat === "rush_yards") {
        statLines.rush_yards = pick.line;
      } else if (pick.stat === "rush_attempts") {
        // attempts don't score fantasy directly; ignore for now
      } else if (pick.stat === "rec_yards") {
        statLines.rec_yards = pick.line;
      } else if (pick.stat === "receptions") {
        statLines.receptions = pick.line;
      }
      // TDs / fumbles often come as separate props; wire them when available.
    }
  }

  return { statLinesByPlayer, fantasyPropsByPlayer };
}

/**
 * Compute implied NBA fantasy from component projections, if enough stats exist.
 *
 * Tightened requirements:
 * - Must have points, rebounds, and assists.
 * - Must have at least one of steals/blocks/turnovers; if none, we skip the player
 *   rather than assume 0 and create a big underbias.
 */
function computeImpliedFantasyNBA(lines: PlayerStatLines): number | null {
  const hasCore =
    lines.points != null &&
    lines.rebounds != null &&
    lines.assists != null;

  const hasDefense =
    lines.steals != null ||
    lines.blocks != null ||
    lines.turnovers != null;

  if (!hasCore || !hasDefense) return null;

  const inputs: NbaFantasyInputs = {
    points: lines.points ?? 0,
    rebounds: lines.rebounds ?? 0,
    assists: lines.assists ?? 0,
    steals: lines.steals ?? 0,
    blocks: lines.blocks ?? 0,
    turnovers: lines.turnovers ?? 0,
  };

  return computeFantasyScoreNBA(inputs);
}

/**
 * Compute implied NFL fantasy from component projections, if enough stats exist.
 *
 * Tightened requirements:
 * - Must have either:
 *   - Some passing projection (yards/TDs/INT), or
 *   - Some rushing/receiving projection (yards/receptions/TDs).
 * - And must have at least one TD or turnover field available
 *   (pass_tds, rush_tds, rec_tds, interceptions, fumbles_lost)
 *   so we are not ignoring all scoring events.
 */
function computeImpliedFantasyNFL(lines: PlayerStatLines): number | null {
  const hasPassing =
    lines.pass_yards != null ||
    lines.pass_tds != null ||
    lines.interceptions != null;

  const hasRushingReceiving =
    lines.rush_yards != null ||
    lines.rush_tds != null ||
    lines.receptions != null ||
    lines.rec_yards != null ||
    lines.rec_tds != null;

  const hasTdOrTurnover =
    lines.pass_tds != null ||
    lines.rush_tds != null ||
    lines.rec_tds != null ||
    lines.interceptions != null ||
    lines.fumbles_lost != null;

  if (!hasPassing && !hasRushingReceiving) {
    return null;
  }

  if (!hasTdOrTurnover) {
    return null;
  }

  const inputs: NflFantasyInputs = {
    passingYards: lines.pass_yards ?? 0,
    passingTDs: lines.pass_tds ?? 0,
    interceptions: lines.interceptions ?? 0,
    rushingYards: lines.rush_yards ?? 0,
    rushingTDs: lines.rush_tds ?? 0,
    receptions: lines.receptions ?? 0,
    receivingYards: lines.rec_yards ?? 0,
    receivingTDs: lines.rec_tds ?? 0,
    fumblesLost: lines.fumbles_lost ?? 0,
  };

  return computeFantasyScoreNFL(inputs);
}

/**
 * Main analyzer: compares implied fantasy vs PrizePicks fantasy_score line.
 */
export async function runFantasyAnalyzer(): Promise<FantasyComparisonRow[]> {
  const picks = await fetchPrizePicksRawProps();
  const { statLinesByPlayer, fantasyPropsByPlayer } = buildPlayerData(picks);

  const results: FantasyComparisonRow[] = [];

  for (const [key, fantasyProps] of fantasyPropsByPlayer.entries()) {
    const [leagueStr] = key.split("::");
    const league = leagueStr as LeagueKey;

    const statLines = statLinesByPlayer.get(key);
    if (!statLines) continue;

    let implied: number | null = null;

    if (league === "NBA") {
      implied = computeImpliedFantasyNBA(statLines);
    } else if (league === "NFL") {
      implied = computeImpliedFantasyNFL(statLines);
    }

    if (implied == null || !Number.isFinite(implied)) continue;

    // There may be multiple fantasy props per player (different slates/markets);
    // we create a row per fantasy prop.
    for (const fp of fantasyProps) {
      const fantasyLine = fp.fantasyLine;
      if (!Number.isFinite(fantasyLine)) continue;

      const diff = implied - fantasyLine;

      results.push({
        league,
        player: fp.pick.player, // keep original casing from PP
        fantasyLine,
        impliedFantasy: implied,
        diff,
      });
    }
  }

  // Sort by absolute edge descending
  results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return results;
}

// If you want a direct CLI entrypoint for quick testing, you can create
// a separate test script that imports runFantasyAnalyzer and logs results.
