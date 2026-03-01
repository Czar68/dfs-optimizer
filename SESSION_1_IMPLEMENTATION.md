# Session 1 Implementation Guide: Mean-Variance Kelly + Payout Consolidation

## 1. TypeScript API and Data Structures

### 1.1 Core Kelly Function

```typescript
// Main Kelly computation function
function computeKellyForCard(
  cardEv: number,                    // Expected value per unit stake (e.g., 0.08 = 8%)
  hitDistribution: CardHitDistribution,  // {hits: probability} mapping
  flexType: FlexType,                // '6F', '5P', etc.
  site: 'prizepicks' | 'underdog',   // Which site's payout structure to use
  config: KellyConfig = DEFAULT_KELLY_CONFIG
): KellyResult
```

### 1.2 Kelly Result Interface

```typescript
interface KellyResult {
  // Raw calculations
  meanReturn: number;               // μ: Expected net return per unit stake
  variance: number;                 // σ²: Variance of net returns
  rawKellyFraction: number;         // μ/σ²: Raw mean-variance Kelly
  
  // Applied constraints
  cappedKellyFraction: number;      // After maxRawKellyFraction cap (10%)
  safeKellyFraction: number;        // After globalKellyMultiplier (0.5 = half-Kelly)
  finalKellyFraction: number;       // After maxPerCardFraction cap (5%)
  
  // Dollar amounts
  recommendedStake: number;         // Final dollar stake ($750 × finalKellyFraction)
  expectedProfit: number;           // Expected profit (stake × cardEv)
  maxPotentialWin: number;          // Max possible win (stake × (maxPayout - 1))
  
  // Diagnostics
  riskAdjustment: string;           // 'FULL_KELLY', 'HALF_KELLY', 'QUARTER_KELLY', 'CONSERVATIVE'
  isCapped: boolean;                // True if any constraint was hit
  capReasons: string[];             // Which constraints were applied
}
```

### 1.3 Kelly Configuration

```typescript
interface KellyConfig {
  bankroll: number;                 // Default: $750
  globalKellyMultiplier: number;    // Default: 0.5 (half-Kelly)
  maxPerCardFraction: number;       // Default: 0.05 (5% max per card)
  minCardEv: number;                // Default: 0.03 (3% minimum EV)
  maxRawKellyFraction: number;      // Default: 0.10 (10% raw Kelly cap)
}
```

## 2. Concrete Implementation

### 2.1 Mean-Variance Kelly Calculation

```typescript
function computeKellyForCard(...): KellyResult {
  // Get payout structure for this card
  const payouts = getPayoutsForCard(flexType, site);
  
  // Compute μ (mean net return)
  let meanReturn = 0;
  for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
    const hits = Number(hitsStr);
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1; // Net return multiplier
    meanReturn += prob * netReturn;
  }
  
  // Compute σ² (variance)
  let variance = 0;
  for (const [hitsStr, prob] of Object.entries(hitDistribution)) {
    const hits = Number(hitsStr);
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1;
    variance += prob * Math.pow(netReturn - meanReturn, 2);
  }
  
  // Raw Kelly: f* = μ/σ²
  const rawKellyFraction = meanReturn / variance;
  
  // Apply safety constraints
  const cappedKellyFraction = Math.min(rawKellyFraction, config.maxRawKellyFraction);
  const safeKellyFraction = cappedKellyFraction * config.globalKellyMultiplier;
  const finalKellyFraction = Math.min(safeKellyFraction, config.maxPerCardFraction);
  
  // Skip if EV too low or Kelly negative
  if (cardEv < config.minCardEv || finalKellyFraction <= 0) {
    return createZeroKellyResult(config, cardEv < config.minCardEv ? 'BELOW_MIN_EV' : 'NEGATIVE_KELLY');
  }
  
  // Calculate dollar amounts
  const recommendedStake = config.bankroll * finalKellyFraction;
  const expectedProfit = recommendedStake * cardEv;
  const maxPayout = getMaxPayoutForCard(flexType, site);
  const maxPotentialWin = recommendedStake * (maxPayout - 1);
  
  return {
    meanReturn,
    variance,
    rawKellyFraction,
    cappedKellyFraction,
    safeKellyFraction,
    finalKellyFraction,
    recommendedStake,
    expectedProfit,
    maxPotentialWin,
    riskAdjustment: determineRiskAdjustment(finalKellyFraction, rawKellyFraction, config.globalKellyMultiplier),
    isCapped: finalKellyFraction < rawKellyFraction,
    capReasons: getCapReasons(rawKellyFraction, finalKellyFraction, config)
  };
}
```

