// src/config/nba_props.ts
// Single source of truth for NBA player prop stats used by both SGO and TheRundown.
// Keep SGO allowlist and TheRundown market IDs in sync with this list.

import { StatCategory } from "../types";

/**
 * NBA stat categories we import from both SGO and TheRundown.
 * Same stats for both providers so we compare apples to apples.
 * Includes steals/blocks/turnovers for revenue (SGO expansion).
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

/** TheRundown market IDs that map to NBA_STAT_CATEGORIES (same stats as SGO).
 * Expanded Phase 7: added steals (215), blocks (214), turnovers (216). */
export const THERUNDOWN_NBA_MARKET_IDS = [29, 35, 38, 39, 93, 99, 214, 215, 216, 297, 298] as const;

/** TheRundown market_id → StatCategory. Single source of truth for what we import from TheRundown.
 * IDs verified from TheRundown docs: https://docs.therundown.io/guides/player-props */
export const THERUNDOWN_MARKET_ID_TO_STAT: Record<number, StatCategory> = {
  29: "points",
  35: "rebounds",
  38: "threes",
  39: "assists",
  93: "pra",
  99: "points_assists",
  214: "blocks",
  215: "steals",
  216: "turnovers",
  297: "points_rebounds",
  298: "rebounds_assists",
};
