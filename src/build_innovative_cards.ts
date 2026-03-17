// src/build_innovative_cards.ts
//
// Innovative Card Builder — Max EV with Player Diversity
//
// Generates a portfolio of up to maxCards (default 50) PrizePicks cards with:
//   • Composite scoring: cardEV × diversity × (1 - correlation) × liquidity
//   • Portfolio-level player/team/stat caps (player ≤ 3 cards, stat mix enforced)
//   • Kelly portfolio sizing across top 20 picks (global fraction ≤ 0.20)
//   • Edge density preference: avgLegEV > median pool
//   • Book spread requirement: ≥ 2 distinct books across legs
//   • Edge cluster identification: groups of 2+ legs from same team+stat

import { EvPick, FlexType } from "./types";
import { computeKellyForCard, computePrizePicksHitDistribution, DEFAULT_KELLY_CONFIG } from "./kelly_mean_variance";
import { computeLocalEvDP } from "./engine_interface";
import { getBreakevenForStructure } from "./config/binomial_breakeven";
import { getBreakevenThreshold } from "../math_models/breakeven_from_registry";
import { cliArgs } from "./cli_args";
import {
  FRAGILE_PENALTY,
  CONFIDENCE_DELTA_WEIGHT,
  ADJ_EV_MIN_BUCKET_ROWS,
  ESPN_RISKY_PENALTY,
  ESPN_CAUTION_PENALTY,
  ESPN_LOW_MINUTES_PENALTY,
  LINE_STRONG_AGAINST_PENALTY,
  LINE_MODERATE_AGAINST_PENALTY,
  LINE_FAVORABLE_BOOST,
} from "./constants/scoring";
import { computeBucketCalibrations } from "./calibrate_leg_ev";
import { getSelectionEv } from "./constants/evSelectionUtils";

// ---------------------------------------------------------------------------
// PrizePicks payout tables (hits → multiplier, stake = 1)
// Power = all-or-nothing | Flex = tiered ladder
// ---------------------------------------------------------------------------
// Must match config/prizepicks_payouts.ts exactly (official Feb 2026 payouts)
const PP_PAYOUTS: Record<string, Record<number, number>> = {
  "2P":  { 2: 3 },
  "3P":  { 3: 6 },
  "4P":  { 4: 10 },
  "5P":  { 5: 20 },
  "6P":  { 6: 37.5 },
  "3F":  { 3: 3,  2: 1 },
  "4F":  { 4: 6,  3: 1.5 },
  "5F":  { 5: 10, 4: 2, 3: 0.4 },
  "6F":  { 6: 25, 5: 2, 4: 0.4 },
};
// Goblin payouts (~0.6x; 6P = 22.5x). Canonical: parlay_structures.ts PP_GOBLIN_*.
const PP_GOBLIN_PAYOUTS: Record<string, Record<number, number>> = {
  "2P":  { 2: 1.8 },
  "3P":  { 3: 3.6 },
  "4P":  { 4: 6 },
  "5P":  { 5: 12 },
  "6P":  { 6: 22.5 },
  "3F":  { 3: 1.8,  2: 0.6 },
  "4F":  { 4: 3.6,  3: 0.9 },
  "5F":  { 5: 6, 4: 1.2, 3: 0.24 },
  "6F":  { 6: 15, 5: 1.2, 4: 0.24 },
};

// Pool sizes per card size — limits combinatorial explosion
const POOL_SIZE_BY_N: Record<number, number> = {
  2: 40, 3: 35, 4: 25, 5: 20, 6: 16,
};

// Portfolio-level caps
const MAX_CARDS_PER_PLAYER = 3;
const MAX_CARDS_PER_STAT   = 4;   // per stat category globally
const STAT_SHARE_CAP: Record<string, number> = {
  points:   0.30,  // PTS ≤ 30% of portfolio cards
  rebounds: 0.25,  // REB ≤ 25%
  assists:  0.25,
  threes:   0.20,
  // other stats share the remaining ~20%
};
const GLOBAL_KELLY_CAP = 0.20; // sum of all selected cards' Kelly fractions
const TARGET_CARDS     = 50;

// Stat category groupings for balance reporting
const STAT_GROUPS: Record<string, string> = {
  points: "PTS", pra: "PRA", points_rebounds: "PR", points_assists: "PA",
  rebounds_assists: "RA",
  rebounds: "REB", assists: "AST", threes: "3PM",
  blocks: "BLK", steals: "STL", blocks_steals: "STKS",
  turnovers: "TO", fantasy_score: "FPTS",
};

// ---------------------------------------------------------------------------
// Exported card shape
// ---------------------------------------------------------------------------
// Tier classification thresholds
const TIER1_MIN_EV    = 0.08;   // 8% card EV
const TIER1_MIN_KELLY = 0.015;  // 1.5% Kelly fraction
const TIER2_MIN_EV    = 0.04;   // 4% card EV
const TIER2_MIN_KELLY = 0.005;  // 0.5% Kelly fraction

