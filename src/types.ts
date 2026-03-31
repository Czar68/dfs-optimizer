// src/types.ts

import type { FeatureScoreSignals } from "./feature_input/feature_scoring";
import type { FeatureSnapshot } from "./feature_input/feature_snapshot";

export type Site = "prizepicks" | "underdog" | "sleeper";

export type Sport = 'NBA' | 'NFL' | 'MLB' | 'NHL' | 'NCAAB' | 'NCAAF'; // extensible

export type StatCategory =
  // NBA stats
  | "points"
  | "rebounds"
  | "assists"
  | "pra"
  | "pr"
  | "pa"
  | "ra"
  | "threes"
  | "blocks"
  | "steals"
  | "stocks"
  | "turnovers"
  | "fantasy_score"
  | "points_rebounds"
  | "points_assists"
  | "rebounds_assists"
  // NFL stats
  | "pass_yards"
  | "pass_attempts"
  | "pass_completions"
  | "pass_tds"
  | "interceptions"
  | "rush_yards"
  | "rush_attempts"
  | "rush_rec_yards"
  | "rec_yards"
  | "receptions"
  // MLB stats
  | "strikeout"
  | "hits"
  | "rbi"
  | "home_run"
  | "pitcher_strikeout"
  | "batter_hits"
  // NHL stats
  | "goals"
  | "assists"
  | "points"
  | "shots_on_goal"
  | "saves"
  | "goals_against"
  | "plus_minus"
  | "penalty_minutes"
  | "power_play_goals"
  | "short_handed_goals"
  | "time_on_ice";

// Narrow stat name alias used by normalize_stats.ts
export type StatType =
  // NBA core
  | "points"
  | "rebounds"
  | "assists"
  | "pra"
  | "pr"
  | "pa"
  | "ra"
  | "threes"
  | "blocks"
  | "steals"
  | "stocks"
  | "turnovers"
  | "fantasy"
  // NFL passing
  | "pass_yards"
  | "pass_attempts"
  | "pass_completions"
  | "pass_tds"
  | "interceptions"
  | "longest_completion"
  | "passer_rating"
  // NFL rushing
  | "rush_yards"
  | "rush_attempts"
  | "rush_tds"
  | "longest_rush"
  // NFL receiving
  | "rec_yards"
  | "receptions"
  | "rec_tds"
  | "longest_reception"
  // NFL combos + TDs + fantasy
  | "pass_rush_yards"
  | "rush_rec_yards"
  | "any_td"
  | "nfl_fantasy"
  // NHL stats
  | "goals"
  | "assists"
  | "points"
  | "shots_on_goal"
  | "saves"
  | "goals_against"
  | "plus_minus"
  | "penalty_minutes"
  | "power_play_goals"
  | "short_handed_goals"
  | "time_on_ice";

// Raw PrizePicks leg at ingest
export interface RawPick {
  sport: Sport;
  site: Site;
  league: string;
  player: string;
  team: string | null;
  opponent: string | null;
  stat: StatCategory;
  line: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;

  // Promo / special line flags
  isDemon: boolean;
  isGoblin: boolean;
  isPromo: boolean;

  // Underdog: true if the leg has explicit per-leg multipliers (e.g. 1.03x/0.88x)
  // rather than standard fixed-ladder pricing.
  isNonStandardOdds: boolean;

  // Underdog: per-leg payout factor for the OVER ("higher") direction.
  // Derived from UD's options[].american_price for the "higher" choice.
  //   factor = (1 + 100/|american|) / 2   when american < 0  (over is favourite)
  //   factor = (1 + american/100)  / 2    when american > 0  (over is underdog)
  // factor = 1.0  → pick pays full structure multiplier (±0 / even money)
  // factor < 1.0  → pick REDUCES card payout (easy/heavily-favoured line)
  // factor > 1.0  → pick BOOSTS card payout (underdog line)
  // undefined / null  → standard pick, no UD option pricing (treat as 1.0)
  udPickFactor?: number | null;
}

// Canonical internal odds-row contract (provider-neutral backend shape).
export interface InternalPlayerPropOdds {
  sport: Sport;
  player: string;
  team: string | null;
  opponent: string | null;
  league: string;
  stat: StatCategory;
  line: number;
  overOdds: number;
  underOdds: number;
  book: string;
  eventId: string | null;
  marketId: string | null;
  selectionIdOver: string | null;
  selectionIdUnder: string | null;
  /** Set by Phase 1 harvest: true = main line, false = alt line from includeAltLines */
  isMainLine?: boolean;
}

/**
 * Transitional alias for legacy call sites.
 * InternalPlayerPropOdds is the canonical source of truth.
 */
export type SgoPlayerPropOdds = InternalPlayerPropOdds;

// Merge stage: picks + odds before EV
export interface MergedPick {
  sport: Sport;
  site: Site;
  league: string;
  player: string;
  team: string | null;
  opponent: string | null;
  stat: StatCategory;
  line: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;

