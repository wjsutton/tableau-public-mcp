/**
 * Get Workbook Details Tool
 *
 * Retrieves detailed metadata for a single Tableau Public workbook.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getWorkbookDetails tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL (e.g., 'username/workbook-name')")
});

type GetWorkbookDetailsParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookDetails tool
 *
 * This tool fetches detailed metadata for a single workbook including:
 * - Workbook title and description
 * - View names and types
 * - Publication and update dates
 * - Author information
 * - View counts and statistics
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "workbookUrl": "datavizblog/sales-dashboard"
 * }
 *
 * // Response includes detailed workbook metadata
 * ```
 */
export function getWorkbookDetailsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_details",
    description: "Retrieves detailed metadata for a single Tableau Public workbook. " +
      "Returns comprehensive information including workbook title, description, " +
      "view names and types, publication dates, author information, and view statistics. " +
      "Requires the workbook repository URL in the format 'username/workbook-name'. " +
      "Useful for getting complete information about a specific workbook.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Details"
    },

    callback: async (args: GetWorkbookDetailsParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl } = args;

      try {
        console.error(`[get_workbook_details] Fetching details for workbook: ${workbookUrl}`);

        // Call Tableau Public API with caching
        const data = await cachedGet(
          `/profile/api/single_workbook/${workbookUrl}`
        );

        console.error(`[get_workbook_details] Successfully retrieved details for ${workbookUrl}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching details for workbook '${workbookUrl}'`);
      }
    }
  });
}
