# Session 2 Implementation Guide: Portfolio Selector + Kelly/Portfolio Integration

## Task 1 – Portfolio Selector Design and Implementation

### 1A. Objective and Score Formula

**Objective Function:**
```
Maximize Σ(efficiency_i) subject to Σ(kellyFraction_i) ≤ dailyRiskBudget
where efficiency_i = cardEv_i / (cappedKellyFraction_i + ε)
```

**Constraints:**
- Daily risk budget: ≤ 8% of bankroll (sum of capped Kelly fractions)
- Max 3 selected cards per player
- Max 5 selected cards per game  
- Max 4 selected cards per team
- Only cards with EV ≥ 3% and cappedKellyFraction > 0 eligible

**Efficiency Formula:**
```typescript
const efficiency = card.cardEv / (card.kellyResult.cappedKellyFraction + 0.0001);
```

- **ε = 0.0001** (0.01%) to avoid division by zero
- Uses `cappedKellyFraction` (after 10% raw cap) for fair comparison
- Higher efficiency = more EV per unit of Kelly risk

### 1B. Algorithm Implementation

**Function Signature:**
```typescript
selectCardPortfolio(
  cards: CardEvResult[],        // includes kellyResult, site, legs, metadata
  constraints: PortfolioConstraints = DEFAULT_PORTFOLIO_CONSTRAINTS
): PortfolioResult
```

**PortfolioResult Interface:**
```typescript
interface PortfolioResult {
  selectedCards: CardEvResult[];
  rejectedCards: RejectedCard[];
  totals: PortfolioTotals;
  constraintsHit: ConstraintHit[];
}

interface PortfolioTotals {
  selectedCount: number;
  totalKellyFraction: number;
  totalStake: number;
  totalExpectedProfit: number;
  riskBudgetUsed: number; // percentage of budget used
}
```

**Algorithm (Greedy Selection):**
```typescript
export function selectCardPortfolio(cards, constraints) {
  // Step 1: Filter eligible cards
  const eligible = cards.filter(card => 
    card.cardEv >= constraints.minCardEv && 
    card.kellyResult?.cappedKellyFraction > 0
  );

  // Step 2: Compute efficiency scores
  const scored = eligible.map(card => ({
    card,
    efficiency: card.cardEv / (card.kellyResult.cappedKellyFraction + constraints.efficiencyEpsilon),
    ev: card.cardEv,
    winProb: card.winProbability,
  }));

  // Step 3: Sort by efficiency desc, EV desc, winProb desc
  scored.sort((a, b) => {
    if (Math.abs(a.efficiency - b.efficiency) > 1e-6) return b.efficiency - a.efficiency;
    if (Math.abs(a.ev - b.ev) > 1e-6) return b.ev - a.ev;
    return b.winProb - a.winProb;
  });

  // Step 4: Greedy selection with constraint tracking
  const selected = [];
  const rejected = [];
  const playerCounts = new Map();
  const gameCounts = new Map();
  const teamCounts = new Map();
  let totalKelly = 0;

  for (const {card} of scored) {
    const kelly = card.kellyResult.finalKellyFraction;
    
    // Check constraints
    if (totalKelly + kelly > constraints.dailyRiskBudget) {
      rejected.push({card, reason: 'RISK_BUDGET'});
      continue;
    }
    
    if (violatesPlayerCardLimit(card, playerCounts, constraints.maxCardsPerPlayer)) {
      rejected.push({card, reason: 'PLAYER'});
      continue;
    }
    
    if (violatesGameCardLimit(card, gameCounts, constraints.maxCardsPerGame)) {
      rejected.push({card, reason: 'GAME'});
      continue;
    }
    
    if (violatesTeamCardLimit(card, teamCounts, constraints.maxCardsPerTeam)) {
      rejected.push({card, reason: 'TEAM'});
      continue;
    }
    
    // Accept card
    selected.push(card);
    totalKelly += kelly;
    updateConstraintCounters(card, playerCounts, gameCounts, teamCounts);
  }

  return {
    selectedCards: selected,
    rejectedCards: rejected,
    totals: calculateTotals(selected, totalKelly),
    constraintsHit: getConstraintViolations(),
  };
}
```

### 1C. Integration Points

**Recommended Approach:** Run portfolio selection on every `/api/run/*` call

