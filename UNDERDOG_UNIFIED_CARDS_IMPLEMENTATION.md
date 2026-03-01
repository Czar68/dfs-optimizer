# Underdog Unified Cards Implementation Complete

## 🎯 **IMPLEMENTATION COMPLETE**

### **✅ Current Underdog Outputs Inventory**

#### **Underdog Legs Output (Already Existed)**
- **JSON Path**: `underdog-legs.json` (root directory)
- **CSV Path**: `underdog-legs.csv` (root directory)
- **Schema**: Full leg data with site, league, player, line, odds, EV, etc.
- **Consumption**: Already pushed to existing "UD legs" Sheets page via `sheets_push_legs.py`

#### **Underdog Cards Output (Now Unified)**
- **JSON Path**: `underdog-cards.json` (root directory) - **UPDATED**
- **CSV Path**: `underdog-cards.csv` (root directory) - **UPDATED**
- **Schema**: Now matches PrizePicks unified schema with platform flag
- **Consumption**: Ready for extended `sheets_push_cards.py` or dedicated script

## 🔄 **Unified Schema Implementation**

### **✅ Before (Underdog-Specific Schema):**
```json
{
  "format": "UD_3F_STD",
  "cardEv": 0.025,
  "winProbCash": 0.142,
  "winProbAny": 0.389,
  "legsSummary": [...],
  "runTimestamp": "2025-01-08T12:30:00.000Z"
}
```

### **✅ After (Unified Schema):**
```json
{
  "runTimestamp": "2025-01-08T12:30:00.000Z",
  "cards": [
    {
      "site": "UD",                    // Platform identifier
      "flexType": "3F",                 // Mapped to PrizePicks codes
      "structureId": "UD_3F_STD",      // Underdog structure ID
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
      "hitDistribution": {...},
      "legIds": ["id1", "id2", "id3"]
    }
  ]
}
```

### **✅ CSV Schema (Unified):**
```csv
site,flexType,structureId,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp
UD,3F,UD_3F_STD,0.025,0.142,0.389,0.58,8.2,id1,id2,id3,,,,2025-01-08T12:30:00.000Z
UD,4P,UD_4P_STD,0.030,0.165,0.425,0.62,7.8,id1,id2,id3,id4,,,2025-01-08T12:30:00.000Z
UD,5P,UD_5P_INS,0.045,0.195,0.485,0.71,9.1,id1,id2,id3,id4,id5,,2025-01-08T12:30:00.000Z
```

## 🔧 **Implementation Details**

### **✅ Structure Type Mapping**
```typescript
// Underdog Structure → PrizePicks FlexType Mapping
UD_3F_STD  → "3F"  (flexible payout)
UD_4F_STD  → "4F"  (flexible payout)
UD_5F_STD  → "5F"  (flexible payout)

UD_2P_STD  → "2P"  (standard power)
UD_3P_STD  → "3P"  (standard power)
UD_4P_STD  → "4P"  (standard power)
UD_5P_STD  → "5P"  (standard power)
UD_6P_STD  → "6P"  (standard power)

UD_4P_INS  → "4P"  (insured → closest power equivalent)
UD_5P_INS  → "5P"  (insured → closest power equivalent)
UD_6P_INS  → "6P"  (insured → closest power equivalent)
UD_7P_INS  → "6P"  (insured → closest power equivalent)
UD_8P_INS  → "6P"  (insured → closest power equivalent)
```

### **✅ Enhanced Analytics**
- **avgProb**: Average leg probability (calculated from leg trueProb)
- **avgEdgePct**: Average leg edge percentage (calculated from leg edge * 100)
- **legIds**: Individual leg IDs for CSV leg1Id, leg2Id, etc.
- **site**: Platform identifier ("UD" for Underdog)
- **structureId**: Original Underdog structure ID for reference

### **✅ Backward Compatibility**
- **PrizePicks workflow unchanged**: Still uses `prizepicks-cards.json/csv`
- **Underdog legs unchanged**: Still uses `underdog-legs.json/csv`
- **Sheets scripts**: PrizePicks `sheets_push_cards.py` works as before
- **Future extension**: `sheets_push_cards.py` can be extended to handle both platforms

## 📊 **Run Sequence Updated**

