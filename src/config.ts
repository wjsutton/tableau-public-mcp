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
    baseURL: process.env.TABLEAU_PUBLIC_BASE_URL || "https://public.tableau.com"
  };
}
