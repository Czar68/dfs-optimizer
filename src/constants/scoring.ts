/**
 * Scoring constants for card compositeScore and tier behaviour.
 *
 * AUDIT (2026-03-14) — Scoring signal flow:
 *   A. scoringWeight   — Reaches compositeScore: legEv = edge * sw in calculate_ev.ts;
 *                       avgScoringWeight (geometric mean of leg scoringWeight) is multiplied
 *                       into compositeScore in build_innovative_cards. No drop-off.
 *   B. adjEv          — Used for pool filter/sort/avgLegEV via effectiveLegEv(l).
 *                       cardEV in compositeScore comes from DP(trueProb), not adjEv.
 *                       Drop-off: adjEv never used as the EV factor in compositeScore.
 *   C. confidenceDelta — Not used as scoring modifier (PP col 19 / col W output only).
 *   D. fragile        — classifyTier caps fragile at T2; no compositeScore multiplier.
 *   E. cardEV formula — cardEV = computeLocalEvDP(flexType, leg.trueProb[]) - clusterPenalty.
 *                       No avg(legEv); no weights in cardEV itself.
 *
 * RECOMMENDED FORMULA (SCORING_V2):
 *   useAdjEvForScore = (calibration bucket count >= ADJ_EV_MIN_BUCKET_ROWS);
 *   evForScore = useAdjEvForScore ? mean(adjEv ?? legEv over legs) : cardEV;
 *   baseScore = evForScore * diversity * (1 - correlation) * liquidity * avgScoringWeight;
 *   compositeScore = baseScore * (fragile ? FRAGILE_PENALTY : 1)
 *                    + sum(leg.confidenceDelta > 0 ? leg.confidenceDelta * CONFIDENCE_DELTA_WEIGHT : 0);
 *   (Tier1/Tier2 count and kelly unchanged; only sort key updated.)
 */

export const FRAGILE_PENALTY = 0.92;
export const CONFIDENCE_DELTA_WEIGHT = 0.005;
/** Use adjEv as the EV factor in compositeScore only when calibration has at least this many bucket rows. */
export const ADJ_EV_MIN_BUCKET_ROWS = 5;

/** ESPN enrichment: compositeScore multiplier when status is Doubtful. */
export const ESPN_RISKY_PENALTY = 0.88;
/** ESPN enrichment: compositeScore multiplier when status is Day-To-Day or Questionable. */
export const ESPN_CAUTION_PENALTY = 0.96;
/** ESPN enrichment: compositeScore multiplier when avg last-5 minutes < 20. */
export const ESPN_LOW_MINUTES_PENALTY = 0.94;

/** Line movement: compositeScore multiplier when line moved ≥ 2.0 against our pick (STRONG_AGAINST). */
export const LINE_STRONG_AGAINST_PENALTY = 0.8;
/** Line movement: compositeScore multiplier when line moved 1.0–1.9 against our pick (MODERATE_AGAINST). */
export const LINE_MODERATE_AGAINST_PENALTY = 0.92;
/** Line movement: compositeScore multiplier when line moved ≥ 1.0 in our favor (FAVORABLE). */
export const LINE_FAVORABLE_BOOST = 1.06;
/** Line movement: points threshold for STRONG_AGAINST (block when BLOCK_ENABLED). */
export const LINE_MOVEMENT_BLOCK_THRESHOLD = 2.0;
/** Line movement: points threshold for FAVORABLE and MODERATE_AGAINST boundary. */
export const LINE_MOVEMENT_FAVORABLE_THRESHOLD = 1.0;
/** Line movement: retain snapshots for this many days; prune older. */
export const LINE_MOVEMENT_MAX_SNAPSHOT_AGE_DAYS = 7;
