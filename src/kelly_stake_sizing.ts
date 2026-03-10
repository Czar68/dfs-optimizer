// src/kelly_stake_sizing.ts
// Core math delegated to math_models/kelly_stake_sizing (locked-down canonical source)

export type {
  StakeSizingInput,
  StakeSizingOutput,
  BankrollConfig,
  PortfolioAllocation,
} from '../math_models/kelly_stake_sizing';

export {
  DEFAULT_BANKROLL_CONFIG,
  computeStake,
  computePortfolioAllocation,
} from '../math_models/kelly_stake_sizing';

import type { BankrollConfig, PortfolioAllocation } from '../math_models/kelly_stake_sizing';
import type { StakeSizingInput } from '../math_models/kelly_stake_sizing';
import { DEFAULT_BANKROLL_CONFIG } from '../math_models/kelly_stake_sizing';

export function updateBankrollConfig(newBankroll: number): BankrollConfig {
  return {
    ...DEFAULT_BANKROLL_CONFIG,
    currentBankroll: newBankroll,
  };
}

export function validateStakeInput(input: StakeSizingInput): string[] {
  const errors: string[] = [];
  if (input.cardEv <= 0) errors.push('Card EV must be positive');
  if (input.winProb <= 0 || input.winProb > 1) errors.push('Win probability must be between 0 and 1');
  if (input.kellyFraction <= 0) errors.push('Kelly fraction must be positive');
  if (input.bankroll <= 0) errors.push('Bankroll must be positive');
  if (input.maxKellyMultiplier <= 0 || input.maxKellyMultiplier > 1) errors.push('Max Kelly multiplier must be between 0 and 1');
  return errors;
}

export function getRiskAssessmentSummary(
  portfolio: PortfolioAllocation,
  config: BankrollConfig
): string {
  const riskLevel = portfolio.riskPercentage;
  let assessment = '';
  if (riskLevel > 0.15) assessment = 'VERY HIGH RISK - Consider reducing position sizes';
  else if (riskLevel > 0.10) assessment = 'HIGH RISK - Monitor closely';
  else if (riskLevel > 0.05) assessment = 'MODERATE RISK - Within acceptable range';
  else assessment = 'LOW RISK - Conservative allocation';
  if (portfolio.scalingApplied) assessment += ' | Scaled to meet risk cap';
  if (portfolio.droppedCards.length > 0) assessment += ` | Dropped ${portfolio.droppedCards.length} low-stake positions`;
  return assessment;
}

export function exportStakeData(
  cards: any[],
  singles: any[]
): {
  timestamp: string;
  bankroll: number;
  totalStake: number;
  riskPercentage: number;
  cards: any[];
  singles: any[];
} {
  const totalStake = cards.reduce((sum, card) => sum + (card.recommendedStake || 0), 0) +
                     singles.reduce((sum, single) => sum + (single.recommendedStake || 0), 0);
  return {
    timestamp: new Date().toISOString(),
    bankroll: DEFAULT_BANKROLL_CONFIG.currentBankroll,
    totalStake,
    riskPercentage: totalStake / DEFAULT_BANKROLL_CONFIG.currentBankroll,
    cards: cards.map(card => ({
      id: card.id, site: card.site, sport: card.sport, structure: card.flexType,
      ev: card.cardEv, recommendedStake: card.recommendedStake,
      riskAdjustment: card.riskAdjustment, kellyPercentage: card.kellyPercentage,
    })),
    singles: singles.map(single => ({
      id: single.marketId, sport: single.sport, book: single.book, market: single.marketId,
      side: single.side, edge: single.edgePct, recommendedStake: single.recommendedStake,
      riskAdjustment: single.riskAdjustment, kellyPercentage: single.kellyPercentage,
    })),
  };
}
