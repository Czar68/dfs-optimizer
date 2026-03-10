// src/kelly_mean_variance.ts
// All math delegated to math_models/kelly_mean_variance (locked-down canonical source)

export type { KellyConfig, KellyResult } from '../math_models/kelly_mean_variance';
export {
  DEFAULT_KELLY_CONFIG,
  computeKellyForCard,
  computePrizePicksHitDistribution,
} from '../math_models/kelly_mean_variance';
