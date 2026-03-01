// src/correlation_filters.ts
// Correlation and structure constraints engine for reducing redundancy and improving card quality

import { CardEvResult, EvPick, Sport, FlexType } from './types';

export interface CorrelationFilterConfig {
  maxPlayersPerTeam: Record<string, number>;
  allowSamePlayerOpposites: boolean;
  correlationThreshold: number; // min combined EV for correlated pairs
  structureTeamLimits: Record<string, Record<string, number>>; // per-structure team limits
}

export interface CorrelationFilterResult {
  filteredCards: CardEvResult[];
  removalReasons: Record<string, number>;
  originalCount: number;
  finalCount: number;
  removalStats: {
    samePlayerConflicts: number;
    teamConcentrationAdjustments: number;
    correlationConflicts: number;
    structureViolations: number;
  };
}

// Default configuration with conservative limits
export const DEFAULT_CORRELATION_CONFIG: CorrelationFilterConfig = {
  maxPlayersPerTeam: {
    'NBA': 3,
    'NFL': 3,
    'MLB': 3,
    'NHL': 2,
    'NCAAB': 3,
    'NCAAF': 3,
  },
  allowSamePlayerOpposites: false, // Never allow over/under on same player
  correlationThreshold: 0.10, // 10% combined EV minimum for correlated pairs
  structureTeamLimits: {
    '2P': { 'NBA': 2, 'NFL': 2, 'MLB': 2, 'NHL': 1, 'NCAAB': 2, 'NCAAF': 2 },
    '3P': { 'NBA': 2, 'NFL': 2, 'MLB': 2, 'NHL': 1, 'NCAAB': 2, 'NCAAF': 2 },
    '3F': { 'NBA': 2, 'NFL': 2, 'MLB': 2, 'NHL': 1, 'NCAAB': 2, 'NCAAF': 2 },
    '4P': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
    '4F': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
    '5P': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
    '5F': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
    '6P': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
    '6F': { 'NBA': 3, 'NFL': 3, 'MLB': 3, 'NHL': 2, 'NCAAB': 3, 'NCAAF': 3 },
  },
};

/**
 * Apply correlation and structure constraints to filter cards
 */
export function applyCorrelationFilters(
  cards: CardEvResult[],
  config: CorrelationFilterConfig = DEFAULT_CORRELATION_CONFIG
): CorrelationFilterResult {
  
  console.log(`🔍 Applying correlation filters to ${cards.length} cards...`);
  
  const removalReasons: Record<string, number> = {};
  const filteredCards: CardEvResult[] = [];
  
  let samePlayerConflictsCount = 0;
  let teamConcentrationAdjustments = 0;
  let correlationConflicts = 0;
  let structureViolations = 0;

  for (const card of cards) {
    let shouldKeep = true;
    let removalReason = '';

    // Check 1: Same player opposite sides (over/under conflicts)
    if (!config.allowSamePlayerOpposites) {
      const samePlayerConflictsList = findSamePlayerConflicts(card);
      if (samePlayerConflictsList.length > 0) {
        shouldKeep = false;
        removalReason = 'same_player_conflict';
        samePlayerConflictsCount++;
        console.log(`  ❌ Same player conflict: ${samePlayerConflictsList.map(c => `${c.player} ${c.stat} ${c.side}`).join(', ')}`);
      }
    }

    // Check 2: Team concentration limits
    if (shouldKeep) {
      const teamLimit = (config.structureTeamLimits[card.flexType]?.[card.legs[0]?.pick?.sport || 'NBA']) || 
                       (config.maxPlayersPerTeam[card.legs[0]?.pick?.sport || 'NBA']);
      const teamCounts = getTeamCounts(card);
      const maxTeamCount = Math.max(...Object.values(teamCounts));
      
      if (maxTeamCount > teamLimit) {
        shouldKeep = false;
        removalReason = 'team_concentration_exceeded';
        teamConcentrationAdjustments++;
        console.log(`  ❌ Team concentration exceeded: ${JSON.stringify(teamCounts)} > limit ${teamLimit}`);
      }
    }

    // Check 3: Correlated stat pairs (optional advanced filtering)
    if (shouldKeep && config.correlationThreshold > 0) {
      const correlatedPairs = findCorrelatedPairs(card);
      const lowEVCorrelations = correlatedPairs.filter(pair => 
        pair.combinedEV < config.correlationThreshold
      );
      
      if (lowEVCorrelations.length > 0) {
        shouldKeep = false;
        removalReason = 'low_ev_correlation';
        correlationConflicts++;
        console.log(`  ❌ Low EV correlation: ${lowEVCorrelations.map(p => `${p.leg1.stat}+${p.leg2.stat}=${(p.combinedEV * 100).toFixed(1)}%`).join(', ')}`);
      }
    }

    // Check 4: Structure-specific violations
    if (shouldKeep) {
      const structureViolationsFound = checkStructureViolations(card);
      if (structureViolationsFound.length > 0) {
        shouldKeep = false;
        removalReason = 'structure_violation';
        structureViolations++;
        console.log(`  ❌ Structure violations: ${structureViolationsFound.join(', ')}`);
      }
    }

    if (shouldKeep) {
      filteredCards.push(card);
    } else {
      removalReasons[removalReason] = (removalReasons[removalReason] || 0) + 1;
    }
  }

  const result: CorrelationFilterResult = {
    filteredCards,
    removalReasons,
    originalCount: cards.length,
    finalCount: filteredCards.length,
    removalStats: {
      samePlayerConflicts: samePlayerConflictsCount,
      teamConcentrationAdjustments,
      correlationConflicts,
      structureViolations,
    },
  };

  console.log(`✅ Correlation filters complete: ${result.originalCount} → ${result.finalCount} cards`);
  console.log(`   Removed: ${result.originalCount - result.finalCount} cards`);
  console.log(`   Reasons: ${JSON.stringify(result.removalReasons)}`);
  
  return result;
}

