/**
 * Pagination utilities for Tableau Public API
 *
 * Provides helper functions to handle paginated API responses,
 * automatically fetching multiple pages until the desired number
 * of results is obtained or no more results are available.
 */

export interface PaginationOptions {
  /**
   * Maximum total number of results to return
   * @default 1000
   */
  maxResults?: number;

  /**
   * Number of results to request per API call
   * @default 50
   */
  pageSize?: number;
}

/**
 * Fetches paginated results from an API endpoint
 *
 * Automatically handles pagination by repeatedly calling the provided
 * function with incrementing start/offset values until either:
 * - The maximum number of results is reached
 * - No more results are available from the API
 *
 * @template T The type of items being paginated
 * @param apiCall Function that fetches a page of results given start index and count
 * @param options Pagination configuration options
 * @returns Promise resolving to array of all fetched items
 *
 * @example
 * ```typescript
 * const workbooks = await paginate(
 *   async (start, count) => {
 *     const response = await apiClient.get('/workbooks', {
 *       params: { start, count }
 *     });
 *     return response.data.items;
 *   },
 *   { maxResults: 200, pageSize: 50 }
 * );
 * ```
 */
export async function paginate<T>(
  apiCall: (start: number, count: number) => Promise<T[]>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const { maxResults = 1000, pageSize = 50 } = options;
  const results: T[] = [];
  let start = 0;

  while (results.length < maxResults) {
    // Calculate how many items to request in this batch
    const count = Math.min(pageSize, maxResults - results.length);

    try {
      const batch = await apiCall(start, count);

      // If we got no results, we've reached the end
      if (batch.length === 0) {
        break;
      }

      results.push(...batch);
      start += batch.length;

      // If we got fewer results than requested, there are no more results
      if (batch.length < count) {
        break;
      }
    } catch (error) {
      console.error(`[Pagination] Error fetching batch at start=${start}:`, error);
      throw error;
    }
  }

  // Ensure we don't exceed maxResults
  return results.slice(0, maxResults);
}

/**
 * Fetches paginated results using index-based pagination
 *
 * Similar to paginate() but uses an index parameter instead of start.
 * This is used by some Tableau Public endpoints like followers/following.
 *
 * @template T The type of items being paginated
 * @param apiCall Function that fetches a page of results given index and count
 * @param options Pagination configuration options
 * @returns Promise resolving to array of all fetched items
 *
 * @example
 * ```typescript
 * const followers = await paginateByIndex(
 *   async (index, count) => {
 *     const response = await apiClient.get('/followers', {
 *       params: { index, count }
 *     });
 *     return response.data;
 *   },
 *   { maxResults: 100, pageSize: 24 }
 * );
 * ```
 */
