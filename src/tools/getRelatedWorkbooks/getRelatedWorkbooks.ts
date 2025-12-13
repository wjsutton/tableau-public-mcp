/**
 * Get Related Workbooks Tool
 *
 * Retrieves recommended/related workbooks for a given Tableau Public workbook.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getRelatedWorkbooks tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL (e.g., 'username/workbook-name')"),
  count: z.number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe("Number of related workbooks to return (default: 10, max: 20)")
});

type GetRelatedWorkbooksParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getRelatedWorkbooks tool
 *
 * This tool fetches workbooks related to a given workbook based on
 * Tableau Public's recommendation algorithm. Returns up to 20 related
 * workbooks with metadata including titles, authors, view counts, and thumbnails.
 *
 * Useful for discovering similar content and content recommendations.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "workbookUrl": "datavizblog/sales-dashboard",
 *   "count": 5
 * }
 *
 * // Response includes up to 5 related workbooks
 * ```
 */
export function getRelatedWorkbooksTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_related_workbooks",
    description: "Retrieves recommended workbooks related to a specific Tableau Public workbook. " +
      "Returns up to 20 similar workbooks based on Tableau Public's recommendation algorithm. " +
      "Includes workbook metadata such as titles, authors, view counts, and thumbnails. " +
      "Requires the workbook repository URL in the format 'username/workbook-name'. " +
      "Useful for content discovery and finding similar visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Related Workbooks"
    },

    callback: async (args: GetRelatedWorkbooksParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl, count = 10 } = args;

      try {
        console.error(`[get_related_workbooks] Fetching ${count} related workbooks for: ${workbookUrl}`);

        // Call Tableau Public API with caching
        const data = await cachedGet<unknown[]>(
          `/public/apis/bff/workbooks/v2/${workbookUrl}/recommended-workbooks`,
          { count }
        );

        const relatedCount = data?.length || 0;
        console.error(`[get_related_workbooks] Retrieved ${relatedCount} related workbooks`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching related workbooks for '${workbookUrl}'`);
      }
    }
  });
}
