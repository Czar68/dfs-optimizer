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
  source: "OddsAPI" | "none";
  sourceType: "fresh" | "cache"; // Whether this run used fresh or cached odds
  apiCalls: {
    endpoint: string;
    timestamp: string;
    reason: "scheduled" | "force-refresh" | "cache-stale";
  }[];
}

export interface OddsFetchConfig {
  noFetch: boolean; // --no-fetch-odds / --use-cache-only
  forceRefresh: boolean; // --force-refresh-odds
  refreshIntervalMinutes: number;
}

const DEFAULT_CACHE_DIR = path.join(process.cwd(), ".cache");
const DEFAULT_TTL_MINUTES = 15; // 15 minutes default cache TTL

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
      // Normalize legacy source to OddsAPI-only
      if (entry.source !== "OddsAPI" && entry.source !== "none") {
        entry.source = "OddsAPI";
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

}

// Global cache instance for the application
export const oddsCache = new OddsCache();
