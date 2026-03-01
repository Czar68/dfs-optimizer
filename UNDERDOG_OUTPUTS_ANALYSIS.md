# Underdog Outputs Analysis and Cards Data Strategy

## 📊 **Current Underdog Outputs Inventory**

### **✅ Underdog Legs Output (Already Exists)**
- **JSON Path**: `underdog-legs.json` (root directory)
- **CSV Path**: `underdog-legs.csv` (root directory)
- **Schema**: Full leg data with site, league, player, line, odds, EV, etc.
- **Consumption**: Already pushed to existing "UD legs" Sheets page via `sheets_push_legs.py`

### **✅ Underdog Cards Output (Already Exists)**
- **JSON Path**: `underdog-cards.json` (root directory)
- **CSV Path**: `underdog-cards.csv` (root directory)
- **Schema**: Custom Underdog format with structure-specific data
- **Current Status**: **No dedicated Sheets consumption** - cards exist but not pushed to Sheets

## 🔍 **Current Underdog Cards Schema Analysis**

### **Existing Underdog Cards JSON Structure:**
```json
{
  "format": "UD_3F_STD",
  "cardEv": 0.025,
  "winProbCash": 0.142,
  "winProbAny": 0.389,
  "legsSummary": [
    {
      "site": "underdog",
      "league": "NBA",
      "player": "LeBron James",
      "team": "LAL",
      "opponent": "BOS",
      "stat": "Points",
      "line": 25.5,
      "outcome": "over",
      "trueProb": 0.62,
      "edge": 0.08
    }
  ],
  "runTimestamp": "2025-01-08T12:30:00.000Z"
}
```

### **Existing Underdog Cards CSV Structure:**
```csv
format,cardEv,winProbCash,winProbAny,legsSummary,runTimestamp
UD_3F_STD,0.025,0.142,0.389,"LeBron James Points 25.5 over (edge=0.0800) | ...",2025-01-08T12:30:00.000Z
```

## 📋 **PrizePicks Cards Schema Comparison**

### **PrizePicks Cards JSON Structure:**
```json
{
  "runTimestamp": "2025-01-08T12:30:00.000Z",
  "cards": [
    {
      "flexType": "flex",
      "legs": [...],
      "stake": 1,
      "totalReturn": 5.0,
      "expectedValue": 0.25,
      "winProbability": 0.20,
      "cardEv": 0.025,
      "winProbCash": 0.142,
      "winProbAny": 0.389,
      "avgProb": 0.58,
      "avgEdgePct": 8.2,
      "hitDistribution": {...}
    }
  ]
}
```

### **PrizePicks Cards CSV Structure:**
```csv
flexType,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp
flex,0.025,0.142,0.389,0.58,8.2,id1,id2,id3,,,2025-01-08T12:30:00.000Z
```

## 🎯 **Schema Compatibility Analysis**

### **✅ Shared Fields (Compatible):**
- `cardEv` - Card expected value
- `winProbCash` - Probability of cashing
- `winProbAny` - Probability of any positive return
- `runTimestamp` - Run timestamp
- `legs` - Leg data structure (similar)

### **❌ Missing Fields (Underdog → PrizePicks):**
- `flexType` - Underdog uses `format` (UD_3F_STD)
- `avgProb` - Average leg probability
- `avgEdgePct` - Average leg edge percentage
- `leg1Id, leg2Id, etc.` - Individual leg IDs
- `stake` - Stake amount
- `totalReturn` - Total return on win
- `expectedValue` - Expected profit per unit stake
- `hitDistribution` - Full hit distribution

### **❌ Missing Fields (PrizePicks → Underdog):**
- `format` - Structure ID (UD_3F_STD, UD_5P_INS, etc.)
- `legsSummary` - Formatted leg summary string

## 🚀 **Recommended Strategy: Option A - Shared Schema**

### **Decision: Use PrizePicks Schema with Platform Flag**

**Rationale:**
1. **PrizePicks schema is more comprehensive** - includes all necessary analytics fields
2. **Minimal changes required** - extend existing `sheets_push_cards.py` with platform filtering
3. **Unified Sheets workflow** - single "cards" tab can handle both platforms
4. **Future-proof** - easy to add more platforms with same schema

### **Proposed Unified Schema:**
```json
{
  "runTimestamp": "2025-01-08T12:30:00.000Z",
  "cards": [
    {
      "site": "UD",                    // Platform flag
      "flexType": "standard",          // Map from structure type
      "structureId": "UD_3F_STD",     // Underdog structure ID
      "legs": [...],
      "stake": 1,
      "totalReturn": 3.0,
      "expectedValue": 0.25,
      "winProbability": 0.20,
      "cardEv": 0.025,
      "winProbCash": 0.142,
      "winProbAny": 0.389,
      "avgProb": 0.58,
      "avgEdgePct": 8.2,
      "hitDistribution": {...}
    }
  ]
}
```

### **CSV Schema (Extended):**
```csv
site,flexType,structureId,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp
UD,standard,UD_3F_STD,0.025,0.142,0.389,0.58,8.2,id1,id2,id3,,,,2025-01-08T12:30:00.000Z
PP,flex,,0.025,0.142,0.389,0.58,8.2,id1,id2,id3,,,,2025-01-08T12:30:00.000Z
```

## 📝 **Implementation Plan**

### **Step 1: Update Underdog Cards Output**
- **Function**: `writeUnderdogCardsToFile()`
- **Format**: Match PrizePicks schema with additional fields
- **Path**: `underdog-cards.json` (overwrite existing)
- **Fields**: Add `site: "UD"`, `avgProb`, `avgEdgePct`, leg IDs, etc.

### **Step 2: Extend Sheets Push Script**
- **File**: `sheets_push_cards.py`
- **Changes**: Add `site` column header and platform filtering
- **Benefit**: Single script handles both platforms
- **Backward compatibility**: Existing PrizePicks workflow unchanged

### **Step 3: Update Run Sequence**
```bash
# PrizePicks (unchanged)
npx tsc -p .
node dist/run_optimizer.js
py sheets_push_legs.py
py sheets_push_cards.py

# Underdog (new cards output)
npx tsc -p .
node dist/run_underdog_optimizer.js
# Future: py sheets_push_cards.py (extended to handle UD)
```

## 🎯 **Benefits of Unified Approach**

### **✅ Advantages:**
1. **Single Sheets tab** - "cards" tab shows both platforms
2. **Unified analytics** - Same metrics across platforms
3. **Easy comparison** - Side-by-side platform performance
4. **Minimal maintenance** - One script, one schema
5. **Future scalability** - Easy to add more platforms

### **✅ Backward Compatibility:**
- PrizePicks workflow completely unchanged
- Existing Sheets formulas and references preserved
- No migration required for PrizePicks data

### **✅ Enhanced Analytics:**
- Underdog gets same detailed analytics as PrizePicks
- Platform comparison possible in Sheets
- Consistent metrics across platforms

## 🔧 **Next Steps**

1. **Implement `writeUnderdogCardsToFile()`** with unified schema
2. **Test Underdog output** matches PrizePicks format
3. **Extend `sheets_push_cards.py`** with platform support
4. **Update run sequence documentation**
5. **Test end-to-end workflow** with both platforms

**Result**: Both platforms output to same schema, enabling unified Sheets workflow and cross-platform analytics.
