/**
 * Configuration management for Tableau Public MCP Server
 *
 * Provides centralized configuration with environment variable support
 * for customizing server behavior.
 */

import * as os from "os";
import * as path from "path";

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

  /**
   * Maximum size (in bytes) of an image returned inline as MCP image content.
   * Images larger than this are downscaled to fit (preserving aspect ratio)
   * before being embedded in the tool response. Full-resolution output is
   * still written to disk when a save_path is supplied.
   * @default 1048576 (1 MB)
   */
  maxInlineImageBytes: number;

  /**
   * Base directory used to resolve RELATIVE output paths (save_path / outputPath)
   * and as the default save location when none is supplied.
   *
   * The server process's current working directory is deliberately NOT used:
   * sandboxed hosts (e.g. Cowork) launch the server with an unrelated cwd
   * (often C:\windows\system32), so resolving against cwd produces unwritable
   * paths. Absolute paths supplied by the caller are always honoured as-is.
   * @default <home>/tableau-public-mcp
   */
  outputBaseDir: string;
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
    // Inline image response settings
    maxInlineImageBytes: parseInt(process.env.MAX_INLINE_IMAGE_BYTES || "1048576", 10),
    // Output location for saved files (relative paths resolve against this; never cwd)
    outputBaseDir: process.env.TABLEAU_MCP_OUTPUT_DIR || path.join(os.homedir(), "tableau-public-mcp"),
  };
}
