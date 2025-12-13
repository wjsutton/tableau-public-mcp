/**
 * Configuration management for Tableau Public MCP Server
 *
 * Provides centralized configuration with environment variable support
 * for customizing server behavior.
 */

export interface Config {
  /**
   * Maximum number of results to return from API calls
   * @default 1000
   */
  maxResultLimit: number;

  /**
   * Logging level for server operations
   * @default "info"
   */
  logLevel: "debug" | "info" | "warn" | "error";

  /**
   * Default timeout for API requests in milliseconds
   * @default 30000
   */
  apiTimeout: number;

  /**
   * Base URL for Tableau Public API
   * @default "https://public.tableau.com"
   */
  baseURL: string;

  /**
   * Enable/disable API response caching
   * @default true
   */
  cacheEnabled: boolean;

  /**
   * Maximum number of entries per cache
   * @default 1000
   */
  cacheMaxEntries: number;

  /**
   * Default cache TTL in milliseconds
   * @default 300000 (5 minutes)
   */
  cacheDefaultTTL: number;

  /**
   * Maximum concurrent API requests for parallel pagination
   * @default 3
   */
  maxConcurrency: number;

  /**
   * Delay between batch requests in milliseconds (rate limiting)
   * @default 100
   */
  batchDelayMs: number;
}

/**
 * Retrieves the current configuration from environment variables
 * with sensible defaults for all values.
 *
 * @returns {Config} The application configuration
 *
 * @example
 * ```typescript
 * const config = getConfig();
 * console.log(`Max results: ${config.maxResultLimit}`);
 * ```
 */
export function getConfig(): Config {
  return {
    maxResultLimit: parseInt(process.env.MAX_RESULT_LIMIT || "1000", 10),
    logLevel: (process.env.LOG_LEVEL || "info") as Config["logLevel"],
    apiTimeout: parseInt(process.env.API_TIMEOUT || "30000", 10),
    baseURL: process.env.TABLEAU_PUBLIC_BASE_URL || "https://public.tableau.com",
    // Cache settings
    cacheEnabled: process.env.CACHE_ENABLED !== "false",
    cacheMaxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || "1000", 10),
    cacheDefaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || "300000", 10),
    // Pagination settings
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || "3", 10),
    batchDelayMs: parseInt(process.env.BATCH_DELAY_MS || "100", 10),
  };
}
