// src/odds_cache.ts
// Disk-based odds cache with configurable TTL to respect API rate limits

import fs from "fs";
import path from "path";
import { MergedPick } from "./types";

export interface OddsCacheOptions {
  cacheDir?: string;
  defaultTtlMinutes?: number;
}

export interface CacheEntry {
  data: MergedPick[];
  fetchedAt: string; // ISO timestamp
  source: "SGO" | "TheRundown" | "mixed" | "none";
  sourceType: "fresh" | "cache"; // Whether this run used fresh or cached odds
  apiCalls: {
    endpoint: string;
    timestamp: string;
    reason: "scheduled" | "force-refresh" | "cache-stale" | "sgo-failed" | "sgo-skipped" | "rundown-failed";
  }[];
}

export interface OddsFetchConfig {
  noFetch: boolean; // --no-fetch-odds / --use-cache-only
  forceRefresh: boolean; // --force-refresh-odds
  refreshIntervalMinutes: number;
}

// Provider usage tracking interfaces
export interface ProviderUsage {
  date: string; // YYYY-MM-DD
  sgoCallCount: number;
  rundownDataPointsUsed: number;
}

export interface ProviderUsageConfig {
  sgoMaxCallsPerDay: number;
  rundownMaxDataPointsPerDay: number;
}

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache");
const DEFAULT_TTL_MINUTES = 15; // 15 minutes default cache TTL
const PROVIDER_USAGE_FILE = "provider-usage.json";

export class OddsCache {
  private cacheDir: string;
  private defaultTtlMs: number;

