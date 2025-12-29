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
    .describe("Workbook repository URL - the workbookRepoUrl from API responses (e.g., 'SalesForecastDashboard_17646104017530')"),
  viewName: z.string()
    .min(1, "View name cannot be empty")
    .describe("Name of the specific view/sheet (spaces and periods removed, e.g., 'Dashboard1')"),
  workbookName: z.string()
    .optional()
    .describe("Canonical workbook name (without numeric suffix). If not provided, will attempt to derive from workbookUrl by removing trailing _digits. Example: For 'olympic_ages_17646104017530', use 'olympic_ages'."),
  useStaticPath: z.coerce.boolean()
    .optional()
    .default(false)
    .describe("Use alternative static image path format (default: false, uses thumb path)")
});

type GetWorkbookThumbnailParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookThumbnail tool
 *
 * This tool generates URLs to retrieve thumbnail images of Tableau Public visualizations.
 * Thumbnails are smaller, preview-sized images suitable for lists and galleries.
 *
 * Two URL formats are available:
 * 1. Thumb path (default): `/thumb/views/{canonicalName}/{viewName}`
 * 2. Static path: `/static/images/{firstTwoLetters}/{canonicalName}/{viewName}/4_3.png`
 *
 * The canonical workbook name is derived by removing numeric suffixes (e.g., _17646104017530)
 * from the workbookRepoUrl returned by API responses.
 *
 * Important notes:
 * - The workbookName parameter can override automatic derivation
 * - Remove spaces and periods from the view name
 * - Use the exact view name as it appears in the workbook structure
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request with automatic canonical name derivation
 * {
 *   "workbookUrl": "olympic_ages_17646104017530",
 *   "viewName": "TheAgeofOlympians"
 * }
 * // Derives canonical name: "olympic_ages"
 * // Generates: /static/images/ol/olympic_ages/TheAgeofOlympians/4_3.png
 *
 * // Request with explicit canonical name
 * {
 *   "workbookUrl": "olympic_ages_17646104017530",
 *   "viewName": "TheAgeofOlympians",
 *   "workbookName": "olympic_ages"
 * }
 * ```
 */
export function getWorkbookThumbnailTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_thumbnail",
    description: "Generates thumbnail URLs for a Tableau Public visualization using the static images endpoint. " +
      "Requires the canonical workbook name (without numeric suffix) for reliable results. " +
      "If workbookName is not provided, the tool automatically removes trailing numeric suffixes (e.g., '_17646104017530') from workbookUrl. " +
      "Example: For workbookUrl 'olympic_ages_17646104017530', it derives 'olympic_ages'. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' → 'Dashboard1'). " +
      "Supports two URL formats: thumb path (default) and static path (4_3.png).",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Thumbnail"
    },

    callback: async (args: GetWorkbookThumbnailParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl, viewName, workbookName, useStaticPath = false } = args;

      try {
        console.error(`[get_workbook_thumbnail] Generating thumbnail URL for: ${workbookUrl}/${viewName} (static=${useStaticPath})`);

        const config = getConfig();

        // Derive canonical workbook name by removing numeric suffix (e.g., _17646104017530)
        const canonicalName = workbookName || workbookUrl.replace(/_\d{10,}$/, '');

        let thumbnailUrl: string;

        if (useStaticPath) {
          // Extract first two letters from canonical name for static path
          const firstTwoLetters = canonicalName.substring(0, 2);
          thumbnailUrl = `${config.baseURL}/static/images/${firstTwoLetters}/${canonicalName}/${viewName}/4_3.png`;
        } else {
          // Default thumb path - also use canonical name
          thumbnailUrl = `${config.baseURL}/thumb/views/${canonicalName}/${viewName}`;
        }

        const result = {
          thumbnailUrl,
          workbookUrl,
          canonicalWorkbookName: canonicalName,
          viewName,
          pathType: useStaticPath ? "static" : "thumb",
          description: "Thumbnail-sized preview image of the visualization",
          usage: "This URL can be used in <img> tags for preview galleries and workbook lists",
          note: canonicalName !== workbookUrl
            ? `Derived canonical name '${canonicalName}' from workbookUrl by removing numeric suffix`
            : "Using workbookUrl as canonical name (no numeric suffix detected)"
        };

        console.error(`[get_workbook_thumbnail] Generated thumbnail URL successfully`);

        return createSuccessResult(result);

      } catch (error) {
        return handleApiError(error, `generating thumbnail URL for workbook '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
