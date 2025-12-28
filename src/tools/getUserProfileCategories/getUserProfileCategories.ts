/**
 * Get User Profile Categories Tool
 *
 * Retrieves the workbook categories for a Tableau Public user,
 * including the workbooks within each category.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getUserProfileCategories tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve categories for"),
  startIndex: z.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Starting index for pagination (default: 0)"),
  pageSize: z.number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(500)
    .describe("Number of categories to return (default: 500, max: 500)")
});

type GetUserProfileCategoriesParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getUserProfileCategories tool
 *
 * This tool fetches the user's workbook categories from Tableau Public.
 * Categories are user-defined collections that organize their workbooks.
 * Each category includes:
 * - Category metadata (name, description)
 * - Contained workbooks with details
 * - View counts and favorites
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "username": "datavizblog",
 *   "pageSize": 100
 * }
 *
 * // Response includes:
 * {
 *   "categories": [
 *     {
 *       "name": "Data Visualizations",
 *       "workbooks": [...]
 *     }
 *   ]
 * }
 * ```
 */
export function getUserProfileCategoriesTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_user_profile_categories",
    description: "Retrieves workbook categories for a Tableau Public user. " +
      "Returns user-defined categories containing workbooks, with metadata including " +
      "category names, contained workbooks, view counts, and favorites. " +
      "Supports pagination with startIndex and pageSize parameters. " +
      "Useful for understanding how a user organizes their content.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get User Profile Categories"
    },

    callback: async (args: GetUserProfileCategoriesParams): Promise<Ok<CallToolResult>> => {
      const { username, startIndex = 0, pageSize = 500 } = args;

      try {
        console.error(`[get_user_profile_categories] Fetching categories for user: ${username} (start=${startIndex}, size=${pageSize})`);

        // Call Tableau Public API with caching
        const data = await cachedGet<{ categories?: unknown[] }>(
          `/public/apis/bff/v2/author/${username}/categories`,
          { startIndex, pageSize }
        );

        const categoryCount = data?.categories?.length || 0;
        console.error(`[get_user_profile_categories] Retrieved ${categoryCount} categories for ${username}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching categories for user '${username}'`);
      }
    }
  });
}
