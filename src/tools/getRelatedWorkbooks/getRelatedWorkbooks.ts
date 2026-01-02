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
import { constructDirectUrl } from "../../utils/urlBuilder.js";

/**
 * Parameter schema for getRelatedWorkbooks tool
 */
const paramsSchema = z.object({
  workbookName: z.string()
    .min(1, "Workbook name cannot be empty")
    .describe("Workbook name only (e.g., 'RunningforOlympicGold'). Do not include username prefix."),
  count: z.coerce.number()
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
 *   "workbookName": "sales-dashboard",
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
      "Includes workbook metadata such as titles, authors, view counts, thumbnails, and direct URLs. " +
      "Requires the workbook name only (e.g., 'RunningforOlympicGold'), not the full path with username. " +
      "Useful for content discovery and finding similar visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Related Workbooks"
    },

    callback: async (args: GetRelatedWorkbooksParams): Promise<Ok<CallToolResult>> => {
      const { workbookName, count = 10 } = args;

      try {
        console.error(`[get_related_workbooks] Fetching ${count} related workbooks for: ${workbookName}`);

        // Call Tableau Public API with caching
        const response = await cachedGet<unknown[] | { workbooks?: unknown[] }>(
          `/public/apis/bff/workbooks/v2/${workbookName}/recommended-workbooks`,
          { count }
        );

        // Handle both array and object responses
        const workbooksArray = Array.isArray(response) ? response : (response as any)?.workbooks || [];

        // Enrich workbooks with directUrl
        const enrichedData = workbooksArray.map((workbook: any) => {
          const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl } = workbook;
          if (authorProfileName && workbookRepoUrl && defaultViewRepoUrl) {
            const directUrl = constructDirectUrl({
              authorProfileName,
              workbookRepoUrl,
              defaultViewRepoUrl
            });
            if (directUrl) {
              workbook.directUrl = directUrl;
            }
          }
          return workbook;
        });

        const relatedCount = enrichedData.length;
        console.error(`[get_related_workbooks] Retrieved ${relatedCount} related workbooks`);

        return createSuccessResult(enrichedData);

      } catch (error) {
        return handleApiError(error, `fetching related workbooks for '${workbookName}'`);
      }
    }
  });
}
