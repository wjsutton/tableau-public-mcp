/**
 * Get Viz of the Day Tool
 *
 * Retrieves Tableau Public's Visualization of the Day (VOTD) winners.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getVizOfDay tool
 */
const paramsSchema = z.object({
  page: z.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Page number for pagination (default: 0)"),
  limit: z.number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(12)
    .describe("Number of VOTD entries to return (default: 12, max: 12)")
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
      "Returns recent winners with workbook titles, authors, feature dates, descriptions, " +
      "view counts, and thumbnails. Supports pagination with page and limit parameters " +
      "(max 12 per request). Useful for discovering high-quality visualizations and " +
      "staying updated with featured content.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Viz of the Day"
    },

    callback: async (args: GetVizOfDayParams): Promise<Ok<CallToolResult>> => {
      const { page = 0, limit = 12 } = args;

      try {
        console.error(`[get_viz_of_day] Fetching VOTD winners (page=${page}, limit=${limit})`);

        // Call Tableau Public API
        const response = await apiClient.get(
          "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
          {
            params: {
              page,
              limit
            }
          }
        );

        const votdCount = response.data?.vizzes?.length || response.data?.length || 0;
        console.error(`[get_viz_of_day] Retrieved ${votdCount} VOTD entries`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, "fetching Viz of the Day winners");
      }
    }
  });
}