**Justification:**
- **User experience:** Users see the optimal subset immediately, no extra clicks
- **Consistency:** JSON, Sheets, and web UI all show the same selected set
- **Performance:** Portfolio selection is fast (<100ms for 1000 cards)
- **Simplicity:** Single source of truth for selected cards

**Integration Location:**
```typescript
// In run_optimizer.ts (after card generation)
const allCards = await generateAllCards(); // existing code
const portfolioResult = selectCardPortfolio(allCards);
const markedCards = markCardsWithPortfolio(allCards, portfolioResult);
await writeCardsCsv(markedCards); // includes selected/portfolioRank

// In run_underdog_optimizer.ts (same pattern)
const udCards = await generateUnderdogCards();
const portfolioResult = selectCardPortfolio(udCards);
const markedCards = markCardsWithPortfolio(udCards, portfolioResult);
await writeUnderdogCardsCsv(markedCards);

// In server.ts /api/cards endpoint
app.get("/api/cards", (req, res) => {
  // ... existing loading code ...
  
  // Add portfolio selection if requested
  if (req.query.portfolio === "true") {
    const portfolioResult = selectCardPortfolio(allCards);
    const markedCards = markCardsWithPortfolio(allCards, portfolioResult);
    return res.json({ count: markedCards.length, cards: markedCards });
  }
  
  // Default: return all cards (backward compatibility)
  res.json({ count: allCards.length, cards: allCards });
});
```

**Query Parameter Support:**
- `GET /api/cards?portfolio=true` - Return portfolio-selected cards only
- `GET /api/cards?selected=true` - Return only selected cards (alias)
- `GET /api/cards` - Return all cards (backward compatibility)

---

## Task 2 – Wire Kelly and Portfolio into Sheets

### 2.1 Card CSV/JSON Schema Changes

**New Fields to Add:**
```typescript
// Kelly fields
kellyMeanReturn: number;           // μ: Expected net return per unit stake
kellyVariance: number;             // σ²: Variance of net returns  
kellyRawFraction: number;          // μ/σ²: Raw mean-variance Kelly
kellyCappedFraction: number;       // After 10% raw cap
kellyFinalFraction: number;        // After all constraints (what we use)
kellyStake: number;                // Recommended stake in dollars
kellyExpectedProfit: number;       // Expected profit (stake × cardEv)
kellyMaxWin: number;               // Max possible win
kellyRiskAdjustment: string;       // 'HALF_KELLY', 'CONSERVATIVE', etc.
kellyIsCapped: boolean;            // True if any constraint applied
kellyCapReasons: string;           // Semicolon-separated cap reasons

// Portfolio fields  
selected: boolean;                 // True if in optimal portfolio
portfolioRank: number;             // 1-based rank (undefined if not selected)
efficiencyScore: number;           // EV / (cappedKelly + epsilon)
```

**CSV Header Order (append to existing):**
```csv
# Existing columns... A-N
kellyMeanReturn,kellyVariance,kellyRawFraction,kellyCappedFraction,kellyFinalFraction,kellyStake,kellyExpectedProfit,kellyMaxWin,kellyRiskAdjustment,kellyIsCapped,kellyCapReasons,selected,portfolioRank,efficiencyScore
```

**JSON Structure:**
```json
{
  "cards": [
    {
      // ... existing fields ...
      "kellyResult": {
        "meanReturn": 0.223,
        "variance": 18.87,
        "rawKellyFraction": 0.0118,
        "cappedKellyFraction": 0.01,
        "finalKellyFraction": 0.005,
        "recommendedStake": 3.75,
        "expectedProfit": 0.30,
        "maxPotentialWin": 93.75,
        "riskAdjustment": "HALF_KELLY",
        "isCapped": true,
        "capReasons": ["GLOBAL_MULTIPLIER"]
      },
      "selected": true,
      "portfolioRank": 1,
      "efficiencyScore": 8.0
    }
  ]
}
```

### 2.2 Sheets Column Mapping

**Backend-Driven Columns (filled via CSV push):**

