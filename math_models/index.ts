/**
 * math_models/index.ts
 * Explicit re-exports to avoid TS2308 (duplicate exported names). Do not use export *.
 */

export type { CardHitDistribution, FlexPayout } from './card_ev_distribution';
export { computeCardEvFromDistribution } from './card_ev_distribution';

export {
  binom,
  binomPmf,
  computeHitDistributionDP,
  computeHitDistributionRecord,
  computePrizePicksHitDistributionIid,
} from './hit_distribution_dp';

export { computeLocalEv, computeLocalEvDP } from './ev_dp_prizepicks';

export type { CardLegInput } from './card_ev_underdog';
export {
  computeCardEvFromPayouts,
  computeLegFactorProduct,
  scalePayouts,
  computeHitDistribution,
} from './card_ev_underdog';

export type { KellyConfig, KellyResult } from './kelly_mean_variance';
export { DEFAULT_KELLY_CONFIG, computeKellyForCard, computePrizePicksHitDistribution } from './kelly_mean_variance';

export {
  SPORT_KELLY_FRACTIONS,
  CONSERVATIVE_KELLY_DIVISOR,
  MAX_STAKE_PER_CARD,
  MAX_BANKROLL_PCT_PER_CARD,
  MIN_STAKE,
  calculateKellyStake,
  getKellyFraction,
} from './kelly_staking';

export type { StakeSizingInput, StakeSizingOutput, BankrollConfig, PortfolioAllocation } from './kelly_stake_sizing';
export { DEFAULT_BANKROLL_CONFIG, computeStake, computePortfolioAllocation } from './kelly_stake_sizing';

export {
  binom as binomBreakeven,
  binomPmf as binomPmfBreakeven,
  expectedReturnBinomial,
  solveBreakevenProbability,
  probToAmerican,
} from './breakeven_binomial';

export { computeWinProbs } from './win_probabilities';

export type { Leg } from './ev_parlay';
export { ev, parlayOdds, kellyStake, MIN_EV_DECIMAL, MAX_PARLAY_LEGS, evFilter } from './ev_parlay';

export {
  americanToDecimal,
  decimalToAmerican,
  calculateImpliedProbability,
  calculateFairOdds,
  calculateSingleBetEV,
  calculateKellyFraction,
} from './single_bet_ev';

export { trueBeFromOdds, fairBeFromTwoWayOdds, structureBreakeven, juiceAwareLegEv } from './juice_adjust';

export type { RegistryEntry } from './registry';
export { getRegistryEntry, getPayoutByHitsFromRegistry, getAllRegistryStructureIds } from './registry';

export type { HitDistribution } from './card_ev_from_registry';
export { cardEvFromRegistry, winProbsFromRegistry } from './card_ev_from_registry';

export { getBreakevenThreshold } from './breakeven_from_registry';

export type { Platform, StructureKind, OptimalCardSizeResult } from './optimal_card_size';
export { getOptimalCardSize } from './optimal_card_size';