  // Book/odds fields populated in merge_odds.ts
  book: string;
  overOdds: number;
  underOdds: number;
  trueProb: number;
  fairOverOdds: number;
  fairUnderOdds: number;

  // Promo flags carried forward from RawPick
  isDemon: boolean;
  isGoblin: boolean;
  isPromo: boolean;

  /** Tracking only: true for PP demon/goblin lines - must not affect EV calculations */
  isPromoLine?: boolean;

  // Underdog varied-multiplier flag (carried from RawPick)
  isNonStandardOdds: boolean;

  /** Optional UD modifier metadata (merge/API); guardrail + non-standard leg math read when present. */
  nonStandard?: {
    category: string;
    explicitness?: string;
  };

  /** Present on many merged rows (from RawPick); EV + merge matching use when set. */
  outcome?: "over" | "under";
  /** Underdog payout factor when carried from API into merged rows. */
  udPickFactor?: number | null;

  // Phase 2 alt-line merge metadata
  /** "main" = matched within MAX_LINE_DIFF on a main line (or any SGO line pre-Phase1).
   *  "alt"  = matched via findBestAltMatch on an alt line from includeAltLines harvest. */
  matchType?: "main" | "alt";
  /** Absolute delta between the pick line and the matched odds line. 0 = exact. */
  altMatchDelta?: number;

  // Canonical merge key + display label (Prompt 3)
  /** Unique key: platform:player:stat:line:side:period */
  legKey?: string;
  /** Human-readable: Player - Stat - Line */
  legLabel?: string;

  // Odds snapshot audit columns (set when OddsSnapshotManager is active)
  oddsSnapshotId?: string;
  oddsFetchedAtUtc?: string;
  oddsAgeMinutes?: number;
  oddsRefreshMode?: string;
  oddsSource?: string;
  oddsIncludesAltLines?: boolean;

  /** Phase P — PrizePicks: count of books in sharp-weight consensus pool (exact-first + Phase K filter). */
  ppNConsensusBooks?: number;
  /** Phase P — PP: max(min) de-vig **over** prob spread across those books; `0` when single-book. */
  ppConsensusDevigSpreadOver?: number;
}

// EV / cards inputs and outputs
export type FlexType =
  | "2P"
  | "3P"
  | "4P"
  | "5P"
  | "6P"
  | "7P"
  | "8P"
  | "3F"
  | "4F"
  | "5F"
  | "6F"
  | "7F"
  | "8F";

export interface CardLegInput {
  sport: Sport;
  player: string;
  team: string | null;
  opponent: string | null;
  league: string;
  stat: StatCategory;
  line: number;
  outcome: "over" | "under";
  trueProb: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;
  /** Underdog per-pick payout factor (decimal_higher_price / 2).
   *  < 1.0 = UD discounts card payout for this pick (easy/favoured line).
   *  = 1.0 = standard (no adjustment).
   *  > 1.0 = UD boosts card payout for this pick (underdog line).
   *  Absent / null = treat as 1.0. */
  udPickFactor?: number | null;
}

// Per‑leg EV object after merge_odds + calculate_ev
export interface EvPick {
  id: string;
  sport: Sport;
  site: Site;
  league: string;
  player: string;
  team: string | null;
  opponent: string | null;
  stat: StatCategory;
  line: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;
  outcome: "over" | "under";
  trueProb: number;
  /** Raw model probability before Phase 16R calibration layer */
  rawTrueProb?: number;
  /** Calibrated probability from Phase 16R layer (before any odds-bucket haircut) */
  calibratedTrueProb?: number;
  /** Whether a Phase 16R calibration mapping was applied */
  probCalibrationApplied?: boolean;
  /** Calibration bucket label used when available */
  probCalibrationBucket?: string;
  fairOdds: number;
  edge: number;
  book: string | null;
  overOdds: number | null;
  underOdds: number | null;

  // Per‑leg EV
  legEv: number;

  /** Phase 73: naive trueProb−0.5 on the same probability basis as gating (effectiveTrueProb after haircut when set in calculate_ev). */
  legacyNaiveLegMetric?: number;

  /** Phase 73: fair chosen-side probability from two-way de-vig (when both American prices exist). */
  fairProbChosenSide?: number;

  // Calibration-adjusted EV (from perf tracker buckets); used when present for filtering/sorting/card EV
  adjEv?: number;

  // Underdog varied-multiplier flag (carried from RawPick → MergedPick)
  isNonStandardOdds: boolean;

  // UD payout factor (from UD API american_price); >1 = boosted, <1 = discounted, null = standard
  udPickFactor?: number | null;

  /** Carried from merge when applicable; used by canonical non-standard leg math. */
  nonStandard?: {
    category: string;
    explicitness?: string;
  };

  /** Set by calculate_ev when canonical non-standard mapping classifies the leg. */
  modelingClass?: string;
  modelingReason?: string;

