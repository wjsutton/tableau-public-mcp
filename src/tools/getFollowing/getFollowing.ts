/**
 * Get Following Tool
 *
 * Retrieves the list of accounts a Tableau Public user is following.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getFollowing tool
 */
const paramsSchema = z.object({
  username: z.string()
    .min(1, "Username cannot be empty")
    .describe("Tableau Public username to retrieve following list for"),
  index: z.coerce.number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Starting index for pagination (default: 0, increments by count)"),
  count: z.coerce.number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .default(24)
    .describe("Number of following accounts to return (default: 24, max: 24)")
});

type GetFollowingParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getFollowing tool
 *
 * This tool fetches the accounts that a Tableau Public user follows.
 * Returns information including:
 * - Followed account usernames
 * - Account metadata (display name, bio)
 * - Latest workbook details for each followed account
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
 * // Response includes followed accounts and their latest workbooks
 * ```
 */
export function getFollowingTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_following",
    description: "Retrieves the list of accounts a Tableau Public user is following. " +
      "Returns usernames, metadata (display names, bios), and latest workbook details " +
      "for each followed account. Supports pagination with index and count parameters. " +
      "Default returns 24 accounts per request (max 24). " +
      "The index parameter increments by count for pagination (e.g., 0, 24, 48). " +
      "Useful for understanding user interests and discovering related content creators.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Following"
    },

    callback: async (args: GetFollowingParams): Promise<Ok<CallToolResult>> => {
      const { username, index = 0, count = 24 } = args;

      try {
        console.error(`[get_following] Fetching following for user: ${username} (index=${index}, count=${count})`);

        // Call Tableau Public API with caching
        const data = await cachedGet<unknown[]>(
          `/profile/api/following/${username}`,
          { index, count }
        );

        const followingCount = data?.length || 0;
        console.error(`[get_following] Retrieved ${followingCount} following accounts for ${username}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching following list for user '${username}'`);
      }
    }
  });
}
