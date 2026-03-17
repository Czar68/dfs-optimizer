/**
 * math_models/kelly_staking.ts
 * Kelly stake constants and calculateKellyStake pipeline.
 * EXTRACTED FROM: src/kelly_staking.ts — do not change formulas without peer-review.
 */
import type { Sport } from '../src/types';
export declare const SPORT_KELLY_FRACTIONS: Record<Sport, number>;
export declare const CONSERVATIVE_KELLY_DIVISOR = 1.5;
export declare const MAX_STAKE_PER_CARD = 25;
export declare const MAX_BANKROLL_PCT_PER_CARD = 0.035;
export declare const MIN_STAKE = 1;
/**
 * Pipeline: bankroll × sportFrac × cardEv → /1.5 → clamp(min, min(maxDollar, bankroll×3.5%))
 */
export declare function calculateKellyStake(cardEv: number, bankroll: number | undefined, sport: Sport): number;
export declare function getKellyFraction(sport: Sport): number;