  // Canonical merge key + display label (carried from MergedPick)
  legKey?: string;
  legLabel?: string;

  /** Phase 95: optional context features — populate via `attachFeatureContextToPick`; not set by default pipeline. */
  featureSnapshot?: FeatureSnapshot;
  featureSignals?: FeatureScoreSignals;

  /**
   * Phase 97: optional graded result vs the line (validation / reporting only; not set by default pipeline).
   * With **`featureSignals`**, enables **`evaluateSignalPerformance`** (read-only).
   */
  gradedLegOutcome?: "hit" | "miss" | "push";

  /**
   * Phase 101E: export-only — how **`perf_tracker`** was joined to grounded legs (**`feature_validation_export`**).
   */
  featureValidationJoin?: {
    method: "leg_id" | "reconstruction";
    matchedLegCsvId: string;
  };

  /** Phase P — carried from merge for PP legs; books in consensus / de-vig spread (reporting). */
  ppNConsensusBooks?: number;
  ppConsensusDevigSpreadOver?: number;
}

// Distribution of hits → probability for a card
export type CardHitDistribution = Record<number, number>;

// Card EV result used by run_optimizer.ts and card_ev.ts
export interface CardEvResult {
  flexType: FlexType;

  // Legs are { pick, side } as used in run_optimizer.ts
  legs: {
    pick: EvPick;
    side: "over" | "under";
  }[];

  stake: number;
  totalReturn: number;

  // Overall EV (expected profit per 1 unit stake)
  expectedValue: number;

  // Win probability for cashing and any positive return
  winProbability: number;

  // Convenience fields used by run_optimizer writeCardsCsv
  cardEv: number;
  winProbCash: number;
  winProbAny: number;

  // Card-level diagnostic metrics
  avgProb: number;    // Average of leg true probabilities
  avgEdgePct: number; // Average leg edge in percent (edge * 100)

  // Full hit distribution (k hits → probability)
  hitDistribution: CardHitDistribution;

  // Kelly sizing results (computed after EV)
  kellyResult?: {
    meanReturn: number;
    variance: number;
    rawKellyFraction: number;
    cappedKellyFraction: number;    // After maxRawKellyFraction cap
    safeKellyFraction: number;      // After globalKellyMultiplier  
    finalKellyFraction: number;     // After all caps (what we actually use)
    recommendedStake: number;
    expectedProfit: number;
    maxPotentialWin: number;
    riskAdjustment: string;
    isCapped: boolean;
    capReasons: string[];
  };

  // Portfolio selection results (computed after Kelly)
  selected?: boolean;              // True if card is in optimal portfolio
  portfolioRank?: number;          // 1-based rank in selected cards (undefined if not selected)
  efficiencyScore?: number;        // Efficiency = EV / (cappedKelly + epsilon)

  /** Breakeven gap: (projected leg win probability) − (platform breakeven for this structure). +EV when > 0. */
  breakevenGap?: number;

  /** Which platform this card was built for (drives truthful export/alert labels). */
  site?: Site;

  /**
   * Canonical structure id used for EV / breakeven / payout lookup (e.g. PP `5F`, UD `UD_8P_STD`).
   * When set, should match the registry key used in EV math for this card.
   */
  structureId?: string;

  /**
   * Phase 77: snapshot of evaluator `cardEv` for export observability (equals `cardEv` when diversification runs; unchanged math).
   */
  rawCardEv?: number;
  /** Phase 77: greedy score = rawCardEv − soft penalties (export selection only). */
  diversificationAdjustedScore?: number;
  /** Phase 77: penalties / rank from `portfolio_diversification` (export layer only). */
  portfolioDiversification?: PortfolioDiversificationCardMeta;

  /** Phase 95: optional context features — populate via `attachFeatureContextToCard`; not set by default pipeline. */
  featureSnapshot?: FeatureSnapshot;
  featureSignals?: FeatureScoreSignals;
}

/** Phase 77 — metadata attached to exported cards after portfolio diversification (no EV mutation). */
export interface PortfolioDiversificationCardMeta {
  greedyRank: number;
  penaltyTotal: number;
  legPenalty: number;
  playerPenalty: number;
  playerStatPenalty: number;
  gamePenalty: number;
  overlapPenalty: number;
}

// Card types used by Sheets export
export type CardMode = "flex" | "power";

export type CardSize = 2 | 3 | 4 | 5 | 6;

export interface CardLeg {
  site: Site;
  league: string;
  player: string;
  team: string | null;
  opponent: string | null;
  stat: StatCategory;
  line: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;
  outcome: "over" | "under";
  trueProb: number;
}

export interface Card {
  mode: CardMode;
  size: CardSize;
  legs: CardLeg[];
  stake: number;
  stakePerCard: number;
  totalReturn: number;
  expectedValue: number;
  winProbability: number;
}
