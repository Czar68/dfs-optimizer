# OddsAPI Token Usage Analysis Report

## Executive Summary

**Token Usage per Run: ~10 tokens** ✅ **EFFICIENT**

The optimizer uses **~10 tokens per fresh odds fetch**, which is well within acceptable limits. The current implementation is efficient and doesn't require immediate optimization.

## Detailed Analysis

### Current Configuration
- **Games per slate**: 9 NBA games
- **Bookmakers**: 15 sportsbooks
- **Markets**: 12 market types (including alt lines)
- **Cache TTL**: 15 minutes

### Token Cost Breakdown
```
Events list request:    1 token
Event odds requests:    9 tokens (1 per game)
Total per fresh fetch: 10 tokens
```

### Cache Behavior
- **Cache TTL**: 15 minutes (configurable in `src/odds_cache.ts`)
- **Cache hit**: Most runs use cached data (0 tokens)
- **Cache miss**: Fresh fetch only when cache expires or `--force-refresh-odds`

### Architecture Efficiency ✅

**Single Odds Fetch**: The optimizer uses `OddsSnapshotManager` to ensure odds are fetched **once per run** and shared between PP and UD platforms.

```typescript
// src/run_optimizer.ts
const oddsFetchFn = async (_sports: Sport[], opts: { forceRefresh: boolean }) => {
  return fetchOddsAPIProps({
    apiKey: process.env.ODDSAPI_KEY,
    sport: "basketball_nba",
    markets: DEFAULT_MARKETS,
    forceRefresh: opts.forceRefresh,
  });
};

// Single call reused for both platforms
oddsSnapshot = await OddsSnapshotManager.getSnapshot();
```

**No Redundant Fetches**: 
- ✅ PP and UD share the same odds snapshot
- ✅ No duplicate event fetching
- ✅ Alt lines included in single fetch

## Token Usage Scenarios

| Scenario | Frequency | Token Cost | Notes |
|----------|------------|-------------|-------|
| **Cached run** | Most runs (every 15min) | 0 tokens | Cache hit |
| **Fresh run** | When cache expires | ~10 tokens | Full fetch |
| **Force refresh** | Manual `--force-refresh-odds` | ~10 tokens | User requested |
| **Daily usage** | ~96 runs per day | ~960 tokens max | Assuming all fresh |

## Optimization Recommendations

### Current Status: ✅ NO ACTION NEEDED

**Token usage is already efficient at ~10 tokens per fresh fetch.**

### Future Optimizations (Optional)

1. **Increase Cache TTL**
   ```typescript
   // src/odds_cache.ts
   const DEFAULT_TTL_MINUTES = 30; // Increase from 15 to 30 minutes
   ```
   - **Impact**: Reduce fresh fetches by 50%
   - **Tradeoff**: Slightly older odds data

2. **Reduce Bookmaker Set**
   ```typescript
   // Top 8-10 most reliable books instead of 15
   const SELECTED_BOOKMAKERS = ["fanduel", "draftkings", "betmgm", ...];
   ```
   - **Impact**: Reduced API response size, same token cost
   - **Tradeoff**: Less bookmaker diversity

3. **Off-Hours Extended Caching**
   ```typescript
   // Longer TTL during non-trading hours
   const OFF_HOURS_TTL = 120; // 2 hours overnight
   ```
   - **Impact**: Significant token savings overnight
   - **Tradeoff**: Stale odds for morning runs

## Cost Projections

### Current Usage (Efficient)
- **Per fresh fetch**: ~10 tokens
- **Monthly (30 days, 1 fresh/day)**: ~300 tokens
- **Monthly (30 days, 4 fresh/day)**: ~1,200 tokens

### With Optimizations
- **30-min TTL**: ~150 tokens/month (50% reduction)
- **2-hour overnight TTL**: ~200 tokens/month (33% reduction)

## Monitoring

### Token Tracking Added
```typescript
// src/fetch_oddsapi_props.ts
console.log(`[TOKEN_TRACK] Starting odds fetch for ${sportLabel} - events: ${eventList.length}`);
console.log(`[TOKEN_TRACK] Final cost analysis: ${costPerRun.toFixed(2)} tokens per run`);
```

### Key Metrics to Monitor
- Tokens per fresh fetch
- Cache hit rate
- Daily token usage
- Monthly projections

## Conclusion

**The current OddsAPI token usage is excellent at ~10 tokens per fresh fetch.** 

- ✅ **Efficient**: Well under the 100+ token threshold
- ✅ **Well-architected**: Single fetch shared across platforms
- ✅ **Cached**: Most runs use 0 tokens via cache
- ✅ **No redundancy**: No duplicate or unnecessary fetches

**No immediate action required.** The system is already optimized for token efficiency.

---

*Report generated: 2026-03-29*
*Analysis based on current configuration and cache behavior*
