/**
 * Get Followers Tool
 *
 * Retrieves the list of followers for a Tableau Public user.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getFollowers tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve followers for"),
  index: z.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Starting index for pagination (default: 0, increments by count)"),
  count: z.number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(24)
    .describe("Number of followers to return (default: 24, max: 100)")
});

type GetFollowersParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getFollowers tool
 *
 * This tool fetches the followers of a Tableau Public user.
 * Returns follower information including:
 * - Follower usernames
 * - Follower metadata (display name, bio)
 * - Latest workbook details for each follower
 *
 * Supports pagination using index parameter (increments by count, not by results).
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "username": "datavizblog",
 *   "count": 24
 * }
 *
 * // Response includes follower details and their latest workbooks
 * ```
 */
export function getFollowersTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_followers",
    description: "Retrieves the list of followers for a Tableau Public user. " +
      "Returns follower usernames, metadata (display names, bios), and their latest workbook details. " +
      "Supports pagination with index and count parameters. " +
      "Default returns 24 followers per request (max 100). " +
      "The index parameter increments by count for pagination (e.g., 0, 24, 48). " +
      "Useful for analyzing user communities and discovering related authors.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Followers"
    },

    callback: async (args: GetFollowersParams): Promise<Ok<CallToolResult>> => {
      const { username, index = 0, count = 24 } = args;

      try {
        console.error(`[get_followers] Fetching followers for user: ${username} (index=${index}, count=${count})`);

        // Call Tableau Public API with caching
        const data = await cachedGet<unknown[]>(
          `/profile/api/followers/${username}`,
          { index, count }
        );

        const followerCount = data?.length || 0;
        console.error(`[get_followers] Retrieved ${followerCount} followers for ${username}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching followers for user '${username}'`);
      }
    }
  });
}