| Column | Current | New Backend Field | Formula Status |
|--------|---------|-------------------|----------------|
| P | KellyStake | `kellyStake` | **REMOVE FORMULA** (now backend-driven) |
| Q | FinalStake | `kellyStake` | **REMOVE FORMULA** (same as KellyStake) |
| R | KellyRaw% | `kellyRawFraction * 100` | **REMOVE FORMULA** |
| S | KellyFinal% | `kellyFinalFraction * 100` | **REMOVE FORMULA** |
| T | ExpectedProfit$ | `kellyExpectedProfit` | **REMOVE FORMULA** |
| U | MaxWin$ | `kellyMaxWin` | **REMOVE FORMULA** |
| V | RiskAdjustment | `kellyRiskAdjustment` | **REMOVE FORMULA** |
| W | Selected | `selected` | **NEW COLUMN** |
| X | PortfolioRank | `portfolioRank` | **NEW COLUMN** |
| Y | EfficiencyScore | `efficiencyScore` | **NEW COLUMN** |

**Formula-Driven Columns (keep existing formulas):**

| Column | Current Formula | Keep? |
|--------|-----------------|-------|
| Z | RiskAlreadyUsedToday | **KEEP** (cumulative sum of selected KellyFinal%) |
| AA | DailyRiskRemaining | **KEEP** (8% - RiskAlreadyUsedToday) |
| AB | RiskStatus | **KEEP** (color coding based on risk usage) |

**Updated `sheets_push_cards.py`:**
```python
# Add to UNIFIED_CSV_HEADER_FIELDS
UNIFIED_CSV_HEADER_FIELDS = [
    # ... existing fields A-N ...
    'kellyMeanReturn', 'kellyVariance', 'kellyRawFraction', 'kellyCappedFraction',
    'kellyFinalFraction', 'kellyStake', 'kellyExpectedProfit', 'kellyMaxWin',
    'kellyRiskAdjustment', 'kellyIsCapped', 'kellyCapReasons', 'selected',
    'portfolioRank', 'efficiencyScore'
]

# Add to csv_to_values_split_and_reorder_unified mapping
def csv_to_values_split_and_reorder_unified(csv_data):
    # ... existing code ...
    
    # Kelly fields (columns O-Y)
    row_data.extend([
        card.get('kellyMeanReturn', 0),
        card.get('kellyVariance', 0),
        card.get('kellyRawFraction', 0),
        card.get('kellyCappedFraction', 0),
        card.get('kellyFinalFraction', 0),
        card.get('kellyStake', 0),
        card.get('kellyExpectedProfit', 0),
        card.get('kellyMaxWin', 0),
        card.get('kellyRiskAdjustment', ''),
        card.get('kellyIsCapped', False),
        card.get('kellyCapReasons', ''),
        card.get('selected', False),
        card.get('portfolioRank', ''),
        card.get('efficiencyScore', 0),
    ])
```

### 2.3 Daily Risk View Formulas

**Total Kelly Used by Selected Cards:**
```excel
=SUMIFS(P:P, W:W, TRUE)  // Sum KellyFinal% for selected cards
```

**Total Dollar Risk vs Bankroll:**
```excel
=SUMIFS(Q:Q, W:W, TRUE)  // Sum KellyStake for selected cards
```

**Risk Budget Utilization:**
```excel
=SUMIFS(P:P, W:W, TRUE) / 0.08  // Percentage of 8% budget used
```

**Add to `SHEETS_FORMULAS.md`:**
```markdown
### Kelly and Portfolio Metrics (Backend-Driven)

Columns P-Y are now populated directly from the optimizer backend:

- **P (KellyStake)**: Recommended stake in dollars from mean-variance Kelly
- **Q (FinalStake)**: Same as KellyStake (kept for backward compatibility)
- **R (KellyRaw%)**: Raw Kelly fraction × 100 (before constraints)
- **S (KellyFinal%)**: Final Kelly fraction × 100 (after all constraints)
- **T (ExpectedProfit$)**: Expected profit = stake × cardEv
- **U (MaxWin$)**: Maximum possible win based on payout structure
- **V (RiskAdjustment)**: 'FULL_KELLY', 'HALF_KELLY', 'QUARTER_KELLY', or 'CONSERVATIVE'
- **W (Selected)**: TRUE if card is in optimal portfolio
- **X (PortfolioRank)**: 1-based rank in selected cards (blank if not selected)
- **Y (EfficiencyScore)**: EV / (cappedKelly + 0.0001)

### Daily Risk Tracking (Formula-Driven)

- **Z (RiskAlreadyUsedToday)**: `=SUMIFS(S:S, W:W, TRUE)`
- **AA (DailyRiskRemaining)**: `=0.08 - Z2` (8% budget minus used)
- **AB (RiskStatus)**: Conditional formatting based on Z2 vs 0.08
```

