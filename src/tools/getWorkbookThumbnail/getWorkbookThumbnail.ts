/**
 * Get Workbook Thumbnail Tool
 *
 * Fetches a thumbnail image for a Tableau Public workbook visualization and
 * returns it inline as MCP image content. File output is opt-in via `save_path`.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as path from "path";
import * as fs from "fs/promises";
import { Tool } from "../tool.js";
import { createImageResult, createErrorResult, handleApiError } from "../../utils/errorHandling.js";
import { getConfig } from "../../config.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import {
  fetchImageForResponse,
  InlineImageResult,
  encodeFullResolution,
  formatFromExtension
} from "../../utils/imageProcessing.js";
import { formatFileSize, toLongPath, resolveOutputPath } from "../../utils/fileSystem.js";

/**
 * Parameter schema for getWorkbookThumbnail tool
 */
const paramsSchema = z.object({
  workbookUrl: z.string()
    .min(1, "Workbook URL cannot be empty")
    .describe("Workbook repository URL - the workbookRepoUrl from API responses (e.g., 'SalesForecastDashboard_17646104017530')"),
  viewName: z.string()
    .min(1, "View name cannot be empty")
    .optional()
    .describe("Name of the specific view/sheet. If omitted, auto-resolved from the workbook's default view. When provided, spaces and periods should be removed (e.g., 'Dashboard1')."),
  workbookName: z.string()
    .optional()
    .describe("Canonical workbook name (without numeric suffix). If not provided, will attempt to derive from workbookUrl by removing trailing _digits. Example: For 'olympic_ages_17646104017530', use 'olympic_ages'."),
  useStaticPath: z.coerce.boolean()
    .optional()
    .default(false)
    .describe("Use alternative static image path format (default: false, uses thumb path)"),
  save_path: z.string()
    .optional()
    .describe(
      "Optional file path to also write the thumbnail to (parent directories are created). " +
      "Prefer an ABSOLUTE path — relative paths resolve against TABLEAU_MCP_OUTPUT_DIR (default <home>/tableau-public-mcp), " +
      "never the server's working directory. When omitted, nothing is written to disk."
    )
});

type GetWorkbookThumbnailParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getWorkbookThumbnail tool
 *
 * This tool fetches a thumbnail image of a Tableau Public visualization and
 * returns it inline as MCP image content, so callers receive it directly with
 * no filesystem coordination (works for local, sandboxed, and remote callers).
 *
 * Two source URL formats are available:
 * 1. Thumb path (default): `/thumb/views/{canonicalName}/{viewName}`
 * 2. Static path: `/static/images/{firstTwoLetters}/{canonicalName}/{viewName}/4_3.png`
 *
 * The canonical workbook name is derived by removing numeric suffixes (e.g.,
 * _17646104017530) from the workbookRepoUrl returned by API responses.
 *
 * Important notes:
 * - The viewName is auto-resolved from the workbook's default view if not provided (recommended)
 * - View names frequently differ from workbook names, so auto-resolution is preferred
 * - The workbookName parameter can override automatic derivation
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Recommended: Let viewName be auto-resolved, return inline image
 * { "workbookUrl": "DjokovicNadalrivalry" }
 *
 * // With explicit viewName
 * { "workbookUrl": "olympic_ages_17646104017530", "viewName": "TheAgeofOlympians" }
 * ```
 */
export function getWorkbookThumbnailTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_workbook_thumbnail",
    description: "Fetches a thumbnail-sized preview image of a Tableau Public visualization and returns it INLINE as MCP image content " +
      "(no filesystem coordination required, so it works for local, sandboxed, and remote callers). " +
      "Requires the workbook repository URL. The view name is auto-resolved from the workbook's default view if not explicitly provided — this is the recommended usage, since view names frequently differ from workbook names. " +
      "If workbookName is not provided, the tool automatically removes trailing numeric suffixes (e.g., '_17646104017530') from workbookUrl. " +
      "Supports two source URL formats: thumb path (default) and static path (4_3.png). " +
      "File output is opt-in: pass 'save_path' to also write the thumbnail to disk (nothing is written to temp otherwise).",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get Workbook Thumbnail"
    },

    callback: async (args: GetWorkbookThumbnailParams): Promise<Ok<CallToolResult>> => {
      const { workbookUrl, workbookName, useStaticPath = false, save_path } = args;
      let { viewName } = args;

      try {
        // Auto-resolve viewName if not provided
        if (!viewName) {
          console.error(`[get_workbook_thumbnail] viewName not provided, fetching from workbook details...`);
          const details = await cachedGet(`/profile/api/single_workbook/${workbookUrl}`) as {
            defaultViewName?: string;
            defaultViewRepoUrl?: string;
          };

          // Try defaultViewName first, fall back to defaultViewRepoUrl
          const resolvedViewName = details.defaultViewName || details.defaultViewRepoUrl;

          if (!resolvedViewName) {
            throw new Error(
              `Could not resolve default view for "${workbookUrl}". Provide viewName explicitly.`
            );
          }

          // Strip spaces, periods, and special characters per Tableau thumbnail API requirements
          viewName = resolvedViewName.replace(/[\s.\[\]'&#?!:,()]/g, '');
          console.error(`[get_workbook_thumbnail] Auto-resolved viewName: ${resolvedViewName} → ${viewName}`);
        }

        console.error(`[get_workbook_thumbnail] Generating thumbnail URL for: ${workbookUrl}/${viewName} (static=${useStaticPath})`);

        const config = getConfig();

        // Candidate canonical workbook names. Tableau's thumb endpoint returns
        // HTTP 200 with a tiny grey PLACEHOLDER for names that don't exist, so a
        // 200 alone can't be trusted. Try the full (suffixed) repo URL first, then
        // the suffix-stripped name, and prefer whichever returns a real
        // (non-placeholder) image. An explicit workbookName is respected as-is.
        const PLACEHOLDER_MAX_BYTES = 5000;
        const strippedName = workbookUrl.replace(/_\d{10,}$/, '');
        const candidateNames = workbookName
          ? [workbookName]
          : [...new Set([workbookUrl, strippedName])];

        const buildThumbUrl = (name: string): string =>
          useStaticPath
            ? `${config.baseURL}/static/images/${name.substring(0, 2)}/${name}/${viewName}/4_3.png`
            : `${config.baseURL}/thumb/views/${name}/${viewName}`;

        let chosen: { name: string; url: string; image: InlineImageResult } | undefined;
        let fallback: { name: string; url: string; image: InlineImageResult } | undefined;
        const attempts: Array<{ name: string; url: string; bytes?: number; error?: string }> = [];

        for (const name of candidateNames) {
          const url = buildThumbUrl(name);
          console.error(`[get_workbook_thumbnail] Trying candidate '${name}': ${url}`);
          try {
            const image = await fetchImageForResponse(url, {
              maxWidth: 1600,
              maxHeight: 1600,
              format: "png",
              quality: 90,
              maxInlineBytes: config.maxInlineImageBytes
            });
            attempts.push({ name, url, bytes: image.originalSize });
            if (!fallback) fallback = { name, url, image };
            if (image.originalSize >= PLACEHOLDER_MAX_BYTES) {
              chosen = { name, url, image };
              break; // a real (non-placeholder) image
            }
            console.error(`[get_workbook_thumbnail] Candidate '${name}' looks like a placeholder (${image.originalSize} bytes); trying next.`);
          } catch (fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            attempts.push({ name, url, error: message });
            console.error(`[get_workbook_thumbnail] Candidate '${name}' failed: ${message}`);
          }
        }

        // Every candidate failed outright -> genuinely not found.
        if (!chosen && !fallback) {
          return createErrorResult(
            "Thumbnail not found",
            {
              workbookUrl,
              viewName,
              candidatesTried: attempts,
              suggestion: "Verify the workbookUrl and viewName, or omit viewName to auto-resolve the default view."
            }
          );
        }

        // Fall back to the best (small) image we got, flagging it as a likely placeholder.
        const likelyPlaceholder = !chosen;
        const selected = chosen || fallback!;
        const canonicalName = selected.name;
        const thumbnailUrl = selected.url;
        const image = selected.image;

        // Optionally persist the thumbnail to disk at full resolution, resolving
        // relative paths against the configured base dir (never cwd) and honouring
        // the destination extension's format.
        let savedPath: string | undefined;
        let savedInfo: { dimensions: string; format: string; size: number } | undefined;
        if (save_path) {
          const absSavePath = resolveOutputPath(save_path, config.outputBaseDir);
          try {
            const saveFormat = formatFromExtension(absSavePath, "png");
            const fullRes = await encodeFullResolution(image.originalBuffer, saveFormat, 95);
            await fs.mkdir(path.dirname(absSavePath), { recursive: true });
            await fs.writeFile(absSavePath, fullRes.buffer);
            savedPath = await toLongPath(absSavePath);
            savedInfo = {
              dimensions: `${fullRes.width}x${fullRes.height}`,
              format: fullRes.mimeType,
              size: fullRes.buffer.length
            };
            console.error(`[get_workbook_thumbnail] Wrote thumbnail to: ${savedPath}`);
          } catch (saveError) {
            return createErrorResult(
              "Failed to write thumbnail to save_path",
              {
                save_path,
                resolvedPath: absSavePath,
                error: saveError instanceof Error ? saveError.message : String(saveError),
                suggestion: "Provide an absolute path, or set TABLEAU_MCP_OUTPUT_DIR. Ensure the directory is writable."
              }
            );
          }
        }

        const metadata = {
          success: true,
          workbookUrl,
          canonicalWorkbookName: canonicalName,
          viewName,
          viewNameAutoResolved: !args.viewName,
          pathType: useStaticPath ? "static" : "thumb",
          thumbnailUrl,
          delivery: "inline",
          image: {
            mimeType: image.mimeType,
            dimensions: `${image.inlineWidth}x${image.inlineHeight}`,
            size: image.inlineSize,
            sizeFormatted: formatFileSize(image.inlineSize),
            wasDownscaledForResponseLimit: image.wasDownscaledForLimit
          },
          ...(candidateNames.length > 1 ? { candidatesTried: attempts } : {}),
          ...(savedPath
            ? {
                savedPath,
                savedFullResolution: savedInfo,
                savedNote: `Thumbnail (${savedInfo?.dimensions}, ${savedInfo?.format}) written to save_path.`
              }
            : { savedPath: null, savedNote: "No file written; thumbnail returned inline only." }),
          ...(likelyPlaceholder
            ? { warning: `The returned thumbnail is only ${image.originalSize} bytes and is likely a generic placeholder — the workbook/view may not exist. Try passing an explicit workbookName and/or viewName.` }
            : {}),
          note: canonicalName !== workbookUrl
            ? `Used canonical name '${canonicalName}' (workbookUrl was '${workbookUrl}').`
            : "Using workbookUrl as canonical name."
        };

        console.error(`[get_workbook_thumbnail] Returning thumbnail inline (${formatFileSize(image.inlineSize)})`);

        return createImageResult(image.data, image.mimeType, metadata);

      } catch (error) {
        return handleApiError(error, `fetching thumbnail for workbook '${workbookUrl}/${viewName}'`);
      }
    }
  });
}
