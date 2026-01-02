/**
 * Get Viz of the Day Tool
 *
 * Retrieves Tableau Public's Visualization of the Day (VOTD) winners.
 * Supports efficient fetching of large amounts with parallel pagination.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";
import { paginateByPageParallel } from "../../utils/pagination.js";
import { getConfig } from "../../config.js";
import { constructDirectUrl } from "../../utils/urlBuilder.js";

/**
 * Parameter schema for getVizOfDay tool
 */
const paramsSchema = z.object({
  page: z.coerce.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Page number for pagination (default: 0)"),
  limit: z.coerce.number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .default(12)
    .describe("Number of VOTD entries per page (default: 12, max: 12)"),
  maxResults: z.coerce.number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Total VOTD entries to fetch using parallel pagination (max: 500). If specified, fetches multiple pages in parallel."),
  filterMonth: z.coerce.number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Filter results to a specific month (1-12). Use with filterYear."),
  filterYear: z.coerce.number()
    .int()
    .min(2015)
    .optional()
    .describe("Filter results to a specific year (e.g., 2024). Use with filterMonth.")
});

type GetVizOfDayParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getVizOfDay tool
 *
 * This tool fetches the most recent Visualization of the Day (VOTD) winners
 * from Tableau Public. VOTD is a curated selection of exceptional visualizations
 * featured by Tableau.
 *
 * Returns visualization details including:
 * - Workbook titles and authors
 * - Feature dates
 * - Descriptions and highlights
 * - View counts and engagement metrics
 * - Thumbnail URLs
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Get recent VOTD winners
 * {
 *   "page": 0,
 *   "limit": 12
 * }
 * ```
 */
export function getVizOfDayTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_viz_of_day",
    description: "Retrieves Tableau Public's Visualization of the Day (VOTD) winners. " +
      "VOTD is a curated selection of exceptional visualizations featured by Tableau. " +
      "Returns winners with workbook titles, authors, feature dates, descriptions, " +
      "view counts, thumbnails, and direct URLs for viewing on Tableau Public. " +
      "Supports efficient bulk fetching with 'maxResults' " +
      "(up to 500, uses parallel pagination for speed). Can filter by month/year " +
      "(e.g., filterMonth=10, filterYear=2024 for October 2024). " +
      "Useful for discovering high-quality visualizations and analyzing trends.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Viz of the Day"
    },

    callback: async (args: GetVizOfDayParams): Promise<Ok<CallToolResult>> => {
      const { page = 0, limit = 12, maxResults, filterMonth, filterYear } = args;
      const config = getConfig();

      try {
        // If maxResults specified, use parallel pagination for efficiency
        if (maxResults && maxResults > limit) {
          if (config.logLevel === "debug") {
            console.error(`[get_viz_of_day] Fetching ${maxResults} VOTD entries with parallel pagination`);
          }

          // API returns object with 'contents' array: { current, next, contents: [...] }
          // Also API requires limit=12 exactly
          const allVizzes = await paginateByPageParallel(
            async (pageNum: number, _pageLimit: number) => {
              const data = await cachedGet<unknown>(
                "/public/apis/bff/discover/v2/vizzes/viz-of-the-day",
                { page: pageNum, limit: 12 }
              );
              // Add defensive check for non-array responses
              if (Array.isArray(data)) {
                return data;
              } else if (data && typeof data === 'object' && 'contents' in data && Array.isArray((data as any).contents)) {
                return (data as any).contents;
              }
              return [];
            },
            maxResults,
            { maxResults, pageSize: 12 }
          );

          // Apply date filter if specified
          let filteredVizzes = allVizzes;
          if (filterMonth && filterYear) {
            filteredVizzes = allVizzes.filter((viz: unknown) => {
              const vizData = viz as { curatedAt?: string };
              const dateStr = vizData.curatedAt;
              if (!dateStr) return false;
              const date = new Date(dateStr);
              return date.getMonth() + 1 === filterMonth && date.getFullYear() === filterYear;
            });
            if (config.logLevel === "debug") {
              console.error(`[get_viz_of_day] Filtered to ${filteredVizzes.length} entries for ${filterMonth}/${filterYear}`);
            }
          }

          // Enrich vizzes with directUrl
          const enrichedVizzes = filteredVizzes.map((viz: any) => {
            const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl } = viz;
            if (authorProfileName && workbookRepoUrl && defaultViewRepoUrl) {
              const directUrl = constructDirectUrl({
                authorProfileName,
                workbookRepoUrl,
                defaultViewRepoUrl
              });
              if (directUrl) {
                viz.directUrl = directUrl;
              }
            }
            return viz;
          });

          const votdCount = enrichedVizzes.length;
          if (config.logLevel === "debug") {
            console.error(`[get_viz_of_day] Retrieved ${votdCount} VOTD entries total`);
          }

          return createSuccessResult({
            vizzes: enrichedVizzes,
            totalFetched: allVizzes.length,
            filtered: filterMonth && filterYear ? true : false,
            filterMonth,
            filterYear
          });
        }

        // Single page request with caching
        // API returns object with 'contents' array: { current, next, contents: [...] }
        if (config.logLevel === "debug") {
          console.error(`[get_viz_of_day] Fetching VOTD winners (page=${page})`);
        }

        const data = await cachedGet<unknown>(
          "/public/apis/bff/discover/v2/vizzes/viz-of-the-day",
          { page, limit: 12 }
        );

        // Apply defensive type checking and date filter if specified
        let vizzes: unknown[] = [];
        if (Array.isArray(data)) {
          vizzes = data;
        } else if (data && typeof data === 'object' && 'contents' in data && Array.isArray((data as any).contents)) {
          vizzes = (data as any).contents;
        } else {
          console.error('[get_viz_of_day] Unexpected response format:', typeof data);
          vizzes = [];
        }
        if (filterMonth && filterYear) {
          vizzes = vizzes.filter((viz: unknown) => {
            const vizData = viz as { curatedAt?: string };
            const dateStr = vizData.curatedAt;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            return date.getMonth() + 1 === filterMonth && date.getFullYear() === filterYear;
          });
        }

        // Enrich vizzes with directUrl
        const enrichedVizzes = vizzes.map((viz: any) => {
          const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl } = viz;
          if (authorProfileName && workbookRepoUrl && defaultViewRepoUrl) {
            const directUrl = constructDirectUrl({
              authorProfileName,
              workbookRepoUrl,
              defaultViewRepoUrl
            });
            if (directUrl) {
              viz.directUrl = directUrl;
            }
          }
          return viz;
        });

        const votdCount = enrichedVizzes.length;
        if (config.logLevel === "debug") {
          console.error(`[get_viz_of_day] Retrieved ${votdCount} VOTD entries`);
        }

        return createSuccessResult({ vizzes: enrichedVizzes, page });

      } catch (error) {
        return handleApiError(error, "fetching Viz of the Day winners");
      }
    }
  });
}
