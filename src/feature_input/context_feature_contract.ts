/**
 * Phase 87 — Non-math context / AI feature input contract.
 * Lives outside `math_models/`; must not be imported from EV/breakeven/selection code until explicitly wired.
 */

/** Logical grouping for future enrichment (L5, splits, matchup, etc.). */
export type ContextFeatureFamily =
  | 'rolling_form'
  | 'home_away_split'
  | 'matchup_context'
  | 'market_context'
  | 'schedule_rest'
  | 'minutes_availability'
  | 'game_environment'
  | 'team_defense_context'
  | 'other'

/** How downstream consumers should interpret `value` after normalization. */
export type FeatureValueKind = 'ratio' | 'count' | 'zscore' | 'categorical' | 'unknown'

/**
 * One observed feature for a subject at a point in time.
 * Not a model output — raw or derived context only.
 */
export interface ContextFeatureRecord {
  /** Stable id, e.g. `l5_pts_per_game` */
  key: string
  family: ContextFeatureFamily
  kind: FeatureValueKind
  /** UTC end of observation window (ISO-8601 string). */
  asOfUtc: string
  /** Opaque id (leg id, player key, etc.). */
  subjectId: string
  /** Normalized payload; `null` means missing / not applicable. */
  value: number | string | null
  /** Optional audit trail (file, job name) — never used inside `math_models/`. */
  provenance?: string
}

/** Repository location for this layer (documentation / imports). */
export const FEATURE_INPUT_MODULE_PREFIX = 'src/feature_input' as const
