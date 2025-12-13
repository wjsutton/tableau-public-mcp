/**
 * In-memory caching layer for Tableau Public API responses
 *
 * Inspired by the official Tableau MCP's ExpiringMap pattern, enhanced with:
 * - LRU (Least Recently Used) eviction when max entries reached
 * - Cache hit/miss statistics for monitoring
 * - Configurable TTL per entry
 *
 * @see https://github.com/tableau/tableau-mcp/blob/main/src/utils/expiringMap.ts
 */

import { getConfig } from "../config.js";

/**
 * Cache entry with metadata for TTL and LRU tracking
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  lastAccessed: number;
}

/**
 * Cache statistics for monitoring performance
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * TTL constants (in milliseconds) by data type
 * Based on data volatility and MCP best practices
 */
export const TTL = {
  /** User profiles - 5 minutes (profile data rarely changes) */
  PROFILE: 5 * 60 * 1000,
  /** Workbook lists - 2 minutes (new workbooks occasionally added) */
  WORKBOOKS: 2 * 60 * 1000,
  /** Search results - 1 minute (results can change frequently) */
  SEARCH: 1 * 60 * 1000,
  /** VOTD - 30 minutes (changes once per day) */
  VOTD: 30 * 60 * 1000,
  /** Featured authors - 30 minutes (changes infrequently) */
  FEATURED: 30 * 60 * 1000,
  /** Static content like workbook details - 10 minutes */
  STATIC: 10 * 60 * 1000,
} as const;

/**
 * LRU Cache with TTL support and statistics tracking
 *
 * Features:
 * - Automatic expiration via setTimeout (like official Tableau MCP)
 * - LRU eviction when max entries reached (enhancement)
 * - Hit/miss statistics for monitoring (enhancement)
 * - Pattern-based invalidation (enhancement)
 *
 * @example
 * ```typescript
 * const cache = new Cache<UserProfile>(TTL.PROFILE, 500);
 * cache.set('user:john', profile);
 * const cached = cache.get('user:john'); // Updates lastAccessed for LRU
 * console.log(cache.getStats()); // { hits: 1, misses: 0, ... }
 * ```
 */
export class Cache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    hitRate: 0,
  };

  constructor(
    private readonly defaultTTL: number,
    private readonly maxEntries: number = 1000
  ) {}

  /**
   * Generate a cache key from endpoint and params
   * Ensures consistent key generation regardless of param order
   */
  static generateKey(
    endpoint: string,
    params?: Record<string, unknown>
  ): string {
    if (!params || Object.keys(params).length === 0) {
      return endpoint;
    }
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = params[key];
          return acc;
        },
        {} as Record<string, unknown>
      );
    return `${endpoint}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get a value from the cache
   * Updates lastAccessed for LRU tracking
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check if expired (belt and suspenders - timeout should handle this)
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update lastAccessed for LRU
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.data;
  }

  /**
   * Store a value in the cache with optional custom TTL
   * Triggers LRU eviction if max entries reached
   */
  set(key: string, data: T, ttl?: number): void {
    const effectiveTTL = ttl ?? this.defaultTTL;

    // Validate TTL (like official Tableau MCP)
    if (effectiveTTL <= 0) {
      throw new Error("TTL must be greater than 0");
    }
    if (effectiveTTL > 2 ** 31 - 1) {
      throw new Error("TTL exceeds maximum setTimeout value");
    }

    // Clear existing timeout if key exists
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key)!);
      this.timeouts.delete(key);
    }

    // LRU eviction if at capacity and adding new key
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      expiresAt: now + effectiveTTL,
      lastAccessed: now,
    });

    // Set expiration timeout (like official Tableau MCP)
    const timeout = setTimeout(() => {
      this.delete(key);
    }, effectiveTTL);

    this.timeouts.set(key, timeout);
    this.stats.size = this.cache.size;
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    const timeout = this.timeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);
    }

    const deleted = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return deleted;
  }

  /**
   * Invalidate all entries matching a pattern
   * Useful for invalidating related entries (e.g., all profile data)
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all entries and timeouts
   */
  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (useful for benchmarking)
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.updateHitRate();
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Update hit rate percentage
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  [Symbol.dispose](): void {
    this.clear();
  }
}

// Singleton cache instances for different data types
// Lazy initialization to respect config
let _profileCache: Cache | undefined;
let _workbookCache: Cache | undefined;
let _searchCache: Cache | undefined;
let _discoveryCache: Cache | undefined;

/**
 * Get the profile cache instance (lazy initialization)
 */
export function getProfileCache(): Cache {
  if (!_profileCache) {
    const config = getConfig();
    _profileCache = new Cache(TTL.PROFILE, config.cacheMaxEntries);
  }
  return _profileCache;
}

/**
 * Get the workbook cache instance (lazy initialization)
 */
export function getWorkbookCache(): Cache {
  if (!_workbookCache) {
    const config = getConfig();
    _workbookCache = new Cache(TTL.WORKBOOKS, config.cacheMaxEntries);
  }
  return _workbookCache;
}

/**
 * Get the search cache instance (lazy initialization)
 */
export function getSearchCache(): Cache {
  if (!_searchCache) {
    const config = getConfig();
    _searchCache = new Cache(TTL.SEARCH, config.cacheMaxEntries);
  }
  return _searchCache;
}

/**
 * Get the discovery cache instance (lazy initialization)
 */
export function getDiscoveryCache(): Cache {
  if (!_discoveryCache) {
    const config = getConfig();
    _discoveryCache = new Cache(TTL.VOTD, config.cacheMaxEntries);
  }
  return _discoveryCache;
}

/**
 * Get combined stats from all caches
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  return {
    profile: _profileCache?.getStats() ?? {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    },
    workbook: _workbookCache?.getStats() ?? {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    },
    search: _searchCache?.getStats() ?? {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    },
    discovery: _discoveryCache?.getStats() ?? {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0,
    },
  };
}

/**
 * Clear all caches (useful for testing)
 */
export function clearAllCaches(): void {
  _profileCache?.clear();
  _workbookCache?.clear();
  _searchCache?.clear();
  _discoveryCache?.clear();
}