export type CardTier = 1 | 2 | 3;

export interface InnovativeCard {
  flexType:         FlexType;
  legs:             EvPick[];
  cardEV:           number;
  winProbCash:      number;
  avgProb:          number;
  avgLegEV:         number;
  avgEdge:          number;
  diversity:        number;          // 0-1, higher = more diverse within card
  correlation:      number;          // 0-1, lower = less correlated (better)
  correlationScore: number;          // 0-100, higher = less correlated (human-friendly)
  liquidity:        number;          // 0-1, based on book coverage
  compositeScore:   number;          // cardEV × diversity × (1 - correlation) × liquidity × avgScoringWeight
  kellyFrac:        number;          // raw Kelly fraction for this card
  kellyStake:       number;          // $ amount to bet = bankroll × kellyFrac × kellyMultiplier, clamped
  statBalance:      Record<string, number>;
  edgeCluster:      string;
  legIds:           string[];
  portfolioRank:    number;
  tier:             CardTier;        // 1=premium, 2=solid, 3=speculative
  fragile:          boolean;         // true if EV drops >50% under juice+10 or line±0.5
  fragileEvShifted: number;          // EV after applying worst-case perturbation
}

// ---------------------------------------------------------------------------
// Synchronous card EV via proper DP (non-iid, uses individual leg probs).
// When isGoblin, uses goblin payout table (reduced multipliers).
// ---------------------------------------------------------------------------
function evaluateSyncCard(legs: EvPick[], flexType: string, isGoblin: boolean): {
  cardEV: number; winProbCash: number; avgProb: number;
} {
  const payouts = isGoblin ? PP_GOBLIN_PAYOUTS[flexType] : PP_PAYOUTS[flexType];
  if (!payouts) return { cardEV: -1, winProbCash: 0, avgProb: 0 };

  const probs = legs.map(l => l.trueProb);
  const avg   = probs.reduce((a, b) => a + b, 0) / probs.length;
  const evStructure = isGoblin ? `${flexType}_GOBLIN` : flexType;

  // Use exact DP hit distribution — no i.i.d. approximation
  const cardEV = computeLocalEvDP(evStructure, probs);

  // winProbCash via DP (P(payout > stake))
  const n  = probs.length;
  let dp   = new Array(n + 1).fill(0);
  dp[0]    = 1;
  for (let i = 0; i < n; i++) {
    const p    = probs[i];
    const next = new Array(n + 1).fill(0);
    for (let j = 0; j <= i; j++) {
      if (dp[j] === 0) continue;
      next[j]     += dp[j] * (1 - p);
      next[j + 1] += dp[j] * p;
    }
    dp = next;
  }
  let winProbCash = 0;
  for (const [hitsStr, mult] of Object.entries(payouts)) {
    if (mult > 1) winProbCash += dp[Number(hitsStr)] ?? 0;
  }

  return { cardEV, winProbCash, avgProb: avg };
}

// ---------------------------------------------------------------------------
// Within-card diversity score (0-1)
// Penalizes: same team > 1 pick, same stat > 40% of legs, same game > 2 picks
// ---------------------------------------------------------------------------
function scoreDiversity(legs: EvPick[]): number {
  const n = legs.length;
  let score = 1.0;

  // Team concentration
  const teamCounts = new Map<string, number>();
  for (const l of legs) {
    const t = l.team ?? "UNK";
    teamCounts.set(t, (teamCounts.get(t) ?? 0) + 1);
  }
  for (const cnt of teamCounts.values()) {
    if (cnt > 1) score -= (cnt - 1) * 0.15; // -0.15 per extra leg from same team
  }

  // Stat concentration (any stat > 40% of legs)
  const statCounts = new Map<string, number>();
  for (const l of legs) {
    statCounts.set(l.stat, (statCounts.get(l.stat) ?? 0) + 1);
  }
  for (const cnt of statCounts.values()) {
    const share = cnt / n;
    if (share > 0.4) score -= (share - 0.4) * 1.0; // proportional penalty
  }

  // Game concentration: > 2 legs from same game
  const gameCounts = new Map<string, number>();
  for (const l of legs) {
    const g = l.gameId ?? l.team ?? "UNK";
    gameCounts.set(g, (gameCounts.get(g) ?? 0) + 1);
  }
  for (const cnt of gameCounts.values()) {
    if (cnt > 2) score -= (cnt - 2) * 0.10;
  }

  return Math.max(0, Math.min(1, score));
}

