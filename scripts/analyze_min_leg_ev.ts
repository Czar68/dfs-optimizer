#!/usr/bin/env ts-node

/**
 * Find minimum leg EV required for each structure to meet card EV thresholds
 * Uses validated EV functions from audit scripts
 */

import { computeCardEvFromDistribution } from '../src/payout_math';
import { 
  POWER3_PAYOUTS, 
  POWER5_PAYOUTS, 
  POWER6_PAYOUTS,
  FLEX3_PAYOUTS, 
  FLEX4_PAYOUTS, 
  FLEX5_PAYOUTS, 
  FLEX6_PAYOUTS 
} from '../src/payouts';
import { CardHitDistribution } from '../src/types';

// Structure configurations with actual payout exports
const STRUCTURES = {
  '3F': { picks: 3, type: 'Flex' as const, minCardEv: 0.0, payouts: FLEX3_PAYOUTS },
  '4F': { picks: 4, type: 'Flex' as const, minCardEv: 0.0, payouts: FLEX4_PAYOUTS },
  '5F': { picks: 5, type: 'Flex' as const, minCardEv: 0.05, payouts: FLEX5_PAYOUTS },
  '6F': { picks: 6, type: 'Flex' as const, minCardEv: 0.05, payouts: FLEX6_PAYOUTS },
  '3P': { picks: 3, type: 'Power' as const, minCardEv: 0.03, payouts: POWER3_PAYOUTS },
  '5P': { picks: 5, type: 'Power' as const, minCardEv: 0.0, payouts: POWER5_PAYOUTS },
  '6P': { picks: 6, type: 'Power' as const, minCardEv: 0.0, payouts: POWER6_PAYOUTS },
};

/**
 * Compute card EV for uniform leg EV
 * @param structure - Structure configuration
 * @param legEv - Uniform leg EV (same for all legs)
 * @returns Card EV for this structure with uniform legs
 */
function computeCardEvForUniformLegs(structure: typeof STRUCTURES[keyof typeof STRUCTURES], legEv: number): number {
  const { picks, payouts } = structure;
  
  // Convert leg EV to true probability
  // legEv = trueProb - 0.5, so trueProb = legEv + 0.5
  const trueProb = legEv + 0.5;
  
  // Create hit distribution for uniform legs
  // This is a binomial distribution: P(k hits) = C(n,k) * p^k * (1-p)^(n-k)
  const hitDistribution: CardHitDistribution = {};
  
  for (let hits = 0; hits <= picks; hits++) {
    // Binomial probability
    const binomialProb = binomialCoefficient(picks, hits) * 
                        Math.pow(trueProb, hits) * 
                        Math.pow(1 - trueProb, picks - hits);
    hitDistribution[hits] = binomialProb;
  }
  
  // Compute card EV with stake=1 (per-unit calculation)
  const result = computeCardEvFromDistribution(1, hitDistribution, payouts);
  return result.cardEv;
}

/**
 * Compute binomial coefficient C(n,k)
 */
function binomialCoefficient(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

/**
 * Binary search for minimum leg EV that achieves target card EV
 */
function findMinLegEv(structure: typeof STRUCTURES[keyof typeof STRUCTURES]): number {
  const { minCardEv } = structure;
  
  // Search range: leg EV from -0.3 to +0.3 (true prob from 0.2 to 0.8)
  let low = -0.3;
  let high = 0.3;
  let best = low;
  
  // Binary search with tolerance
  const tolerance = 0.0001; // 0.01% EV tolerance
  const maxIterations = 50;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    const mid = (low + high) / 2;
    const cardEv = computeCardEvForUniformLegs(structure, mid);
    
    if (cardEv >= minCardEv - tolerance) {
      best = mid;
      high = mid; // Try lower leg EV
    } else {
      low = mid; // Need higher leg EV
    }
    
    if (high - low < tolerance) break;
  }
  
  return best;
}

/**
 * Main analysis
 */
function main(): void {
  console.log('=== Minimum Leg EV Analysis ===\n');
  
  const results: Array<{
    structure: string;
    minCardEv: number;
    requiredLegEv: number;
    requiredTrueProb: number;
  }> = [];
  
  // Compute minimum leg EV for each structure
  for (const [structureName, config] of Object.entries(STRUCTURES)) {
    const requiredLegEv = findMinLegEv(config);
    const requiredTrueProb = requiredLegEv + 0.5;
    
    results.push({
      structure: structureName,
      minCardEv: config.minCardEv,
      requiredLegEv,
      requiredTrueProb,
    });
  }
  
  // Sort by required leg EV (ascending)
  results.sort((a, b) => a.requiredLegEv - b.requiredLegEv);
  
  // Output table
  console.log('| Structure | Min Card EV | Required Leg EV | Required True Prob |');
  console.log('|-----------|-------------|-----------------|-------------------|');
  
  for (const result of results) {
    console.log(
      `| ${result.structure.padStart(8)} | ${(result.minCardEv * 100).toFixed(1).padStart(10)}% | ${(result.requiredLegEv * 100).toFixed(2).padStart(13)}% | ${(result.requiredTrueProb * 100).toFixed(1).padStart(16)}% |`
    );
  }
  
  console.log('\n=== Global Cutoff Analysis ===\n');
  
  // Structures we actually use (based on current thresholds)
  const activeStructures = ['3F', '4F', '5F', '6F', '3P'];
  const activeResults = results.filter(r => activeStructures.includes(r.structure));
  
  if (activeResults.length > 0) {
    const minLegEvGlobal = Math.min(...activeResults.map(r => r.requiredLegEv));
    const maxLegEvGlobal = Math.max(...activeResults.map(r => r.requiredLegEv));
    
    console.log(`Active structures: [${activeStructures.join(', ')}]`);
    console.log(`Most permissive (min): ${minLegEvGlobal >= 0 ? '+' : ''}${(minLegEvGlobal * 100).toFixed(2)}% leg EV`);
    console.log(`Most conservative (max): ${maxLegEvGlobal >= 0 ? '+' : ''}${(maxLegEvGlobal * 100).toFixed(2)}% leg EV`);
    
    console.log('\n=== Practical Filtering Logic ===\n');
    console.log('For each structure S:');
    console.log('  if maxLegEv < m_S: skip structure S for this slate');
    console.log('');
    console.log('Where m_S are the required leg EVs from the table above.');
  }
  
  console.log('\n=== Implementation Notes ===\n');
  console.log('1. Add prefilter check at start of optimizer run');
  console.log('2. Skip card generation for structures that cannot meet thresholds');
  console.log('3. This prevents wasted computation on hopeless structures');
  console.log('4. Use per-structure logic for maximum flexibility');
}

if (require.main === module) {
  main();
}
