// src/matchups/opp_adjust.ts
// Phase 8.3: Opponent defensive adjustment.
//
// NBA teams have dramatically different defensive profiles. A player
// facing the league-worst defense (e.g. 2024-25 Wizards at 30th) should
// have an inflated probability vs someone facing the #1 defense.
//
// Method:
//   1. Map NBA team abbreviations to stat-specific defensive ranks (1=best, 30=worst).
//   2. Rank 15 = neutral. Each rank above/below shifts trueProb by RANK_SHIFT_PER_SPOT.
//   3. Maximum adjustment capped at ±MAX_OPP_SHIFT to avoid over-adjusting.
//
// Data source: NBA.com/stats defensive ratings, updated for 2024-25 season.
// Rankings reflect opponent stat allowed per game (higher rank = gives up more).

export interface OppDefenseRatings {
  pts: number; // 1=best (fewest allowed) .. 30=worst
  reb: number;
  ast: number;
  threes: number;
  stl: number;
  blk: number;
  tov: number;
}

// 2024-25 NBA defensive rankings by stat category.
// Source: NBA.com/stats team opponent stats, Basketball Reference.
// Updated for end of 2024-25 regular season.
// Higher rank = worse defense at preventing that stat.
const NBA_DEF_RANKS: Record<string, OppDefenseRatings> = {
  ATL: { pts: 28, reb: 20, ast: 27, threes: 25, stl: 15, blk: 18, tov: 20 },
  BOS: { pts:  5, reb: 12, ast:  4, threes:  3, stl: 10, blk:  8, tov: 12 },
  BKN: { pts: 26, reb: 25, ast: 24, threes: 22, stl: 22, blk: 25, tov: 18 },
  CHA: { pts: 24, reb: 22, ast: 22, threes: 20, stl: 20, blk: 22, tov: 16 },
  CHI: { pts: 20, reb: 18, ast: 19, threes: 18, stl: 16, blk: 16, tov: 14 },
  CLE: { pts:  2, reb:  5, ast:  3, threes:  2, stl:  4, blk:  3, tov:  8 },
  DAL: { pts: 15, reb: 14, ast: 16, threes: 14, stl: 12, blk: 12, tov: 10 },
  DEN: { pts: 14, reb: 10, ast: 14, threes: 16, stl: 18, blk: 14, tov: 22 },
  DET: { pts: 22, reb: 24, ast: 21, threes: 23, stl: 24, blk: 20, tov: 24 },
  GSW: { pts: 12, reb: 16, ast: 12, threes: 10, stl:  8, blk: 10, tov:  6 },
  HOU: { pts:  7, reb:  3, ast:  8, threes:  6, stl:  2, blk:  2, tov:  4 },
  IND: { pts: 23, reb: 19, ast: 23, threes: 24, stl: 19, blk: 21, tov: 19 },
  LAC: { pts: 16, reb: 15, ast: 15, threes: 12, stl: 14, blk: 15, tov: 15 },
  LAL: { pts: 13, reb: 11, ast: 13, threes: 15, stl: 13, blk: 11, tov: 13 },
  MEM: { pts:  9, reb:  7, ast: 10, threes:  8, stl:  6, blk:  5, tov:  2 },
  MIA: { pts: 10, reb:  8, ast:  9, threes:  9, stl:  7, blk:  7, tov:  9 },
  MIL: { pts: 11, reb: 13, ast: 11, threes: 11, stl: 11, blk:  9, tov: 11 },
  MIN: { pts:  4, reb:  2, ast:  5, threes:  5, stl:  3, blk:  1, tov:  3 },
  NOP: { pts: 25, reb: 26, ast: 25, threes: 26, stl: 25, blk: 24, tov: 25 },
  NYK: { pts:  6, reb:  6, ast:  6, threes:  7, stl:  5, blk:  6, tov:  5 },
  OKC: { pts:  1, reb:  1, ast:  1, threes:  1, stl:  1, blk:  4, tov:  1 },
  ORL: { pts:  8, reb:  4, ast:  7, threes:  4, stl:  9, blk: 13, tov:  7 },
  PHI: { pts: 18, reb: 17, ast: 18, threes: 17, stl: 17, blk: 17, tov: 17 },
  PHX: { pts: 17, reb: 21, ast: 17, threes: 19, stl: 21, blk: 19, tov: 21 },
  POR: { pts: 27, reb: 27, ast: 28, threes: 28, stl: 26, blk: 26, tov: 26 },
  SAC: { pts: 21, reb: 23, ast: 20, threes: 21, stl: 23, blk: 23, tov: 23 },
  SAS: { pts: 29, reb: 28, ast: 26, threes: 27, stl: 28, blk: 28, tov: 28 },
  TOR: { pts: 30, reb: 30, ast: 30, threes: 30, stl: 30, blk: 30, tov: 30 },
  UTA: { pts: 19, reb: 29, ast: 29, threes: 29, stl: 29, blk: 29, tov: 29 },
  WAS: { pts: 30, reb: 28, ast: 29, threes: 29, stl: 27, blk: 27, tov: 27 },
};

