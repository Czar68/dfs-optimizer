// src/config/sport_config.ts
// Sport-specific configuration for odds fetching and stat mapping

import { Sport, StatCategory } from "../types";

export interface SportConfig {
  // OddsAPI market keys for each stat category
  statMappings: {
    [K in StatCategory]?: string;
  };

  // Default stat categories for this sport
  defaultStats: StatCategory[];
}

export const SPORT_CONFIGS: Record<Sport, SportConfig> = {
  NBA: {
    statMappings: {
      points: "player_points",
      rebounds: "player_rebounds",
      assists: "player_assists",
      threes: "player_threes",
      blocks: "player_blocks",
      steals: "player_steals",
      turnovers: "player_turnovers",
      pra: "player_points_rebounds_assists",
      pr: "player_points_rebounds",
      pa: "player_points_assists",
      ra: "player_rebounds_assists",
    },
    defaultStats: ["points", "rebounds", "assists", "threes", "blocks", "steals", "turnovers"]
  },

  NHL: {
    statMappings: {
      goals: "player_goals",
      assists: "player_assists",
      points: "player_points",
      shots_on_goal: "player_shots_on_goal",
      saves: "player_saves",
      plus_minus: "player_plus_minus",
      penalty_minutes: "player_penalty_minutes",
      time_on_ice: "player_time_on_ice",
    },
    defaultStats: ["goals", "assists", "points", "shots_on_goal"]
  },

  NFL: {
    statMappings: {
      pass_yards: "player_pass_yards",
      pass_tds: "player_pass_tds",
      rush_yards: "player_rush_yards",
      rec_yards: "player_rec_yards",
      receptions: "player_receptions",
    },
    defaultStats: ["pass_yards", "rush_yards", "rec_yards", "receptions"]
  },

  MLB: {
    statMappings: {},
    defaultStats: []
  },

  NCAAB: {
    statMappings: {
      points: "player_points",
      rebounds: "player_rebounds",
      assists: "player_assists",
      threes: "player_threes",
    },
    defaultStats: ["points", "rebounds", "assists", "threes"]
  },

  NCAAF: {
    statMappings: {},
    defaultStats: []
  }
};

export function getSportConfig(sport: Sport): SportConfig {
  return SPORT_CONFIGS[sport];
}

export function getEnabledSports(sports: Sport[]): SportConfig[] {
  return sports.map(sport => getSportConfig(sport));
}
