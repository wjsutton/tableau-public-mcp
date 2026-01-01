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
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";
import { constructDirectUrl } from "../../utils/urlBuilder.js";

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
      "Returns workbook information including repository URLs and direct URLs where available. " +
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

        // Call Tableau Public API with caching
        const response = await cachedGet<unknown[] | { favorites?: unknown[]; workbooks?: unknown[] }>(
          `/profile/api/favorite/${username}/workbook`
        );

        // Handle both array and object responses
        const favoritesArray = Array.isArray(response)
          ? response
          : (response as any)?.favorites || (response as any)?.workbooks || [];

        // Enrich favorites with directUrl if they have required fields
        // Note: API may return workbook objects or just URLs - handle both cases
        const enrichedData = favoritesArray.map((favorite: any) => {
          // If favorite is an object with workbook data
          if (favorite && typeof favorite === 'object') {
            const { authorProfileName, workbookRepoUrl, defaultViewRepoUrl } = favorite;
            if (authorProfileName && workbookRepoUrl && defaultViewRepoUrl) {
              const directUrl = constructDirectUrl({
                authorProfileName,
                workbookRepoUrl,
                defaultViewRepoUrl
              });
              if (directUrl) {
                favorite.directUrl = directUrl;
              }
            }
          }
          return favorite;
        });

        const favoriteCount = enrichedData.length;
        console.error(`[get_favorites] Retrieved ${favoriteCount} favorites for ${username}`);

        return createSuccessResult(enrichedData);

      } catch (error) {
        return handleApiError(error, `fetching favorites for user '${username}'`);
      }
    }
  });
}
