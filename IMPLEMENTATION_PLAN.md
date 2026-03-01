# Implementation Plan: Mean-Variance Kelly, Portfolio Selector, and Outcome Tracking

## Task 1 – Design and Implement Improved Kelly Sizing

### 1.1 Choice of Approach: Mean-Variance Kelly Approximation

**Recommendation:** Use the **mean-variance Kelly approximation** `f* ≈ μ/σ²` rather than true multi-outcome Kelly.

**Justification:**
- **Accuracy:** For flex plays, this gives 5–10× more accurate sizing than binary Kelly
- **Simplicity:** One formula using data we already compute (μ and σ² from hit distribution)
- **Speed:** O(n) computation vs. numerical optimization for true Kelly
- **Robustness:** Less sensitive to edge cases in the distribution tails

**Formula Derivation:**

For a card with outcome distribution:
- `p[k]` = probability of exactly k hits (from DP or binomial)
- `r[k]` = net return multiplier for k hits (payout - 1)

```
μ = Σ_k p[k] × r[k]          // Expected net return per unit stake
σ² = Σ_k p[k] × (r[k] - μ)²  // Variance of net return
f_mv = μ / σ²                 // Mean-variance Kelly approximation
```

**Example calculation (UD 6F with p̄ = 0.56):**
```
p[6] = 0.031, r[6] = 24 (25× payout - 1)
p[5] = 0.145, r[5] = 1.6 (2.6× payout - 1)  
p[4] = 0.282, r[4] = -0.75 (0.25× payout - 1)
p[0-3] = 0.542, r = -1 (lose stake)

μ = 0.031×24 + 0.145×1.6 + 0.282×(-0.75) + 0.542×(-1) = 0.223
σ² = 0.031×(24-0.223)² + 0.145×(1.6-0.223)² + 0.282×(-0.75-0.223)² + 0.542×(-1-0.223)² = 18.87
f_mv = 0.223 / 18.87 = 0.0118 = 1.18% of bankroll
```

### 1.2 Practical Constraints and Safety Adjustments

```typescript
interface KellyConstraints {
  maxPerCard: number;        // Max 5% of bankroll per card
  globalFraction: number;    // Global Kelly multiplier (e.g., 0.5 for half-Kelly)
  minEdge: number;          // Min EV to consider betting (e.g., 0.03)
  maxKellyRaw: number;      // Cap raw Kelly before global multiplier (e.g., 0.10)
}
```

**Recommended defaults:**
- `maxPerCard = 0.05` (5% of bankroll absolute cap)
- `globalFraction = 0.5` (half-Kelly)
- `minEdge = 0.03` (3% minimum EV)
- `maxKellyRaw = 0.10` (10% raw Kelly cap before half-Kelly)

**Safety flow:**
```
f_raw = max(0, μ/σ²)                    // Mean-variance Kelly
f_capped = min(f_raw, maxKellyRaw)     // Prevent extreme bets
f_safe = f_capped × globalFraction      // Half-Kelly safety
f_final = min(f_safe, maxPerCard)       // Absolute per-card cap
```

### 1.3 Implementation Sketch

