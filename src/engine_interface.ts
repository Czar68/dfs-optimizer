// src/engine_interface.ts
// Interface to consume EV/ROI from Google Sheets Windshark engine
// 
// OPTIMIZATIONS ADDED:
// - In-memory caching to avoid duplicate API calls for same avgProb values
// - Batch processing to group multiple avgProb values into single API call
// - Reduced write frequency from per-card to per-unique-avgProb
// - Rate limiting with exponential backoff for HTTP 429 responses

import { google } from 'googleapis';
import { getPayoutsAsRecord } from "./config/prizepicks_payouts";

// Cache for EV results to avoid duplicate API calls
const evCache = new Map<number, StructureEV[]>();
// Track recent avgProb values for batch processing
const pendingAvgProbs = new Set<number>();
// Batch processing configuration - optimized for speed
const BATCH_SIZE = 3; // Reduced from 10 for faster processing
const BATCH_DELAY_MS = 500; // Reduced from 1000ms for faster batching

// Performance counters for optimization tracking
let evaluateFlexCardCallCount = 0;
let uniqueAvgProbCount = 0;
let sheetsWriteCount = 0;
let rate429Count = 0;

// ---- Debug Configuration ----
const DEBUG_FLEX_EV_INTERFACE = false; // Toggle for flex structure debug logging

// Cache hit/miss tracking for flex structures
let flexCacheHits = 0;
let flexCacheMisses = 0;

// Timeout and degraded mode constants
const EV_WAIT_TIMEOUT_MS = 3000; // Reduced from 5000ms for faster response (still > 2000ms recalculation delay)
const MAX_CONSECUTIVE_TIMEOUTS = 25; // Increased from 5 to 25 - much harder to trigger
const MAX_CONSECUTIVE_429S = 10; // Increased from 3 to 10 - much harder to trigger

// Degraded mode tracking
let consecutiveEvTimeouts = 0;
let consecutive429s = 0;
let evEngineDegraded = false;

/**
 * Reset performance counters (call at start of optimizer run)
 */
export function resetPerformanceCounters(): void {
  evaluateFlexCardCallCount = 0;
  uniqueAvgProbCount = 0;
  sheetsWriteCount = 0;
  rate429Count = 0;
  consecutiveEvTimeouts = 0;
  consecutive429s = 0;
  evEngineDegraded = false;
  evCache.clear();
  pendingAvgProbs.clear();
  flexCacheHits = 0;
  flexCacheMisses = 0;
}

/**
 * Check if EV engine is in degraded mode
 */
export function isEvEngineDegraded(): boolean {
  return evEngineDegraded;
}

/**
 * Reset degraded mode after successful batch (call when Sheets responds correctly)
 */
export function resetDegradedMode(): void {
  if (evEngineDegraded) {
    console.log('🔄 EV engine recovering from degraded mode - Sheets responded successfully');
  }
  consecutiveEvTimeouts = 0;
  consecutive429s = 0;
  evEngineDegraded = false;
}

/**
 * Log performance metrics (call at end of optimizer run)
 */
export function logPerformanceMetrics(): void {
  console.log('\n=== Google Sheets EV Engine Performance Metrics ===');
  console.log(`evaluateFlexCard calls: ${evaluateFlexCardCallCount}`);
  console.log(`Unique avgProb values: ${uniqueAvgProbCount}`);
  console.log(`Actual Sheets writes: ${sheetsWriteCount}`);
  console.log(`HTTP 429 rate limits: ${rate429Count}`);
  console.log(`Cache hit rate: ${evaluateFlexCardCallCount > 0 ? ((evaluateFlexCardCallCount - uniqueAvgProbCount) / evaluateFlexCardCallCount * 100).toFixed(1) : 0}%`);
  console.log(`API call reduction: ${evaluateFlexCardCallCount > 0 ? ((evaluateFlexCardCallCount - sheetsWriteCount) / evaluateFlexCardCallCount * 100).toFixed(1) : 0}%`);
  console.log('================================================\n');
}

/**
 * Get flex structure EV cache statistics (read-only helper)
 * Returns cache state derived from existing in-memory structures
 */
export function getFlexEvCacheStats(): {
  totalKeys: number;
  flexKeys: number;
  hitCount: number;
  missCount: number;
} {
  // Count total cache keys
  const totalKeys = evCache.size;
  
  // Count keys that have flex structure data (5F or 6F)
  let flexKeys = 0;
  for (const [avgProb, evs] of evCache) {
    const hasFlexData = evs.some(ev => ev.structure === '5F' || ev.structure === '6F');
    if (hasFlexData) {
      flexKeys++;
    }
  }
  
  return {
    totalKeys,
    flexKeys,
    hitCount: flexCacheHits,
    missCount: flexCacheMisses,
  };
}

