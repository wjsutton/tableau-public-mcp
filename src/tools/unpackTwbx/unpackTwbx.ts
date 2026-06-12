/**
 * Unpack TWBX Tool
 *
 * Extracts and analyzes the contents of a Tableau .twbx file.
 * Provides a light analysis with file inventory and categorization.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as path from "path";
import AdmZip from "adm-zip";
import { Tool } from "../tool.js";
import { createSuccessResult, createErrorResult } from "../../utils/errorHandling.js";
import {
  fileExists,
  getExtractionPath,
  getDefaultExtractionPath,
  toLongPath,
  formatFileSize,
  categorizeFile,
  FileInfo
} from "../../utils/fileSystem.js";

/**
 * Parameter schema for unpackTwbx tool
 */
const paramsSchema = z.object({
  filePath: z.string()
    .min(1, "File path cannot be empty")
    .describe("Full path to the .twbx file to unpack (from download_workbook_twbx)"),
  extractTo: z.string()
    .optional()
    .describe(
      "Optional extraction directory override. By default the contents are " +
      "extracted beside the input file at <directory of the .twbx>/extracted/<workbook-name>, " +
      "so any caller that can read the .twbx can also read the extracted files. " +
      "Provide this to extract to a specific directory instead."
    )
});

type UnpackTwbxParams = z.infer<typeof paramsSchema>;

/**
 * Summary of files by category
 */
interface CategorySummary {
  twbFiles: string[];
  dataFiles: string[];
  imageFiles: string[];
  otherFiles: string[];
}

/**
 * Factory function to create the unpackTwbx tool
 *
 * This tool extracts a .twbx file and provides a light analysis:
 * 1. Validates the file exists and is a .twbx
 * 2. Extracts contents to a temp directory
 * 3. Lists all files with sizes and categories
 * 4. Identifies the main .twb file
 * 5. Returns extraction path and file inventory
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "filePath": "C:/Users/.../tableau-public-mcp/downloads/MyWorkbook.twbx"
 * }
 *
 * // Response includes extraction path and file inventory
 * ```
 */
