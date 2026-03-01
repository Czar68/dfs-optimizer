// src/portfolio_selector.ts
// Greedy portfolio selection with efficiency scoring and risk constraints

import { CardEvResult } from "./types";

export interface PortfolioConstraints {
  dailyRiskBudget: number;        // e.g., 0.08 (8% of bankroll)
  maxCardsPerPlayer: number;      // e.g., 3
  maxCardsPerGame: number;         // e.g., 5  
  maxCardsPerTeam: number;         // e.g., 4
  minCardEv: number;               // e.g., 0.03 (3% minimum EV)
  minKellyFraction: number;        // e.g., 0.001 (0.1% minimum Kelly)
  efficiencyEpsilon: number;       // Small value to avoid division by zero
}

export interface PortfolioResult {
  selectedCards: CardEvResult[];
  rejectedCards: RejectedCard[];
  totals: PortfolioTotals;
  constraintsHit: ConstraintHit[];
}

export interface RejectedCard {
  card: CardEvResult;
  reason: string;
  step: number; // Order in which it was considered
}

export interface PortfolioTotals {
  selectedCount: number;
  totalKellyFraction: number;
  totalStake: number;
  totalExpectedProfit: number;
  riskBudgetUsed: number; // percentage of budget used
}

export interface ConstraintHit {
  type: 'PLAYER' | 'GAME' | 'TEAM' | 'RISK_BUDGET' | 'MIN_EV' | 'MIN_KELLY';
  entityId: string; // player name, game key, team name, or 'budget'
  currentCount: number;
  limit: number;
}

export const DEFAULT_PORTFOLIO_CONSTRAINTS: PortfolioConstraints = {
  dailyRiskBudget: 0.08,          // 8% of bankroll
  maxCardsPerPlayer: 3,
  maxCardsPerGame: 5,
  maxCardsPerTeam: 4,
  minCardEv: 0.03,                // 3% minimum EV
  minKellyFraction: 0.001,        // 0.1% minimum Kelly
  efficiencyEpsilon: 0.0001,       // 0.01% to avoid division by zero
};

/**
 * Select optimal card portfolio using greedy efficiency scoring
 * 
 * Algorithm:
 * 1. Filter eligible cards (EV ≥ min, Kelly > 0)
 * 2. Compute efficiency score = cardEv / (kellyFraction_capped + epsilon)
 * 3. Sort by efficiency desc, then EV desc, then winProb desc
 * 4. Greedily add cards respecting all constraints
 * 5. Stop when budget exhausted or no more eligible cards
 */
