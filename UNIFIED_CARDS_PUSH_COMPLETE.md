# Unified Cards Push Implementation Complete

## 🎯 **IMPLEMENTATION COMPLETE**

### **✅ Goal Achieved**
Extended the cards Sheets push script to handle both PrizePicks and Underdog cards in a unified workflow with clear platform identification.

## 🔄 **Updated Workflow**

### **Before (Separate Workflows):**
```bash
# PrizePicks only
npx tsc -p .
node dist/run_optimizer.js
py sheets_push_legs.py
py sheets_push_cards.py

# Underdog only (no Sheets integration)
npx ts-node src/scripts/scrape_underdog_champions.ts
npx tsc -p .
node dist/run_underdog_optimizer.js
```

### **After (Unified Workflow):**
```bash
# PrizePicks
npx tsc -p .
node dist/run_optimizer.js
py sheets_push_legs.py

# Underdog
npx ts-node src/scripts/scrape_underdog_champions.ts
npx tsc -p .
node dist/run_underdog_optimizer.js

# Unified cards push (handles both platforms)
py sheets_push_cards.py
```

## 📊 **Unified Sheets Layout**

### **Single "Cards" Tab with Site Column**
```
A: runTimestamp (Date)
B: Card_ID (empty)
C: Site (PP or UD)          ← NEW - Platform identifier
D: Slip (flexType)
E: Legs (count)
F-K: Leg1_ID..Leg6_ID
L: AvgProb
M: AvgEdge%
N: CardEV%
O: WinProbCash
```

### **Final Header Row:**
```
site,flexType,cardEv,winProbCash,winProbAny,avgProb,avgEdgePct,leg1Id,leg2Id,leg3Id,leg4Id,leg5Id,leg6Id,runTimestamp
```

## 🔧 **Technical Implementation**

### **✅ Enhanced CSV Loading**
```python
def load_cards_from_csv(csv_path: str, default_site: str):
    """
    Load cards from CSV and normalize to unified schema
    - Handles missing files gracefully
    - Normalizes site field (PP/UD)
    - Validates required columns
    - Returns standardized row format
    """
```

### **✅ Unified Data Processing**
```python
def csv_to_values_split_and_reorder_unified(pp_rows, ud_rows):
    """
    Convert both PrizePicks and Underdog rows to Sheets format:
    - Processes both platforms separately
    - Maintains site identification
    - Standardizes column order
    - Calculates leg counts
    """
```

### **✅ Enhanced Main Function**
```python
def main(dry_run: bool = False):
    # Load both platforms
    pp_rows = load_cards_from_csv(PRIZEPICKS_CSV_PATH, "PP")
    ud_rows = load_cards_from_csv(UNDERDOG_CSV_PATH, "UD")
    
    # Log detailed summary
    print(f"Loaded {pp_count} PrizePicks rows, {ud_count} Underdog rows, total {total_count} rows")
    
    # Push unified data to single Sheets tab
```

## 📋 **File Structure Changes**

### **Modified:**
```
sheets_push_cards.py  # Enhanced for multi-platform support
```

### **New Constants:**
```python
PRIZEPICKS_CSV_PATH = "prizepicks-cards.csv"
UNDERDOG_CSV_PATH = "underdog-cards.csv"
UNIFIED_CSV_HEADER_FIELDS = [
    "site", "flexType", "cardEv", "winProbCash", "winProbAny", 
    "avgProb", "avgEdgePct", "leg1Id", "leg2Id", "leg3Id", 
    "leg4Id", "leg5Id", "leg6Id", "runTimestamp"
]
```

### **Sheets Range Updates:**
```python
# Expanded from A–N to A–O for site column
TARGET_RANGE = "Cards_Data!A2"
CLEAR_RANGE = "Cards_Data!A2:O"
```

## 🚀 **Usage Examples**

### **Normal Operation:**
```bash
python sheets_push_cards.py
```

**Expected Output:**
```
Loaded 45 PrizePicks rows, 28 Underdog rows, total 73 rows
Converted 73 rows to Sheets format
Pushed 45 PrizePicks rows, 28 Underdog rows, total 73 rows to Cards tab
```

