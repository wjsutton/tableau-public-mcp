/**
 * Get User Profile Tool
 *
 * Retrieves comprehensive profile information for a Tableau Public user
 * including basic counts, social links, and recent workbooks.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getUserProfile tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve profile information for")
});

type GetUserProfileParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getUserProfile tool
 *
 * This tool fetches comprehensive profile data from the Tableau Public API
 * including:
 * - Basic user information (display name, location, bio)
 * - Content counts (workbooks, followers, following, favorites)
 * - Social links and website information
 * - Recent workbooks (last 21)
 * - Freelance status and professional details
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
 * // Response includes:
 * {
 *   "displayName": "Data Viz Blog",
 *   "workbookCount": 150,
 *   "followers": 1200,
 *   "following": 50,
 *   "recentWorkbooks": [...]
 * }
 * ```
 */
export function getUserProfileTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_user_profile",
    description: "Retrieves comprehensive profile information for a Tableau Public user. " +
      "Returns user metadata including workbook counts, followers, following, favorites, " +
      "social links, website details, freelance status, and the last 21 workbooks. " +
      "Useful for getting a complete overview of a user's Tableau Public presence.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get User Profile"
    },

    callback: async (args: GetUserProfileParams): Promise<Ok<CallToolResult>> => {
      const { username } = args;

      try {
        console.error(`[get_user_profile] Fetching profile for user: ${username}`);

        // Call Tableau Public API
        const response = await apiClient.get(`/profile/api/${username}`);

        console.error(`[get_user_profile] Successfully retrieved profile for ${username}`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `fetching profile for user '${username}'`);
      }
    }
  });
}