export function selectCardPortfolio(
  cards: CardEvResult[],
  constraints: PortfolioConstraints = DEFAULT_PORTFOLIO_CONSTRAINTS
): PortfolioResult {
  
  // Step 1: Filter eligible cards
  const eligibleCards = cards.filter(card => {
    if (!card.kellyResult) return false;
    if (card.cardEv < constraints.minCardEv) return false;
    if (card.kellyResult.finalKellyFraction < constraints.minKellyFraction) return false;
    return true;
  });

  console.log(`📊 Portfolio selector input: ${cards.length} cards`);
  console.log(`   Eligible after EV/Kelly filters: ${eligibleCards.length} cards`);
  
  // Count cards filtered out by each reason
  const evFiltered = cards.filter(card => card.cardEv < constraints.minCardEv).length;
  const kellyFiltered = cards.filter(card => !card.kellyResult || card.kellyResult.finalKellyFraction < constraints.minKellyFraction).length;
  console.log(`   Filtered by EV < ${(constraints.minCardEv * 100).toFixed(1)}%: ${evFiltered} cards`);
  console.log(`   Filtered by Kelly ≤ ${(constraints.minKellyFraction * 100).toFixed(1)}%: ${kellyFiltered} cards`);

  // Step 2: Compute efficiency scores
  const cardsWithScore = eligibleCards.map(card => {
    const kellyCapped = card.kellyResult!.cappedKellyFraction;
    const efficiency = card.cardEv / (kellyCapped + constraints.efficiencyEpsilon);
    
    return {
      card,
      efficiency,
      // Tie-breakers will be handled in sort
      ev: card.cardEv,
      winProb: card.winProbability,
    };
  });

  // Step 3: Sort by efficiency desc, then EV desc, then winProb desc
  cardsWithScore.sort((a, b) => {
    // Primary: efficiency score
    if (Math.abs(a.efficiency - b.efficiency) > 1e-6) {
      return b.efficiency - a.efficiency;
    }
    // Secondary: EV
    if (Math.abs(a.ev - b.ev) > 1e-6) {
      return b.ev - a.ev;
    }
    // Tertiary: win probability
    return b.winProb - a.winProb;
  });

  // Step 4: Greedy selection with constraints
  const selectedCards: CardEvResult[] = [];
  const rejectedCards: RejectedCard[] = [];
  const constraintsHit: ConstraintHit[] = [];
  
  // Track constraint usage
  const playerCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();
  let totalKellyFraction = 0;

  // Count rejections by reason
  const rejectionReasons = new Map<string, number>();

  for (let i = 0; i < cardsWithScore.length; i++) {
    const { card } = cardsWithScore[i];
    const kellyFraction = card.kellyResult!.finalKellyFraction;

    // Check if adding this card would exceed daily risk budget
    if (totalKellyFraction + kellyFraction > constraints.dailyRiskBudget) {
      rejectedCards.push({
        card,
        reason: 'RISK_BUDGET',
        step: i + 1,
      });
      rejectionReasons.set('RISK_BUDGET', (rejectionReasons.get('RISK_BUDGET') || 0) + 1);
      
      if (!constraintsHit.find(h => h.type === 'RISK_BUDGET')) {
        constraintsHit.push({
          type: 'RISK_BUDGET',
          entityId: 'budget',
          currentCount: totalKellyFraction + kellyFraction,
          limit: constraints.dailyRiskBudget,
        });
      }
      continue;
    }

    // Check player constraints
    let playerViolation = false;
    for (const leg of card.legs) {
      const player = leg.pick.player;
      const count = playerCounts.get(player) || 0;
      if (count + 1 > constraints.maxCardsPerPlayer) {
        rejectedCards.push({
          card,
          reason: 'PLAYER',
          step: i + 1,
        });
        rejectionReasons.set('PLAYER', (rejectionReasons.get('PLAYER') || 0) + 1);
        playerViolation = true;
        
        if (!constraintsHit.find(h => h.type === 'PLAYER' && h.entityId === player)) {
          constraintsHit.push({
            type: 'PLAYER',
            entityId: player,
            currentCount: count + 1,
            limit: constraints.maxCardsPerPlayer,
          });
        }
        break;
      }
    }
    if (playerViolation) continue;

    // Check game constraints
    let gameViolation = false;
    for (const leg of card.legs) {
      const gameKey = getGameKey(leg.pick);
      const count = gameCounts.get(gameKey) || 0;
      if (count + 1 > constraints.maxCardsPerGame) {
        rejectedCards.push({
          card,
          reason: 'GAME',
          step: i + 1,
        });
        rejectionReasons.set('GAME', (rejectionReasons.get('GAME') || 0) + 1);
        gameViolation = true;
        
        if (!constraintsHit.find(h => h.type === 'GAME' && h.entityId === gameKey)) {
          constraintsHit.push({
            type: 'GAME',
            entityId: gameKey,
            currentCount: count + 1,
            limit: constraints.maxCardsPerGame,
          });
        }
        break;
      }
    }
    if (gameViolation) continue;

    // Check team constraints
    let teamViolation = false;
    for (const leg of card.legs) {
      const team = leg.pick.team;
      if (!team) continue;
      const count = teamCounts.get(team) || 0;
      if (count + 1 > constraints.maxCardsPerTeam) {
        rejectedCards.push({
          card,
          reason: 'TEAM',
          step: i + 1,
        });
        rejectionReasons.set('TEAM', (rejectionReasons.get('TEAM') || 0) + 1);
        teamViolation = true;
        
        if (!constraintsHit.find(h => h.type === 'TEAM' && h.entityId === team)) {
          constraintsHit.push({
            type: 'TEAM',
            entityId: team,
            currentCount: count + 1,
            limit: constraints.maxCardsPerTeam,
          });
        }
        break;
      }
    }
    if (teamViolation) continue;

    // All constraints passed - add this card
    selectedCards.push(card);
    totalKellyFraction += kellyFraction;

    // Update constraint counters
    for (const leg of card.legs) {
      const player = leg.pick.player;
      playerCounts.set(player, (playerCounts.get(player) || 0) + 1);
      
      const gameKey = getGameKey(leg.pick);
      gameCounts.set(gameKey, (gameCounts.get(gameKey) || 0) + 1);
      
      const team = leg.pick.team;
      if (team) {
        teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
      }
    }
  }

  // Calculate totals
  const totals: PortfolioTotals = {
    selectedCount: selectedCards.length,
    totalKellyFraction,
    totalStake: selectedCards.reduce((sum, card) => sum + (card.kellyResult?.recommendedStake || 0), 0),
    totalExpectedProfit: selectedCards.reduce((sum, card) => sum + (card.kellyResult?.expectedProfit || 0), 0),
    riskBudgetUsed: totalKellyFraction / constraints.dailyRiskBudget,
  };

  // Debug summary
  console.log(`🎯 Portfolio selection complete:`);
  console.log(`   Selected: ${selectedCards.length} cards`);
  console.log(`   Total Kelly fraction: ${(totals.totalKellyFraction * 100).toFixed(2)}%`);
  console.log(`   Total stake: $${totals.totalStake.toFixed(2)}`);
  console.log(`   Expected profit: $${totals.totalExpectedProfit.toFixed(2)}`);
  console.log(`   Budget used: ${(totals.riskBudgetUsed * 100).toFixed(1)}%`);
  
  if (rejectionReasons.size > 0) {
    console.log(`   Rejections by reason:`);
    for (const [reason, count] of rejectionReasons) {
      console.log(`     ${reason}: ${count} cards`);
    }
  }

  return {
    selectedCards,
    rejectedCards,
    totals,
    constraintsHit,
  };
}

