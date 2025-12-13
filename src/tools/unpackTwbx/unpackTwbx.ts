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
    .describe("Optional extraction directory. Defaults to a temp subdirectory based on the filename.")
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
      "Returns the extraction path and a categorized inventory of all files. " +
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

        // Step 3: Determine extraction directory
        const baseName = path.basename(filePath, ".twbx");
        const extractionPath = extractTo || getExtractionPath(baseName);

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