---

## Task 3 – Web API and React Dashboard Integration

### 3.1 API Layer Updates

**Updated `/api/cards` Response:**
```typescript
interface CardApiResponse {
  // ... existing fields ...
  kellyResult?: {
    rawKellyFraction: number;
    cappedKellyFraction: number;
    finalKellyFraction: number;
    recommendedStake: number;
    expectedProfit: number;
    riskAdjustment: string;
    isCapped: boolean;
  };
  selected?: boolean;
  portfolioRank?: number;
  efficiencyScore?: number;
}

// Response structure
interface CardsResponse {
  count: number;
  cards: CardApiResponse[];
  portfolio?: {  // Only included when ?portfolio=true
    selectedCount: number;
    totalKellyFraction: number;
    totalStake: number;
    totalExpectedProfit: number;
    riskBudgetUsed: number;
  };
}
```

**Backward Compatibility Strategy:**
- All new fields are optional (`?`) in the interface
- Existing clients ignore unknown fields
- Add `version` field if needed for future breaking changes

**Server Implementation:**
```typescript
app.get("/api/cards", (req, res) => {
  // ... existing card loading ...
  
  const includePortfolio = req.query.portfolio === "true" || req.query.selected === "true";
  let responseCards = allCards;
  let portfolioSummary;
  
  if (includePortfolio) {
    const portfolioResult = selectCardPortfolio(allCards);
    responseCards = markCardsWithPortfolio(allCards, portfolioResult);
    
    portfolioSummary = {
      selectedCount: portfolioResult.selectedCards.length,
      totalKellyFraction: portfolioResult.totals.totalKellyFraction,
      totalStake: portfolioResult.totals.totalStake,
      totalExpectedProfit: portfolioResult.totals.totalExpectedProfit,
      riskBudgetUsed: portfolioResult.totals.riskBudgetUsed,
    };
  }
  
  const response: CardsResponse = {
    count: responseCards.length,
    cards: responseCards,
    ...(portfolioSummary && { portfolio: portfolioSummary }),
  };
  
  res.json(response);
});
```

### 3.2 React Dashboard Changes

**CardsTable Component - New Columns:**
```typescript
// Add to column definitions
const columns = [
  // ... existing columns ...
  {
    header: "Kelly %",
    accessor: "kellyResult.finalKellyFraction",
    Cell: ({ value }) => `${(value * 100).toFixed(2)}%`,
    sortType: "number",
  },
  {
    header: "Stake $",
    accessor: "kellyResult.recommendedStake", 
    Cell: ({ value }) => `$${value.toFixed(2)}`,
    sortType: "number",
  },
  {
    header: "Exp Profit $",
    accessor: "kellyResult.expectedProfit",
    Cell: ({ value }) => `$${value.toFixed(2)}`,
    sortType: "number",
  },
  {
    header: "Risk",
    accessor: "kellyResult.riskAdjustment",
    Cell: ({ value }) => (
      <span className={`risk-${value.toLowerCase()}`}>
        {value.replace('_', ' ')}
      </span>
    ),
  },
  {
    header: "Selected",
    accessor: "selected",
    Cell: ({ value }) => (
      <span className={`selected-${value ? 'yes' : 'no'}`}>
        {value ? '✓' : '✗'}
      </span>
    ),
  },
  {
    header: "Rank",
    accessor: "portfolioRank",
    Cell: ({ value }) => value || '-',
  },
  {
    header: "Efficiency",
    accessor: "efficiencyScore",
    Cell: ({ value }) => value?.toFixed(1) || '-',
    sortType: "number",
  },
];
```

**Default Sorting:**
```typescript
// Default sort: selected first, then by portfolio rank, then by efficiency
const initialState = {
  sortBy: [
    { id: 'selected', desc: true },
    { id: 'portfolioRank', desc: false },
    { id: 'efficiencyScore', desc: true },
  ],
};
```