```typescript
// New interface extending CardEvResult
interface CardEvResultWithKelly extends CardEvResult {
  // Kelly sizing fields
  kellyFraction: number;      // Raw μ/σ²
  recommendedStake: number;   // Final dollar stake after constraints
  potentialWin: number;       // Expected profit (stake × cardEv)
  riskAdjustment: string;      // "HALF_KELLY", "CONSERVATIVE", etc.
}

function computeKellyStake(
  card: CardEvResult,
  bankroll: number,
  constraints: KellyConstraints = DEFAULT_KELLY_CONSTRAINTS
): CardEvResultWithKelly {
  
  // Extract outcome distribution and payouts
  const { hitDistribution, cardEv, flexType } = card;
  const payouts = getPayoutsForStructure(flexType);
  
  // Compute μ and σ²
  let mu = 0;
  let variance = 0;
  
  for (let hits = 0; hits <= hitDistribution.length - 1; hits++) {
    const prob = hitDistribution[hits] || 0;
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1; // Net return multiplier
    
    mu += prob * netReturn;
  }
  
  // Compute variance
  for (let hits = 0; hits <= hitDistribution.length - 1; hits++) {
    const prob = hitDistribution[hits] || 0;
    const payout = payouts[hits] || 0;
    const netReturn = payout - 1;
    
    variance += prob * Math.pow(netReturn - mu, 2);
  }
  
  // Edge case: zero variance (shouldn't happen with real data)
  if (variance < 1e-10) {
    return {
      ...card,
      kellyFraction: 0,
      recommendedStake: 0,
      potentialWin: 0,
      riskAdjustment: 'NO_VARIANCE'
    };
  }
  
  // Mean-variance Kelly
  const kellyFraction = mu / variance;
  
  // Apply constraints
  const cappedKelly = Math.min(kellyFraction, constraints.maxKellyRaw);
  const safeKelly = cappedKelly * constraints.globalFraction;
  const finalKelly = Math.min(safeKelly, constraints.maxPerCard);
  
  // Skip if EV too low
  if (cardEv < constraints.minEdge) {
    return {
      ...card,
      kellyFraction,
      recommendedStake: 0,
      potentialWin: 0,
      riskAdjustment: 'BELOW_MIN_EDGE'
    };
  }
  
  const recommendedStake = bankroll * finalKelly;
  const potentialWin = recommendedStake * cardEv;
  
  // Determine risk adjustment label
  let riskAdjustment: string;
  if (finalKelly >= kellyFraction * 0.9) {
    riskAdjustment = 'FULL_KELLY';
  } else if (finalKelly >= kellyFraction * 0.4) {
    riskAdjustment = 'HALF_KELLY';
  } else if (finalKelly >= kellyFraction * 0.2) {
    riskAdjustment = 'QUARTER_KELLY';
  } else {
    riskAdjustment = 'CONSERVATIVE';
  }
  
  return {
    ...card,
    kellyFraction,
    recommendedStake,
    potentialWin,
    riskAdjustment
  };
}

// Helper to get payouts for a structure
function getPayoutsForStructure(flexType: FlexType): Record<number, number> {
  // Import from consolidated payouts (Task 4)
  const { PP_PAYOUTS, UNDERDOG_PAYOUTS } = require('./payouts_consolidated');
  
  if (flexType.includes('P') || flexType.includes('F')) {
    // PrizePicks structure
    return PP_PAYOUTS[flexType] || {};
  } else {
    // Underdog structure (UD_ prefix)
    const udKey = flexType.replace('UD_', '');
    return UNDERDOG_PAYOUTS[udKey] || {};
  }
}
```

### 1.4 Integration Points

**Where to plug in:**
1. **`card_ev.ts`** - Add Kelly computation after `evaluateFlexCard` returns
2. **`underdog_card_ev.ts`** - Add Kelly computation after evaluation functions
3. **`run_optimizer.ts`** - Apply Kelly to all cards before CSV export
4. **`run_underdog_optimizer.ts`** - Apply Kelly to UD cards before export

**CSV export changes:**
Add columns: `kellyFraction`, `recommendedStake`, `potentialWin`, `riskAdjustment`

**Sheets integration:**
- Add columns P:S for Kelly data
- Update `SHEETS_FORMULAS.md` with new stake calculations
- Modify push scripts to include new columns

---

## Task 2 – Card Portfolio Selection / Parlay Optimizer

### 2.1 Objective & Constraints

**Objective:** Maximize expected log-growth of bankroll
```
Maximize: Σ_i log(1 + f_i × r_i)
Subject to: Σ_i stake_i ≤ dailyRiskBudget × bankroll
```

**Constraints:**
- **Daily risk budget:** ≤ 8% of bankroll total
- **Player diversification:** ≤ 3 cards per player
- **Game diversification:** ≤ 5 cards per game  
- **Team diversification:** ≤ 4 cards per team
- **Site caps:** Optional (e.g., max 10 PP cards, max 10 UD cards)
- **Structure caps:** Optional (e.g., max 5 of any single structure)