### 2.2 PrizePicks Hit Distribution

```typescript
// PrizePicks uses i.i.d. binomial (all legs have same avg probability)
export function computePrizePicksHitDistribution(
  legs: { pick: { trueProb: number } }[],
  flexType: FlexType
): CardHitDistribution {
  const n = legs.length;
  const avgProb = legs.reduce((sum, leg) => sum + leg.pick.trueProb, 0) / n;
  
  const distribution: CardHitDistribution = {};
  
  // Binomial PMF: P(X=k) = C(n,k) × p^k × (1-p)^(n-k)
  for (let k = 0; k <= n; k++) {
    let coeff = 1;
    for (let i = 0; i < k; i++) {
      coeff = coeff * (n - i) / (i + 1);
    }
    
    const prob = coeff * Math.pow(avgProb, k) * Math.pow(1 - avgProb, n - k);
    distribution[k] = prob;
  }
  
  return distribution;
}
```

### 2.3 Integration into EV Flow

**PrizePicks (`card_ev.ts`):**
```typescript
export async function evaluateFlexCard(...): Promise<CardEvResult | null> {
  // ... existing EV calculation ...
  
  // NEW: Compute hit distribution for Kelly
  const hitDistribution = computePrizePicksHitDistribution(legs, flexType);
  
  // NEW: Compute Kelly sizing
  const kellyResult = computeKellyForCard(
    structureEV.ev,
    hitDistribution,
    flexType,
    'prizepicks',
    DEFAULT_KELLY_CONFIG
  );

  return {
    // ... existing fields ...
    hitDistribution,    // Now populated instead of empty
    kellyResult,        // NEW: Kelly sizing results
  };
}
```

**Underdog (`underdog_card_ev.ts`):**
```typescript
export function evaluateUdStandardCard(legs, overrideStructureId?) {
  // ... existing evaluation ...
  
  // Convert array to record for Kelly function
  const hitDistributionRecord: Record<number, number> = {};
  hitProbs.forEach((prob, hits) => {
    if (prob > 0) hitDistributionRecord[hits] = prob;
  });

  // NEW: Compute Kelly sizing
  const kellyResult = computeKellyForCard(
    expectedValue,
    hitDistributionRecord,
    structure.id.replace('UD_', '') as any,
    'underdog',
    DEFAULT_KELLY_CONFIG
  );

  return {
    // ... existing fields ...
    kellyResult,        // NEW: Kelly sizing results
  };
}
```

## 3. Integration Points

### 3.1 Files Modified

| File | Changes |
|------|---------|
| `src/config/prizepicks_payouts.ts` | **NEW**: Single source of PP payout truth |
| `src/kelly_mean_variance.ts` | **NEW**: Mean-variance Kelly implementation |
| `src/types.ts` | **MODIFIED**: Added `kellyResult?` to `CardEvResult` |
| `src/card_ev.ts` | **MODIFIED**: Added Kelly computation, updated imports |
| `src/underdog_card_ev.ts` | **MODIFIED**: Added Kelly computation to both functions |
| `src/kelly_stake_sizing.ts` | **MODIFIED**: Fixed `potentialWin` → `expectedProfit` bug |

### 3.2 CSV/JSON Export Changes

**New columns in cards CSV:**
```csv
kellyMeanReturn,kellyVariance,kellyRawFraction,kellyFinalFraction,kellyStake,kellyExpectedProfit,kellyMaxWin,kellyRiskAdjustment,kellyIsCapped,kellyCapReasons
0.223,18.87,0.0118,0.0059,4.43,0.35,105.75,HALF_KELLY,true,"GLOBAL_MULTIPLIER"
```

**In `run_optimizer.ts` writeCardsCsv:**
```typescript
// Add Kelly columns to header
const header = [
  // ... existing columns ...
  'kellyMeanReturn', 'kellyVariance', 'kellyRawFraction', 'kellyFinalFraction',
  'kellyStake', 'kellyExpectedProfit', 'kellyMaxWin', 'kellyRiskAdjustment',
  'kellyIsCapped', 'kellyCapReasons'
];

// Add Kelly data to each row
const kelly = card.kellyResult;
if (kelly) {
  row.push(
    kelly.meanReturn,
    kelly.variance,
    kelly.rawKellyFraction,
    kelly.finalKellyFraction,
    kelly.recommendedStake,
    kelly.expectedProfit,
    kelly.maxPotentialWin,
    kelly.riskAdjustment,
    kelly.isCapped,
    kelly.capReasons.join(';')
  );
} else {
  row.push(0, 0, 0, 0, 0, 0, 0, 'NO_KELLY', false, '');
}
```

