// src/config/sport_config.ts
// Sport-specific configuration for odds fetching and stat mapping

import { Sport, StatCategory } from "../types";

export interface SportConfig {
  // SGO league configuration
  sgoLeagueId: string;
  
  // TheRundown sport ID
  rundownSportId: number;
  
  // Stat mappings from internal stat to provider-specific market keys
  statMappings: {
    [K in StatCategory]?: {
      sgo?: string;
      rundown?: string;
    };
  };
  
  // Default stat categories for this sport
  defaultStats: StatCategory[];
}

export const SPORT_CONFIGS: Record<Sport, SportConfig> = {
  NBA: {
    sgoLeagueId: "NBA",
    rundownSportId: 4, // NBA sport_id in TheRundown
    statMappings: {
      points: { sgo: "player_points", rundown: "player_points" },
      rebounds: { sgo: "player_rebounds", rundown: "player_rebounds" },
      assists: { sgo: "player_assists", rundown: "player_assists" },
      threes: { sgo: "player_threes", rundown: "player_threes" },
      blocks: { sgo: "player_blocks", rundown: "player_blocks" },
      steals: { sgo: "player_steals", rundown: "player_steals" },
      turnovers: { sgo: "player_turnovers", rundown: "player_turnovers" },
      // Combo stats
      pra: { sgo: "player_points_rebounds_assists", rundown: "player_points_rebounds_assists" },
      pr: { sgo: "player_points_rebounds", rundown: "player_points_rebounds" },
      pa: { sgo: "player_points_assists", rundown: "player_points_assists" },
      ra: { sgo: "player_rebounds_assists", rundown: "player_rebounds_assists" },
    },
    defaultStats: ["points", "rebounds", "assists", "threes", "blocks", "steals", "turnovers"]
  },
  
  NHL: {
    sgoLeagueId: "NHL",
    rundownSportId: 6, // NHL sport_id in TheRundown
    statMappings: {
      goals: { sgo: "player_goals", rundown: "player_goals" },
      assists: { sgo: "player_assists", rundown: "player_assists" },
      points: { sgo: "player_points", rundown: "player_points" }, // NHL points = goals + assists
      shots_on_goal: { sgo: "player_shots_on_goal", rundown: "player_shots_on_goal" },
      saves: { sgo: "player_saves", rundown: "player_saves" },
      plus_minus: { sgo: "player_plus_minus", rundown: "player_plus_minus" },
      penalty_minutes: { sgo: "player_penalty_minutes", rundown: "player_penalty_minutes" },
      time_on_ice: { sgo: "player_time_on_ice", rundown: "player_time_on_ice" },
    },
    defaultStats: ["goals", "assists", "points", "shots_on_goal"]
  },
  
  NFL: {
    sgoLeagueId: "NFL",
    rundownSportId: 1, // NFL sport_id in TheRundown
    statMappings: {
      pass_yards: { sgo: "player_pass_yards", rundown: "player_pass_yards" },
      pass_tds: { sgo: "player_pass_tds", rundown: "player_pass_tds" },
      rush_yards: { sgo: "player_rush_yards", rundown: "player_rush_yards" },
      rec_yards: { sgo: "player_rec_yards", rundown: "player_rec_yards" },
      receptions: { sgo: "player_receptions", rundown: "player_receptions" },
    },
    defaultStats: ["pass_yards", "rush_yards", "rec_yards", "receptions"]
  },
  
  MLB: {
    sgoLeagueId: "MLB",
    rundownSportId: 2, // MLB sport_id in TheRundown
    statMappings: {
      // Baseball stats would go here
    },
    defaultStats: []
  },
  
  NCAAB: {
    sgoLeagueId: "NCAAB",
    rundownSportId: 5, // NCAAB sport_id in TheRundown
    statMappings: {
      points: { sgo: "player_points", rundown: "player_points" },
      rebounds: { sgo: "player_rebounds", rundown: "player_rebounds" },
      assists: { sgo: "player_assists", rundown: "player_assists" },
      threes: { sgo: "player_threes", rundown: "player_threes" },
    },
    defaultStats: ["points", "rebounds", "assists", "threes"]
  },
  
  NCAAF: {
    sgoLeagueId: "NCAAF",
    rundownSportId: 3, // NCAAF sport_id in TheRundown
    statMappings: {
      // College football stats would go here
    },
    defaultStats: []
  }
};

export function getSportConfig(sport: Sport): SportConfig {
  return SPORT_CONFIGS[sport];
}

export function getEnabledSports(sports: Sport[]): SportConfig[] {
  return sports.map(sport => getSportConfig(sport));
}