**CSS Classes for Styling:**
```css
/* Risk adjustment colors */
.risk-full_kelly { color: #dc2626; font-weight: bold; }
.risk-half_kelly { color: #f59e0b; }
.risk-quarter_kelly { color: #10b981; }
.risk-conservative { color: #6b7280; }

/* Selection indicators */
.selected-yes { color: #059669; font-weight: bold; }
.selected-no { color: #6b7280; }
```

**UX Enhancements:**
```typescript
// Toggle for selected cards only
const [showSelectedOnly, setShowSelectedOnly] = useState(false);

const filteredCards = useMemo(() => {
  if (!showSelectedOnly) return cards;
  return cards.filter(card => card.selected);
}, [cards, showSelectedOnly]);

// Running totals for visible cards
const visibleTotals = useMemo(() => {
  return cards.reduce((acc, card) => {
    if (card.selected) {
      acc.kellyFraction += card.kellyResult?.finalKellyFraction || 0;
      acc.stake += card.kellyResult?.recommendedStake || 0;
      acc.expectedProfit += card.kellyResult?.expectedProfit || 0;
      acc.count += 1;
    }
    return acc;
  }, { kellyFraction: 0, stake: 0, expectedProfit: 0, count: 0 });
}, [cards]);

// Display in header
<div className="portfolio-summary">
  <span>Selected: {visibleTotals.count} cards</span>
  <span>Risk: {(visibleTotals.kellyFraction * 100).toFixed(2)}%</span>
  <span>Stake: ${visibleTotals.stake.toFixed(2)}</span>
  <span>Exp Profit: ${visibleTotals.expectedProfit.toFixed(2)}</span>
</div>
```

**Component Integration:**
```typescript
// In RunPanel or CardsTable component
const { data: cardsData, isLoading } = useQuery({
  queryKey: ['cards', { portfolio: true }], // Always get portfolio results
  queryFn: () => fetch('/api/cards?portfolio=true').then(r => r.json()),
});

// Show portfolio summary when available
{cardsData?.portfolio && (
  <PortfolioSummary portfolio={cardsData.portfolio} />
)}

// Toggle switch
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={showSelectedOnly}
    onChange={(e) => setShowSelectedOnly(e.target.checked)}
  />
  Show selected cards only
</label>
```

---

## Task 4 – Validation and Safety Checklist

### 4.1 Unit-Style Checks

**Portfolio Selector Test Cases:**

```typescript
// Test 1: Simple budget constraint
const cards = [
  createMockCard('6F', 0.08, 0.02),  // 2% Kelly, high efficiency
  createMockCard('6F', 0.06, 0.03),  // 3% Kelly, medium efficiency  
  createMockCard('6F', 0.04, 0.04),  // 4% Kelly, low efficiency
];
const result = selectCardPortfolio(cards, { dailyRiskBudget: 0.05 }); // 5% budget

// Should select first two (2% + 3% = 5%), reject third
assert(result.selectedCards.length === 2);
assert(result.totals.totalKellyFraction === 0.05);
assert(result.rejectedCards[0].reason === 'RISK_BUDGET');

// Test 2: Player constraint
const playerCards = [
  createMockCardWithPlayer('6F', 0.08, 0.01, 'LeBron James'),
  createMockCardWithPlayer('6F', 0.07, 0.01, 'LeBron James'),
  createMockCardWithPlayer('6F', 0.06, 0.01, 'LeBron James'),
  createMockCardWithPlayer('6F', 0.05, 0.01, 'LeBron James'), // 4th LeBron card
];
const result2 = selectCardPortfolio(playerCards, { maxCardsPerPlayer: 3 });

// Should select first 3, reject 4th
assert(result2.selectedCards.length === 3);
assert(result2.rejectedCards[0].reason === 'PLAYER');
assert(result2.rejectedCards[0].card.legs[0].pick.player === 'LeBron James');
```

**Kelly Calculation Test Cases:**

