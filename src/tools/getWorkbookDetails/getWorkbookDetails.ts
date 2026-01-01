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
import { constructDirectUrl } from "../../utils/urlBuilder.js";

/**
 * Parameter schema for getWorkbookDetails tool
 */
const paramsSchema = z.object({
  workbookName: z.string()
    .min(1, "Workbook name cannot be empty")
    .describe("The workbook name from the Tableau Public URL (e.g., 'GloboxABTestAnalysis_17009696417070')")
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
 *   "workbookName": "GloboxABTestAnalysis_17009696417070"
 * }
 *
 * // Response includes detailed workbook metadata
 * // Note: Use just the workbook name, NOT the 'username/workbook-name' format
 * ```
 */
export function getWorkbookDetailsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_details",
    description: "Retrieves detailed metadata for a single Tableau Public workbook. " +
      "Returns comprehensive information including workbook title, description, " +
      "view names and types, publication dates, author information, view statistics, and direct URL. " +
      "Requires the workbook name from the Tableau Public URL (e.g., 'GloboxABTestAnalysis_17009696417070'). " +
      "Useful for getting complete information about a specific workbook.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Details"
    },

    callback: async (args: GetWorkbookDetailsParams): Promise<Ok<CallToolResult>> => {
      const { workbookName } = args;

      try {
        console.error(`[get_workbook_details] Fetching details for workbook: ${workbookName}`);

        // Call Tableau Public API with caching
        const data = await cachedGet(
          `/profile/api/single_workbook/${workbookName}`
        );

        // Enrich workbook with directUrl
        if (data && typeof data === 'object') {
          const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl } = data as any;
          if (authorProfileName && workbookRepoUrl && defaultViewRepoUrl) {
            const directUrl = constructDirectUrl({
              authorProfileName,
              workbookRepoUrl,
              defaultViewRepoUrl
            });
            if (directUrl) {
              (data as any).directUrl = directUrl;
            }
          }
        }

        console.error(`[get_workbook_details] Successfully retrieved details for ${workbookName}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching details for workbook '${workbookName}'`);
      }
    }
  });
}
