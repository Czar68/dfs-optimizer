/**
 * Adapters to normalize PP and UD raw picks into UnifiedProp.
 * Odds API (PlayerPropOdds) can be converted to UnifiedProp so mergeService can
 * keep the best line (highest edge) across main and alternative lines.
 * All site-specific logic (field mapping, stat normalization) lives here.
 */

import type { RawPick, StatCategory, PlayerPropOdds } from "../types";
import type { UnifiedProp, UnifiedOdds, UnifiedProvider } from "../types/unified-prop";

const DEFAULT_BREAKEVEN = 0.5;
const PLACEHOLDER_ODDS: UnifiedOdds = { over: 0, under: 0 };

/** Normalize stat name across providers; returns canonical string (StatCategory). */
export function toStatCategory(stat: string): string {
  const s = String(stat ?? "").trim().toLowerCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    points: "points",
    pts: "points",
    rebounds: "rebounds",
    reb: "rebounds",
    assists: "assists",
    ast: "assists",
    threes: "threes",
    "3pm": "threes",
    "3pt": "threes",
    "3ptm": "threes",
    steals: "steals",
    stl: "steals",
    blocks: "blocks",
    blk: "blocks",
    fantasy: "fantasy_score",
    fantasy_score: "fantasy_score",
    turnovers: "turnovers",
    pra: "pra",
    points_rebounds_assists: "pra",
    pr: "points_rebounds",
    points_rebounds: "points_rebounds",
    pa: "points_assists",
    points_assists: "points_assists",
    ra: "rebounds_assists",
    rebounds_assists: "rebounds_assists",
    stocks: "stocks",
    fantasy_points: "fantasy_score",
  };
  return map[s] ?? "points";
}

/**
 * Transform a PrizePicks raw pick into UnifiedProp.
 * Site-specific fields (isDemon, isGoblin, isPromo, udPickFactor, etc.) remain only in raw.
 */
export function transformPP(raw: any): UnifiedProp {
  const r = raw as RawPick & { site?: string };
  const id = r.projectionId ?? `pp-${r.player}-${r.stat}-${r.line}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    provider: "PP",
    player: r.player ?? "",
    statType: toStatCategory(r.stat ?? "points") as StatCategory,
    lineValue: Number(r.line) || 0,
    breakeven: DEFAULT_BREAKEVEN,
    odds: PLACEHOLDER_ODDS,
    raw,
    isDerived: false,
  };
}

/**
 * Transform an Underdog raw pick into UnifiedProp.
 * Site-specific fields (isNonStandardOdds, udPickFactor, etc.) remain only in raw.
 */
export function transformUD(raw: any): UnifiedProp {
  const r = raw as RawPick & { site?: string };
  const id = r.projectionId ?? `ud-${r.player}-${r.stat}-${r.line}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    provider: "UD",
    player: r.player ?? "",
    statType: toStatCategory(r.stat ?? "points") as StatCategory,
    lineValue: Number(r.line) || 0,
    breakeven: DEFAULT_BREAKEVEN,
    odds: PLACEHOLDER_ODDS,
    raw,
    isDerived: false,
  };
}

/**
 * Transform one Odds API row (PlayerPropOdds) into UnifiedProp.
 * Each Sgo row is already one (player, stat, line); the API returns multiple outcomes
 * per market (different point values), and fetch_oddsapi_props normalizes to one row per line.
 * Use this to feed odds into mergeProps so the best line (highest edge) is kept per player+stat.
 * provider defaults to "PP" for pipeline compatibility (odds feed is used for PP/UD merge).
 */
export function transformOddsApi(
  row: PlayerPropOdds,
  options?: { provider?: UnifiedProvider }
): UnifiedProp {
  const provider = options?.provider ?? "PP";
  const id =
    `oddsapi-${(row.eventId ?? "ev").slice(0, 8)}-${row.player}-${row.stat}-${row.line}-${row.book}`.replace(
      /\s+/g,
      "_"
    );
  return {
    id,
    provider,
    player: row.player ?? "",
    statType: toStatCategory(row.stat ?? "points") as StatCategory,
    lineValue: Number(row.line) || 0,
    breakeven: DEFAULT_BREAKEVEN,
    odds: {
      over: Number(row.overOdds) || 0,
      under: Number(row.underOdds) || 0,
    },
    raw: row,
    isDerived: false,
  };
}

/**
 * Convert an array of PlayerPropOdds (e.g. from fetch_oddsapi_props) to UnifiedProp[].
 * One UnifiedProp per row; each row is already a distinct (player, stat, line) including
 * alternative lines when includeAlternativeLines was true.
 */
export function oddsApiArrayToUnifiedProps(
  rows: PlayerPropOdds[],
  options?: { provider?: UnifiedProvider }
): UnifiedProp[] {
  return rows.map((r) => transformOddsApi(r, options));
}