### **✅ PrizePicks (Unchanged):**
```bash
npx tsc -p .
node dist/run_optimizer.js
py sheets_push_legs.py
py sheets_push_cards.py
```

### **✅ Underdog (New Unified Output):**
```bash
npx tsc -p .
node dist/run_underdog_optimizer.js
# Future: py sheets_push_cards.py (extended to handle UD)
```

### **✅ Output Files:**
```
PrizePicks:
├── prizepicks-cards.json    (unified schema)
├── prizepicks-cards.csv     (unified schema)
└── prizepicks-legs.csv

Underdog:
├── underdog-cards.json      (unified schema - NEW)
├── underdog-cards.csv       (unified schema - NEW)
└── underdog-legs.csv
```

## 🚀 **Benefits of Unified Approach**

### **✅ Single Sheets Workflow**
- **Unified "cards" tab**: Can display both PrizePicks and Underdog cards
- **Platform comparison**: Side-by-side performance analysis
- **Consistent metrics**: Same analytics across platforms
- **Easy filtering**: Filter by `site` column ("PP" vs "UD")

### **✅ Enhanced Underdog Analytics**
- **Detailed metrics**: Now includes avgProb, avgEdgePct, leg IDs
- **Platform identification**: Clear `site: "UD"` flag
- **Structure tracking**: Original `structureId` preserved
- **Compatibility**: Works with existing PrizePicks tools

### **✅ Future Extensibility**
- **Multi-platform support**: Easy to add DraftKings, FanDuel, etc.
- **Single codebase**: One schema for all platforms
- **Consistent tools**: Same Sheets scripts for all platforms
- **Scalable architecture**: Easy to maintain and extend

## 📋 **Next Steps for Sheets Integration**

### **✅ Option A: Extend Existing Script**
```python
# sheets_push_cards.py (extended)
CSV_PATH = "prizepicks-cards.csv"  # Or make configurable
UD_CSV_PATH = "underdog-cards.csv"

# Add site column to header
CSV_HEADER_FIELDS = [
    "site",        # NEW - Platform identifier
    "flexType",
    "structureId", # NEW - Underdog structure ID
    "cardEv",
    # ... rest of existing fields
]
```

### **✅ Option B: Dedicated Script**
```python
# sheets_push_ud_cards.py (new)
CSV_PATH = "underdog-cards.csv"
TARGET_RANGE = "UD_Cards!A2"  # Dedicated tab
```

### **✅ Sheets Layout Options**
1. **Single "cards" tab**: Both platforms with site filtering
2. **Dedicated "UD_cards" tab**: Underdog-specific layout
3. **Platform tabs**: "PP_cards" and "UD_cards" separate

## 🎯 **Production Ready**

The Underdog optimizer now provides:

- ✅ **Unified cards schema**: Compatible with PrizePicks format
- ✅ **Enhanced analytics**: avgProb, avgEdgePct, leg IDs, site flag
- ✅ **Platform identification**: Clear "UD" vs "PP" separation
- ✅ **Backward compatibility**: PrizePicks workflow unchanged
- ✅ **Future-ready**: Easy Sheets integration and multi-platform support

**Underdog cards are now ready for unified Sheets consumption alongside PrizePicks!** 🚀

## 📈 **Example Output**

### **JSON Structure:**
```json
{
  "runTimestamp": "2025-01-08T12:30:00.000Z",
  "cards": [
    {
      "site": "UD",
      "flexType": "3F",
      "structureId": "UD_3F_STD",
      "cardEv": 0.025,
      "winProbCash": 0.142,
      "winProbAny": 0.389,
      "avgProb": 0.58,
      "avgEdgePct": 8.2,
      "legIds": ["ud_leg_123", "ud_leg_456", "ud_leg_789"],
      "legs": [...],
      "stake": 1,
      "totalReturn": 3.0,
      "expectedValue": 0.25,
      "winProbability": 0.20,
      "hitDistribution": {"0": 0.42, "1": 0.38, "2": 0.15, "3": 0.05}
    }
  ]
}
```

### **CSV Structure:**
```csv
site,flexType,structureId,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp
UD,3F,UD_3F_STD,0.025,0.142,0.389,0.58,8.2,ud_leg_123,ud_leg_456,ud_leg_789,,,,2025-01-08T12:30:00.000Z
```

**Ready for production use and Sheets integration!** 🎯
