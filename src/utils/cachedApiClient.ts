/**
 * Cached wrapper around the API client
 *
 * Provides transparent caching for API responses based on endpoint patterns.
 * Automatically selects the appropriate cache and TTL based on the endpoint.
 *
 * @example
 * ```typescript
 * // Use instead of direct apiClient.get()
 * const data = await cachedGet<SearchResults>('/api/search/query', { query: 'test' });
 *
 * // Force fresh data
 * const fresh = await cachedGet<Profile>('/profile/api/john', undefined, { bypassCache: true });
 * ```
 */

import { apiClient } from "./apiClient.js";
import {
  Cache,
  TTL,
  getProfileCache,
  getWorkbookCache,
  getSearchCache,
  getDiscoveryCache,
} from "./cache.js";
import { getConfig } from "../config.js";

/**
 * Options for cached requests
 */
export interface CachedRequestOptions {
  /** Skip cache and fetch fresh data */
  bypassCache?: boolean;
  /** Custom TTL for this request (overrides endpoint default) */
  ttl?: number;
}

/**
 * Endpoint pattern matching for cache selection
 */
interface CacheMapping {
  pattern: RegExp;
  getCache: () => Cache;
  ttl: number;
  name: string;
}

/**
 * Mapping of endpoint patterns to their cache configurations
 * Order matters - first match wins
 */
const ENDPOINT_CACHE_MAP: CacheMapping[] = [
  // Profile endpoints
  {
    pattern: /^\/profile\/api\/followers\//,
    getCache: getProfileCache,
    ttl: TTL.PROFILE,
    name: "followers",
  },
  {
    pattern: /^\/profile\/api\/following\//,
    getCache: getProfileCache,
    ttl: TTL.PROFILE,
    name: "following",
  },
  {
    pattern: /^\/profile\/api\/favorites\//,
    getCache: getProfileCache,
    ttl: TTL.PROFILE,
    name: "favorites",
  },
  {
    pattern: /^\/profile\/api\/single_workbook\//,
    getCache: getWorkbookCache,
    ttl: TTL.STATIC,
    name: "workbook-details",
  },
  {
    pattern: /^\/profile\/api\/[^/]+$/,
    getCache: getProfileCache,
    ttl: TTL.PROFILE,
    name: "profile",
  },

  // Workbook endpoints
  {
    pattern: /^\/public\/apis\/workbooks/,
    getCache: getWorkbookCache,
    ttl: TTL.WORKBOOKS,
    name: "workbooks",
  },

  // Search endpoints
  {
    pattern: /^\/api\/search\//,
    getCache: getSearchCache,
    ttl: TTL.SEARCH,
    name: "search",
  },

  // Discovery endpoints
  {
    pattern: /^\/public\/apis\/bff\/discover\/.*viz-of-the-day/,
    getCache: getDiscoveryCache,
    ttl: TTL.VOTD,
    name: "votd",
  },
  {
    pattern: /^\/public\/apis\/featured-authors/,
    getCache: getDiscoveryCache,
    ttl: TTL.FEATURED,
    name: "featured",
  },
];

/**
 * Get the cache configuration for an endpoint
 */
function getCacheMapping(endpoint: string): CacheMapping | null {
  for (const mapping of ENDPOINT_CACHE_MAP) {
    if (mapping.pattern.test(endpoint)) {
      return mapping;
    }
  }
  return null;
}

/**
 * Make a cached GET request
 *
 * Checks the cache first (if enabled), falls back to API call,
 * and stores the result in cache for future requests.
 *
 * @param endpoint - The API endpoint path
 * @param params - Query parameters
 * @param options - Cache options (bypassCache, custom TTL)
 * @returns The response data
 *
 * @example
 * ```typescript
 * // Normal usage - will use cache
 * const results = await cachedGet('/api/search/query', { query: 'COVID' });
 *
 * // Bypass cache for fresh data
 * const fresh = await cachedGet('/api/search/query', { query: 'COVID' }, { bypassCache: true });
 * ```
 */
export async function cachedGet<T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options: CachedRequestOptions = {}
): Promise<T> {
  const config = getConfig();

  // If caching is disabled globally, skip cache logic
  if (!config.cacheEnabled) {
    const response = await apiClient.get(endpoint, { params });
    return response.data as T;
  }

  const cacheMapping = getCacheMapping(endpoint);
  const cacheKey = Cache.generateKey(endpoint, params);

  // Try to get from cache (unless bypassing)
  if (cacheMapping && !options.bypassCache) {
    const cache = cacheMapping.getCache();
    const cached = cache.get(cacheKey);

    if (cached !== undefined) {
      if (config.logLevel === "debug") {
        console.error(`[Cache] HIT (${cacheMapping.name}): ${endpoint}`);
      }
      return cached as T;
    }

    if (config.logLevel === "debug") {
      console.error(`[Cache] MISS (${cacheMapping.name}): ${endpoint}`);
    }
  }

  // Fetch from API
  const response = await apiClient.get(endpoint, { params });
  const data = response.data as T;

  // Store in cache
  if (cacheMapping) {
    const cache = cacheMapping.getCache();
    const ttl = options.ttl ?? cacheMapping.ttl;
    cache.set(cacheKey, data, ttl);
  }

  return data;
}

/**
 * Invalidate cache entries for a specific endpoint pattern
 *
 * @param endpointPattern - Regex pattern matching endpoints to invalidate
 * @returns Number of entries invalidated
 *
 * @example
 * ```typescript
 * // Invalidate all profile cache entries for a user
 * invalidateCache(/\/profile\/api\/john/);
 *
 * // Invalidate all search results
 * invalidateCache(/\/api\/search\//);
 * ```
 */
export function invalidateCache(endpointPattern: RegExp): number {
  let total = 0;

  // Check each cache for matching entries
  const caches = [
    getProfileCache(),
    getWorkbookCache(),
    getSearchCache(),
    getDiscoveryCache(),
  ];

  for (const cache of caches) {
    total += cache.invalidatePattern(endpointPattern);
  }

  return total;
}

/**
 * Prefetch data into the cache
 *
 * Useful for warming the cache with expected data needs.
 *
 * @param endpoint - The API endpoint path
 * @param params - Query parameters
 * @param options - Cache options
 *
 * @example
 * ```typescript
 * // Prefetch a user's profile in the background
 * prefetch('/profile/api/john').catch(() => {});
 * ```
 */
export async function prefetch(
  endpoint: string,
  params?: Record<string, unknown>,
  options: CachedRequestOptions = {}
): Promise<void> {
  try {
    await cachedGet(endpoint, params, options);
  } catch (error) {
    // Silently fail on prefetch errors
    const config = getConfig();
    if (config.logLevel === "debug") {
      console.error(`[Cache] Prefetch failed for ${endpoint}:`, error);
    }
  }
}