  constructor(options: OddsCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.defaultTtlMs = (options.defaultTtlMinutes ?? DEFAULT_TTL_MINUTES) * 60 * 1000;
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCachePath(): string {
    return path.join(this.cacheDir, "odds-cache.json");
  }

  private readCache(): CacheEntry | null {
    try {
      const cachePath = this.getCachePath();
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const raw = fs.readFileSync(cachePath, "utf8");
      const entry: CacheEntry = JSON.parse(raw);
      
      // Validate cache entry structure
      if (!entry || !Array.isArray(entry.data) || !entry.fetchedAt) {
        console.warn("[OddsCache] Invalid cache entry format, ignoring");
        return null;
      }
      
      return entry;
    } catch (error) {
      console.warn("[OddsCache] Failed to read cache:", error);
      return null;
    }
  }

  private writeCache(entry: CacheEntry): void {
    try {
      const cachePath = this.getCachePath();
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2), "utf8");
    } catch (error) {
      console.error("[OddsCache] Failed to write cache:", error);
    }
  }

  /**
   * Check if cached data is still valid based on TTL
   */
  private isCacheValid(entry: CacheEntry, ttlMs: number): boolean {
    const fetchedAt = new Date(entry.fetchedAt).getTime();
    const now = Date.now();
    return (now - fetchedAt) < ttlMs;
  }

  /**
   * Get cached odds if valid (returns full entry for metadata)
   */
  getCachedOddsEntry(config: OddsFetchConfig): CacheEntry | null {
    if (config.forceRefresh) {
      console.log("[OddsCache] Force refresh requested, ignoring cache");
      return null;
    }

    const entry = this.readCache();
    if (!entry) {
      console.log("[OddsCache] No cached data available");
      return null;
    }

    const ttlMs = config.refreshIntervalMinutes * 60 * 1000;
    if (!this.isCacheValid(entry, ttlMs)) {
      const ageMinutes = (Date.now() - new Date(entry.fetchedAt).getTime()) / (60 * 1000);
      console.log(`[OddsCache] Cache expired (${ageMinutes.toFixed(1)} minutes old, TTL=${config.refreshIntervalMinutes}m)`);
      return null;
    }

    console.log(`[OddsCache] Using cached odds from ${entry.fetchedAt} (${entry.data.length} picks, source: ${entry.source})`);
    
    // Log recent API calls for transparency
    if (entry.apiCalls.length > 0) {
      const recentCalls = entry.apiCalls.slice(-3); // Show last 3 calls
      console.log("[OddsCache] Recent API calls:");
      recentCalls.forEach(call => {
        console.log(`  - ${call.timestamp} ${call.endpoint} (${call.reason})`);
      });
    }

    return entry;
  }

  /**
   * Get cached odds if valid (legacy method - returns just data)
   */
  getCachedOdds(config: OddsFetchConfig): MergedPick[] | null {
    const entry = this.getCachedOddsEntry(config);
    return entry ? entry.data : null;
  }

  /**
   * Cache new odds data with API call metadata
   */
  cacheOdds(
    data: MergedPick[], 
    source: CacheEntry["source"],
    sourceType: CacheEntry["sourceType"],
    apiCalls: CacheEntry["apiCalls"]
  ): void {
    const entry: CacheEntry = {
      data,
      fetchedAt: new Date().toISOString(),
      source,
      sourceType,
      apiCalls
    };

    this.writeCache(entry);
    console.log(`[OddsCache] Cached ${data.length} odds from ${source} (${sourceType}) at ${entry.fetchedAt}`);
  }

  /**
   * Log an API call for audit trail
   */
  static logApiCall(endpoint: string, reason: CacheEntry["apiCalls"][0]["reason"]): void {
    const timestamp = new Date().toISOString();
    console.log(`[API] ${timestamp} ${endpoint} (${reason})`);
  }

  /**
   * Clear cache manually (useful for debugging)
   */
  clearCache(): void {
    try {
      const cachePath = this.getCachePath();
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        console.log("[OddsCache] Cache cleared");
      }
    } catch (error) {
      console.error("[OddsCache] Failed to clear cache:", error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { exists: boolean; ageMinutes: number | null; size: number } | null {
    const entry = this.readCache();
    if (!entry) {
      return { exists: false, ageMinutes: null, size: 0 };
    }

    const ageMinutes = (Date.now() - new Date(entry.fetchedAt).getTime()) / (60 * 1000);
    return {
      exists: true,
      ageMinutes,
      size: entry.data.length
    };
  }

  /**
   * Get provider usage tracking file path
   */
  private getProviderUsagePath(): string {
    return path.join(this.cacheDir, PROVIDER_USAGE_FILE);
  }

  /**
   * Load provider usage data from disk
   */
  loadProviderUsage(): ProviderUsage {
    try {
      const usagePath = this.getProviderUsagePath();
      if (fs.existsSync(usagePath)) {
        const data = fs.readFileSync(usagePath, "utf8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("[OddsCache] Failed to load provider usage:", error);
    }
    
    // Return default usage for today
    return {
      date: new Date().toISOString().slice(0, 10),
      sgoCallCount: 0,
      rundownDataPointsUsed: 0,
    };
  }

  /**
   * Save provider usage data to disk
   */
  saveProviderUsage(usage: ProviderUsage): void {
    try {
      const usagePath = this.getProviderUsagePath();
      fs.writeFileSync(usagePath, JSON.stringify(usage, null, 2));
    } catch (error) {
      console.error("[OddsCache] Failed to save provider usage:", error);
    }
  }

  /**
   * Check if SGO can be called. No local cap — SGO dashboard quota only (500k requests).
   */
  canCallSgo(_config: ProviderUsageConfig): { canCall: boolean; reason: string } {
    return {
      canCall: true,
      reason: "No local cap enforced; SGO dashboard quota only (500k requests)",
    };
  }

  /**
   * Check if TheRundown can be called based on daily limits
   */
  canCallTheRundown(config: ProviderUsageConfig, estimatedDataPoints: number): { canCall: boolean; reason: string } {
    const usage = this.loadProviderUsage();
    const today = new Date().toISOString().slice(0, 10);
    
    // Reset if new day
    if (usage.date !== today) {
      usage.date = today;
      usage.sgoCallCount = 0;
      usage.rundownDataPointsUsed = 0;
    }
    
    if (usage.rundownDataPointsUsed + estimatedDataPoints > config.rundownMaxDataPointsPerDay) {
      return {
        canCall: false,
        reason: `TheRundown daily data point limit would be exceeded (${usage.rundownDataPointsUsed} + ${estimatedDataPoints} > ${config.rundownMaxDataPointsPerDay})`
      };
    }
    
    return { canCall: true, reason: "Within limits" };
  }

  /**
   * Record an SGO API call
   */
  recordSgoCall(): void {
    const usage = this.loadProviderUsage();
    const today = new Date().toISOString().slice(0, 10);
    
    // Reset if new day
    if (usage.date !== today) {
      usage.date = today;
      usage.sgoCallCount = 0;
      usage.rundownDataPointsUsed = 0;
    }
    
    usage.sgoCallCount++;
    this.saveProviderUsage(usage);

    const maxCalls = this.getProviderUsageConfig().sgoMaxCallsPerDay;
    console.log(`[OddsCache] SGO call recorded: ${usage.sgoCallCount}/${maxCalls} today (no local cap; use dashboard for real quota)`);
  }

  /**
   * Record TheRundown data point usage
   */
  recordTheRundownUsage(dataPoints: number): void {
    const usage = this.loadProviderUsage();
    const today = new Date().toISOString().slice(0, 10);
    
    // Reset if new day
    if (usage.date !== today) {
      usage.date = today;
      usage.sgoCallCount = 0;
      usage.rundownDataPointsUsed = 0;
    }
    
    usage.rundownDataPointsUsed += dataPoints;
    this.saveProviderUsage(usage);
    
    const limit = this.getProviderUsageConfig().rundownMaxDataPointsPerDay;
    console.log(`[OddsCache] TheRundown usage recorded: ${usage.rundownDataPointsUsed}/${limit} data points today`);
  }

  /**
   * Get current provider usage statistics
   */
  getProviderUsageStats(): ProviderUsage & { sgoLimit: number; rundownLimit: number } {
    const usage = this.loadProviderUsage();
    const config = this.getProviderUsageConfig();
    
    return {
      ...usage,
      sgoLimit: config.sgoMaxCallsPerDay,
      rundownLimit: config.rundownMaxDataPointsPerDay,
    };
  }

  /**
   * Get provider usage configuration from environment variables.
   * SGO: no local cap; env SGO_MAX_CALLS_PER_DAY only used for optional logging (default 500000 to match real plan).
   */
  getProviderUsageConfig(): ProviderUsageConfig {
    return {
      sgoMaxCallsPerDay: parseInt(process.env.SGO_MAX_CALLS_PER_DAY || "500000", 10),
      rundownMaxDataPointsPerDay: parseInt(process.env.TRD_MAX_DATA_POINTS_PER_DAY || "20000", 10),
    };
  }
}

// Global cache instance for the application
export const oddsCache = new OddsCache();