// ---------------------------------------------------------------------------
// Within-card correlation penalty (0-1, lower = better)
// Estimates how correlated the legs are with each other
// ---------------------------------------------------------------------------
function scoreCorrelation(legs: EvPick[]): number {
  const n = legs.length;
  if (n < 2) return 0;

  let penalty = 0;
  let pairs   = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = legs[i];
      const b = legs[j];
      pairs++;

      const sameGame = a.gameId && b.gameId && a.gameId === b.gameId;
      const sameTeam = a.team && b.team && a.team === b.team;

      if (sameTeam) {
        penalty += 0.35; // same team = strong correlation
        if (a.stat === "points" && b.stat === "points") penalty += 0.30; // PTS+PTS
      } else if (sameGame) {
        penalty += 0.10; // same game = mild correlation
      }

      // Stat correlation regardless of team/game
      if (a.stat === b.stat && (a.stat === "points" || a.stat === "pra")) {
        penalty += 0.05;
      }
    }
  }

  return Math.min(0.95, pairs > 0 ? penalty / pairs : 0);
}

// ---------------------------------------------------------------------------
// Liquidity score (0-1) — book coverage + optional live liquidity map
// ---------------------------------------------------------------------------
function scoreLiquidity(legs: EvPick[], liveScores?: Map<string, number>): number {
  // If live scores are available and ALL legs have data, use their average
  if (liveScores && liveScores.size > 0) {
    const scores = legs.map(l => liveScores.get(l.id)).filter((s): s is number => s !== undefined);
    if (scores.length === legs.length) {
      return Math.max(0.1, Math.min(1.0, scores.reduce((a, b) => a + b, 0) / scores.length));
    }
  }
  // Static fallback: unique books present across legs
  const books = new Set(legs.map(l => l.book).filter(Boolean));
  if (books.size >= 3) return 1.0;
  if (books.size >= 2) return 0.85;
  if (books.size === 1) return 0.70;
  return 0.55;
}

// ---------------------------------------------------------------------------
// Kelly fraction for a card (simplified single-outcome approximation).
// When isGoblin, uses goblin payout table.
// ---------------------------------------------------------------------------
function cardKellyFrac(cardEV: number, winProbCash: number, flexType: string, isGoblin: boolean): number {
  const payouts = isGoblin ? PP_GOBLIN_PAYOUTS[flexType] : PP_PAYOUTS[flexType];
  if (!payouts) return 0;
  // Use the max payout tier for Kelly numerator
  const maxPayout = Math.max(...Object.values(payouts));
  if (maxPayout <= 1 || winProbCash <= 0) return 0;
  // Standard Kelly: (p * (b-1) - (1-p)) / (b-1)  where b = maxPayout
  const b = maxPayout;
  const p = winProbCash;
  const k = (p * (b - 1) - (1 - p)) / (b - 1);
  return Math.max(0, Math.min(0.25, k)); // cap at 25% per card
}

// ---------------------------------------------------------------------------
// Combination generator (k-subsets of an array)
// ---------------------------------------------------------------------------
function* kCombinations<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k === 0) { yield []; return; }
  if (k > n) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map(i => arr[i]);
    // Find rightmost index that can be incremented
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

// ---------------------------------------------------------------------------
// Edge cluster detection
// Groups legs by (team, stat) pairs; returns map of clusterKey → leg IDs
// ---------------------------------------------------------------------------
function detectEdgeClusters(legs: EvPick[]): Map<string, EvPick[]> {
  const groups = new Map<string, EvPick[]>();
  for (const leg of legs) {
    const key = `${leg.team ?? "UNK"}_${STAT_GROUPS[leg.stat] ?? leg.stat}`;
    const arr = groups.get(key) ?? [];
    arr.push(leg);
    groups.set(key, arr);
  }
  // Only return clusters with 2+ picks
  for (const [key, arr] of groups) {
    if (arr.length < 2) groups.delete(key);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Stat balance within a single card (returns label→count map)
// ---------------------------------------------------------------------------
function cardStatBalance(legs: EvPick[]): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const l of legs) {
    const label = STAT_GROUPS[l.stat] ?? l.stat;
    bal[label] = (bal[label] ?? 0) + 1;
  }
  return bal;
}

// ---------------------------------------------------------------------------
// Fragile flag: does EV collapse under small market perturbations?
//
// Tests two scenarios and takes the worst:
//   1. juice+10: each leg's trueProb shifts as if over odds moved +10 cents
//   2. line±0.5: each leg's trueProb nudged down ~1 percentage point
//
// If the worst-case EV is < 50% of the original, the card is fragile.
// ---------------------------------------------------------------------------
function computeFragileEv(legs: EvPick[], flexType: string, isGoblin: boolean): number {
  const evStructure = isGoblin ? `${flexType}_GOBLIN` : flexType;
  // Scenario 1: trueProb reduced by ~juice+10c effect (roughly −2pp per leg)
  const juiceShiftedProbs = legs.map(l => Math.max(0.01, l.trueProb - 0.02));
  const evJuice = computeLocalEvDP(evStructure, juiceShiftedProbs);

  // Scenario 2: trueProb reduced by line±0.5 effect (roughly −1pp per leg)
  const lineShiftedProbs = legs.map(l => Math.max(0.01, l.trueProb - 0.01));
  const evLine = computeLocalEvDP(evStructure, lineShiftedProbs);

  return Math.min(evJuice, evLine); // worst-case
}