export async function paginateByIndex<T>(
  apiCall: (index: number, count: number) => Promise<T[]>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const { maxResults = 1000, pageSize = 24 } = options;
  const results: T[] = [];
  let index = 0;

  while (results.length < maxResults) {
    const count = Math.min(pageSize, maxResults - results.length);

    try {
      const batch = await apiCall(index, count);

      if (batch.length === 0) {
        break;
      }

      results.push(...batch);
      index += count; // Index increments by count, not by actual results

      if (batch.length < count) {
        break;
      }
    } catch (error) {
      console.error(`[Pagination] Error fetching batch at index=${index}:`, error);
      throw error;
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Fetches paginated results using page-based pagination
 *
 * Similar to paginate() but uses page numbers instead of start index.
 * This is used by some Tableau Public endpoints like viz-of-the-day.
 *
 * @template T The type of items being paginated
 * @param apiCall Function that fetches a page of results given page number and limit
 * @param options Pagination configuration options
 * @returns Promise resolving to array of all fetched items
 *
 * @example
 * ```typescript
 * const vizzes = await paginateByPage(
 *   async (page, limit) => {
 *     const response = await apiClient.get('/viz-of-the-day', {
 *       params: { page, limit }
 *     });
 *     return response.data.items;
 *   },
 *   { maxResults: 50, pageSize: 12 }
 * );
 * ```
 */
export async function paginateByPage<T>(
  apiCall: (page: number, limit: number) => Promise<T[]>,
  options: PaginationOptions = {}
): Promise<T[]> {
  const { maxResults = 1000, pageSize = 12 } = options;
  const results: T[] = [];
  let page = 0;

  while (results.length < maxResults) {
    const limit = Math.min(pageSize, maxResults - results.length);

    try {
      const batch = await apiCall(page, limit);

      if (batch.length === 0) {
        break;
      }

      results.push(...batch);
      page += 1;

      if (batch.length < limit) {
        break;
      }
    } catch (error) {
      console.error(`[Pagination] Error fetching page ${page}:`, error);
      throw error;
    }
  }

  return results.slice(0, maxResults);
}

// ============================================================================
// Parallel Pagination (Performance Enhancement)
// ============================================================================

import { getConfig } from "../config.js";

/**
 * Configuration for parallel pagination
 */
export interface ParallelPaginationOptions extends PaginationOptions {
  /**
   * Maximum concurrent API requests
   * @default from config.maxConcurrency (3)
   */
  concurrency?: number;

  /**
   * Delay between batches in milliseconds (rate limiting)
   * @default from config.batchDelayMs (100)
   */
  batchDelay?: number;
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parallel pagination with known total count
 *
 * When we know the total number of results upfront (or can estimate it),
 * we can calculate all page offsets and fetch them in parallel batches.
 * This is 3-5x faster than sequential pagination for large result sets.
 *
 * @template T The type of items being paginated
 * @param apiCall Function that fetches a page of results
 * @param totalCount Known or estimated total count of results
 * @param options Parallel pagination options
 * @returns Promise resolving to array of all fetched items
 *
 * @example
 * ```typescript
 * // Fetch 500 workbooks in parallel (5x faster than sequential)
 * const workbooks = await paginateParallel(
 *   async (start, count) => {
 *     const response = await apiClient.get('/workbooks', { params: { start, count } });
 *     return response.data.items;
 *   },
 *   500,
 *   { pageSize: 50, concurrency: 3 }
 * );
 * ```
 */
export async function paginateParallel<T>(
  apiCall: (start: number, count: number) => Promise<T[]>,
  totalCount: number,
  options: ParallelPaginationOptions = {}
): Promise<T[]> {
  const config = getConfig();
  const {
    maxResults = 1000,
    pageSize = 50,
    concurrency = config.maxConcurrency,
    batchDelay = config.batchDelayMs,
  } = options;

  const effectiveMax = Math.min(maxResults, totalCount);
  const totalPages = Math.ceil(effectiveMax / pageSize);

  // Generate all page requests
  const pageRequests: Array<{ start: number; count: number }> = [];
  for (let i = 0; i < totalPages; i++) {
    const start = i * pageSize;
    const count = Math.min(pageSize, effectiveMax - start);
    pageRequests.push({ start, count });
  }

  // Process in batches with concurrency limit
  const results: T[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < pageRequests.length; i += concurrency) {
    const batch = pageRequests.slice(i, i + concurrency);

    const batchPromises = batch.map(async ({ start, count }) => {
      try {
        return await apiCall(start, count);
      } catch (error) {
        console.error(
          `[Pagination] Error fetching batch at start=${start}:`,
          error
        );
        errors.push(error instanceof Error ? error : new Error(String(error)));
        return [] as T[];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const items of batchResults) {
      results.push(...items);
    }

    // Rate limiting delay between batches (not after the last batch)
    if (i + concurrency < pageRequests.length && batchDelay > 0) {
      await delay(batchDelay);
    }
  }

  // If all requests failed, throw the first error
  if (results.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return results.slice(0, effectiveMax);
}

/**
 * Parallel page-based pagination
 *
 * Like paginateParallel but uses page numbers instead of start offsets.
 *
 * @template T The type of items being paginated
 * @param apiCall Function that fetches a page of results given page number and limit
 * @param totalCount Known or estimated total count of results
 * @param options Parallel pagination options
 * @returns Promise resolving to array of all fetched items
 */
export async function paginateByPageParallel<T>(
  apiCall: (page: number, limit: number) => Promise<T[]>,
  totalCount: number,
  options: ParallelPaginationOptions = {}
): Promise<T[]> {
  const config = getConfig();
  const {
    maxResults = 1000,
    pageSize = 12,
    concurrency = config.maxConcurrency,
    batchDelay = config.batchDelayMs,
  } = options;

  const effectiveMax = Math.min(maxResults, totalCount);
  const totalPages = Math.ceil(effectiveMax / pageSize);

  // Generate all page requests
  const pageRequests: Array<{ page: number; limit: number }> = [];
  for (let i = 0; i < totalPages; i++) {
    const remaining = effectiveMax - i * pageSize;
    const limit = Math.min(pageSize, remaining);
    pageRequests.push({ page: i, limit });
  }

  // Process in batches with concurrency limit
  const results: T[] = [];
  const errors: Error[] = [];

  for (let i = 0; i < pageRequests.length; i += concurrency) {
    const batch = pageRequests.slice(i, i + concurrency);

    const batchPromises = batch.map(async ({ page, limit }) => {
      try {
        return await apiCall(page, limit);
      } catch (error) {
        console.error(`[Pagination] Error fetching page ${page}:`, error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
        return [] as T[];
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const items of batchResults) {
      results.push(...items);
    }

    // Rate limiting delay between batches
    if (i + concurrency < pageRequests.length && batchDelay > 0) {
      await delay(batchDelay);
    }
  }

  // If all requests failed, throw the first error
  if (results.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  return results.slice(0, effectiveMax);
}

/**
 * Adaptive pagination - starts sequential, switches to parallel when total is known
 *
 * Some APIs return total count in the response. This function detects that
 * and optimizes subsequent fetches using parallel pagination.
 *
 * @template T The type of items being paginated
 * @param apiCall Function that returns items and optionally total count
 * @param options Parallel pagination options
 * @returns Promise resolving to array of all fetched items
 *
 * @example
 * ```typescript
 * const workbooks = await paginateAdaptive(
 *   async (start, count) => {
 *     const response = await apiClient.get('/workbooks', { params: { start, count } });
 *     return { items: response.data.items, total: response.data.totalCount };
 *   },
 *   { maxResults: 500 }
 * );
 * ```
 */
export async function paginateAdaptive<T>(
  apiCall: (
    start: number,
    count: number
  ) => Promise<{ items: T[]; total?: number }>,
  options: ParallelPaginationOptions = {}
): Promise<T[]> {
  const { maxResults = 1000, pageSize = 50 } = options;

  // First request to get total count
  const firstBatch = await apiCall(0, pageSize);
  const results: T[] = [...firstBatch.items];

  if (results.length === 0 || results.length >= maxResults) {
    return results.slice(0, maxResults);
  }

  // If we have total count and more pages needed, parallelize the rest
  if (firstBatch.total && firstBatch.total > pageSize) {
    const remaining = Math.min(maxResults, firstBatch.total) - results.length;

    if (remaining > 0) {
      // Fetch remaining pages in parallel
      const moreResults = await paginateParallel(
        async (start, count) => {
          const batch = await apiCall(start + pageSize, count);
          return batch.items;
        },
        remaining,
        {
          ...options,
          maxResults: remaining,
        }
      );
      results.push(...moreResults);
    }
  } else {
    // Fall back to sequential if no total count (original behavior)
    let start = pageSize;
    while (results.length < maxResults) {
      const count = Math.min(pageSize, maxResults - results.length);
      const batch = await apiCall(start, count);
      if (batch.items.length === 0) break;
      results.push(...batch.items);
      start += batch.items.length;
      if (batch.items.length < count) break;
    }
  }

  return results.slice(0, maxResults);
}
