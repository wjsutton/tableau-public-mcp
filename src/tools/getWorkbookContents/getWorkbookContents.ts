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
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getWorkbookContents tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL (e.g., 'username/workbook-name')")
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
 *   "workbookUrl": "datavizblog/sales-analysis"
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
      "all visible sheets, dashboards, and stories with their repository URLs. " +
      "Returns sheet metadata, types, and configurations. " +
      "Requires the workbook repository URL in the format 'username/workbook-name'. " +
      "Useful for exploring workbook structure and accessing individual visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Contents"
    },

    callback: async (args: GetWorkbookContentsParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl } = args;

      try {
        console.error(`[get_workbook_contents] Fetching contents for workbook: ${workbookUrl}`);

        // Call Tableau Public API
        const response = await apiClient.get(
          `/profile/api/workbook/${workbookUrl}`
        );

        const sheetCount = response.data?.sheets?.length || 0;
        console.error(`[get_workbook_contents] Retrieved ${sheetCount} sheets for ${workbookUrl}`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `fetching contents for workbook '${workbookUrl}'`);
      }
    }
  });
}
