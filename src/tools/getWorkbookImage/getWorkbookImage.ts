/**
 * Get Workbook Image Tool
 *
 * Fetches, resizes, and compresses a Tableau Public visualization image,
 * saving it to the filesystem. Preserves aspect ratio and text detail.
 * Returns the file path for AI analysis.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { Tool } from "../tool.js";
import { createSuccessResult, createErrorResult, handleApiError } from "../../utils/errorHandling.js";
import { fetchResizeAndSave, SavedImage } from "../../utils/imageProcessing.js";
import { ensureTempSubdir, getImagePath, formatFileSize } from "../../utils/fileSystem.js";
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
  maxWidth: z.coerce.number()
    .int()
    .min(100)
    .max(2400)
    .optional()
    .default(768)
    .describe("Maximum width in pixels (default: 768, max: 2400) - maintains aspect ratio"),
  maxHeight: z.coerce.number()
    .int()
    .min(100)
    .max(2400)
    .optional()
    .default(768)
    .describe("Maximum height in pixels (default: 768, max: 2400) - maintains aspect ratio"),
  quality: z.coerce.number()
    .int()
    .min(10)
    .max(100)
    .optional()
    .default(85)
    .describe("JPEG/WebP compression quality 10-100 (default: 85 for text clarity)"),
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
 * within specified dimensions (while maintaining aspect ratio), compresses it,
 * and saves it to the filesystem. The optimized image file path is returned.
 *
 * Default settings (768px max dimension, quality 85, JPEG) produce images typically
 * 150-400KB, preserving text detail important for dashboard analysis.
 *
 * Images are saved to: {temp}/tableau-public-mcp/images/{workbook}_{view}_{timestamp}.{ext}
 * Files are left in the temp directory for OS-managed cleanup.
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
 * // Response includes file path and optimization metadata
 * {
 *   "success": true,
 *   "filePath": "/tmp/tableau-public-mcp/images/SalesForecastDashboard_2_Dashboard1_1234567890.jpg",
 *   "optimization": { ... }
 * }
 * ```
 */
export function getWorkbookImageTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_image",
    description: "Fetches and optimizes a Tableau Public visualization image, saving it to the filesystem. " +
      "Scales down images larger than 768px (maintaining aspect ratio) and compresses to 150-400KB target size. " +
      "Preserves text detail important for dashboard analysis. " +
      "Returns the file path where the optimized image is saved, along with metadata about size and compression. " +
      "Requires the workbook repository URL and view name. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' -> 'Dashboard1').",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Image"
    },

    callback: async (args: GetWorkbookImageParams): Promise<Ok<CallToolResult>> => {
      // Explicitly parse parameters to ensure type coercion
      const parsed = paramsSchema.parse(args);

      const {
        workbookUrl,
        viewName,
        maxWidth = 768,
        maxHeight = 768,
        quality = 85,
        format = "jpeg"
      } = parsed;

      // Ensure numeric types (defensive check)
      const width = Number(maxWidth);
      const height = Number(maxHeight);
      const qual = Number(quality);

      if (isNaN(width) || isNaN(height) || isNaN(qual)) {
        return createErrorResult(
          "Invalid numeric parameters",
          { maxWidth, maxHeight, quality }
        );
      }

      try {
        console.error(`[get_workbook_image] Fetching and optimizing image for: ${workbookUrl}/${viewName}`);
        console.error(`[get_workbook_image] Options: max ${width}x${height} (aspect ratio preserved), quality=${qual}, format=${format}`);

        const config = getConfig();

        // Construct the Tableau Public image URL
        const imageUrl = `${config.baseURL}/views/${workbookUrl}/${viewName}.png?:display_static_image=y&:showVizHome=n`;

        console.error(`[get_workbook_image] Fetching from: ${imageUrl}`);

        // Prepare the output path
        await ensureTempSubdir("images");
        const outputPath = getImagePath(workbookUrl, viewName, format);

        console.error(`[get_workbook_image] Will save to: ${outputPath}`);

        // Fetch, resize, and save the image
        let result: SavedImage;
        try {
          result = await fetchResizeAndSave(imageUrl, outputPath, {
            maxWidth: width,
            maxHeight: height,
            quality: qual,
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
            if (fetchError.message.includes("ENOENT") || fetchError.message.includes("EACCES")) {
              return createErrorResult(
                "Failed to save image file",
                {
                  workbookUrl,
                  viewName,
                  filePath: outputPath,
                  error: fetchError.message,
                  suggestion: "Check filesystem permissions for the temp directory"
                }
              );
            }
          }
          throw fetchError;
        }

        console.error(`[get_workbook_image] Optimized: ${result.originalSize} -> ${result.processedSize} bytes (${result.compressionRatio.toFixed(1)}x compression)`);
        console.error(`[get_workbook_image] Dimensions: ${result.width}x${result.height}`);
        console.error(`[get_workbook_image] Saved to: ${result.filePath}`);

        // Return the file path with metadata (following downloadWorkbookTwbx pattern)
        const response = {
          success: true,
          filePath: result.filePath,
          workbookUrl,
          viewName,
          originalUrl: imageUrl,
          optimization: {
            originalSize: result.originalSize,
            originalSizeFormatted: formatFileSize(result.originalSize),
            processedSize: result.processedSize,
            processedSizeFormatted: formatFileSize(result.processedSize),
            compressionRatio: Math.round(result.compressionRatio * 10) / 10,
            originalDimensions: `${result.originalWidth}x${result.originalHeight}`,
            finalDimensions: `${result.width}x${result.height}`,
            wasResized: result.wasResized,
            format: result.mimeType,
            quality: qual
          },
          savedAt: new Date().toISOString(),
          nextStep: "The optimized image has been saved to the file path. You can now analyze it with vision capabilities."
        };

        return createSuccessResult(response);

      } catch (error) {
        return handleApiError(error, `fetching and optimizing image for '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
