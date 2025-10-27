/**
 * Get Shared Workbook Tool
 *
 * Retrieves source workbook details from a Tableau Public shared workbook URL.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getSharedWorkbook tool
 */
const paramsSchema = z.object({
  shareId: z.string()
    .min(1, "Share ID cannot be empty")
    .describe("Share ID from shared workbook URL (e.g., 'abc123' from shared/abc123)")
});

type GetSharedWorkbookParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getSharedWorkbook tool
 *
 * This tool resolves shared workbook URLs to their source workbook details.
 * Tableau Public allows workbooks to be shared with unique share IDs.
 * This tool retrieves the original workbook metadata from a share ID.
 *
 * Useful for tracking down the source of shared visualizations.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "shareId": "abc123xyz"
 * }
 *
 * // Response includes source workbook details
 * ```
 */
export function getSharedWorkbookTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_shared_workbook",
    description: "Retrieves the source workbook details from a Tableau Public shared workbook URL. " +
      "When workbooks are shared using Tableau Public's share feature, they get a unique share ID. " +
      "This tool resolves the share ID to the original workbook metadata including title, author, " +
      "and repository URL. Requires the share ID from the shared URL (e.g., 'abc123' from '/shared/abc123'). " +
      "Useful for tracking the source of shared visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Shared Workbook"
    },

    callback: async (args: GetSharedWorkbookParams): Promise<Ok<CallToolResult>> => {
      const { shareId } = args;

      try {
        console.error(`[get_shared_workbook] Fetching shared workbook for ID: ${shareId}`);

        // Call Tableau Public API
        const response = await apiClient.get(
          `/profile/api/workbook/shared/${shareId}`
        );

        console.error(`[get_shared_workbook] Successfully retrieved shared workbook details`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `fetching shared workbook with ID '${shareId}'`);
      }
    }
  });
}
