/**
 * Unified schema for PP and UD props before and after merge.
 * No site-specific logic here; adapters produce UnifiedProp, mergeService consumes and produces MergedProp.
 */

import type { StatCategory } from "../types";

export type UnifiedProvider = "PP" | "UD";

/** American odds (over/under). */
export interface UnifiedOdds {
  over: number;
  under: number;
}

/**
 * Normalized prop from either provider (adapter output).
 * breakeven: fraction in [0,1] (e.g. 0.5345 = 53.45%).
 * raw: original object; site-specific fields (isDemon, udPickFactor, etc.) stay only in raw.
 * derivedFrom: IDs of component props used to build this prop (for fantasy/synthetic).
 * isDerived: true when this prop is synthetic (e.g. fantasy score from PTS+REB+AST).
 */
export interface UnifiedProp {
  id: string;
  provider: UnifiedProvider;
  player: string;
  statType: StatCategory;
  lineValue: number;
  /** Breakeven probability as fraction in [0, 1]. */
  breakeven: number;
  odds: UnifiedOdds;
  /** Original raw object; preserve all site-specific fields here. */
  raw: any;
  /** IDs of component props used to build this (e.g. fantasy score). */
  derivedFrom?: string[];
  /** True if this prop is derived (e.g. fantasy aggregate). */
  isDerived: boolean;
  /** Fantasy/model projection for this prop (e.g. matchup-based); used to compute ConfidenceDelta vs bookmaker line. */
  FantasyMatchupScore?: number;
  [key: string]: any;
}

/**
 * Result of merge: one best line per (player, stat) with highest edge.
 * Site-agnostic.
 * gameTime: optional; set by adapter from raw (e.g. raw.commenceTime, raw.startTime) for 23-col Cards export.
 */
export interface MergedProp {
  id: string;
  provider: UnifiedProvider;
  player: string;
  statType: StatCategory;
  lineValue: number;
  breakeven: number;
  odds: UnifiedOdds;
  edge: number;
  trueProb: number;
  raw: any;
  /** ISO string or display time for game start; for Sheets column B (GameTime). Populate from raw.commenceTime or event data. */
  gameTime?: string;
  /** Fantasy/model projection when available; used with lineValue for ConfidenceDelta. */
  fantasyMatchupScore?: number;
  /** ConfidenceDelta = (FantasyProjection - BookmakerLine); maps to 23-col Cards sheet V and 36-col inventory. */
  confidenceDelta?: number;
}