### 3.3 Sheets Integration

**New columns (P:V):**
- **P**: `Kelly Raw %` - = rawKellyFraction × 100
- **Q**: `Kelly Final %` - = finalKellyFraction × 100  
- **R**: `Kelly Stake $` - = recommendedStake
- **S**: `Expected Profit $` - = expectedProfit
- **T**: `Max Potential Win $` - = maxPotentialWin
- **U**: `Risk Adjustment` - = riskAdjustment
- **V**: `Kelly Capped` - = IF(isCapped, "YES", "NO")

**Backend-driven vs Formula-driven:**
- **Backend**: All Kelly calculations (computed once, exported)
- **Formulas**: None for Kelly (to avoid inconsistencies)

### 3.4 Web API Changes

**`/api/cards` response:**
```typescript
interface CardApiResponse {
  // ... existing fields ...
  kellyResult?: {
    finalKellyFraction: number;
    recommendedStake: number;
    expectedProfit: number;
    riskAdjustment: string;
    isCapped: boolean;
  };
}
```

**React Dashboard changes:**
```typescript
// Add to cards table
<th>Kelly %</th>
<th>Stake $</th>
<th>Exp Profit $</th>
<th>Risk</th>

// Add to row display
<td>{(card.kellyResult?.finalKellyFraction * 100).toFixed(2)}%</td>
<td>${card.kellyResult?.recommendedStake.toFixed(2)}</td>
<td>${card.kellyResult?.expectedProfit.toFixed(2)}</td>
<td>{card.kellyResult?.riskAdjustment}</td>
```

## 4. Payout Consolidation

### 4.1 New Single Source Module

**`src/config/prizepicks_payouts.ts`:**
```typescript
export const PRIZEPICKS_PAYOUTS: Record<string, FlexPayout[]> = {
  '2P': [{ hits: 2, multiplier: 3 }],
  '3P': [{ hits: 3, multiplier: 6 }],
  '4P': [{ hits: 4, multiplier: 10 }],
  '5P': [{ hits: 5, multiplier: 20 }],
  '6P': [{ hits: 6, multiplier: 37.5 }],
  '3F': [{ hits: 3, multiplier: 3 }, { hits: 2, multiplier: 1 }],
  '4F': [{ hits: 4, multiplier: 6 }, { hits: 3, multiplier: 1.5 }],
  '5F': [{ hits: 5, multiplier: 10 }, { hits: 4, multiplier: 2 }, { hits: 3, multiplier: 0.4 }],
  '6F': [{ hits: 6, multiplier: 25 }, { hits: 5, multiplier: 2 }, { hits: 4, multiplier: 0.4 }],
};
```

### 4.2 Files to Update

| File | Current Import | New Import |
|------|----------------|------------|
| `src/card_ev.ts` | Local `PP_PAYOUTS` | `import { getPayoutsAsRecord } from './config/prizepicks_payouts'` |
| `src/engine_interface.ts` | Local `PP_PAYOUTS` | `import { getPayoutsAsRecord } from './config/prizepicks_payouts'` |
| `src/payout_math.ts` | From `./payouts` | `import { PRIZEPICKS_PAYOUTS } from './config/prizepicks_payouts'` |

### 4.3 Migration Steps

1. **Create** `src/config/prizepicks_payouts.ts` with consolidated payouts
2. **Update** `src/card_ev.ts` to import from new module
3. **Update** `src/engine_interface.ts` to import from new module  
4. **Update** `src/payout_math.ts` to import from new module
5. **Mark** `src/payouts.ts` as deprecated (keep for backward compatibility)
6. **Test** that optimizers produce identical results

## 5. Test Plan

### 5.1 Unit Tests

**Kelly Calculation Tests:**
```typescript
// Test: UD 6F with avg prob 0.56 (from plan example)
const mockHitDist = { 6: 0.031, 5: 0.145, 4: 0.282, 3: 0.189, 2: 0.084, 1: 0.025, 0: 0.044 };
const kellyResult = computeKellyForCard(0.08, mockHitDist, '6F', 'underdog');

assert(Math.abs(kellyResult.meanReturn - 0.223) < 0.001);
assert(Math.abs(kellyResult.variance - 18.87) < 0.01);
assert(Math.abs(kellyResult.rawKellyFraction - 0.0118) < 0.0001);
assert(Math.abs(kellyResult.finalKellyFraction - 0.0059) < 0.0001); // Half-Kelly
assert(kellyResult.riskAdjustment === 'HALF_KELLY');
```

