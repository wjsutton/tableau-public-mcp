/**
 * Get User Profile Basic Tool
 *
 * Retrieves basic profile description for a Tableau Public user.
 * This is a lightweight alternative to the full profile endpoint.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getUserProfileBasic tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve basic profile for")
});

type GetUserProfileBasicParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getUserProfileBasic tool
 *
 * This tool fetches basic profile information using a lightweight endpoint.
 * Returns essential user information without the full detail of the
 * comprehensive profile endpoint. Useful when you only need basic metadata.
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
 * // Response includes basic profile info
 * {
 *   "profileName": "datavizblog",
 *   "displayName": "Data Viz Blog",
 *   ...
 * }
 * ```
 */
export function getUserProfileBasicTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_user_profile_basic",
    description: "Retrieves basic profile information for a Tableau Public user. " +
      "Returns essential user metadata in a lightweight format. " +
      "This is a simpler alternative to get_user_profile when you only need " +
      "core profile details without the full workbook history. " +
      "Useful for quick profile lookups and user validation.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get User Profile Basic"
    },

    callback: async (args: GetUserProfileBasicParams): Promise<Ok<CallToolResult>> => {
      const { username } = args;

      try {
        console.error(`[get_user_profile_basic] Fetching basic profile for user: ${username}`);

        // Call Tableau Public API
        const response = await apiClient.get(
          "/public/apis/authors",
          {
            params: {
              profileName: username
            }
          }
        );

        console.error(`[get_user_profile_basic] Successfully retrieved basic profile for ${username}`);

        return createSuccessResult(response.data);

      } catch (error) {
        return handleApiError(error, `fetching basic profile for user '${username}'`);
      }
    }
  });
}