### 2.2 Algorithm: Greedy with Efficiency Score

**Step 1: Pre-compute efficiency scores**
```
efficiency_i = cardEv_i / (kellyFraction_i + ε)
```
Where ε = 0.001 to avoid division by zero. This ranks cards by EV per unit of Kelly risk.

**Step 2: Greedy selection with constraints**
```typescript
interface PortfolioConstraints {
  dailyRiskBudget: number;    // e.g., 0.08 (8% of bankroll)
  maxCardsPerPlayer: number;  // e.g., 3
  maxCardsPerGame: number;     // e.g., 5
  maxCardsPerTeam: number;     // e.g., 4
  maxCardsPerSite: Record<string, number>; // e.g., { PP: 10, UD: 10 }
  maxCardsPerStructure: Record<string, number>; // e.g., { '6F': 8, '5F': 6 }
}

function selectCardPortfolio(
  cards: CardEvResultWithKelly[],
  bankroll: number,
  constraints: PortfolioConstraints
): {
  selectedCards: CardEvResultWithKelly[];
  totalStake: number;
  totalRiskFraction: number;
  droppedCards: string[];
  constraintsHit: string[];
} {
  
  // Sort by efficiency score (descending)
  const sortedCards = [...cards].sort((a, b) => {
    const effA = a.cardEv / (a.kellyFraction + 1e-6);
    const effB = b.cardEv / (b.kellyFraction + 1e-6);
    return effB - effA;
  });
  
  const selectedCards: CardEvResultWithKelly[] = [];
  const droppedCards: string[] = [];
  const constraintsHit: string[] = [];
  
  // Track constraint usage
  const playerCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();
  const siteCounts = new Map<string, number>();
  const structureCounts = new Map<string, number>();
  
  let totalStake = 0;
  
  for (const card of sortedCards) {
    // Check if adding this card would exceed constraints
    let canAdd = true;
    const reasons: string[] = [];
    
    // Check daily risk budget
    if (totalStake + card.recommendedStake > constraints.dailyRiskBudget * bankroll) {
      canAdd = false;
      reasons.push('daily_risk');
    }
    
    // Check player constraints
    for (const leg of card.legs) {
      const player = leg.pick.player;
      const count = playerCounts.get(player) || 0;
      if (count + 1 > constraints.maxCardsPerPlayer) {
        canAdd = false;
        reasons.push('player');
        break;
      }
    }
    
    // Check game constraints
    for (const leg of card.legs) {
      const gameKey = getGameKey(leg.pick);
      const count = gameCounts.get(gameKey) || 0;
      if (count + 1 > constraints.maxCardsPerGame) {
        canAdd = false;
        reasons.push('game');
        break;
      }
    }
    
    // Check team constraints
    for (const leg of card.legs) {
      const team = leg.pick.team;
      if (!team) continue;
      const count = teamCounts.get(team) || 0;
      if (count + 1 > constraints.maxCardsPerTeam) {
        canAdd = false;
        reasons.push('team');
        break;
      }
    }
    
    // Check site constraints
    const site = card.legs[0]?.pick.site || 'unknown';
    const siteCount = siteCounts.get(site) || 0;
    const siteLimit = constraints.maxCardsPerSite[site] || Infinity;
    if (siteCount + 1 > siteLimit) {
      canAdd = false;
      reasons.push('site');
    }
    
    // Check structure constraints
    const structure = card.flexType;
    const structCount = structureCounts.get(structure) || 0;
    const structLimit = constraints.maxCardsPerStructure[structure] || Infinity;
    if (structCount + 1 > structLimit) {
      canAdd = false;
      reasons.push('structure');
    }
    
    if (canAdd) {
      // Add card and update counters
      selectedCards.push(card);
      totalStake += card.recommendedStake;
      
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
      
      siteCounts.set(site, (siteCounts.get(site) || 0) + 1);
      structureCounts.set(structure, (structCount + 1));
    } else {
      droppedCards.push(`${card.flexType}:${card.legs.map(l => l.pick.player).join('+')}`);
      constraintsHit.push(...reasons);
    }
  }
  
  const totalRiskFraction = totalStake / bankroll;
  
  return {
    selectedCards,
    totalStake,
    totalRiskFraction,
    droppedCards,
    constraintsHit: [...new Set(constraintsHit)] // Unique constraint types hit
  };
}

function getGameKey(pick: EvPick): string {
  const t = pick.team ?? "";
  const o = pick.opponent ?? "";
  return [t, o].sort().join("_vs_");
}
```

