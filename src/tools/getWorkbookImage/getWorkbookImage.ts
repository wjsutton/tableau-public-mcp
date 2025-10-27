/**
 * Get Workbook Image Tool
 *
 * Retrieves a full-size PNG image of a Tableau Public workbook visualization.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";
import { getConfig } from "../../config.js";

/**
 * Parameter schema for getWorkbookImage tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL (e.g., 'username/workbook-name')"),
  viewName: z.string()
    .min(1, "View name cannot be empty")
    .describe("Name of the specific view/sheet to capture (spaces and periods removed)")
});

type GetWorkbookImageParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookImage tool
 *
 * This tool generates a URL to retrieve a full-size PNG screenshot
 * of a specific view/sheet from a Tableau Public workbook.
 *
 * Important notes about view names:
 * - Remove spaces and periods from the view name
 * - Use the exact view name as it appears in the workbook structure
 * - Example: "Dashboard 1" becomes "Dashboard1"
 *
 * The image is rendered as a static screenshot of the visualization.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "workbookUrl": "datavizblog/sales-dashboard",
 *   "viewName": "Dashboard1"
 * }
 *
 * // Response includes the image URL
 * ```
 */
export function getWorkbookImageTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_image",
    description: "Retrieves the URL for a full-size PNG image of a Tableau Public visualization. " +
      "Returns a direct link to download a static screenshot of the specified view/sheet. " +
      "Requires the workbook repository URL (format: 'username/workbook-name') and view name. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' → 'Dashboard1'). " +
      "Useful for embedding visualizations, documentation, and sharing static images.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Image"
    },

    callback: async (args: GetWorkbookImageParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl, viewName } = args;

      try {
        console.error(`[get_workbook_image] Generating image URL for: ${workbookUrl}/${viewName}`);

        const config = getConfig();

        // Construct the image URL
        const imageUrl = `${config.baseURL}/views/${workbookUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

        const result = {
          imageUrl,
          workbookUrl,
          viewName,
          description: "Full-size PNG screenshot of the visualization",
          usage: "This URL can be used directly in <img> tags or downloaded for offline use"
        };

        console.error(`[get_workbook_image] Generated image URL successfully`);

        return createSuccessResult(result);

      } catch (error) {
        return handleApiError(error, `generating image URL for workbook '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