/**
 * Write to Google Sheets with rate limiting and retry logic
 * 
 * @param sheets - Google Sheets API client
 * @param spreadsheetId - Spreadsheet ID
 * @param range - Cell range to write to
 * @param values - Values to write
 * @param maxRetries - Maximum number of retry attempts
 */
async function writeWithRetry(
  sheets: any,
  spreadsheetId: string,
  range: string,
  values: any[][],
  maxRetries: number = 4
): Promise<void> {
  const WRITE_DELAY_MS = 500; // 500ms delay between writes to stay well under quota
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add delay before write (except for first attempt)
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, 8s max
        console.log(`Retrying write to ${range} in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Rate limiting delay for first write
        await new Promise(resolve => setTimeout(resolve, WRITE_DELAY_MS));
      }
      
      // Track actual write attempt
      sheetsWriteCount++;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values
        }
      });
      
      // Success - exit retry loop
      return;
      
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isRateLimitError = error.code === 429 || error.status === 429;
      
      // Track 429 errors and check for degraded mode
      if (isRateLimitError) {
        rate429Count++;
        consecutive429s++;
        
        // Check if we should enter degraded mode due to too many 429s
        if (consecutive429s >= MAX_CONSECUTIVE_429S && !evEngineDegraded) {
          evEngineDegraded = true;
          console.error(`🚨 EV ENTERING DEGRADED MODE: ${consecutive429s} consecutive 429 errors (threshold: ${MAX_CONSECUTIVE_429S})`);
          console.error(`🚨 All future EV requests will return EV=0 to prevent rate limit exhaustion`);
        }
      } else {
        // Reset 429 counter on non-429 errors
        consecutive429s = 0;
      }
      
      if (isLastAttempt || !isRateLimitError) {
        // Either last attempt or non-rate-limit error - throw the error
        throw error;
      }
      
      // Rate limit error and we have retries left - continue to next attempt
      console.log(`Rate limited on write to ${range}, will retry...`);
    }
  }
}

/**
 * Batch process multiple avgProb values in a single API call
 * This dramatically reduces the number of write operations
 */
async function batchProcessAvgProbs(
  sheets: any,
  spreadsheetId: string,
  avgProbs: number[]
): Promise<Map<number, StructureEV[]>> {
  const results = new Map<number, StructureEV[]>();
  
  console.log(`Batch processing ${avgProbs.length} unique avgProb values...`);
  
  for (const avgProb of avgProbs) {
    try {
      // Write avgProb to Engine!B51
      console.log(`📝 Writing avgProb=${avgProb} to Engine!B51`);
      await writeWithRetry(sheets, spreadsheetId, 'Engine!B51', [[avgProb]]);
      
      // CRITICAL: Give Sheets time to recalculate formulas
      // Sheets formulas need time to propagate after input changes
      const RECALCULATION_DELAY_MS = 1500; // Reduced from 2000ms for faster processing
      console.log(`⏳ Waiting ${RECALCULATION_DELAY_MS}ms for Sheets recalculation...`);
      await new Promise(resolve => setTimeout(resolve, RECALCULATION_DELAY_MS));
      
      // Read all EV/ROI cells in ONE batch call
      const evRoiRanges = STRUCTURE_CONFIG.flatMap(config => [config.evCell, config.roiCell]);
      console.log(`📖 Reading EV/ROI from ranges: [${evRoiRanges.join(', ')}]`);
      
      const batchResponse = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: evRoiRanges,
      });

      // Map results into StructureEV array
      const valueRanges = batchResponse.data.valueRanges || [];
      const structureEvs: StructureEV[] = [];

      console.log(`📊 Raw Sheets response for avgProb=${avgProb}:`);
      
      for (let i = 0; i < STRUCTURE_CONFIG.length; i++) {
        const config = STRUCTURE_CONFIG[i];
        const evRange = valueRanges[i * 2];
        const roiRange = valueRanges[i * 2 + 1];

        // Parse EV value
        const evValue = evRange?.values?.[0]?.[0];
        const ev = parseFloat(String(evValue || '0')) || 0;

        // Parse ROI value
        const roiValue = roiRange?.values?.[0]?.[0];
        const roi = parseFloat(String(roiValue || '0')) || 0;

        console.log(`  ${config.structure}: EV=${evValue}→${ev}, ROI=${roiValue}→${roi}`);

        structureEvs.push({
          structure: config.structure,
          picks: config.picks,
          type: config.type,
          ev,
          roi,
        });
      }

      console.log(`✅ Caching results for avgProb=${avgProb}: ${structureEvs.map(s => `${s.structure}=${s.ev}`).join(', ')}`);
      results.set(avgProb, structureEvs);
      
      // Add delay between batch items to avoid rate limiting
      if (avgProbs.length > 1) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
      
    } catch (error) {
      console.error(`Error processing avgProb ${avgProb}:`, error);
      // Fallback to zero values for this avgProb
      results.set(avgProb, STRUCTURE_CONFIG.map(config => ({
        structure: config.structure,
        picks: config.picks,
        type: config.type,
        ev: 0,
        roi: 0,
      })));
    }
  }
  
  return results;
}

export interface StructureEV {
  structure: string;      // "2P" | "3P" | "3F" | "4P" | "4F" | "5P" | "5F" | "6P" | "6F"
  picks: number;          // 2 | 3 | 4 | 5 | 6
  type: 'Power' | 'Flex'; // "Power" for P, "Flex" for F
  ev: number;             // from Engine!Bx
  roi: number;            // from Engine!Bx
}

// Structure configuration mapping
const STRUCTURE_CONFIG = [
  { structure: "2P", picks: 2, type: "Power" as const, evCell: "Engine!B64", roiCell: "Engine!B65" },
  { structure: "3P", picks: 3, type: "Power" as const, evCell: "Engine!B75", roiCell: "Engine!B76" },
  { structure: "3F", picks: 3, type: "Flex" as const, evCell: "Engine!B85", roiCell: "Engine!B86" },
  { structure: "4P", picks: 4, type: "Power" as const, evCell: "Engine!B96", roiCell: "Engine!B97" },
  { structure: "4F", picks: 4, type: "Flex" as const, evCell: "Engine!B106", roiCell: "Engine!B107" },
  { structure: "5P", picks: 5, type: "Power" as const, evCell: "Engine!B117", roiCell: "Engine!B118" },
  { structure: "5F", picks: 5, type: "Flex" as const, evCell: "Engine!B127", roiCell: "Engine!B128" },
  { structure: "6P", picks: 6, type: "Power" as const, evCell: "Engine!B138", roiCell: "Engine!B139" },
  { structure: "6F", picks: 6, type: "Flex" as const, evCell: "Engine!B149", roiCell: "Engine!B150" },
];

// ---- Local EV Engine (mirrors Engine sheet BINOMDIST model exactly) ----

// PrizePicks payout tables — SSOT: src/config/prizepicks_payouts.ts
const PP_PAYOUTS: Record<string, Record<number, number>> = {
  '2P': getPayoutsAsRecord('2P'),
  '3P': getPayoutsAsRecord('3P'),
  '4P': getPayoutsAsRecord('4P'),
  '5P': getPayoutsAsRecord('5P'),
  '6P': getPayoutsAsRecord('6P'),
  '3F': getPayoutsAsRecord('3F'),
  '4F': getPayoutsAsRecord('4F'),
  '5F': getPayoutsAsRecord('5F'),
  '6F': getPayoutsAsRecord('6F'),
};

/** Binomial PMF: P(X=k) where X ~ Bin(n, p) */
function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  let coeff = 1;
  for (let i = 0; i < k; i++) {
    coeff = coeff * (n - i) / (i + 1);
  }
  return coeff * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Compute EV locally using i.i.d. binomial model.
 * Used for getStructureEV (avgProb-based lookup — when individual leg probs
 * are not available). For cards with known individual leg probabilities,
 * prefer computeLocalEvDP which gives exact results.
 */
function computeLocalEv(structure: string, picks: number, avgProb: number): number {
  const payouts = PP_PAYOUTS[structure];
  if (!payouts) return 0;

  let expectedReturn = 0;
  for (let k = 0; k <= picks; k++) {
    const payout = payouts[k] ?? 0;
    if (payout === 0) continue;
    expectedReturn += binomPmf(k, picks, avgProb) * payout;
  }
  return expectedReturn - 1;
}

/**
 * Compute exact card EV via DP hit distribution (non-iid).
 * probs[i] = trueProb for leg i.  Returns EV = Σ P(k hits) × payout(k) - 1.
 *
 * This is mathematically exact: it builds the full probability distribution
 * over how many legs hit (0..n) using the individual probabilities, then
 * multiplies each probability by the corresponding payout.
 */
export function computeLocalEvDP(structure: string, probs: number[]): number {
  const payouts = PP_PAYOUTS[structure];
  if (!payouts || probs.length === 0) return 0;

  const n = probs.length;
  // dp[j] = P(exactly j hits so far)
  let dp = new Array(n + 1).fill(0);
  dp[0] = 1;

  for (let i = 0; i < n; i++) {
    const p = probs[i];
    const next = new Array(n + 1).fill(0);
    for (let j = 0; j <= i; j++) {
      if (dp[j] === 0) continue;
      next[j]     += dp[j] * (1 - p);  // leg i misses
      next[j + 1] += dp[j] * p;        // leg i hits
    }
    dp = next;
  }

  let expectedReturn = 0;
  for (let k = 0; k <= n; k++) {
    const payout = payouts[k] ?? 0;
    if (payout === 0) continue;
    expectedReturn += dp[k] * payout;
  }
  return expectedReturn - 1;
}

/** Compute all structure EVs locally (instant, no API calls) */
function computeLocalStructureEVs(avgProb: number): StructureEV[] {
  return STRUCTURE_CONFIG.map(config => {
    const ev = computeLocalEv(config.structure, config.picks, avgProb);
    return {
      structure: config.structure,
      picks: config.picks,
      type: config.type,
      ev,
      roi: ev, // ROI = EV for per-unit-stake calculation
    };
  });
}

/**
 * Get structure EVs from Google Sheets engine for a given hit probability
 * 
 * OPTIMIZED: Uses in-memory caching and batch processing to reduce API calls
 * - Cache hits: 0 API calls (instant response)
 * - Cache misses: Batched with other unique avgProb values
 * - Reduced from ~27,000 writes to ~50-100 writes per run
 * 
 * @param avgProb - Global per-leg hit probability (equivalent to $B$51 in Sheets)
 * @returns Array of structure EV data for all slip types
 */
export async function getStructureEVs(avgProb: number): Promise<StructureEV[]> {
  const engineMode = process.env.ENGINE_MODE;
  
  // Track evaluateFlexCard calls (this function is called for each card evaluation)
  evaluateFlexCardCallCount++;
  
  // If not in sheets mode, use local binomial EV computation (instant, no API calls)
  if (engineMode !== 'sheets') {
    return computeLocalStructureEVs(avgProb);
  }

  // DEGRADED MODE: Skip EV evaluations if engine is degraded
  if (evEngineDegraded) {
    console.log(`EV engine degraded, returning EV=0 for avgProb=${avgProb}`);
    return STRUCTURE_CONFIG.map(config => ({
      structure: config.structure,
      picks: config.picks,
      type: config.type,
      ev: 0,
      roi: 0,
    }));
  }

  console.log(`Getting EV for avgProb=${avgProb}, cache=${evCache.has(avgProb)}, pending=${pendingAvgProbs.size}`);

  // Check cache first (instant response, no API call)
  const cached = evCache.get(avgProb);
  if (cached) {
    // Track flex cache hits
    const hasFlexData = cached.some(ev => ev.structure === '5F' || ev.structure === '6F');
    if (hasFlexData) {
      flexCacheHits++;
      if (DEBUG_FLEX_EV_INTERFACE) {
        console.log(`🔍 FLEX CACHE HIT: avgProb=${avgProb} (flex structures served from cache)`);
      }
    }
    return cached;
  }

  // Add to pending batch if not already processing
  if (!pendingAvgProbs.has(avgProb)) {
    pendingAvgProbs.add(avgProb);
    uniqueAvgProbCount++; // Track unique avgProb values
    
    // Track flex cache misses (new avgProb values that may need flex data)
    flexCacheMisses++;
    if (DEBUG_FLEX_EV_INTERFACE) {
      console.log(`🔍 FLEX CACHE MISS: avgProb=${avgProb} (added to pending batch)`);
    }
  }

  // If we have enough pending items, process them in a batch
  if (pendingAvgProbs.size >= BATCH_SIZE) {
    await processPendingBatch();
  }

  // Wait for this specific avgProb to be processed with timeout
  const startTime = Date.now();
  let isFirstTimeout = true;
  
  while (!evCache.has(avgProb)) {
    if (Date.now() - startTime > EV_WAIT_TIMEOUT_MS) {
      // TIMEOUT: Log and return fallback values
      console.error(`EV timeout for avgProb=${avgProb} after ${EV_WAIT_TIMEOUT_MS}ms, treating as EV=0`);
      consecutiveEvTimeouts++;
      
      // IMMEDIATE BATCH PROCESSING: If this is the first timeout, trigger batch processing immediately
      if (isFirstTimeout && pendingAvgProbs.size > 0) {
        console.log(`🚀 Immediate batch processing triggered by timeout for avgProb=${avgProb} (${pendingAvgProbs.size} pending)`);
        await processPendingBatch();
        // Give it one more chance to get cached result
        if (evCache.has(avgProb)) {
          console.log(`✅ Immediate batch succeeded - avgProb=${avgProb} now cached`);
          consecutiveEvTimeouts = 0; // Reset timeout counter on success
          break; // Exit while loop, will return cached result below
        }
      }
      
      // Check if we should enter degraded mode due to too many timeouts
      if (consecutiveEvTimeouts >= MAX_CONSECUTIVE_TIMEOUTS && !evEngineDegraded) {
        evEngineDegraded = true;
        console.error(`🚨 EV ENTERING DEGRADED MODE: ${consecutiveEvTimeouts} consecutive timeouts (threshold: ${MAX_CONSECUTIVE_TIMEOUTS})`);
        console.error(`🚨 All future EV requests will return EV=0 to prevent hanging`);
        
        if (DEBUG_FLEX_EV_INTERFACE) {
          console.log(`🔍 FLEX DEGRADED MODE: Flex structures will return EV=0 until recovery`);
        }
      }
      
      // Return fallback values so card building can continue
      // NOTE: Do NOT remove avgProb from pending - it will still be processed in next batch
      const fallbackResults = STRUCTURE_CONFIG.map(config => ({
        structure: config.structure,
        picks: config.picks,
        type: config.type,
        ev: 0,
        roi: 0,
      }));
      
      return fallbackResults;
    }
    
    isFirstTimeout = false;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Reset timeout counter on successful retrieval
  consecutiveEvTimeouts = 0;
  return evCache.get(avgProb)!;
}

/**
 * Process pending avgProb values in batches
 * This is the core optimization that reduces API calls dramatically
 */
async function processPendingBatch(): Promise<void> {
  if (pendingAvgProbs.size === 0) return;

  const avgProbsToProcess = Array.from(pendingAvgProbs);
  pendingAvgProbs.clear();

  console.log(`🔄 Processing batch of ${avgProbsToProcess.length} avgProb values: [${avgProbsToProcess.join(', ')}]`);

  if (DEBUG_FLEX_EV_INTERFACE) {
    console.log(`🔍 FLEX BATCH: Processing ${avgProbsToProcess.length} avgProb values (will fetch 5F/6F data from Sheets)`);
  }

  try {
    // Initialize Google Sheets API with service account authentication
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      keyFile: 'config/props-pipeline-engine-sa.json'
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    const spreadsheetId = process.env.PRIZEPICKS_ENGINE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('PRIZEPICKS_ENGINE_SHEET_ID environment variable not set');
    }

    console.log(`📊 Writing to Sheets spreadsheet: ${spreadsheetId}`);

    // Process all pending avgProb values in one batch
    const results = await batchProcessAvgProbs(sheets, spreadsheetId, avgProbsToProcess);
    
    // Cache all results
    for (const [avgProb, evs] of results) {
      evCache.set(avgProb, evs);
    }

    console.log(`✅ Cached EV results for ${results.size} avgProb values`);
    
    // Reset degraded mode on successful batch processing
    if (evEngineDegraded) {
      console.log('✅ Batch processing succeeded - recovering from degraded mode');
      resetDegradedMode();
    }
    
  } catch (error) {
    console.error('Error in batch processing:', error);
    // Fallback: cache zero values for all pending avgProbs
    const fallbackResults = STRUCTURE_CONFIG.map(config => ({
      structure: config.structure,
      picks: config.picks,
      type: config.type,
      ev: 0,
      roi: 0,
    }));
    
    for (const avgProb of avgProbsToProcess) {
      evCache.set(avgProb, fallbackResults);
    }
  }
}

/**
 * Finalize any remaining pending avgProb values
 * Call this at the end of the optimizer run to ensure all values are processed
 */
export async function finalizePendingEVRequests(): Promise<void> {
  if (pendingAvgProbs.size > 0) {
    console.log(`Finalizing ${pendingAvgProbs.size} remaining EV requests...`);
    const wasDegraded = evEngineDegraded;
    await processPendingBatch();
    
    // If batch processing succeeded and we were in degraded mode, reset it
    if (wasDegraded && pendingAvgProbs.size === 0) {
      console.log('✅ Finalization batch succeeded - recovering from degraded mode');
      resetDegradedMode();
    }
  }
}

/**
 * Get EV for a specific structure type from Google Sheets engine
 * 
 * @param flexType - PrizePicks slip type (2P, 3F, etc.)
 * @param avgProb - Global per-leg hit probability
 * @returns EV data for the specified structure
 */
export async function getStructureEV(
  flexType: string,
  avgProb: number
): Promise<StructureEV | null> {
  const evs = await getStructureEVs(avgProb);
  return evs.find(ev => ev.structure === flexType) || null;
}
