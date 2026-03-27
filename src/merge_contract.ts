/**
 * Phase 39 — Merge contract SSOT (documentation + stable reason codes).
 * Behavioral rules live in `src/merge_odds.ts`; this module names and exports them without redefining math.
 */

export const MERGE_CONTRACT_SCHEMA_VERSION = 1 as const;

/** Primary match: exact line === pick.line among name/stat/sport/league-filtered candidates; first array order wins on ties. */
export const MERGE_PRIMARY_MATCH_STRATEGY = "exact_line_first_among_filtered_candidates" as const;

/**
 * When no exact line: choose nearest odds line by absolute delta; tie-break: lower array index in filtered `candidates` (stable scan order).
 */
export const MERGE_NEAREST_FALLBACK_STRATEGY = "nearest_line_within_max_line_diff_then_first_candidate_order" as const;

/**
 * After a `line_diff` failure on the main pass: second pass on OddsAPI alt rows (`isMainLine === false`) within `UD_ALT_LINE_MAX_DELTA`;
 * tie-break: smallest delta, then higher `overOdds` (see `findBestAltMatch` in merge_odds).
 */
export const MERGE_ALT_LINE_SECOND_PASS_STRATEGY = "alt_pool_within_max_delta_then_over_odds_tie_break" as const;

/**
 * Documented deterministic ordering for merge candidate selection (see `findBestMatchForPickWithReason`, `findBestAltMatch`).
 */
export const MERGE_TIE_BREAK_ORDER = [
  "exact_line_before_any_nearest",
  "nearest_smallest_abs_delta",
  "nearest_first_in_candidate_scan_order_on_tie",
  "alt_second_pass_smallest_abs_delta_then_higher_over_odds",
] as const;

/** When `cli.exactLine` is true, nearest tolerance is 0 (exact only). Otherwise 0.5. */
export const MERGE_DEFAULT_NEAREST_TOLERANCE_NON_EXACT = 0.5 as const;

/** Phase 2 Underdog / shared alt-line rescue window (OddsAPI alt lines). Exported from merge_odds for runtime. */
export const UD_ALT_LINE_MAX_DELTA = 2.5;

/** Stats eligible for alt-line second pass (must match merge_odds). */
export const UD_ALT_MATCH_STATS = new Set<string>([
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
]);

/**
 * Internal merge skip/match-fail keys (as produced by merge_odds) → stable operator-facing codes.
 * Only paths that exist in code are listed.
 */
export const MERGE_DROP_REASON = {
  /** `no_candidate`: no odds row matched player+stat+sport+league */
  no_match: "no_match",
  /** `line_diff`: nearest still outside tolerance and alt second pass did not rescue */
  line_mismatch: "line_mismatch",
  /** `juice`: matched line rejected by max juice (side-aware) */
  invalid_odds: "invalid_odds",
  promo_or_special: "promo_or_special",
  fantasy_excluded: "fantasy_excluded",
  /** Stat absent from odds feed (dynamic PP/UD filters) */
  no_odds_stat: "no_odds_stat",
  /** Underdog points escalator lines at or below threshold */
  escalator_filtered: "escalator_filtered",
  /**
   * PrizePicks multi-player display label (`"A + B"`); excluded before matching — odds rows are single-player.
   * Phase 60 — deterministic; not `no_match`.
   */
  combo_label_excluded: "combo_label_excluded",
} as const;

/** Substring used to detect PP combo / multi-player pick labels (deterministic). */
export const PP_COMBO_LABEL_SUBSTRING = " + " as const;

export function isPrizePicksComboPlayerLabel(player: string): boolean {
  return player.includes(PP_COMBO_LABEL_SUBSTRING);
}

export type MergeDropReasonCode = (typeof MERGE_DROP_REASON)[keyof typeof MERGE_DROP_REASON];

/** Map internal unmatched reason keys (merge loop / MatchResult) to canonical codes. */
export function canonicalMergeDropReason(internal: string): MergeDropReasonCode | string {
  switch (internal) {
    case "no_candidate":
      return MERGE_DROP_REASON.no_match;
    case "line_diff":
      return MERGE_DROP_REASON.line_mismatch;
    case "juice":
      return MERGE_DROP_REASON.invalid_odds;
    case "promo_or_special":
      return MERGE_DROP_REASON.promo_or_special;
    case "fantasy_excluded":
      return MERGE_DROP_REASON.fantasy_excluded;
    case "no_odds_stat":
      return MERGE_DROP_REASON.no_odds_stat;
    case "escalator_filtered":
      return MERGE_DROP_REASON.escalator_filtered;
    case "combo_label_excluded":
      return MERGE_DROP_REASON.combo_label_excluded;
    default:
      return internal;
  }
}

export interface MergeDropRecord {
  site: string;
  sport: string;
  player: string;
  stat: string;
  line: number;
  internalReason: string;
  canonicalReason: string;
}

export function sortMergeDropRecordsDeterministically(records: MergeDropRecord[]): MergeDropRecord[] {
  return [...records].sort((a, b) => {
    const s = a.site.localeCompare(b.site);
    if (s !== 0) return s;
    const p = a.player.localeCompare(b.player);
    if (p !== 0) return p;
    const st = a.stat.localeCompare(b.stat);
    if (st !== 0) return st;
    if (a.line !== b.line) return a.line - b.line;
    const sp = a.sport.localeCompare(b.sport);
    if (sp !== 0) return sp;
    const ir = a.internalReason.localeCompare(b.internalReason);
    if (ir !== 0) return ir;
    return a.canonicalReason.localeCompare(b.canonicalReason);
  });
}