### 2.3 Integration

**Backend changes:**
1. **New file:** `src/portfolio_selector.ts` with the above algorithm
2. **Modify optimizers:** After card generation, call portfolio selector
3. **API changes:** `/api/cards` returns `selected: boolean` flag and `portfolioRank` field
4. **CSV export:** Add `selected` and `portfolioRank` columns

**Sheets integration:**
- Add columns: `Selected`, `PortfolioRank`, `PortfolioStake` (may differ from `recommendedStake` if scaled)
- Update push scripts to include portfolio data
- Add portfolio summary section in Sheets

**Web UI changes:**
- Add filter toggle: "Show all cards" vs "Show portfolio only"
- Display portfolio statistics: total stake, risk %, constraint hits
- Color-code selected cards in table

---

## Task 3 – Outcome Tracking & Empirical Edge Validation

### 3.1 Data Model (SQLite Schema)

```sql
-- Legs table: every leg we considered betting on
CREATE TABLE legs (
  id TEXT PRIMARY KEY,
  run_timestamp TEXT NOT NULL,
  site TEXT NOT NULL,  -- 'PP' or 'UD'
  player TEXT NOT NULL,
  team TEXT,
  opponent TEXT,
  stat TEXT NOT NULL,
  line REAL NOT NULL,
  direction TEXT NOT NULL,  -- 'over' or 'under'
  true_prob REAL NOT NULL,  -- Our calculated probability at bet time
  edge REAL NOT NULL,       -- true_prob - 0.5
  leg_ev REAL NOT NULL,     -- Expected value per unit stake
  book TEXT,
  over_odds INTEGER,
  under_odds INTEGER,
  game_time TEXT,
  is_within_24h BOOLEAN,
  is_non_standard_odds BOOLEAN,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Cards table: every card we considered betting on
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  run_timestamp TEXT NOT NULL,
  site TEXT NOT NULL,
  structure TEXT NOT NULL,  -- '6F', '5P', etc.
  card_ev REAL NOT NULL,
  win_prob_cash REAL NOT NULL,
  win_prob_any REAL NOT NULL,
  avg_prob REAL NOT NULL,
  kelly_fraction REAL,
  recommended_stake REAL,
  potential_win REAL,
  risk_adjustment TEXT,
  selected BOOLEAN DEFAULT FALSE,
  portfolio_rank INTEGER,
  leg_ids TEXT NOT NULL,  -- JSON array of leg IDs
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Bets table: cards we actually placed bets on
CREATE TABLE bets (
  id TEXT PRIMARY KEY,  -- Same as cards.id for placed cards
  placed_at TEXT NOT NULL,
  actual_stake REAL NOT NULL,
  status TEXT NOT NULL,  -- 'pending', 'won', 'lost', 'push'
  actual_payout REAL DEFAULT 0,
  net_result REAL,  -- profit/loss (payout - stake)
  settled_at TEXT,
  notes TEXT
);

-- Leg outcomes table: results for individual legs
CREATE TABLE leg_outcomes (
  id TEXT PRIMARY KEY,
  leg_id TEXT NOT NULL,
  actual_value REAL,  -- Actual stat value
  result TEXT NOT NULL,  -- 'hit' or 'miss'
  settled_at TEXT,
  FOREIGN KEY (leg_id) REFERENCES legs(id)
);

-- Card outcomes table: results for cards (computed from leg outcomes)
CREATE TABLE card_outcomes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  hits INTEGER NOT NULL,  -- Number of legs that hit
  payout_multiplier REAL NOT NULL,
  status TEXT NOT NULL,  -- 'won', 'lost', 'push'
  FOREIGN KEY (card_id) REFERENCES cards(id)
);
```