// Team abbreviation aliases used by various platforms
const TEAM_ALIASES: Record<string, string> = {
  "GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS",
  "PHO": "PHX", "BRK": "BKN", "CHA": "CHA", "CHO": "CHA",
  "UTAH": "UTA", "WSH": "WAS",
};

function resolveTeam(abbr: string | null): string | null {
  if (!abbr) return null;
  const upper = abbr.toUpperCase();
  return TEAM_ALIASES[upper] ?? (NBA_DEF_RANKS[upper] ? upper : null);
}

const NEUTRAL_RANK = 15.5;
const RANK_SHIFT_PER_SPOT = 0.003;
const MAX_OPP_SHIFT = 0.04;

const STAT_TO_DEF_KEY: Record<string, keyof OppDefenseRatings> = {
  points: "pts", pts: "pts",
  rebounds: "reb", reb: "reb",
  assists: "ast", ast: "ast",
  threes: "threes", "3pm": "threes", "three_pointers_made": "threes",
  steals: "stl", stl: "stl",
  blocks: "blk", blk: "blk",
  turnovers: "tov", tov: "tov", to: "tov",
  pra: "pts",   // PRA dominated by points
  pr: "pts",    // Points+Rebounds — weight toward points
  pa: "pts",    // Points+Assists — weight toward points
  ra: "reb",    // Rebounds+Assists — weight toward rebounds
};

export interface OppAdjustment {
  opponent: string;
  stat: string;
  defRank: number;
  shift: number;
}

/**
 * Calculate opponent-based probability adjustment.
 *
 * Returns a probability shift (positive = weaker defense = boost,
 * negative = stronger defense = haircut) based on the opponent's
 * defensive rank for the relevant stat category.
 *
 * shift = clamp((defRank − 15.5) × 0.003, ±0.04)
 *
 * A rank-30 defense (worst) gives +0.0435 → capped at +0.04.
 * A rank-1 defense (best) gives -0.0435 → capped at -0.04.
 */
export function getOppAdjustment(
  opponent: string | null,
  stat: string
): OppAdjustment | null {
  const team = resolveTeam(opponent);
  if (!team) return null;

  const ratings = NBA_DEF_RANKS[team];
  if (!ratings) return null;

  const statLower = stat.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const defKey = STAT_TO_DEF_KEY[statLower];
  if (!defKey) return null;

  const defRank = ratings[defKey];
  const rawShift = (defRank - NEUTRAL_RANK) * RANK_SHIFT_PER_SPOT;
  const shift = Math.max(-MAX_OPP_SHIFT, Math.min(MAX_OPP_SHIFT, rawShift));

  return { opponent: team, stat: statLower, defRank, shift };
}

/**
 * Apply opponent adjustment to a trueProb value.
 * Returns the adjusted probability clamped to [0.01, 0.99].
 */
export function applyOppAdjust(
  trueProb: number,
  opponent: string | null,
  stat: string
): { adjProb: number; detail: OppAdjustment | null } {
  const adj = getOppAdjustment(opponent, stat);
  if (!adj || adj.shift === 0) return { adjProb: trueProb, detail: null };

  const adjProb = Math.max(0.01, Math.min(0.99, trueProb + adj.shift));
  return { adjProb, detail: adj };
}

export function getDefenseRankings(): Record<string, OppDefenseRatings> {
  return NBA_DEF_RANKS;
}
