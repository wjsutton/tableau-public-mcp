/**
 * Get Workbook Image Tool
 *
 * Fetches, resizes, and compresses a Tableau Public visualization image
 * to fit within MCP token limits. Returns the image as base64 data.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { createImageResult, createErrorResult, handleApiError } from "../../utils/errorHandling.js";
import { fetchAndOptimizeImage, ProcessedImage } from "../../utils/imageProcessing.js";
import { getConfig } from "../../config.js";

/**
 * Parameter schema for getWorkbookImage tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL - the workbookRepoUrl from API responses (e.g., 'SalesForecastDashboard_2')"),
  viewName: z.string()
    .min(1, "View name cannot be empty")
    .describe("Name of the specific view/sheet to capture (spaces and periods removed, e.g., 'Dashboard1')"),
  maxWidth: z.number()
    .int()
    .min(100)
    .max(1200)
    .optional()
    .default(800)
    .describe("Maximum width in pixels (default: 800, max: 1200)"),
  maxHeight: z.number()
    .int()
    .min(100)
    .max(900)
    .optional()
    .default(600)
    .describe("Maximum height in pixels (default: 600, max: 900)"),
  quality: z.number()
    .int()
    .min(10)
    .max(100)
    .optional()
    .default(80)
    .describe("JPEG/WebP compression quality 10-100 (default: 80)"),
  format: z.enum(["jpeg", "webp", "png"])
    .optional()
    .default("jpeg")
    .describe("Output image format (default: 'jpeg' for best compression)")
});

type GetWorkbookImageParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookImage tool
 *
 * This tool fetches a Tableau Public visualization image, resizes it to fit
 * within specified dimensions, and compresses it to reduce file size.
 * The optimized image is returned as base64 data suitable for MCP responses.
 *
 * Default settings (800x600, quality 80, JPEG) produce images typically
 * 40-60KB, well under the MCP 25K token limit (~75KB base64).
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request - fetch optimized image
 * {
 *   "workbookUrl": "SalesForecastDashboard_2",
 *   "viewName": "Dashboard1"
 * }
 *
 * // Response includes base64 image data + metadata
 * ```
 */
export function getWorkbookImageTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_image",
    description: "Fetches and optimizes a Tableau Public visualization image for MCP responses. " +
      "Resizes and compresses the image to fit within MCP token limits (default: 800x600, JPEG quality 80). " +
      "Returns the image as base64 data along with metadata about size and compression. " +
      "Requires the workbook repository URL and view name. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' -> 'Dashboard1').",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Image"
    },

    callback: async (args: GetWorkbookImageParams): Promise<Ok<CallToolResult>> => {
      const {
        workbookUrl,
        viewName,
        maxWidth = 800,
        maxHeight = 600,
        quality = 80,
        format = "jpeg"
      } = args;

      try {
        console.error(`[get_workbook_image] Fetching and optimizing image for: ${workbookUrl}/${viewName}`);
        console.error(`[get_workbook_image] Options: ${maxWidth}x${maxHeight}, quality=${quality}, format=${format}`);

        const config = getConfig();

        // Construct the Tableau Public image URL
        const imageUrl = `${config.baseURL}/views/${workbookUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

        console.error(`[get_workbook_image] Fetching from: ${imageUrl}`);

        // Fetch and optimize the image
        let result: ProcessedImage;
        try {
          result = await fetchAndOptimizeImage(imageUrl, {
            maxWidth,
            maxHeight,
            quality,
            format
          });
        } catch (fetchError) {
          // Handle specific fetch errors
          if (fetchError instanceof Error) {
            if (fetchError.message.includes("404") || fetchError.message.includes("Not Found")) {
              return createErrorResult(
                "Image not found",
                {
                  workbookUrl,
                  viewName,
                  suggestion: "Verify the workbookUrl and viewName are correct. View names should have spaces and periods removed."
                }
              );
            }
            if (fetchError.message.includes("timeout")) {
              return createErrorResult(
                "Image fetch timed out",
                {
                  workbookUrl,
                  viewName,
                  suggestion: "The Tableau Public server may be slow. Try again later."
                }
              );
            }
          }
          throw fetchError;
        }

        console.error(`[get_workbook_image] Optimized: ${result.originalSize} -> ${result.processedSize} bytes (${result.compressionRatio.toFixed(1)}x compression)`);
        console.error(`[get_workbook_image] Dimensions: ${result.width}x${result.height}, Estimated tokens: ${result.estimatedTokens}`);

        // Check if result exceeds MCP limit and warn
        const MCP_TOKEN_LIMIT = 25000;
        const exceedsLimit = result.estimatedTokens > MCP_TOKEN_LIMIT;

        if (exceedsLimit) {
          console.error(`[get_workbook_image] WARNING: Image still exceeds MCP token limit (${result.estimatedTokens} > ${MCP_TOKEN_LIMIT})`);
        }

        // Return the image with metadata
        const metadata = {
          workbookUrl,
          viewName,
          originalUrl: imageUrl,
          optimization: {
            originalSize: result.originalSize,
            processedSize: result.processedSize,
            compressionRatio: Math.round(result.compressionRatio * 10) / 10,
            width: result.width,
            height: result.height,
            format: result.mimeType,
            quality
          },
          tokenInfo: {
            estimatedTokens: result.estimatedTokens,
            mcpLimit: MCP_TOKEN_LIMIT,
            withinLimit: !exceedsLimit
          }
        };

        return createImageResult(result.data, result.mimeType, metadata);

      } catch (error) {
        return handleApiError(error, `fetching and optimizing image for '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