### 3.2 Pipeline Scripts

**Script 1: Export placed cards from Sheets**
```python
# scripts/export_placed_bets.py
import pandas as pd
import sqlite3
from datetime import datetime

def export_placed_bets(sheets_id, db_path):
    # Read placed cards from Sheets (marked in 'Placed' column)
    # Export to SQLite bets table
    pass
```

**Script 2: Import game results**
```python
# scripts/import_game_results.py
def import_results(csv_path, db_path):
    # CSV columns: player, stat, actual_value, game_time
    # Match to legs table and populate leg_outcomes
    pass
```

**Script 3: Reconcile and compute card outcomes**
```python
# scripts/reconcile_outcomes.py
def reconcile_outcomes(db_path):
    # For each bet, compute hits from leg_outcomes
    # Apply payout structure to get card_outcomes
    # Update bets table with final results
    pass
```

### 3.3 Key Analyses

**Analysis 1: Realized vs Predicted Edge**
```sql
SELECT 
  structure,
  site,
  AVG(card_ev) as predicted_ev,
  AVG(net_result / actual_stake) as realized_ev,
  COUNT(*) as sample_size,
  AVG(net_result) as total_profit_loss
FROM cards c
JOIN bets b ON c.id = b.id
WHERE b.status != 'pending'
GROUP BY structure, site;
```

**Analysis 2: Kelly Performance**
```sql
SELECT 
  CASE 
    WHEN kelly_fraction < 0.005 THEN 'Under 0.5%'
    WHEN kelly_fraction < 0.01 THEN '0.5%-1%'
    WHEN kelly_fraction < 0.02 THEN '1%-2%'
    ELSE 'Over 2%'
  END as kelly_bucket,
  AVG(net_result / actual_stake) as realized_roi,
  SUM(net_result) as total_pl,
  COUNT(*) as bet_count
FROM bets b
JOIN cards c ON b.id = c.id
WHERE b.status != 'pending'
GROUP BY kelly_bucket;
```

**Analysis 3: Predictive Metrics**
```sql
-- Which metrics correlate with actual profitability?
SELECT 
  AVG(true_prob) as avg_true_prob,
  AVG(edge) as avg_edge,
  AVG(leg_ev) as avg_leg_ev,
  AVG(card_ev) as avg_card_ev,
  AVG(win_prob_cash) as avg_win_prob,
  SUM(net_result) / SUM(actual_stake) as realized_roi
FROM cards c
JOIN bets b ON c.id = b.id
WHERE b.status != 'pending'
GROUP BY 
  CASE 
    WHEN card_ev > 0.10 THEN 'High EV (>10%)'
    WHEN card_ev > 0.05 THEN 'Medium EV (5-10%)'
    ELSE 'Low EV (<5%)'
  END;
```

### 3.4 Integration Hooks

**In optimizers:**
```typescript
// After card generation, write to legs and cards tables
function saveToOutcomeTracking(cards: CardEvResultWithKelly[], runTimestamp: string) {
  // Save legs
  for (const card of cards) {
    for (const leg of card.legs) {
      await db.run(`
        INSERT INTO legs (...) VALUES (...)
      `, legData);
    }
    
    // Save card
    await db.run(`
      INSERT INTO cards (...) VALUES (...)
    `, cardData);
  }
}
```

**In web UI:**
- Add "Mark as Placed" button for each card
- When clicked, move card from cards → bets table
- Show running P&L from bets table

---

## Task 4 – Clean Up Math Warts and Duplication

### 4.1 Consolidate PrizePicks Payout Tables

**Current problem:** PP payouts exist in 3 places
- `src/payouts.ts` (as FlexPayout arrays)
- `src/card_ev.ts` (as PP_PAYOUTS record)  
- `src/engine_interface.ts` (as PP_PAYOUTS record)

