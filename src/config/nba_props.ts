// src/config/nba_props.ts
// NBA player prop stat categories used by the OddsAPI pipeline.

import { StatCategory } from "../types";

/**
 * NBA stat categories imported from OddsAPI.
 * Standard markets + combo stats (pra, pr, pa, ra).
 */
export const NBA_STAT_CATEGORIES: StatCategory[] = [
  "points",
  "rebounds",
  "assists",
  "threes",
  "steals",
  "blocks",
  "turnovers",
  "pra",
  "points_rebounds",
  "points_assists",
  "rebounds_assists",
];