export function unpackTwbxTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "unpack_twbx",
    description: "Extracts and analyzes the contents of a Tableau .twbx file. " +
      "A .twbx is a packaged workbook containing the workbook XML (.twb), data extracts, and images. " +
      "By default the contents are extracted beside the input file at " +
      "<directory of the .twbx>/extracted/<workbook-name> so that any caller that can read the " +
      ".twbx can also read the extracted .twb/.hyper (pass extractTo to override). " +
      "If that location is not writable, extraction falls back to a temp directory and the " +
      "response includes a 'warning' field, since temp paths may be unreadable by sandboxed callers. " +
      "Returns the (long-form) extraction path and a categorized inventory of all files. " +
      "Categories: twb (workbook XML), data (extracts like .hyper/.tde), image (embedded images), other. " +
      "Use with files downloaded via download_workbook_twbx tool.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Unpack TWBX"
    },

    callback: async (args: UnpackTwbxParams): Promise<Ok<CallToolResult>> => {
      const { filePath, extractTo } = args;

      try {
        console.error(`[unpack_twbx] Starting extraction of: ${filePath}`);

        // Step 1: Validate file exists
        const exists = await fileExists(filePath);
        if (!exists) {
          return createErrorResult(
            "File not found",
            {
              filePath,
              suggestion: "Use download_workbook_twbx to download a workbook first"
            }
          );
        }

        // Step 2: Validate file extension
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== ".twbx") {
          return createErrorResult(
            "Invalid file type",
            {
              filePath,
              expected: ".twbx",
              received: ext || "(no extension)",
              suggestion: "Provide a path to a .twbx file"
            }
          );
        }

        // Step 3: Determine extraction directory.
        // Default: beside the input file so any caller that can read the .twbx
        // can also read the extracted files. An explicit extractTo overrides this.
        const baseName = path.basename(filePath, ".twbx");
        const usingDefaultLocation = !extractTo;
        let extractionPath = extractTo || getDefaultExtractionPath(filePath);
        let warning: string | undefined;

        console.error(`[unpack_twbx] Extracting to: ${extractionPath}`);

        // Step 4: Extract ZIP contents
        let zip: AdmZip;
        try {
          zip = new AdmZip(filePath);
        } catch (error) {
          return createErrorResult(
            "Failed to read TWBX file",
            {
              filePath,
              error: error instanceof Error ? error.message : String(error),
              suggestion: "The file may be corrupted. Try downloading it again."
            }
          );
        }

        try {
          zip.extractAllTo(extractionPath, true);
        } catch (error) {
          // If we were writing beside the input and that failed (e.g. a
          // read-only source directory), fall back to the temp directory and
          // warn the caller that the result may not be reachable from a sandbox.
          if (usingDefaultLocation) {
            const fallbackPath = getExtractionPath(baseName);
            console.error(
              `[unpack_twbx] Default location not writable (${error instanceof Error ? error.message : String(error)}). ` +
              `Falling back to temp: ${fallbackPath}`
            );
            try {
              zip.extractAllTo(fallbackPath, true);
              extractionPath = fallbackPath;
              warning =
                "Could not write beside the input .twbx (the source directory may be read-only), " +
                "so the contents were extracted to a temporary directory instead. This path may not be " +
                "readable by sandboxed callers (e.g. Cowork). To guarantee the extracted files are " +
                "reachable, re-run with an explicit 'extractTo' pointing to a directory you can read.";
            } catch (fallbackError) {
              return createErrorResult(
                "Failed to extract TWBX file",
                {
                  filePath,
                  extractionPath: fallbackPath,
                  error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                  suggestion: "Check disk space and permissions"
                }
              );
            }
          } else {
            return createErrorResult(
              "Failed to extract TWBX file",
              {
                filePath,
                extractionPath,
                error: error instanceof Error ? error.message : String(error),
                suggestion: "Check disk space and permissions"
              }
            );
          }
        }

        // Normalize to the long-form path so we never return a Windows 8.3
        // short path (e.g. WILLSU~1) that callers may not be able to resolve.
        extractionPath = await toLongPath(extractionPath);

        console.error(`[unpack_twbx] Extraction complete`);

        // Step 5: Get file inventory from ZIP entries
        const entries = zip.getEntries();
        const fileInventory: FileInfo[] = [];
        const categories: CategorySummary = {
          twbFiles: [],
          dataFiles: [],
          imageFiles: [],
          otherFiles: []
        };

        let totalSize = 0;
        let mainTwbFile: string | null = null;

        for (const entry of entries) {
          if (entry.isDirectory) {
            continue; // Skip directories in the inventory
          }

          const entryPath = entry.entryName;
          const entryExt = path.extname(entryPath).toLowerCase();
          const category = categorizeFile(entryPath);
          const size = entry.header.size;

          totalSize += size;

          const fileInfo: FileInfo = {
            path: entryPath,
            size,
            extension: entryExt,
            category,
            isDirectory: false
          };

          fileInventory.push(fileInfo);

          // Categorize for summary
          switch (category) {
            case "twb":
              categories.twbFiles.push(entryPath);
              // The main TWB is typically at the root level
              if (!mainTwbFile || entryPath.split("/").length < (mainTwbFile.split("/").length)) {
                mainTwbFile = entryPath;
              }
              break;
            case "data":
              categories.dataFiles.push(entryPath);
              break;
            case "image":
              categories.imageFiles.push(entryPath);
              break;
            default:
              categories.otherFiles.push(entryPath);
          }
        }

        console.error(`[unpack_twbx] Found ${fileInventory.length} files, total size: ${formatFileSize(totalSize)}`);

        // Step 6: Build result
        const result = {
          success: true,
          sourceFile: filePath,
          extractionPath,
          ...(warning ? { warning } : {}),
          mainTwbFile,
          mainTwbPath: mainTwbFile ? path.join(extractionPath, mainTwbFile) : null,
          summary: {
            totalFiles: fileInventory.length,
            totalSize,
            totalSizeFormatted: formatFileSize(totalSize),
            twbCount: categories.twbFiles.length,
            dataCount: categories.dataFiles.length,
            imageCount: categories.imageFiles.length,
            otherCount: categories.otherFiles.length
          },
          categories,
          fileInventory: fileInventory.map(f => ({
            ...f,
            sizeFormatted: formatFileSize(f.size)
          }))
        };

        console.error(`[unpack_twbx] Extraction complete for ${baseName}`);

        return createSuccessResult(result);

      } catch (error) {
        return createErrorResult(
          "Unexpected error during extraction",
          {
            filePath,
            error: error instanceof Error ? error.message : String(error)
          }
        );
      }
    }
  });
}