/**
 * Generate a unique game key for constraint tracking
 * Format: "TeamA_vs_TeamB" (sorted for consistency)
 */
function getGameKey(pick: { team?: string | null; opponent?: string | null }): string {
  const team = pick.team || "";
  const opponent = pick.opponent || "";
  
  // Sort to ensure "Lakers_vs_Celtics" and "Celtics_vs_Lakers" are the same
  const [team1, team2] = [team, opponent].sort();
  return `${team1}_vs_${team2}`;
}

/**
 * Add portfolio selection metadata to cards
 * This should be called after portfolio selection to mark cards
 */
export function markCardsWithPortfolio(
  allCards: CardEvResult[],
  portfolioResult: PortfolioResult
): CardEvResult[] {
  const selectedSet = new Set(portfolioResult.selectedCards);
  
  return allCards.map((card, index) => {
    const isSelected = selectedSet.has(card);
    const portfolioRank = isSelected ? 
      portfolioResult.selectedCards.indexOf(card) + 1 : 
      undefined;
    
    return {
      ...card,
      // Add portfolio metadata as new properties
      selected: isSelected,
      portfolioRank,
      efficiencyScore: isSelected ? 
        card.cardEv / (card.kellyResult?.cappedKellyFraction! + DEFAULT_PORTFOLIO_CONSTRAINTS.efficiencyEpsilon) :
        undefined,
    };
  });
}
