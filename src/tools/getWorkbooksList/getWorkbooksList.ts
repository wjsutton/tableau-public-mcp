/**
 * Get Workbooks List Tool
 *
 * Retrieves a paginated list of workbooks for a Tableau Public user.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getWorkbooksList tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve workbooks for"),
  start: z.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Start index for pagination (default: 0)"),
  count: z.number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(50)
    .describe("Number of workbooks to return (default: 50, max: 50)"),
  visibility: z.enum(["NON_HIDDEN", "ALL"])
    .optional()
    .default("NON_HIDDEN")
    .describe("Filter by visibility: NON_HIDDEN (visible only) or ALL (default: NON_HIDDEN)")
});

type GetWorkbooksListParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbooksList tool
 *
 * This tool fetches a paginated list of workbooks for a user from Tableau Public.
 * Returns metadata including:
 * - Workbook titles and URLs
 * - View counts and favorites
 * - Publication dates
 * - Thumbnail information
 * - Sheet/dashboard counts
 *
 * Use pagination (start, count) to retrieve large workbook collections.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "username": "datavizblog",
 *   "start": 0,
 *   "count": 25
 * }
 *
 * // Response includes workbook array with metadata
 * ```
 */
export function getWorkbooksListTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbooks_list",
    description: "Retrieves a paginated list of workbooks for a Tableau Public user. " +
      "Returns workbook metadata including titles, view counts, publication dates, " +
      "thumbnails, and sheet counts. Supports pagination with start and count parameters " +
      "(max 50 per request). Use visibility filter to include or exclude hidden workbooks. " +
      "Useful for browsing a user's complete workbook portfolio.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbooks List"
    },

    callback: async (args: GetWorkbooksListParams): Promise<Ok<CallToolResult>> => {
      const { username, start = 0, count = 50, visibility = "NON_HIDDEN" } = args;

      try {
        console.error(`[get_workbooks_list] Fetching workbooks for user: ${username} (start=${start}, count=${count}, visibility=${visibility})`);

        // Call Tableau Public API with caching
        const data = await cachedGet<unknown[]>(
          "/public/apis/workbooks",
          { profileName: username, start, count, visibility }
        );

        const workbookCount = data?.length || 0;
        console.error(`[get_workbooks_list] Retrieved ${workbookCount} workbooks for ${username}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching workbooks for user '${username}'`);
      }
    }
  });
}
