/**
 * Search Visualizations Tool
 *
 * Searches Tableau Public for visualizations or authors matching a query.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for searchVisualizations tool
 */
const paramsSchema = z.object({
  query: z.string()
    .min(1, "Search query cannot be empty")
    .describe("Search term to find visualizations or authors"),
  type: z.enum(["vizzes", "authors"])
    .optional()
    .default("vizzes")
    .describe("Type of content to search: 'vizzes' (visualizations) or 'authors' (default: vizzes)"),
  count: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Number of results to return (default: 20, max: 100)"),
  start: z.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Start index for pagination (default: 0)"),
  language: z.string()
    .optional()
    .default("en-us")
    .describe("Language for search results (default: en-us)")
});

type SearchVisualizationsParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the searchVisualizations tool
 *
 * This tool searches Tableau Public content using keywords.
 * Can search for:
 * - Visualizations (vizzes): Workbooks, dashboards, and visualizations
 * - Authors: Tableau Public users and content creators
 *
 * Returns search results with relevance ranking including:
 * - Titles and descriptions
 * - Authors and metadata
 * - View counts and statistics
 * - Thumbnail URLs
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Search for COVID dashboards
 * {
 *   "query": "COVID-19",
 *   "type": "vizzes",
 *   "count": 10
 * }
 *
 * // Search for authors
 * {
 *   "query": "data visualization",
 *   "type": "authors",
 *   "count": 5
 * }
 * ```
 */
export function searchVisualizationsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "search_visualizations",
    description: "Searches Tableau Public for visualizations or authors matching a query. " +
      "Returns ranked search results with titles, descriptions, authors, view counts, and thumbnails. " +
      "Can search for either 'vizzes' (workbooks and visualizations) or 'authors' (content creators). " +
      "Supports pagination with start and count parameters (max 100 results per request). " +
      "Useful for content discovery, finding specific topics, and identifying relevant creators.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Search Visualizations"
    },

    callback: async (args: SearchVisualizationsParams): Promise<Ok<CallToolResult>> => {
      const { query, type = "vizzes", count = 20, start = 0, language = "en-us" } = args;

      try {
        console.error(`[search_visualizations] Searching for ${type}: "${query}" (start=${start}, count=${count})`);

        // Call Tableau Public API
        const response = await apiClient.get(
          "/api/search/query",
          {
            params: {
              query,
              type,
              count,
              start,
              language
            }
          }
        );

        const resultCount = response.data?.results?.length || 0;
        console.error(`[search_visualizations] Found ${resultCount} results for "${query}"`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `searching for ${type} with query '${query}'`);
      }
    }
  });
}
