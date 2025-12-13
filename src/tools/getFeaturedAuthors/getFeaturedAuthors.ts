/**
 * Get Featured Authors Tool
 *
 * Retrieves the list of featured authors on Tableau Public.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { createSuccessResult, handleApiError } from "../../utils/errorHandling.js";

/**
 * Parameter schema for getFeaturedAuthors tool
 *
 * This endpoint doesn't take parameters but we include
 * an empty schema for consistency.
 */
const paramsSchema = z.object({});

type GetFeaturedAuthorsParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getFeaturedAuthors tool
 *
 * This tool fetches the list of featured authors on Tableau Public.
 * Featured authors are content creators highlighted by Tableau for
 * their exceptional work and contributions to the community.
 *
 * Returns author information including:
 * - Profile names and usernames
 * - Biographies and descriptions
 * - Specialties and focus areas
 * - Social links
 *
 * Useful for discovering influential creators and quality content sources.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request (no parameters needed)
 * {}
 *
 * // Response includes featured author profiles and biographies
 * ```
 */
export function getFeaturedAuthorsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_featured_authors",
    description: "Retrieves the list of featured authors on Tableau Public. " +
      "Featured authors are content creators highlighted by Tableau for exceptional work. " +
      "Returns profile names, biographies, specialties, and social links. " +
      "No parameters required. " +
      "Useful for discovering influential creators, learning from top community members, " +
      "and finding quality content sources.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Featured Authors"
    },

    callback: async (_args: GetFeaturedAuthorsParams): Promise<Ok<CallToolResult>> => {
      try {
        console.error(`[get_featured_authors] Fetching featured authors`);

        // Call Tableau Public API with caching
        const data = await cachedGet<{ authors?: unknown[] }>("/s/authors/list/feed");

        const authorCount = data?.authors?.length || (Array.isArray(data) ? data.length : 0);
        console.error(`[get_featured_authors] Retrieved ${authorCount} featured authors`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, "fetching featured authors");
      }
    }
  });
}
