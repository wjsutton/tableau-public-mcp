/**
 * Get Favorites Tool
 *
 * Retrieves the list of workbooks favorited by a Tableau Public user.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getFavorites tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve favorites for")
});

type GetFavoritesParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getFavorites tool
 *
 * This tool fetches the workbooks that a user has favorited on Tableau Public.
 * Returns a list of workbook repository URLs that the user has marked as favorites.
 *
 * Favorites indicate workbooks that a user has bookmarked or saved for reference,
 * providing insight into their interests and content preferences.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "username": "datavizblog"
 * }
 *
 * // Response includes array of favorited workbook repository URLs
 * ```
 */
export function getFavoritesTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_favorites",
    description: "Retrieves the list of workbooks favorited by a Tableau Public user. " +
      "Returns workbook repository URLs that the user has bookmarked or saved. " +
      "Favorites indicate content the user finds valuable or interesting. " +
      "Useful for understanding user preferences and discovering quality visualizations " +
      "curated by the community.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Favorites"
    },

    callback: async (args: GetFavoritesParams): Promise<Ok<CallToolResult>> => {
      const { username } = args;

      try {
        console.error(`[get_favorites] Fetching favorites for user: ${username}`);

        // Call Tableau Public API
        const response = await apiClient.get(
          `/profile/api/favorite/${username}/workbook`
        );

        const favoriteCount = response.data?.length || 0;
        console.error(`[get_favorites] Retrieved ${favoriteCount} favorites for ${username}`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `fetching favorites for user '${username}'`);
      }
    }
  });
}
