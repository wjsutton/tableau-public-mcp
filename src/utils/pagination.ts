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