/**
 * Find conflicts where same player appears with opposite sides on same stat
 */
function findSamePlayerConflicts(card: CardEvResult): Array<{player: string, stat: string, side: string}> {
  const playerStatSides = new Map<string, Set<string>>();
  
  for (const leg of card.legs) {
    const key = `${leg.pick.player}_${leg.pick.stat}`;
    if (!playerStatSides.has(key)) {
      playerStatSides.set(key, new Set());
    }
    playerStatSides.get(key)!.add(leg.side);
  }
  
  const conflicts: Array<{player: string, stat: string, side: string}> = [];
  
  for (const [key, sides] of playerStatSides.entries()) {
    if (sides.size > 1) { // Has both over and under
      const [player, stat] = key.split('_');
      conflicts.push({ player, stat, side: Array.from(sides).join('/') });
    }
  }
  
  return conflicts;
}

/**
 * Count players per team in a card
 */
function getTeamCounts(card: CardEvResult): Record<string, number> {
  const teamCounts: Record<string, number> = {};
  
  for (const leg of card.legs) {
    if (leg.pick.team) {
      teamCounts[leg.pick.team] = (teamCounts[leg.pick.team] || 0) + 1;
    }
  }
  
  return teamCounts;
}

/**
 * Find potentially correlated stat pairs in a card
 */
function findCorrelatedPairs(card: CardEvResult): Array<{
  leg1: any,
  leg2: any,
  combinedEV: number
}> {
  const correlatedPairs: Array<{
    leg1: any,
    leg2: any,
    combinedEV: number
  }> = [];
  
  // Define correlated stat pairs
  const correlatedStats: Record<string, string[]> = {
    'points': ['rebounds', 'assists'],
    'rebounds': ['points', 'assists'],
    'assists': ['points', 'rebounds'],
    'saves': ['goals_against'],
    'goals_against': ['saves'],
    'shots_on_goal': ['goals'],
    'goals': ['shots_on_goal'],
  };
  
  for (let i = 0; i < card.legs.length; i++) {
    for (let j = i + 1; j < card.legs.length; j++) {
      const leg1 = card.legs[i];
      const leg2 = card.legs[j];
      
      // Check if these stats are correlated
      const isCorrelated = correlatedStats[leg1.pick.stat]?.includes(leg2.pick.stat as string) ||
                          correlatedStats[leg2.pick.stat]?.includes(leg1.pick.stat as string);
      
      if (isCorrelated) {
        const combinedEV = leg1.pick.legEv + leg2.pick.legEv;
        correlatedPairs.push({
          leg1,
          leg2,
          combinedEV
        });
      }
    }
  }
  
  return correlatedPairs;
}

