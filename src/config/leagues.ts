// src/config/leagues.ts
// Centralized league configuration for multi-sport support.

import "dotenv/config";
import { Sport } from "../types";

/** PrizePicks league_id mapping used by their projections API */
export const PP_LEAGUE_IDS: Record<string, number> = {
  NBA: Number(process.env.PRIZEPICKS_NBA_LEAGUE_ID ?? 7),
  NFL: Number(process.env.PRIZEPICKS_NFL_LEAGUE_ID ?? 9),
  NHL: Number(process.env.PRIZEPICKS_NHL_LEAGUE_ID ?? 12),
  MLB: Number(process.env.PRIZEPICKS_MLB_LEAGUE_ID ?? 2),
};

/** Underdog v6 sport_id strings returned in the API response */
export const UD_SPORT_IDS: Record<string, string> = {
  NBA: "NBA",
  NFL: "NFL",
  NHL: "NHL",
  MLB: "MLB",
};

/**
 * Parse a comma-separated env var into a Set of uppercase league keys.
 * Falls back to `["NBA"]` when the var is empty or missing.
 */
function parseLeagueEnv(envVar: string | undefined): Set<string> {
  if (!envVar || envVar.trim().length === 0) return new Set(["NBA"]);
  return new Set(
    envVar
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0)
  );
}

/** Allowed leagues for PrizePicks runs (from ALLOWED_PP_LEAGUES env var) */
export function getAllowedPPLeagues(): Set<string> {
  return parseLeagueEnv(process.env.ALLOWED_PP_LEAGUES);
}

/** Allowed leagues for Underdog runs (from ALLOWED_UD_LEAGUES env var) */
export function getAllowedUDLeagues(): Set<string> {
  return parseLeagueEnv(process.env.ALLOWED_UD_LEAGUES);
}

/** Map a league string to a Sport type (used across both pipelines) */
export function leagueToSport(league: string): Sport {
  const u = league.toUpperCase();
  if (u === "NBA") return "NBA";
  if (u === "NFL") return "NFL";
  if (u === "NHL") return "NHL";
  if (u === "MLB") return "MLB";
  if (u === "NCAAB") return "NCAAB";
  if (u === "NCAAF") return "NCAAF";
  return "NBA"; // safe default
}