**Payout Consolidation Tests:**
```typescript
// Test: All structures return same payouts as before
const oldPayouts = PP_PAYOUTS; // From old system
const newPayouts = getPayoutsAsRecord('6F');

assert.deepEqual(oldPayouts['6F'], newPayouts);
```

### 5.2 Integration Tests

**End-to-End Test:**
```typescript
// Run PrizePicks optimizer and verify Kelly results
const ppCards = await runPrizePicksOptimizer();
const strongCard = ppCards.find(c => c.flexType === '6F' && c.cardEv > 0.08);

assert(strongCard?.kellyResult, 'Kelly should be computed for strong cards');
assert(strongCard.kellyResult.recommendedStake > 0, 'Should recommend stake for +EV cards');
assert(strongCard.kellyResult.finalKellyFraction <= 0.05, 'Should respect 5% per-card cap');

// Run Underdog optimizer and verify Kelly results  
const udCards = await runUnderdogOptimizer();
const udStrongCard = udCards.find(c => c.flexType === '6F' && c.expectedValue > 0.08);

assert(udStrongCard?.kellyResult, 'Kelly should be computed for UD cards');
assert(udStrongCard.kellyResult.recommendedStake > 0, 'Should recommend stake for +EV cards');
```

**Regression Test:**
```typescript
// Verify old binary Kelly vs new mean-variance Kelly
const oldKelly = computeOldKelly(cardEv, winProb);
const newKelly = computeKellyForCard(cardEv, hitDist, flexType, site);

// For flex plays, new Kelly should be significantly higher
if (flexType.includes('F')) {
  assert(newKelly.finalKellyFraction > oldKelly.kellyFraction * 3, 
         'Flex plays should get 3-10× higher stakes with mean-variance Kelly');
}
```

### 5.3 Manual Verification

**Test Card from NBA-Props-29:**
1. **Find** a strong 6F card (EV > 8%) in recent run
2. **Verify** Kelly fraction is reasonable (0.5-2% for strong cards)
3. **Check** that half-Kelly multiplier is applied (riskAdjustment = 'HALF_KELLY')
4. **Confirm** CSV export includes all Kelly columns
5. **Validate** Sheets import shows correct Kelly stake amounts

**Expected Results:**
- **Strong 6F (8% EV)**: ~1.2% Kelly → $9 stake on $750 bankroll
- **Medium 5F (5% EV)**: ~0.8% Kelly → $6 stake on $750 bankroll  
- **Weak 4F (3% EV)**: ~0.3% Kelly → $2 stake on $750 bankroll
- **Power plays**: Similar to old system (binary Kelly was already accurate)

## 6. Success Metrics

### 6.1 Quantitative Checks

- **Kelly fractions**: 90% of cards should have 0.1-5% Kelly fractions
- **Flex play increase**: Flex play stakes should increase 3-10× vs old system
- **Power play stability**: Power play stakes should change <10% vs old system
- **Constraint compliance**: No card should exceed 5% bankroll or have negative stake

### 6.2 Qualitative Checks

- **Code compiles** without TypeScript errors
- **Optimizers run** without runtime errors
- **CSV exports** include new Kelly columns
- **Sheets import** works with new data
- **Web UI** displays Kelly information correctly

### 6.3 Performance Impact

- **Runtime**: Kelly calculation should add <50ms per card
- **Memory**: Minimal additional memory usage
- **File sizes**: CSV files increase by ~100 bytes per card (10 new columns)

---

## Implementation Checklist

- [ ] Create `src/config/prizepicks_payouts.ts`
- [ ] Create `src/kelly_mean_variance.ts` 
- [ ] Update `src/types.ts` with kellyResult field
- [ ] Update `src/card_ev.ts` with Kelly integration
- [ ] Update `src/underdog_card_ev.ts` with Kelly integration
- [ ] Fix `src/kelly_stake_sizing.ts` potentialWin bug
- [ ] Update payout imports in `engine_interface.ts`
- [ ] Update payout imports in `payout_math.ts`
- [ ] Add Kelly columns to CSV exports
- [ ] Test with known card examples
- [ ] Verify Sheets integration works
- [ ] Update web UI to display Kelly data