/** Tier1 = premium only if not fragile (fragile cards cap at T2). */
function classifyTier(cardEV: number, kellyFrac: number, fragile: boolean): CardTier {
  if (fragile) {
    if (cardEV >= TIER2_MIN_EV && kellyFrac >= TIER2_MIN_KELLY) return 2;
    return 3;
  }
  if (cardEV >= TIER1_MIN_EV && kellyFrac >= TIER1_MIN_KELLY) return 1;
  if (cardEV >= TIER2_MIN_EV && kellyFrac >= TIER2_MIN_KELLY) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Team-cluster correlation enforcement:
// max 1 leg per (team, stat-group) cluster within a single card.
// Returns EV penalty if violated.
// ---------------------------------------------------------------------------
const CORRELATION_EV_PENALTY = 0.02; // 2pp EV subtracted per violation

function computeClusterPenalty(legs: EvPick[]): { penalty: number; violations: number } {
  const clusterCounts = new Map<string, number>();
  for (const l of legs) {
    const key = `${l.team ?? "UNK"}_${STAT_GROUPS[l.stat] ?? l.stat}`;
    clusterCounts.set(key, (clusterCounts.get(key) ?? 0) + 1);
  }
  let violations = 0;
  for (const cnt of clusterCounts.values()) {
    if (cnt > 1) violations += cnt - 1;
  }
  return { penalty: violations * CORRELATION_EV_PENALTY, violations };
}

// ---------------------------------------------------------------------------
// Build all FlexType candidates for a given leg subset
// ---------------------------------------------------------------------------
const FLEX_CONFIGS: { size: number; type: FlexType }[] = [
  { size: 2, type: "2P" },
  { size: 3, type: "3P" }, { size: 3, type: "3F" },
  { size: 4, type: "4P" }, { size: 4, type: "4F" },
  { size: 5, type: "5P" }, { size: 5, type: "5F" },
  { size: 6, type: "6P" }, { size: 6, type: "6F" },
];

// ---------------------------------------------------------------------------
// Main: buildInnovativeCards
// ---------------------------------------------------------------------------
export interface InnovativeCardBuilderOptions {
  maxCards?:         number;  // default 50
  minCardEV?:        number;  // default 0.01 (1%)
  minAvgLegEV?:      number;  // edge density floor (default = median leg EV)
  maxPlayerCards?:   number;  // portfolio: player ≤ N cards (default 3)
  globalKellyCap?:   number;  // sum of all Kelly fracs ≤ this (default 0.20)
  liveScores?:       Map<string, number>; // legId → optional live liquidity score
  bankroll?:         number;  // $ bankroll for stake calculation (default 1000)
  kellyMultiplier?:  number;  // 0-1, applied to raw Kelly (default 0.5 = half-Kelly)
  maxBetPerCard?:    number;  // absolute cap on kellyStake (default Infinity)
}

export function buildInnovativeCards(
  legs: EvPick[],
  opts: InnovativeCardBuilderOptions = {}
): { cards: InnovativeCard[]; clusters: EdgeClusterReport[] } {
  const {
    maxCards        = TARGET_CARDS,
    minCardEV       = 0.01,
    maxPlayerCards  = MAX_CARDS_PER_PLAYER,
    globalKellyCap  = GLOBAL_KELLY_CAP,
    liveScores,
    bankroll        = 1000,
    kellyMultiplier = 0.5,
    maxBetPerCard   = Infinity,
  } = opts;

  if (liveScores && liveScores.size > 0) {
    console.log(`[Innovative] Using live liquidity scores for ${liveScores.size} legs`);
  }
  console.log(`[Innovative] Bankroll=$${bankroll} | Kelly=${(kellyMultiplier*100).toFixed(0)}% | MaxBet=$${maxBetPerCard === Infinity ? "∞" : maxBetPerCard}`);

  console.log(`[Innovative] Building innovative portfolio from ${legs.length} legs...`);

  const effectiveLegEv = (l: EvPick) => l.adjEv ?? l.legEv;
  const bucketCalibrations = computeBucketCalibrations();
  const useAdjEvForScore = bucketCalibrations.length >= ADJ_EV_MIN_BUCKET_ROWS;
  if (bucketCalibrations.length > 0) {
    console.log(`[Innovative] Calibration: ${bucketCalibrations.length} buckets; useAdjEvForScore=${useAdjEvForScore}`);
  }
  // Compute edge density median (used for edge-density filter)
  const sortedLegEvs = [...legs].map(l => effectiveLegEv(l)).sort((a, b) => a - b);
  const medianLegEV  = sortedLegEvs[Math.floor(sortedLegEvs.length / 2)] ?? 0;
  const minAvgLegEV  = opts.minAvgLegEV ?? medianLegEV;
  console.log(`[Innovative] Leg EV median: ${(medianLegEV * 100).toFixed(2)}% | Edge density floor: ${(minAvgLegEV * 100).toFixed(2)}%`);

  // Detect edge clusters across all legs
  const clusterMap   = detectEdgeClusters(legs);
  const clusterKeyOf = new Map<string, string>(); // legId → clusterKey
  for (const [key, clLegs] of clusterMap) {
    for (const l of clLegs) clusterKeyOf.set(l.id, key);
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Generate candidate cards for every size/flexType combo
  // ---------------------------------------------------------------------------
  const allCandidates: InnovativeCard[] = [];
  let totalCombosConsidered = 0;

  const minEdge = cliArgs.minEdge ?? 0.015;
  const volumeMode = !!cliArgs.volume;
  for (const { size, type } of FLEX_CONFIGS) {
    const poolSize = POOL_SIZE_BY_N[size] ?? 20;
    const structureBE = getBreakevenForStructure(type);
    const pool = [...legs]
      .filter(l => volumeMode
        ? l.trueProb > 0.50
        : l.trueProb >= structureBE + minEdge)
      .filter(l => getSelectionEv(l) >= minAvgLegEV)
      .sort((a, b) => getSelectionEv(b) - getSelectionEv(a))
      .slice(0, poolSize);

    if (pool.length < size) continue;

    let comboCount = 0;

    for (const combo of kCombinations(pool, size)) {
      // Enforce: max 1 leg per player within a single card
      const players = new Set(combo.map(l => l.player));
      if (players.size < combo.length) continue; // duplicate player

      comboCount++;
      totalCombosConsidered++;

      const isGoblin = combo.some((l) => (l.scoringWeight ?? 1) < 1);

      // --- Synchronous EV (goblin cards use goblin payout table) ---
      const { cardEV: rawCardEV, winProbCash, avgProb } = evaluateSyncCard(combo, type, isGoblin);
      if (!Number.isFinite(rawCardEV) || rawCardEV < minCardEV) continue;

      // --- Cluster correlation penalty ---
      const { penalty: clusterPenalty } = computeClusterPenalty(combo);
      const cardEV = rawCardEV - clusterPenalty;
      if (cardEV < minCardEV) continue;

      // --- Diversity / Correlation / Liquidity ---
      const diversity    = scoreDiversity(combo);
      const correlation  = scoreCorrelation(combo);
      const liquidity    = scoreLiquidity(combo, liveScores);

      // correlationScore: 0-100, higher = less correlated (better for humans)
      const correlationScore = Math.round((1 - correlation) * 100);

      const avgLegEV  = combo.reduce((s, l) => s + getSelectionEv(l), 0) / size;
      const avgEdge   = combo.reduce((s, l) => s + l.edge,  0) / size;

      // --- Fragile flag (needed before compositeScore for fragility penalty) ---
      const fragileEvShifted = computeFragileEv(combo, type, isGoblin);
      const fragile = cardEV > 0 && fragileEvShifted < cardEV * 0.5;

      // --- Composite score (SCORING_V2: adjEv when calibration active, fragile penalty, confidence boost) ---
      // avgScoringWeight: geometric mean of per-leg scoringWeight (goblin 0.95, demon 1.05, std 1.0).
      const avgScoringWeight = combo.reduce((s, l) => s * (l.scoringWeight ?? 1.0), 1.0) ** (1 / size);
      const evForScore = useAdjEvForScore ? avgLegEV : cardEV;
      const baseScore = evForScore * diversity * (1 - correlation) * liquidity * avgScoringWeight;
      const confidenceBoost = combo.reduce(
        (s, l) => s + ((l.confidenceDelta ?? 0) > 0 ? (l.confidenceDelta! * CONFIDENCE_DELTA_WEIGHT) : 0),
        0
      );
      let compositeScore = baseScore * (fragile ? FRAGILE_PENALTY : 1) + confidenceBoost;
      // ESPN enrichment: apply worst single penalty at card level (do not stack per leg)
      let espnPenalty = 1;
      for (const l of combo) {
        if (l.espnStatus === "Doubtful") espnPenalty = Math.min(espnPenalty, ESPN_RISKY_PENALTY);
        if (l.espnStatus === "Day-To-Day" || l.espnStatus === "Questionable") espnPenalty = Math.min(espnPenalty, ESPN_CAUTION_PENALTY);
        if ((l.espnMinutes ?? 99) < 20) espnPenalty = Math.min(espnPenalty, ESPN_LOW_MINUTES_PENALTY);
      }
      compositeScore *= espnPenalty;

      // Line movement: apply worst single category across legs (snapshot-based LineMovementResult only; archive-based uses legEv adjustment only)
      const categories = combo
        .map((l) => (l.lineMovement && "category" in l.lineMovement ? l.lineMovement.category : undefined))
        .filter(Boolean);
      let lineMovementMult = 1;
      if (categories.includes("strong_against")) lineMovementMult = LINE_STRONG_AGAINST_PENALTY;
      else if (categories.includes("moderate_against")) lineMovementMult = LINE_MODERATE_AGAINST_PENALTY;
      else if (categories.includes("favorable")) lineMovementMult = LINE_FAVORABLE_BOOST;
      const beforeLine = compositeScore;
      compositeScore *= lineMovementMult;
      if (lineMovementMult !== 1) {
        const targetCat = lineMovementMult === LINE_STRONG_AGAINST_PENALTY ? "strong_against" : lineMovementMult === LINE_MODERATE_AGAINST_PENALTY ? "moderate_against" : "favorable";
        const worstLeg = combo.find((l) => l.lineMovement && "category" in l.lineMovement && l.lineMovement.category === targetCat);
        const cat = worstLeg?.lineMovement && "category" in worstLeg.lineMovement ? worstLeg.lineMovement.category : "";
        const delta = worstLeg?.lineMovement && "delta" in worstLeg.lineMovement ? worstLeg.lineMovement.delta : 0;
        console.log(`[LINE] Card ${combo[0]?.id ?? "?"}: movement=${cat} delta=${delta.toFixed(1)} → compositeScore ${beforeLine.toFixed(4)}→${compositeScore.toFixed(4)}`);
      }

      // --- Kelly fraction + stake (goblin uses goblin payouts) ---
      const kellyFrac = cardKellyFrac(cardEV, winProbCash, type, isGoblin);
      const kellyStake = Math.min(
        maxBetPerCard,
        Math.round(bankroll * kellyFrac * kellyMultiplier * 100) / 100
      );

      // --- Tier classification (Tier1 only for non-fragile cards) ---
      const tier = classifyTier(cardEV, kellyFrac, fragile);

      // --- Stat balance within card ---
      const statBalance = cardStatBalance(combo);

      // --- Edge cluster membership ---
      const clusterKeys = [...new Set(combo.map(l => clusterKeyOf.get(l.id)).filter(Boolean))];
      const edgeCluster = clusterKeys.length > 0 ? clusterKeys[0]! : "";

      allCandidates.push({
        flexType:       type,
        legs:           combo,
        cardEV,
        winProbCash,
        avgProb,
        avgLegEV,
        avgEdge,
        diversity,
        correlation,
        correlationScore,
        liquidity,
        compositeScore,
        kellyFrac,
        kellyStake,
        statBalance,
        edgeCluster,
        legIds:         combo.map(l => l.id),
        portfolioRank:  0,
        tier,
        fragile,
        fragileEvShifted,
      });
    }

    console.log(`[Innovative] ${type}: ${comboCount} combos → ${allCandidates.filter(c => c.flexType === type).length} candidates (EV ≥ ${(minCardEV*100).toFixed(0)}%)`);
  }

  console.log(`[Innovative] Total combos evaluated: ${totalCombosConsidered} → ${allCandidates.length} candidate cards`);

  // ---------------------------------------------------------------------------
  // Phase 2: Sort candidates by composite score
  // ---------------------------------------------------------------------------
  allCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

  // ---------------------------------------------------------------------------
  // Phase 3: Greedy portfolio selection with caps
  // ---------------------------------------------------------------------------
  const selected: InnovativeCard[] = [];
  const playerCardCount   = new Map<string, number>();
  const statCardCount     = new Map<string, number>();
  let   globalKellyUsed   = 0;
  let   portfolioRank     = 1;

  // Stat share caps (absolute count based on maxCards)
  const maxCardsForStat = (stat: string): number => {
    const cap = STAT_SHARE_CAP[stat];
    if (cap) return Math.ceil(maxCards * cap);
    return Math.ceil(maxCards * 0.20); // default 20% for unlisted stats
  };

  for (const card of allCandidates) {
    if (selected.length >= maxCards) break;

    // Player cap: no player in > maxPlayerCards cards
    const playerViolation = card.legs.some(
      l => (playerCardCount.get(l.player) ?? 0) >= maxPlayerCards
    );
    if (playerViolation) continue;

    // Stat portfolio cap: no stat category exceeds its share limit
    const statViolation = Object.keys(card.statBalance).some(label => {
      // Find the canonical stat key for cap lookup
      const statKey = Object.entries(STAT_GROUPS).find(([, v]) => v === label)?.[0] ?? label;
      const curCount = statCardCount.get(label) ?? 0;
      return curCount >= maxCardsForStat(statKey);
    });
    if (statViolation) continue;

    // Global Kelly cap
    if (globalKellyUsed + card.kellyFrac > globalKellyCap + 0.02) continue; // 2% tolerance

    // Accept card
    card.portfolioRank = portfolioRank++;
    selected.push(card);

    // Update tracking
    for (const l of card.legs) {
      playerCardCount.set(l.player, (playerCardCount.get(l.player) ?? 0) + 1);
    }
    for (const [label, cnt] of Object.entries(card.statBalance)) {
      statCardCount.set(label, (statCardCount.get(label) ?? 0) + cnt);
    }
    globalKellyUsed += card.kellyFrac;
  }

  const tier1 = selected.filter(c => c.tier === 1);
  const tier2 = selected.filter(c => c.tier === 2);
  const tier3 = selected.filter(c => c.tier === 3);
  const fragileCount = selected.filter(c => c.fragile).length;
  const totalStake = selected.reduce((s, c) => s + c.kellyStake, 0);

  for (const card of selected) {
    if (card.tier === 1 && card.fragile) {
      console.warn(
        `[TIER] fragile card promoted to T1: ${card.legIds[0] ?? "unknown"} compositeScore=${card.compositeScore.toFixed(6)} fragileEvShifted=${card.fragileEvShifted.toFixed(6)}`
      );
    }
  }

  console.log(`[Innovative] Portfolio: ${selected.length} cards | Kelly: ${(globalKellyUsed*100).toFixed(1)}% | Stake: $${totalStake.toFixed(0)}`);
  console.log(`[Innovative] Tiers: T1=${tier1.length} T2=${tier2.length} T3=${tier3.length} | Fragile: ${fragileCount}`);

  // ---------------------------------------------------------------------------
  // Phase 4: Edge cluster reports
  // ---------------------------------------------------------------------------
  const clusters = buildClusterReport(clusterMap, legs);

  // Log top 20 cards
  logTop20Cards(selected);

  return { cards: selected, clusters };
}

// ---------------------------------------------------------------------------
// Edge cluster report type and builder
// ---------------------------------------------------------------------------
export interface EdgeClusterReport {
  key:        string;  // e.g. "ORL_AST"
  team:       string;
  stat:       string;
  legCount:   number;
  avgEdge:    number;
  avgLegEV:   number;
  playerList: string;
}

function buildClusterReport(
  clusterMap: Map<string, EvPick[]>,
  _allLegs: EvPick[]
): EdgeClusterReport[] {
  const reports: EdgeClusterReport[] = [];
  for (const [key, legs] of clusterMap) {
    const [team, stat] = key.split("_");
    reports.push({
      key,
      team:       team ?? "",
      stat:       stat ?? "",
      legCount:   legs.length,
      avgEdge:    legs.reduce((s, l) => s + l.edge,  0) / legs.length,
      avgLegEV:   legs.reduce((s, l) => s + getSelectionEv(l), 0) / legs.length,
      playerList: legs.map(l => l.player).join(", "),
    });
  }
  return reports.sort((a, b) => b.avgEdge - a.avgEdge);
}

// ---------------------------------------------------------------------------
// Console logging of top 20 cards for quick sanity check
// ---------------------------------------------------------------------------
function logTop20Cards(cards: InnovativeCard[]): void {
  console.log("\n[Innovative] ── Top 20 Cards ──────────────────────────────────────");
  console.log(
    ["#", "Tier", "Type", "EV%", "Stake", "Corr", "Frag", "Comp%", "Players"].map(h => h.padEnd(8)).join("")
  );
  for (const c of cards.slice(0, 20)) {
    const players = c.legs.map(l => `${l.player.split(" ").pop()} ${l.stat[0].toUpperCase()}`).join("/");
    const tierLabel = c.tier === 1 ? "T1" : c.tier === 2 ? "T2" : "T3";
    console.log(
      [
        `${c.portfolioRank}`,
        tierLabel,
        c.flexType,
        `${(c.cardEV * 100).toFixed(1)}`,
        `$${c.kellyStake}`,
        `${c.correlationScore}`,
        c.fragile ? "!" : "-",
        `${(c.compositeScore * 100).toFixed(1)}`,
        players,
      ].map(v => String(v).padEnd(8)).join("")
    );
  }
  console.log("────────────────────────────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// CSV writer for innovative cards
// ---------------------------------------------------------------------------
function buildCsvRows(cards: InnovativeCard[], site: string, runTimestamp: string): string[] {
  const headers = [
    "portfolioRank", "tier", "site", "flexType", "cardEV", "compositeScore",
    "correlationScore", "diversity", "correlation", "liquidity",
    "kellyFrac", "kellyStake", "fragile", "fragileEvShifted",
    "winProbCash", "avgProb", "avgLegEV", "avgEdge", "breakevenGap",
    "statBalance", "edgeCluster",
    "leg1Id", "leg2Id", "leg3Id", "leg4Id", "leg5Id", "leg6Id",
    "runTimestamp",
  ];
  const rows: string[] = [headers.join(",")];
  for (const c of cards) {
    const legIds = c.legIds;
    const statBal = Object.entries(c.statBalance).map(([k, v]) => `${k}=${v}`).join("|");
    const breakevenGap = c.avgProb - getBreakevenThreshold(c.flexType);
    const row = [
      c.portfolioRank, c.tier, site, c.flexType,
      c.cardEV.toFixed(6), c.compositeScore.toFixed(6),
      c.correlationScore, c.diversity.toFixed(4), c.correlation.toFixed(4), c.liquidity.toFixed(4),
      c.kellyFrac.toFixed(6), c.kellyStake.toFixed(2),
      c.fragile ? "Y" : "N", c.fragileEvShifted.toFixed(6),
      c.winProbCash.toFixed(6), c.avgProb.toFixed(6), c.avgLegEV.toFixed(6), c.avgEdge.toFixed(6),
      breakevenGap.toFixed(6),
      `"${statBal}"`, c.edgeCluster,
      legIds[0] ?? "", legIds[1] ?? "", legIds[2] ?? "",
      legIds[3] ?? "", legIds[4] ?? "", legIds[5] ?? "",
      runTimestamp,
    ];
    rows.push(row.map(v => {
      const s = String(v ?? "");
      return s.startsWith('"') ? s : (s.includes(",") ? `"${s}"` : s);
    }).join(","));
  }
  return rows;
}

export function writeInnovativeCardsCsv(
  cards: InnovativeCard[],
  clusters: EdgeClusterReport[],
  outPath: string,
  clustersPath: string,
  runTimestamp: string,
  site: "PP" | "UD" = "PP"
): void {
  const rows = buildCsvRows(cards, site, runTimestamp);

  const fs = require("fs") as typeof import("fs");
  fs.writeFileSync(outPath, rows.join("\n"), "utf8");
  console.log(`[Innovative] Wrote ${cards.length} innovative cards to ${outPath}`);

  // Write edge clusters JSON
  const clusterData = {
    runTimestamp,
    clusterCount: clusters.length,
    clusters: clusters.map(c => ({
      ...c,
      avgEdge:  Number(c.avgEdge.toFixed(4)),
      avgLegEV: Number(c.avgLegEV.toFixed(4)),
    })),
  };
  fs.writeFileSync(clustersPath, JSON.stringify(clusterData, null, 2), "utf8");
  console.log(`[Innovative] Wrote ${clusters.length} edge clusters to ${clustersPath}`);

  // Print cluster summary
  console.log("\n[Innovative] ── Edge Clusters (2+ picks, same team+stat) ──────────");
  for (const cl of clusters.slice(0, 10)) {
    console.log(`  ${cl.key.padEnd(20)} ${cl.legCount} picks | avgEdge=${(cl.avgEdge*100).toFixed(1)}% | avgEV=${(cl.avgLegEV*100).toFixed(1)}% | ${cl.playerList}`);
  }
  console.log("─────────────────────────────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Tiered CSV writer — outputs tier1.csv and tier2.csv
// ---------------------------------------------------------------------------
export function writeTieredCsvs(
  cards: InnovativeCard[],
  dir: string,
  runTimestamp: string,
  site: "PP" | "UD" = "PP"
): { tier1Count: number; tier2Count: number } {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");

  const tier1 = cards.filter(c => c.tier === 1);
  const tier2 = cards.filter(c => c.tier <= 2); // T1+T2

  const tier1Path = path.join(dir, "tier1.csv");
  if (tier1.length > 0) {
    const rows = buildCsvRows(tier1, site, runTimestamp);
    fs.writeFileSync(tier1Path, rows.join("\n"), "utf8");
    console.log(`[Innovative] Wrote ${tier1.length} Tier-1 cards → tier1.csv`);
  } else {
    const headerRow = "portfolioRank,tier,site,flexType,cardEV,compositeScore,correlationScore,diversity,correlation,liquidity,kellyFrac,kellyStake,fragile,fragileEvShifted,winProbCash,avgProb,avgLegEV,avgEdge,breakevenGap,statBalance,edgeCluster,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp";
    fs.writeFileSync(tier1Path, headerRow + "\n", "utf8");
    console.log(`[Innovative] No Tier-1 cards (need EV≥${(TIER1_MIN_EV*100).toFixed(0)}% + Kelly≥${(TIER1_MIN_KELLY*100).toFixed(1)}% + non-fragile) → tier1.csv header only`);
  }

  if (tier2.length > 0) {
    const rows = buildCsvRows(tier2, site, runTimestamp);
    fs.writeFileSync(path.join(dir, "tier2.csv"), rows.join("\n"), "utf8");
    console.log(`[Innovative] Wrote ${tier2.length} Tier-1+2 cards → tier2.csv`);
  } else {
    console.log(`[Innovative] No Tier-2 cards (need EV≥${(TIER2_MIN_EV*100).toFixed(0)}% + Kelly≥${(TIER2_MIN_KELLY*100).toFixed(1)}%)`);
  }

  return { tier1Count: tier1.length, tier2Count: tier2.length };
}
