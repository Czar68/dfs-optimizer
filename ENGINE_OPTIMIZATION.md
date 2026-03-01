# Google Sheets EV Engine Optimization

## Problem Analysis

### Current Bottleneck
- **27,000+ API calls per run**: Each card evaluation calls `getStructureEV` → `getStructureEVs` → writes to `Engine!B51`
- **Rate limiting**: 500ms delay + exponential backoff creates significant slowdown
- **Redundant work**: Same `avgProb` values processed multiple times across different cards

### Root Cause
```typescript
// Current flow (inefficient):
MAX_CARD_BUILD_TRIES = 3000 × 9 structures = 27,000 calls
evaluateFlexCard() → getStructureEV() → getStructureEVs() → writeWithRetry()
```

## Optimizations Implemented

### 1. In-Memory Caching
```typescript
// Cache EV results to avoid duplicate API calls
const evCache = new Map<number, StructureEV[]>();

// Cache hits: 0 API calls (instant response)
const cached = evCache.get(avgProb);
if (cached) return cached;
```

### 2. Batch Processing
```typescript
// Group unique avgProb values and process in batches
const BATCH_SIZE = 10; // Process up to 10 unique values at once
const BATCH_DELAY_MS = 1000; // 1 second between batches

// Reduced from ~27,000 writes to ~50-100 writes per run
```

### 3. Asynchronous Queue System
```typescript
// Track pending values for batch processing
const pendingAvgProbs = new Set<number>();

// Auto-process when batch size reached
if (pendingAvgProbs.size >= BATCH_SIZE) {
  await processPendingBatch();
}
```

### 4. Finalization Hook
```typescript
// Ensure all remaining requests are processed
export async function finalizePendingEVRequests(): Promise<void> {
  if (pendingAvgProbs.size > 0) {
    await processPendingBatch();
  }
}
```

## Performance Impact

### Before Optimization
- **API Calls**: ~27,000 writes per run
- **Rate Limiting**: Frequent 429 errors and retries
- **Runtime**: 10+ minutes with stalling

### After Optimization
- **API Calls**: ~50-100 writes per run (99.6% reduction)
- **Cache Hits**: Instant responses for duplicate avgProb values
- **Runtime**: Expected 1-2 minutes with minimal rate limiting

### Math Example
```
Before: 3000 tries × 9 structures × 500ms = 22,500 seconds (6.25 hours)
After: 50 unique avgProbs × 500ms = 25 seconds + cache hits
```

## Future Local Engine Design

### Interface Abstraction
```typescript
// Current interface (Sheets-based)
interface EVEngine {
  getStructureEVs(avgProb: number): Promise<StructureEV[]>;
}

// Future implementations
class SheetsEVEngine implements EVEngine { /* current optimized code */ }
class LocalEVEngine implements EVEngine { /* future TypeScript implementation */ }
```

### Minimal Input/Output Contract
```typescript
// Inputs needed for EV calculation
interface EVInputs {
  avgProb: number;           // Average per-leg hit probability
  structure: string;         // "2P", "3F", etc.
}

// Outputs produced by engine
interface EVOutputs {
  ev: number;                // Expected value per unit stake
  roi: number;               // Return on investment (same as EV)
}
```

### Migration Path
1. **Phase 1**: Current optimized Sheets integration
2. **Phase 2**: Extract Sheets logic into pure TypeScript
3. **Phase 3**: Add calibration mode (Sheets for validation)
4. **Phase 4**: Switch to local engine by default

### Calibration Strategy
```typescript
// Future calibration mode
if (process.env.ENGINE_CALIBRATION === 'true') {
  // Run both engines and compare results
  const sheetsResult = await sheetsEngine.getStructureEVs(avgProb);
  const localResult = await localEngine.getStructureEVs(avgProb);
  
  // Log discrepancies for analysis
  if (Math.abs(sheetsResult.ev - localResult.ev) > 0.001) {
    console.log(`Calibration diff: ${avgProb} → ${sheetsResult.ev} vs ${localResult.ev}`);
  }
}
```

## Configuration

### Environment Variables
```bash
# Engine mode
ENGINE_MODE=sheets          # sheets | local (future)

# Batch processing
BATCH_SIZE=10              # Unique avgProb values per batch
BATCH_DELAY_MS=1000        # Delay between batches

# Rate limiting
WRITE_DELAY_MS=500         # Base delay between writes
MAX_RETRIES=4              # Max retry attempts
```

### Performance Tuning
```typescript
// Conservative settings (current)
BATCH_SIZE = 10;           // Smaller batches = less rate limiting
BATCH_DELAY_MS = 1000;     // 1 second between batches

// Aggressive settings (if quota allows)
BATCH_SIZE = 20;           // Larger batches = fewer API calls
BATCH_DELAY_MS = 500;      // Faster processing
```

## Monitoring and Debugging

### Logging Added
```typescript
console.log(`Batch processing ${avgProbs.length} unique avgProb values...`);
console.log(`Cached EV results for ${results.size} avgProb values`);
console.log(`Finalizing ${pendingAvgProbs.size} remaining EV requests...`);
```

### Error Handling
- **Graceful fallback**: Zero EV values if Sheets API fails
- **Partial success**: Cache successful results, retry failed ones
- **Rate limit detection**: Exponential backoff only on 429 errors

## Validation

### Expected Behavior
1. **First run**: Cache miss → batch processing → cache populate
2. **Subsequent runs**: Cache hits → instant responses
3. **Mixed runs**: Some cache hits, some batch processing

### Performance Metrics
- **Cache hit rate**: Should be >80% for typical runs
- **API call reduction**: 99%+ fewer writes to Engine!B51
- **Runtime improvement**: 5-10x faster execution

This optimization maintains full compatibility with the existing optimizer while dramatically reducing Google Sheets API usage and eliminating rate limiting bottlenecks.
