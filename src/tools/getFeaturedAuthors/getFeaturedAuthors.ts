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
 * Supports three community groups with optional pagination
 * for visionaries endpoints.
 */
const paramsSchema = z.object({
  group: z.enum([
    "hall-of-fame-visionaries",
    "tableau-visionaries",
    "tableau-ambassadors-north-america"
  ])
    .optional()
    .describe("Community group to retrieve authors from: " +
      "'hall-of-fame-visionaries' (Hall of Fame Visionaries), " +
      "'tableau-visionaries' (Tableau Visionaries, default), " +
      "'tableau-ambassadors-north-america' (Tableau Ambassadors North America). " +
      "Default: 'tableau-visionaries'"),

  startIndex: z.coerce.number()
    .int()
    .min(0)
    .optional()
    .describe("Starting index for pagination (default: 0). " +
      "Not used for tableau-ambassadors-north-america endpoint."),

  limit: z.preprocess(
    (val) => val === undefined ? undefined : Number(val),
    z.union([z.literal(1), z.literal(12)]).optional()
  )
    .describe("Number of results to return: must be 1 or 12 (default: 12). " +
      "Not used for tableau-ambassadors-north-america endpoint.")
});

type GetFeaturedAuthorsParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getFeaturedAuthors tool
 *
 * This tool fetches authors from Tableau Public community groups.
 * Supports three groups:
 * - Hall of Fame Visionaries (past visionaries)
 * - Tableau Visionaries (current visionaries, default)
 * - Tableau Ambassadors North America
 *
 * Returns author information including:
 * - Profile names and usernames
 * - Biographies and descriptions
 * - Specialties and focus areas
 * - Social links
 *
 * Pagination is supported for visionaries endpoints (max 12 per request).
 * Useful for discovering influential creators and quality content sources.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Get default group (tableau-visionaries)
 * {}
 *
 * // Get hall of fame visionaries with pagination
 * { group: "hall-of-fame-visionaries", startIndex: 0, limit: 12 }
 *
 * // Get ambassadors (no pagination)
 * { group: "tableau-ambassadors-north-america" }
 * ```
 */
export function getFeaturedAuthorsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_featured_authors",
    description: "Retrieves authors from Tableau Public community groups. " +
      "Supports Hall of Fame Visionaries, Tableau Visionaries (default), and " +
      "Tableau Ambassadors North America. Returns profiles, biographies, specialties, " +
      "and social links. Pagination supported for visionaries (max 12 per request). " +
      "Useful for discovering influential creators, learning from top community members, " +
      "and finding quality content sources.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Featured Authors"
    },

    callback: async (args: GetFeaturedAuthorsParams): Promise<Ok<CallToolResult>> => {
      const { group = "tableau-visionaries", startIndex = 0, limit = 12 } = args;

      try {
        console.error(`[get_featured_authors] Fetching authors from ${group}`);

        // Map group to endpoint
        let endpoint: string;
        switch (group) {
          case "hall-of-fame-visionaries":
            endpoint = "/public/apis/bff/discover/v3/authors/hall-of-fame-visionaries";
            break;
          case "tableau-visionaries":
            endpoint = "/public/apis/bff/discover/v3/authors/tableau-visionaries";
            break;
          case "tableau-ambassadors-north-america":
            endpoint = "/public/apis/bff/discover/v1/author_channels/tableau-ambassadors-north-america";
            break;
          default:
            endpoint = "/public/apis/bff/discover/v3/authors/tableau-visionaries";
        }

        // Ambassadors endpoint doesn't support pagination
        const isAmbassadors = group === "tableau-ambassadors-north-america";
        const data = await cachedGet<{ authors?: unknown[] }>(
          endpoint,
          isAmbassadors ? undefined : { startIndex, limit }
        );

        const authorCount = data?.authors?.length || (Array.isArray(data) ? data.length : 0);
        console.error(`[get_featured_authors] Retrieved ${authorCount} authors from ${group}`);

        return createSuccessResult(data);

      } catch (error) {
        return handleApiError(error, `fetching authors from ${group}`);
      }
    }
  });
}