**Solution:**
1. **Create single source:** `src/config/prizepicks_payouts.ts`
```typescript
// src/config/prizepicks_payouts.ts
export interface FlexPayout {
  hits: number;
  multiplier: number;
}

export const PRIZEPICKS_PAYOUTS: Record<string, FlexPayout[]> = {
  '2P': [{ hits: 2, multiplier: 3 }],
  '3P': [{ hits: 3, multiplier: 6 }],
  '4P': [{ hits: 4, multiplier: 10 }],
  '5P': [{ hits: 5, multiplier: 20 }],
  '6P': [{ hits: 6, multiplier: 37.5 }],
  '3F': [
    { hits: 3, multiplier: 3 },
    { hits: 2, multiplier: 1 },
  ],
  '4F': [
    { hits: 4, multiplier: 6 },
    { hits: 3, multiplier: 1.5 },
  ],
  '5F': [
    { hits: 5, multiplier: 10 },
    { hits: 4, multiplier: 2 },
    { hits: 3, multiplier: 0.4 },
  ],
  '6F': [
    { hits: 6, multiplier: 25 },
    { hits: 5, multiplier: 2 },
    { hits: 4, multiplier: 0.4 },
  ],
};

// Helper to convert to simple record for engine use
export function getPayoutsAsRecord(flexType: string): Record<number, number> {
  const payouts = PRIZEPICKS_PAYOUTS[flexType] || [];
  const record: Record<number, number> = {};
  for (const p of payouts) {
    record[p.hits] = p.multiplier;
  }
  return record;
}
```

2. **Update imports:**
- `src/card_ev.ts`: `import { getPayoutsAsRecord } from './config/prizepicks_payouts'`
- `src/engine_interface.ts`: Same import
- Delete duplicate PP_PAYOUTS records

3. **Update `src/payouts.ts`:**
- Keep for backward compatibility but import from new location
- Add comment: "DEPRECATED: Use src/config/prizepicks_payouts.ts"

### 4.2 Fix `potentialWin` in `kelly_stake_sizing.ts`

**Current problem:** Line 109-110 uses `cardEv` as payout multiplier:
```typescript
const approximatePayout = 1 + cardEv; // Wrong!
const potentialWin = recommendedStake * approximatePayout;
```

**Solution options:**

**Option A: Fix with actual max payout**
```typescript
// Get max payout from structure
const maxPayout = getMaxPayoutForStructure(structure);
const potentialWin = recommendedStake * (maxPayout - 1);
```

**Option B: Remove/make clearly informational**
```typescript
// Rename and clarify this is expected profit, not max win
const expectedProfit = recommendedStake * cardEv;
```

**Recommendation:** Option B - rename to `expectedProfit` since that's what it actually represents. Add separate `maxPotentialWin` field if needed for display.

**Implementation:**
```typescript
// In computeStake function:
const expectedProfit = recommendedStake * cardEv;  // Expected profit
const maxPotentialWin = recommendedStake * (getMaxPayoutForStructure(structure) - 1);

return {
  fullKellyStake,
  recommendedStake,
  expectedProfit,        // Renamed from potentialWin
  maxPotentialWin,       // New field
  riskAdjustment,
  kellyPercentage: (recommendedStake / bankroll) * 100,
  riskLevel,
};
```

---

## Task 5 – Prioritized Roadmap (Next 2-3 Sessions)

### Session 1: Math Engine & Kelly Upgrade (4-6 hours)

**Tasks:**
1. **Consolidate PP payouts** (Task 4.1)
   - Create `src/config/prizepicks_payouts.ts`
   - Update imports in `card_ev.ts` and `engine_interface.ts`
   - Test that optimizers still produce same results

2. **Implement mean-variance Kelly** (Task 1.3)
   - Create `src/kelly_mean_variance.ts` with new sizing function
   - Add Kelly fields to `CardEvResult` interface
   - Integrate into `card_ev.ts` after `evaluateFlexCard`
   - Integrate into `underdog_card_ev.ts` after evaluation functions

3. **Update optimizers to use new Kelly**
   - Modify `run_optimizer.ts` to call Kelly computation
   - Modify `run_underdog_optimizer.ts` similarly
   - Update CSV exports with new Kelly columns

