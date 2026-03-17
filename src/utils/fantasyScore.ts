/**
 * Fantasy score projection for NBA (DraftKings-style formula).
 * Formula: points + 1.2*rebounds + 1.5*assists + 3*steals + 3*blocks + 0.5*threes - turnovers
 */

export interface PlayerStats {
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  threes?: number;
  turnovers?: number;
}

const WEIGHTS = {
  points: 1,
  rebounds: 1.2,
  assists: 1.5,
  steals: 3,
  blocks: 3,
  threes: 0.5,
  turnovers: -1,
} as const;

/**
 * Compute fantasy score from per-game (or projected) stats.
 * Missing stats are treated as 0.
 */
export function predictFantasyScore(playerStats: PlayerStats): number {
  const pts = Number(playerStats.points) || 0;
  const reb = Number(playerStats.rebounds) || 0;
  const ast = Number(playerStats.assists) || 0;
  const stl = Number(playerStats.steals) || 0;
  const blk = Number(playerStats.blocks) || 0;
  const threes = Number(playerStats.threes) || 0;
  const tov = Number(playerStats.turnovers) || 0;

  return (
    WEIGHTS.points * pts +
    WEIGHTS.rebounds * reb +
    WEIGHTS.assists * ast +
    WEIGHTS.steals * stl +
    WEIGHTS.blocks * blk +
    WEIGHTS.threes * threes +
    WEIGHTS.turnovers * tov
  );
}
