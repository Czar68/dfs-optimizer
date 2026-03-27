/**
 * Phase 80 — Canonical historical/context feature schema (backtest-ready).
 * Does not wire into live trueProb / edge / gating / selection.
 */

export const HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION = 1 as const;

/** Feature families (documentation + coverage grouping). */
export const HISTORICAL_FEATURE_FAMILIES = {
  recent_form:
    "Rolling outcomes from perf_tracker prior rows (same market group), no leakage: only games strictly before this row.",
  schedule:
    "Derived from perf_tracker date / gameStartTime and prior games for the same player (any market).",
  opponent_context:
    "Opponent team defensive rank from src/matchups/opp_adjust.ts static NBA table (same source as Phase 8 opp adjust, read-only here).",
  market_context:
    "Fields already on PerfTrackerRow (open/close implied, CLV). No new snapshot fetches in Phase 80.",
  role_stability:
    "Schema placeholder — no minutes/usage time series in repo yet.",
} as const;

/**
 * Null rules: any feature may be null when inputs are missing or window has insufficient prior games.
 * provenance / missingnessNotes on each row explain per-field gaps.
 */
export type HistoricalFeatureRow = {
  schemaVersion: typeof HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION;
  /** Stable identity: leg_id + date (game date from tracker). */
  rowKey: string;
  legId: string;
  date: string;
  gameStartTime: string | null;
  platform: string | null;
  player: string;
  stat: string;
  statNormalized: string;
  line: number;
  side: "over" | "under" | null;
  book: string | null;
  /** Same grouping key used for rolling windows (player + market identity). */
  marketGroupKey: string;

  // --- A. Recent form (prior resolved games only, same marketGroupKey) ---
  formPriorSampleSize: number;
  formL5HitRate: number | null;
  formL10HitRate: number | null;
  formL20HitRate: number | null;
  formL5ScrapeStatMean: number | null;
  formL10ScrapeStatMean: number | null;
  formL5HitVariance: number | null;
  formL10HitVariance: number | null;
  /** Slope of binary hit (0/1) vs index in last-10 window (chronological order). */
  formL10HitTrendSlope: number | null;

  // --- B. Schedule / home ---
  homeAway: "home" | "away" | null;
  daysRest: number | null;
  isBackToBack: boolean | null;
  /** Games this player played (distinct game dates) in the inclusive window [date-3, date] — proxy for compressed schedule. */
  playerGamesInLast4CalendarDays: number | null;
  /** Optional grounded game total when present on source row. */
  gameTotal?: number | null;
  /** Optional grounded spread when present on source row (subject-team perspective). */
  spread?: number | null;

  // --- C. Opponent / defense (static NBA ranks) ---
  opponentAbbrevResolved: string | null;
  opponentDefRankForStat: number | null;
  opponentContextProvenance: string | null;

  // --- D. Market (from tracker row) ---
  openImpliedProb: number | null;
  closeImpliedProb: number | null;
  impliedProbDeltaCloseMinusOpen: number | null;
  clvDelta: number | null;
  clvPct: number | null;
  oddsBucket: string | null;

  // --- E. Role (explicit placeholder) ---
  roleMinutesTrend: null;
  roleStabilityNote: "schema_only_no_minutes_series_in_repo";

  provenance: Record<string, string>;
  missingnessNotes: string[];
};

export type FeatureCoverageEntry = {
  field: keyof HistoricalFeatureRow | string;
  nonNullCount: number;
  fraction: number;
};

export type HistoricalFeatureRegistryPayload = {
  schemaVersion: typeof HISTORICAL_FEATURE_REGISTRY_SCHEMA_VERSION;
  generatedAtUtc: string;
  sourcePath: string;
  rowCount: number;
  marketGroups: number;
  families: typeof HISTORICAL_FEATURE_FAMILIES;
  coverage: FeatureCoverageEntry[];
  missingnessByFamily: Record<string, { fields: string[]; note: string }>;
  rowsSample: HistoricalFeatureRow[];
  /** Full export path for machine rows. */
  jsonlRelativePath: string;
};
