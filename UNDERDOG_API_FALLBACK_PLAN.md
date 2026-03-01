# Underdog API Fallback Plan

## 🚨 **Current API Issues**

### **Problem Summary:**
- **API endpoints tested**: Multiple endpoints tried (v4, v5, beta, games, pickem, over_under_lines)
- **Errors encountered**: 
  - `422 Unprocessable Entity` with `cdn_circuit_breaker` (API temporarily blocked)
  - `404 Not Found` (endpoints don't exist or not publicly accessible)
- **Root cause**: Underdog's API likely requires authentication, API keys, or uses different endpoints

### **Expected vs Actual:**
- **Expected**: 50+ NBA props from champions page
- **Actual**: API errors returning 0 props
- **Champions page**: `https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA` shows many props

## 🔄 **Immediate Solutions**

### **Option 1: Manual Data Entry (Quick Fix)**
Create a simple JSON file with data copied from the champions page:

```json
// underdog_manual_props.json
{
  "props": [
    {
      "player": "LeBron James",
      "team": "LAL", 
      "opponent": "GSW",
      "stat": "points",
      "line": 25.5,
      "overOdds": -110,
      "underOdds": -110
    },
    // ... add more props from champions page
  ]
}
```

### **Option 2: Web Scraping (Technical)**
Use a headless browser to scrape the champions page:
- Puppeteer/Playwright to navigate to the page
- Extract prop data from the DOM
- Convert to RawPick format

### **Option 3: API Authentication (Production)**
- Register for Underdog API access
- Obtain API keys/tokens
- Update headers with proper authentication

## 🛠️ **Recommended Implementation**

### **Phase 1: Manual Fallback (Today)**
1. Create manual data entry function
2. Allow optimizer to run with sample data
3. Test unified cards schema works

### **Phase 2: Web Scraping (This Week)**
1. Implement web scraping solution
2. Extract data from champions page automatically
3. Maintain same RawPick output format

### **Phase 3: API Access (Long-term)**
1. Contact Underdog for API access
2. Implement proper authentication
3. Use official API endpoints

## 📊 **Data Format Requirements**

The optimizer expects data in this format:
```typescript
interface RawPick {
  site: "underdog";
  league: "NBA";
  player: string;
  team: string | null;
  opponent: string | null;
  stat: StatCategory;
  line: number;
  projectionId: string;
  gameId: string | null;
  startTime: string | null;
  isDemon: false;
  isGoblin: false;
  isPromo: false;
}
```

## 🎯 **Next Steps**

### **Immediate Action:**
1. **Create manual data file** with 10-20 sample props from champions page
2. **Test optimizer** with manual data to verify everything works
3. **Generate cards** to test unified schema

### **Short-term:**
1. **Implement web scraping** for automated data collection
2. **Schedule daily runs** to get fresh data
3. **Monitor data quality** and consistency

### **Long-term:**
1. **Contact Underdog** for official API access
2. **Implement authentication** for reliable data access
3. **Add error handling** for API failures

## 🚀 **Implementation Priority**

1. **High Priority**: Get optimizer working with real data (manual or scraped)
2. **Medium Priority**: Automated data collection (web scraping)
3. **Low Priority**: Official API integration (requires business relationship)

## 📝 **Manual Data Template**

Copy this structure and fill with data from champions page:
```json
{
  "props": [
    {
      "player": "Player Name",
      "team": "Team Code",
      "opponent": "Opponent Code", 
      "stat": "points|rebounds|assists|threes|blocks|steals|turnovers|fantasy_score",
      "line": 0.0,
      "overOdds": 0,
      "underOdds": 0
    }
  ]
}
```

This will allow you to:
- ✅ Test the optimizer immediately
- ✅ Verify unified cards schema works
- ✅ Generate meaningful betting recommendations
- ✅ Compare with PrizePicks results

While we work on the automated API solution, this manual approach will get your optimizer running with real data today!