```typescript
// Test 1: UD 6F with known distribution
const hitDist = { 6: 0.031, 5: 0.145, 4: 0.282, 3: 0.189, 2: 0.084, 1: 0.025, 0: 0.044 };
const kelly = computeKellyForCard(0.08, hitDist, '6F', 'underdog');

assert(Math.abs(kelly.meanReturn - 0.223) < 0.001, "Mean return should be ~0.223");
assert(Math.abs(kelly.variance - 18.87) < 0.01, "Variance should be ~18.87");
assert(Math.abs(kelly.rawKellyFraction - 0.0118) < 0.0001, "Raw Kelly should be ~1.18%");
assert(kelly.riskAdjustment === 'HALF_KELLY', "Should apply half-Kelly");

// Test 2: PP 5F with high EV
const ppKelly = computeKellyForCard(0.10, computePrizePicksHitDistribution(mockLegs, '5F'), '5F', 'prizepicks');
assert(ppKelly.finalKellyFraction > 0.01, "Strong PP card should get >1% Kelly");
assert(ppKelly.finalKellyFraction <= 0.05, "Should respect 5% per-card cap");
```

### 4.2 End-to-End Sanity Check

**Single Run Verification:**

1. **Run PrizePicks optimizer:**
   ```bash
   npm run run:pp
   ```
   - Verify `prizepicks-cards.json` contains Kelly fields
   - Check that `kellyFinalFraction` values are reasonable (0.1-5%)
   - Confirm `selected` field is populated for some cards

2. **Check CSV export:**
   ```bash
   head -1 prizepicks-cards.csv | tr ',' '\n' | grep -E "(kelly|selected|portfolio)"
   ```
   - Should see new Kelly and portfolio columns
   - Verify data values look reasonable

3. **Push to Sheets:**
   ```bash
   python sheets_push_cards.py
   ```
   - Open `NBA-Props-29.xlsx` → `Cards_Data` tab
   - Verify columns P-Y are populated with Kelly data
   - Check column W (Selected) has TRUE/FALSE values
   - Confirm column Z (RiskAlreadyUsedToday) sums selected KellyFinal%

4. **Test Web UI:**
   - Navigate to `http://localhost:4000`
   - Click "Run PrizePicks Optimizer"
   - Verify cards table shows new Kelly columns
   - Toggle "Show selected cards only"
   - Check portfolio summary totals match Sheets

5. **Cross-Platform Consistency:**
   - Compare selected cards count: JSON vs Sheets vs Web UI
   - Verify total Kelly fraction matches across all platforms
   - Check that same cards are marked as selected everywhere

**Expected Results:**
- **Strong 6F card (8% EV)**: Kelly ~1.2%, stake ~$9, selected = TRUE
- **Medium 5F card (5% EV)**: Kelly ~0.8%, stake ~$6, selected = TRUE  
- **Weak 4F card (3% EV)**: Kelly ~0.3%, stake ~$2, selected = FALSE (budget constraint)
- **Total risk**: Should be ≤ 8% of bankroll (~$60 on $750 bankroll)

**Safety Checks:**
- No card has `kellyFinalFraction` > 0.05 (5% cap)
- Sum of selected `kellyFinalFraction` ≤ 0.08 (8% budget)
- All selected cards have `cardEv` ≥ 0.03 (3% minimum)
- No player appears in >3 selected cards
- No game appears in >5 selected cards

---

## Implementation Checklist

### Portfolio Selector
- [ ] Create `src/portfolio_selector.ts`
- [ ] Update `src/types.ts` with portfolio fields
- [ ] Add portfolio selection to optimizers
- [ ] Test portfolio constraints and efficiency scoring

### CSV/JSON Integration  
- [ ] Add Kelly columns to card CSV exports
- [ ] Add portfolio columns to card CSV exports
- [ ] Update `sheets_push_cards.py` with new fields
- [ ] Test CSV import to Sheets

### API Updates
- [ ] Update `/api/cards` response with Kelly/portfolio fields
- [ ] Add portfolio summary when `?portfolio=true`
- [ ] Test backward compatibility

### Web UI Updates
- [ ] Add Kelly columns to CardsTable
- [ ] Add selection toggle and portfolio summary
- [ ] Add styling for risk adjustment levels
- [ ] Test sorting and filtering

### Documentation
- [ ] Update `SHEETS_FORMULAS.md` with backend-driven columns
- [ ] Add portfolio selection documentation
- [ ] Update API documentation

### Testing
- [ ] Unit tests for portfolio selector
- [ ] Unit tests for Kelly calculation
- [ ] End-to-end integration test
- [ ] Cross-platform consistency check
