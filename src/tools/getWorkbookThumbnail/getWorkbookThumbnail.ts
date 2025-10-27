/**
 * Get Workbook Thumbnail Tool
 *
 * Retrieves a thumbnail image URL for a Tableau Public workbook visualization.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";
import { getConfig } from "../../config.js";

/**
 * Parameter schema for getWorkbookThumbnail tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL (e.g., 'username/workbook-name')"),
  viewName: z.string()
    .min(1, "View name cannot be empty")
    .describe("Name of the specific view/sheet (spaces and periods removed)"),
  useStaticPath: z.boolean()
    .optional()
    .default(false)
    .describe("Use alternative static image path (default: false)")
});

type GetWorkbookThumbnailParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookThumbnail tool
 *
 * This tool generates URLs to retrieve thumbnail images of Tableau Public visualizations.
 * Thumbnails are smaller, preview-sized images suitable for lists and galleries.
 *
 * Two URL formats are available:
 * 1. Thumb path (default): `/thumb/views/{workbookUrl}/{viewName}`
 * 2. Static path: `/static/images/{firstTwoLetters}/{workbookUrl}/{viewName}/4_3.png`
 *
 * Important notes about view names:
 * - Remove spaces and periods from the view name
 * - Use the exact view name as it appears in the workbook structure
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
 * // Response includes thumbnail URL
 * ```
 */
export function getWorkbookThumbnailTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_thumbnail",
    description: "Retrieves the URL for a thumbnail image of a Tableau Public visualization. " +
      "Returns a direct link to a preview-sized image suitable for lists and galleries. " +
      "Requires the workbook repository URL (format: 'username/workbook-name') and view name. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' → 'Dashboard1'). " +
      "Supports two URL formats: thumb path (default) and static path. " +
      "Useful for creating preview galleries, workbook lists, and quick references.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Thumbnail"
    },

    callback: async (args: GetWorkbookThumbnailParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl, viewName, useStaticPath = false } = args;

      try {
        console.error(`[get_workbook_thumbnail] Generating thumbnail URL for: ${workbookUrl}/${viewName} (static=${useStaticPath})`);

        const config = getConfig();

        let thumbnailUrl: string;

        if (useStaticPath) {
          // Extract first two letters from workbook URL for static path
          const firstTwoLetters = workbookUrl.substring(0, 2);
          thumbnailUrl = `${config.baseURL}/static/images/${firstTwoLetters}/${workbookUrl}/${viewName}/4_3.png`;
        } else {
          // Default thumb path
          thumbnailUrl = `${config.baseURL}/thumb/views/${workbookUrl}/${viewName}`;
        }

        const result = {
          thumbnailUrl,
          workbookUrl,
          viewName,
          pathType: useStaticPath ? "static" : "thumb",
          description: "Thumbnail-sized preview image of the visualization",
          usage: "This URL can be used in <img> tags for preview galleries and workbook lists"
        };

        console.error(`[get_workbook_thumbnail] Generated thumbnail URL successfully`);

        return createSuccessResult(result);

      } catch (error) {
        return handleApiError(error, `generating thumbnail URL for workbook '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
