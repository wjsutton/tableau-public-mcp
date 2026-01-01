/**
 * Get Workbook Contents Tool
 *
 * Retrieves the sheets, dashboards, and stories within a Tableau Public workbook.
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
 * Parameter schema for getWorkbookContents tool
 */
const paramsSchema = z.object({
  workbookName: z.string()
    .min(1, "Workbook name cannot be empty")
    .describe("The workbook name from the Tableau Public URL (e.g., 'GloboxABTestAnalysis_17009696417070')")
});

type GetWorkbookContentsParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookContents tool
 *
 * This tool fetches the complete structure of a workbook including:
 * - All visible sheets with their repository URLs
 * - Dashboards and their configurations
 * - Stories and their sequences
 * - Sheet metadata and types
 *
 * Useful for understanding the complete structure of a workbook
 * and accessing individual sheets programmatically.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "workbookName": "SalesAnalysis_17009696417070"
 * }
 *
 * // Response includes all sheets, dashboards, and stories
 * ```
 */
export function getWorkbookContentsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_contents",
    description: "Retrieves the complete structure of a Tableau Public workbook including " +
      "all visible sheets, dashboards, and stories with their repository URLs and direct URLs. " +
      "Returns sheet metadata, types, configurations, and ready-to-use links for viewing each sheet. " +
      "Requires the workbook name from the Tableau Public URL (e.g., 'GloboxABTestAnalysis_17009696417070'). " +
      "Useful for exploring workbook structure and accessing individual visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Contents"
    },

    callback: async (args: GetWorkbookContentsParams): Promise<Ok<CallToolResult>> => {
      const { workbookName } = args;

      try {
        console.error(`[get_workbook_contents] Fetching contents for workbook: ${workbookName}`);

        // Call Tableau Public API with caching
        const data = await cachedGet<{ sheets?: unknown[] }>(
          `/profile/api/workbook/${workbookName}`
        );

        // Enrich sheets with directUrl if workbook context is available
        if (data && data.sheets && Array.isArray(data.sheets)) {
          const workbookData = data as any;
          const { authorProfileName, workbookRepoUrl } = workbookData;

          if (authorProfileName && workbookRepoUrl) {
            data.sheets = data.sheets.map((sheet: any) => {
              const { sheetRepoUrl } = sheet;
              if (sheetRepoUrl) {
                const directUrl = constructDirectUrl({
                  authorProfileName,
                  workbookRepoUrl,
                  defaultViewRepoUrl: sheetRepoUrl
                });
                if (directUrl) {
                  sheet.directUrl = directUrl;
                }
              }
              return sheet;
            });
          }
        }

        const sheetCount = data?.sheets?.length || 0;
        console.error(`[get_workbook_contents] Retrieved ${sheetCount} sheets for ${workbookName}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching contents for workbook '${workbookName}'`);
      }
    }
  });
}