### **Dry Run (Testing):**
```bash
python sheets_push_cards.py --dry-run
```

**Expected Output:**
```
Loaded 45 PrizePicks rows, 28 Underdog rows, total 73 rows
Converted 73 rows to Sheets format
Dry run: skipping Sheets clear/update.
```

### **Missing File Handling:**
```bash
# If underdog-cards.csv doesn't exist
WARNING: CSV file not found: underdog-cards.csv
Loaded 45 PrizePicks rows, 0 Underdog rows, total 45 rows
Pushed 45 PrizePicks rows, 0 Underdog rows, total 45 rows to Cards tab
```

## 📊 **Benefits Achieved**

### **✅ Unified Analysis**
- **Single Tab**: Both platforms in one place
- **Easy Filtering**: Filter by site column (PP vs UD)
- **Cross-Platform Comparison**: Side-by-side performance
- **Consistent Metrics**: Same format for both platforms

### **✅ Operational Efficiency**
- **Single Script**: One command for both platforms
- **Graceful Degradation**: Works if either platform is missing
- **Clear Logging**: Detailed visibility into data sources
- **Error Resilience**: Handles missing files gracefully

### **✅ Backward Compatibility**
- **PrizePicks Unchanged**: Existing workflow preserved
- **Same Authentication**: Uses existing Google Sheets credentials
- **Same Sheet Location**: Updates existing Cards_Data tab
- **Same API Usage**: No changes to Sheets API calls

## 🔄 **Data Flow**

### **Input Files:**
```
prizepicks-cards.csv     # PrizePicks cards (no site column)
underdog-cards.csv      # Underdog cards (with site='UD')
```

### **Processing:**
```
1. Load PrizePicks CSV → Add site='PP' if missing
2. Load Underdog CSV → Use existing site='UD'
3. Normalize both to unified schema
4. Combine into single dataset
5. Convert to Sheets column order
6. Push to unified Cards tab
```

### **Output:**
```
Google Sheets Cards_Data tab:
- Columns A–O with unified data
- Site column for platform identification
- All PrizePicks and Underdog cards mixed
- Ready for filtering and analysis
```

## 📈 **Expected Results**

### **When Both Platforms Have Data:**
- ✅ **50+ PrizePicks cards** + **20+ Underdog cards** = **70+ total cards**
- ✅ **Platform comparison** in single view
- ✅ **Cross-platform insights** and analysis

### **When Only One Platform Has Data:**
- ✅ **Graceful handling** of missing platform
- ✅ **Clear logging** of what was loaded
- ✅ **Partial data push** still works

### **Sheets Analysis Capabilities:**
- ✅ **Filter by site**: Show only PP or only UD cards
- ✅ **Compare performance**: Side-by-side platform metrics
- ✅ **Unified reporting**: Single source for card analytics
- ✅ **Historical tracking**: Both platforms in one timeline

## 🎯 **Implementation Success**

The unified cards push script now provides:

- ✅ **Multi-platform support** (PrizePicks + Underdog)
- ✅ **Unified Sheets workflow** (single tab, site identification)
- ✅ **Graceful error handling** (missing files, empty data)
- ✅ **Clear operational logging** (detailed summaries)
- ✅ **Backward compatibility** (existing PrizePicks workflow unchanged)
- ✅ **Future extensibility** (easy to add more platforms)

**The cards push layer is now unified and ready for cross-platform analysis!** 🚀

## 🔄 **Complete Run Sequence**

### **Daily Workflow:**
```bash
# 1. Scrape Underdog data
npx ts-node src/scripts/scrape_underdog_champions.ts

# 2. Run PrizePicks optimizer
npx tsc -p .
node dist/run_optimizer.js

# 3. Run Underdog optimizer
node dist/run_underdog_optimizer.js

# 4. Push legs (separate scripts)
py sheets_push_legs.py

# 5. Push unified cards (NEW - handles both platforms)
py sheets_push_cards.py
```

### **Result:**
- **PrizePicks legs** → Legs_Data tab
- **Underdog legs** → UD_Legs tab (existing)
- **PrizePicks + Underdog cards** → unified Cards_Data tab

**Complete cross-platform data pipeline operational!** 🎯