/**
 * Check for structure-specific violations
 */
function checkStructureViolations(card: CardEvResult): string[] {
  const violations: string[] = [];
  
  // Check minimum leg requirements
  const expectedSize = parseInt(card.flexType.replace(/\D/g, ''));
  if (card.legs.length !== expectedSize) {
    violations.push(`leg_count_mismatch: expected ${expectedSize}, got ${card.legs.length}`);
  }
  
  // Check for duplicate players
  const playerCounts = new Map<string, number>();
  for (const leg of card.legs) {
    playerCounts.set(leg.pick.player, (playerCounts.get(leg.pick.player) || 0) + 1);
  }
  
  for (const [player, count] of playerCounts.entries()) {
    if (count > 1) {
      violations.push(`duplicate_player: ${player} appears ${count} times`);
    }
  }
  
  // Check for invalid stat combinations (basic validation)
  const invalidCombos = [
    { stat1: 'goals', stat2: 'goals_against' }, // Goalie vs skater conflict
    { stat1: 'saves', stat2: 'points' }, // Goalie vs skater conflict
  ];
  
  for (const combo of invalidCombos) {
    const hasStat1 = card.legs.some((leg: any) => leg.pick.stat === combo.stat1);
    const hasStat2 = card.legs.some((leg: any) => leg.pick.stat === combo.stat2);
    if (hasStat1 && hasStat2) {
      violations.push(`invalid_stat_combo: ${combo.stat1} + ${combo.stat2}`);
    }
  }
  
  return violations;
}

/**
 * Remove weakest leg from cards that exceed team concentration limits
 */
export function adjustTeamConcentration(
  cards: CardEvResult[],
  config: CorrelationFilterConfig = DEFAULT_CORRELATION_CONFIG
): CardEvResult[] {
  const adjustedCards: CardEvResult[] = [];
  
  for (const card of cards) {
    const teamLimit = (config.structureTeamLimits[card.flexType]?.[card.legs[0]?.pick?.sport || 'NBA']) || 
                     (config.maxPlayersPerTeam[card.legs[0]?.pick?.sport || 'NBA']);
    const teamCounts = getTeamCounts(card);
    
    // Find teams that exceed limits
    const excessTeams: string[] = [];
    for (const [team, count] of Object.entries(teamCounts)) {
      if (count > teamLimit) {
        excessTeams.push(team);
      }
    }
    
    if (excessTeams.length === 0) {
      // No adjustment needed
      adjustedCards.push(card);
      continue;
    }
    
    // Create adjusted card by removing lowest EV legs from excess teams
    const adjustedLegs = [...card.legs];
    let removed = 0;
    
    for (const team of excessTeams) {
      const teamLegs = adjustedLegs.filter(leg => leg.pick.team === team);
      const excessCount = teamLegs.length - teamLimit;
      
      if (excessCount > 0) {
        // Sort by EV (lowest first) and remove excess
        teamLegs.sort((a, b) => a.pick.legEv - b.pick.legEv);
        
        for (let i = 0; i < excessCount && i < teamLegs.length; i++) {
          const legToRemove = teamLegs[i];
          const index = adjustedLegs.findIndex(leg => 
            leg.pick.player === legToRemove.pick.player && 
            leg.pick.stat === legToRemove.pick.stat
          );
          
          if (index !== -1) {
            adjustedLegs.splice(index, 1);
            removed++;
          }
        }
      }
    }
    
    if (adjustedLegs.length >= 2) { // Minimum viable card size
      adjustedCards.push({
        ...card,
        legs: adjustedLegs,
        // Note: EV would need to be recalculated for the adjusted card
      });
      
      console.log(`  🔧 Adjusted team concentration: removed ${removed} legs from ${excessTeams.join(', ')}`);
    } else {
      console.log(`  ❌ Card too small after team adjustment (${adjustedLegs.length} legs)`);
    }
  }
  
  return adjustedCards;
}
