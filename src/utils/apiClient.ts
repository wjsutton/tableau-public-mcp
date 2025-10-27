/**
 * HTTP client for Tableau Public API interactions
 *
 * Provides a configured Axios instance with interceptors for logging
 * and error handling. All API requests should use this client.
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { getConfig } from "../config.js";

const config = getConfig();

/**
 * Configured Axios instance for Tableau Public API requests
 *
 * Features:
 * - Automatic base URL configuration
 * - Request/response logging to stderr (stdout reserved for MCP protocol)
 * - Timeout handling
 * - Custom user agent
 *
 * @example
 * ```typescript
 * const response = await apiClient.get('/profile/api/username');
 * console.log(response.data);
 * ```
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: config.baseURL,
  timeout: config.apiTimeout,
  headers: {
    "User-Agent": "tableau-public-mcp-server/1.0.0",
    "Accept": "application/json"
  }
});

/**
 * Request interceptor - logs outgoing API requests
 */
apiClient.interceptors.request.use(
  (config) => {
    const method = config.method?.toUpperCase() || "GET";
    const url = config.url || "";
    console.error(`[API Request] ${method} ${url}`);

    if (config.params) {
      console.error(`[API Request] Parameters:`, JSON.stringify(config.params));
    }

    return config;
  },
  (error: AxiosError) => {
    console.error(`[API Request Error]`, error.message);
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - logs API responses and errors
 */
apiClient.interceptors.response.use(
  (response) => {
    const status = response.status;
    const url = response.config.url || "";
    console.error(`[API Response] ${status} ${url}`);

    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error status
      console.error(
        `[API Error] ${error.response.status} ${error.config?.url}:`,
        error.response.statusText
      );
    } else if (error.request) {
      // Request made but no response received
      console.error(`[API Error] No response from ${error.config?.url}`);
    } else {
      // Error setting up the request
      console.error(`[API Error]`, error.message);
    }

    return Promise.reject(error);
  }
);

/**
 * Type guard to check if an error is an Axios error
 *
 * @param error - The error to check
 * @returns True if the error is an AxiosError
 *
 * @example
 * ```typescript
 * try {
 *   await apiClient.get('/some-endpoint');
 * } catch (error) {
 *   if (isAxiosError(error)) {
 *     console.log(error.response?.status);
 *   }
 * }
 * ```
 */
export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}
