// src/types.ts

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

  // PP scoring weight: goblin = 0.95, demon = 1.05, standard = 1.0
  scoringWeight: number;

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

// Shape returned from fetch_oddsapi_props / Odds API player props
export interface PlayerPropOdds {
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
  /** From OddsAPI event: home_team / away_team (full names). Used in merge to set team/opponent abbrevs. */
  homeTeam?: string | null;
  awayTeam?: string | null;
}

/** ESPN enrichment: last-5 form and injury status (when ENABLE_ESPN_ENRICHMENT). */
export interface EspnEnrichment {
  last5Avg: number;
  last5Games: number;
  vsLineGap: number;
  injuryStatus?: string;
  fetchedAt: string;
}

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

  // PP scoring weight carried from RawPick (goblin 0.95, demon 1.05, standard 1.0)
  scoringWeight: number;

  // Underdog varied-multiplier flag (carried from RawPick)
  isNonStandardOdds: boolean;

  // Phase 2 alt-line merge metadata
  /** "main" = matched within MAX_LINE_DIFF on a main line.
   *  "alt"  = matched via findBestAltMatch on an alt line from includeAltLines harvest.
   *  "alt_ud" = UD only: main pass had no exact match but nearest within 1.5 accepted as alt.
   *  "alt_juice_rescue" = matched via findBestAltMatch after main pass failed with juice.
   *  "fallback_pp" / "fallback_ud" = matched via same-book OddsAPI row when sharp match failed. */
  matchType?: "main" | "alt" | "alt_ud" | "alt_juice_rescue" | "fallback_pp" | "fallback_ud";
  /** Absolute delta between the pick line and the matched odds line. 0 = exact. */
  altMatchDelta?: number;

  // Canonical merge key + display label (Prompt 3)
  /** Unique key: platform:player:stat:line:side:period */
  legKey?: string;
  /** Human-readable: Player - Stat - Line */
  legLabel?: string;

  /** Line movement from legs archive (earliest vs latest run same day). */
  lineMovement?: {
    direction: "toward" | "against" | "none";
    lineDelta: number;
    oddsDelta: number;
    runsObserved: number;
  };

  /** ESPN enrichment (when ENABLE_ESPN_ENRICHMENT): last-5 avg, vsLineGap, injuryStatus. */
  espnEnrichment?: EspnEnrichment;

  // Odds snapshot audit columns (set when OddsSnapshotManager is active)
  oddsSnapshotId?: string;
  oddsFetchedAtUtc?: string;
  oddsAgeMinutes?: number;
  oddsRefreshMode?: string;
  oddsSource?: string;
  oddsIncludesAltLines?: boolean;
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

/** Line movement category from prior snapshot comparison. */
export type LineMovementCategory =
  | "favorable"
  | "neutral"
  | "moderate_against"
  | "strong_against"
  | "no_prior";

/** Line movement result for one leg (delta = currentLine - priorLine; positive = line went up). */
export interface LineMovementResult {
  category: LineMovementCategory;
  delta: number;
  priorLine: number;
  currentLine: number;
  priorRunTs: string;
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
  fairOdds: number;
  edge: number;
  /** Implied probability from market (American odds); set when building leg from odds. */
  impliedProb?: number;
  book: string | null;
  overOdds: number | null;
  underOdds: number | null;

  // Per‑leg EV
  legEv: number;

  /**
   * Correlation‑adjusted true probability used for DP EV / Kelly.
   * When present, DP engines should prefer this over trueProb.
   */
  adjustedProb?: number;

  // Calibration-adjusted EV (from perf tracker buckets); used when present for filtering/sorting/card EV
  adjEv?: number;

  // Underdog varied-multiplier flag (carried from RawPick → MergedPick)
  isNonStandardOdds: boolean;

  // PP scoring weight (goblin 0.95, demon 1.05, standard 1.0); applied to legEv
  scoringWeight: number;

  // UD payout factor (from UD API american_price); >1 = boosted, <1 = discounted, null = standard
  udPickFactor?: number | null;

  // Canonical merge key + display label (carried from MergedPick)
  legKey?: string;
  legLabel?: string;

  /** Merge match quality: carried from MergedPick (main, alt, alt_ud, alt_juice_rescue, fallback_pp, fallback_ud). */
  matchType?: "main" | "alt" | "alt_ud" | "alt_juice_rescue" | "fallback_pp" | "fallback_ud";

  // Intelligence layer: FantasyMatchupScore - line => ConfidenceDelta (for 23-col V / 36-col inventory)
  confidenceDelta?: number;

  // ESPN enrichment (when ESPN_ENRICHMENT_ENABLED): status + recent minutes
  espnStatus?: string;   // "Active" | "Day-To-Day" | "Questionable" | "Doubtful" | "Out" | "Suspended" | "Injured Reserve" | "unknown"
  espnMinutes?: number;  // avg last-5 games minutes; 99 = no data (no penalty)

  /** ESPN enrichment (when ENABLE_ESPN_ENRICHMENT): last-5 avg, vsLineGap, injuryStatus. */
  espnEnrichment?: EspnEnrichment;

  /** Fantasy score contribution to adjEv when ENABLE_FANTASY_EV. */
  fantasyEv?: number;

  // Line movement (when LINE_MOVEMENT_ENABLED): delta vs prior snapshot (LineMovementResult) or archive-based (direction/lineDelta/oddsDelta/runsObserved)
  lineMovement?: LineMovementResult | {
    direction: "toward" | "against" | "none";
    lineDelta: number;
    oddsDelta: number;
    runsObserved: number;
  };
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

  /** UD composite score: cardEv × diversityScore × (1 − correlation) × liquidity; used for ranking. */
  compositeScore?: number;
  diversityScore?: number;
  correlation?: number;
  liquidity?: number;

  /** Optional read-only analytics derived from the EV engine; never used to drive EV/Kelly logic. */
  metrics?: import("./types/cardMetrics").CardMetrics;

  /** Monte Carlo validation: EV from 50k Bernoulli simulations (optional). */
  monteCarloEV?: number;
  /** Monte Carlo validation: win probability from simulations (optional). */
  monteCarloWinProb?: number;
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
