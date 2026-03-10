// src/kelly_staking.ts
// All math delegated to math_models/kelly_staking (locked-down canonical source)

export {
  SPORT_KELLY_FRACTIONS,
  CONSERVATIVE_KELLY_DIVISOR,
  MAX_STAKE_PER_CARD,
  MAX_BANKROLL_PCT_PER_CARD,
  MIN_STAKE,
  calculateKellyStake,
  getKellyFraction,
} from '../math_models/kelly_staking';