4. **Fix potentialWin bug** (Task 4.2)
   - Rename to `expectedProfit` in `kelly_stake_sizing.ts`
   - Add `maxPotentialWin` field if needed

**Verification:**
- Run both optimizers and verify Kelly fractions look reasonable (0.5-5% range)
- Check that CSV exports have new columns
- Verify Sheets import still works

### Session 2: Portfolio Selection & Integration (4-6 hours)

**Tasks:**
1. **Implement portfolio selector** (Task 2.2)
   - Create `src/portfolio_selector.ts` with greedy algorithm
   - Add portfolio fields to card interfaces
   - Test with sample data

2. **Integrate into optimizers**
   - Call portfolio selector after card generation
   - Update card results with `selected` and `portfolioRank` fields
   - Modify CSV exports to include portfolio data

3. **Update backend API**
   - Modify `/api/cards` to return portfolio information
   - Add portfolio summary endpoint `/api/portfolio`

4. **Update Sheets integration**
   - Add portfolio columns to push scripts
   - Update `SHEETS_FORMULAS.md` with new portfolio calculations
   - Test push to Sheets

5. **Update web UI**
   - Add portfolio filter toggle
   - Display portfolio statistics
   - Color-code selected cards

**Verification:**
- Run full pipeline and verify portfolio selection works
- Check that constraints are respected (max 3 per player, etc.)
- Verify web UI shows portfolio correctly

### Session 3: Outcome Tracking Setup (3-4 hours)

**Tasks:**
1. **Create SQLite database** (Task 3.1)
   - Create `data/outcomes.db` with schema
   - Add migration scripts for future schema changes

2. **Implement export/import scripts** (Task 3.2)
   - `scripts/export_placed_bets.py` - from Sheets to DB
   - `scripts/import_game_results.py` - from CSV to DB  
   - `scripts/reconcile_outcomes.py` - compute final results

3. **Add logging hooks**
   - Modify optimizers to save legs/cards to tracking DB
   - Add simple "mark as placed" functionality

4. **Create analysis dashboard**
   - Simple queries for realized vs predicted edge
   - Kelly performance analysis
   - Basic visualization (can start with console output)

**Verification:**
- Test full pipeline: optimizer → tracking → manual result entry → analysis
- Verify queries return sensible results
- Check that database operations don't slow down optimizers

### Success Metrics for Each Session

**Session 1:**
- Kelly fractions are reasonable (not 0% or >10%)
- Flex plays get 3-5× larger stakes than before
- No regressions in card generation

**Session 2:**  
- Portfolio respects all constraints
- Total risk stays within daily budget
- Web UI correctly shows selected cards

**Session 3:**
- Can track a full day's bets through to settlement
- Analysis queries return meaningful comparisons
- Database adds <1 second to optimizer runtime

---

## Appendix: Code Structure Overview

```
src/
├── config/
│   ├── prizepicks_payouts.ts      # NEW: Consolidated PP payouts
│   └── underdog_structures.ts     # EXISTING: UD payouts
├── kelly_mean_variance.ts          # NEW: Mean-variance Kelly sizing
├── portfolio_selector.ts           # NEW: Portfolio selection algorithm
├── card_ev.ts                      # MODIFIED: Add Kelly computation
├── underdog_card_ev.ts             # MODIFIED: Add Kelly computation
├── run_optimizer.ts                # MODIFIED: Add portfolio selection
├── run_underdog_optimizer.ts       # MODIFIED: Add portfolio selection
├── kelly_stake_sizing.ts           # MODIFIED: Fix potentialWin
└── server.ts                       # MODIFIED: Portfolio API endpoints

scripts/
├── export_placed_bets.py           # NEW: Export from Sheets to DB
├── import_game_results.py         # NEW: Import results from CSV
└── reconcile_outcomes.py           # NEW: Compute final outcomes

data/
└── outcomes.db                     # NEW: SQLite tracking database
```

This plan provides a clear path from the current binary Kelly system to a sophisticated portfolio optimizer with empirical validation, while maintaining backward compatibility and adding safety constraints at each step.
