/**
 * Get Workbook Image Tool
 *
 * Fetches, resizes, and compresses a Tableau Public visualization image and
 * returns it inline as MCP image content. The image is delivered directly in
 * the tool response so callers in sandboxed/containerised environments do not
 * need to read the host filesystem. File output is opt-in via `save_path`.
 */

import { z, ZodError } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as path from "path";
import * as fs from "fs/promises";
import { Tool } from "../tool.js";
import { createImageResult, createErrorResult, handleApiError } from "../../utils/errorHandling.js";
import {
  fetchImageForResponse,
  InlineImageResult,
  encodeFullResolution,
  formatFromExtension
} from "../../utils/imageProcessing.js";
import { formatFileSize, toLongPath, resolveOutputPath } from "../../utils/fileSystem.js";
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
    .describe("Output image format (default: 'jpeg' for best compression)"),
  save_path: z.string()
    .optional()
    .describe(
      "Optional file path to also write the full-resolution image to (parent directories are created). " +
      "Prefer an ABSOLUTE path — relative paths resolve against TABLEAU_MCP_OUTPUT_DIR (default <home>/tableau-public-mcp), " +
      "never the server's working directory. The file is written at full source resolution in the format implied by its " +
      "extension (.png/.jpg/.webp), independent of the inline copy's optimization. When omitted, nothing is written to disk."
    )
});

type GetWorkbookImageParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookImage tool
 *
 * This tool fetches a Tableau Public visualization image, resizes it to fit
 * within the requested dimensions (maintaining aspect ratio), compresses it,
 * and returns it inline as MCP image content. This works identically for
 * local, sandboxed, and remote callers since no filesystem coordination is
 * required.
 *
 * If the encoded image would exceed the configured inline size limit
 * (MAX_INLINE_IMAGE_BYTES, default ~1 MB), the inline copy is downscaled to
 * fit and the original dimensions are reported in the metadata text block.
 * When `save_path` is provided, the full-resolution image is also written to
 * that path and its long-form location is returned alongside the image.
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Inline only (no disk writes)
 * { "workbookUrl": "SalesForecastDashboard_2", "viewName": "Dashboard1" }
 *
 * // Inline + persist full-resolution file
 * {
 *   "workbookUrl": "SalesForecastDashboard_2",
 *   "viewName": "Dashboard1",
 *   "save_path": "C:/Projects/X/verification/dashboard.png"
 * }
 * ```
 */
export function getWorkbookImageTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_image",
    description: "Fetches and optimizes a Tableau Public visualization image and returns it INLINE as MCP image content " +
      "(no filesystem coordination required, so it works for local, sandboxed, and remote callers). " +
      "Scales down images larger than 768px (maintaining aspect ratio) and preserves text detail important for dashboard analysis. " +
      "If the encoded image would exceed the inline size limit (~1 MB, configurable), the inline copy is downscaled to fit. " +
      "File output is opt-in: pass 'save_path' (preferably an absolute path) to also write the FULL-resolution image to disk in the " +
      "format implied by the extension; nothing is written to temp otherwise. " +
      "Requires the workbook repository URL and view name. " +
      "View names should have spaces and periods removed (e.g., 'Dashboard 1' -> 'Dashboard1').",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Image"
    },

    callback: async (args: GetWorkbookImageParams): Promise<Ok<CallToolResult>> => {
      // Explicitly parse parameters to ensure type coercion, returning a
      // friendly error rather than letting a raw ZodError + stack escape.
      let parsed: GetWorkbookImageParams;
      try {
        parsed = paramsSchema.parse(args);
      } catch (validationError) {
        if (validationError instanceof ZodError) {
          return createErrorResult(
            "Invalid parameters",
            {
              issues: validationError.issues.map(i => ({ path: i.path.join("."), message: i.message })),
              suggestion: "Check parameter ranges (e.g. maxWidth/maxHeight are 100-2400) and types."
            }
          );
        }
        throw validationError;
      }

      const {
        workbookUrl,
        viewName,
        maxWidth = 768,
        maxHeight = 768,
        quality = 85,
        format = "jpeg",
        save_path
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

        // Fetch and prepare the image for an inline response (no disk writes here)
        let result: InlineImageResult;
        try {
          result = await fetchImageForResponse(imageUrl, {
            maxWidth: width,
            maxHeight: height,
            quality: qual,
            format,
            maxInlineBytes: config.maxInlineImageBytes
          });
        } catch (fetchError) {
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

        // Optionally persist the TRUE full-resolution image to disk. Relative
        // paths resolve against the configured output base dir (never cwd), and
        // the bytes are re-encoded to the format implied by the file extension
        // so a ".png" path really contains a PNG.
        let savedPath: string | undefined;
        let savedInfo: { dimensions: string; format: string; size: number } | undefined;
        if (save_path) {
          const absSavePath = resolveOutputPath(save_path, config.outputBaseDir);
          try {
            const saveFormat = formatFromExtension(absSavePath, format);
            const fullRes = await encodeFullResolution(result.originalBuffer, saveFormat, Math.max(qual, 90));
            await fs.mkdir(path.dirname(absSavePath), { recursive: true });
            await fs.writeFile(absSavePath, fullRes.buffer);
            savedPath = await toLongPath(absSavePath);
            savedInfo = {
              dimensions: `${fullRes.width}x${fullRes.height}`,
              format: fullRes.mimeType,
              size: fullRes.buffer.length
            };
            console.error(`[get_workbook_image] Wrote full-resolution (${savedInfo.dimensions}, ${fullRes.mimeType}) to: ${savedPath}`);
          } catch (saveError) {
            return createErrorResult(
              "Failed to write image to save_path",
              {
                save_path,
                resolvedPath: absSavePath,
                error: saveError instanceof Error ? saveError.message : String(saveError),
                suggestion: "Provide an absolute path, or set TABLEAU_MCP_OUTPUT_DIR. Ensure the directory is writable."
              }
            );
          }
        }

        console.error(`[get_workbook_image] Inline: ${result.inlineWidth}x${result.inlineHeight} (${formatFileSize(result.inlineSize)}), downscaledForLimit=${result.wasDownscaledForLimit}`);

        // Build the metadata text block that accompanies the inline image
        const metadata = {
          success: true,
          workbookUrl,
          viewName,
          originalUrl: imageUrl,
          delivery: "inline",
          image: {
            mimeType: result.mimeType,
            inlineDimensions: `${result.inlineWidth}x${result.inlineHeight}`,
            inlineSize: result.inlineSize,
            inlineSizeFormatted: formatFileSize(result.inlineSize),
            wasDownscaledForResponseLimit: result.wasDownscaledForLimit,
            responseLimitBytes: config.maxInlineImageBytes
          },
          source: {
            originalDimensions: `${result.originalWidth}x${result.originalHeight}`,
            originalSize: result.originalSize,
            originalSizeFormatted: formatFileSize(result.originalSize),
            optimizedDimensions: `${result.fullWidth}x${result.fullHeight}`,
            optimizedSize: result.fullSize,
            optimizedSizeFormatted: formatFileSize(result.fullSize),
            wasResized: result.wasResized,
            format: result.mimeType,
            quality: qual
          },
          ...(savedPath
            ? {
                savedPath,
                savedFullResolution: savedInfo,
                savedNote: `Full-resolution image (${savedInfo?.dimensions}, ${savedInfo?.format}) written to save_path; the inline copy above is optimized/downscaled.`
              }
            : { savedPath: null, savedNote: "No file written; image returned inline only." }),
          ...(result.wasDownscaledForLimit
            ? { note: `Inline image downscaled from ${result.fullWidth}x${result.fullHeight} to fit the ${formatFileSize(config.maxInlineImageBytes)} response limit.${savedPath ? " Full resolution saved to save_path." : " Provide save_path for the full-resolution file."}` }
            : {}),
          nextStep: "The image is included inline in this response and can be analyzed directly with vision capabilities."
        };

        return createImageResult(result.data, result.mimeType, metadata);

      } catch (error) {
        return handleApiError(error, `fetching and optimizing image for '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
