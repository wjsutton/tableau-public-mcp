/**
 * Get TWBX Data Profile Tool
 *
 * Extracts column names from data files (CSV, Excel, JSON) and
 * provides an inventory of image assets in an extracted TWBX package.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as path from "path";
import * as fs from "fs/promises";
import { Tool } from "../tool.js";
import { createSuccessResult, createErrorResult } from "../../utils/errorHandling.js";
import { fileExists, categorizeFile, listFilesRecursive } from "../../utils/fileSystem.js";
import { profileCsvFiles } from "./csvProfiler.js";
import { profileExcelFiles } from "./excelProfiler.js";
import { profileJsonFiles } from "./jsonProfiler.js";
import { profileImageFiles } from "./imageProfiler.js";
import {
  DataProfileResult,
  DataFileProfiles,
  UnsupportedFile,
  DataProfileSummary
} from "./types.js";

/**
 * Parameter schema for getTwbxDataProfile tool
 */
const paramsSchema = z.object({
  extractionPath: z.string()
    .min(1, "Extraction path cannot be empty")
    .describe("Path to extracted TWBX contents (from unpack_twbx)"),
  includeImageProfile: z.boolean()
    .optional()
    .default(true)
    .describe("Include image asset inventory (default: true)"),
  twbFilePath: z.string()
    .optional()
    .describe("Optional path to .twb file to map data columns to calculated field usage")
});

type GetTwbxDataProfileParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the getTwbxDataProfile tool
 *
 * This tool profiles data files extracted from a TWBX package:
 * 1. Scans the extraction directory for data files
 * 2. Extracts column names from CSV, Excel, and JSON files
 * 3. Notes unsupported formats (.hyper, .tde)
 * 4. Optionally inventories image assets
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 */
export function getTwbxDataProfileTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_twbx_data_profile",
    description: "Extracts column names from data files in an extracted TWBX package. " +
      "Supports CSV, Excel (.xlsx/.xls), and JSON files. " +
      "Notes .hyper and .tde files as unsupported (require Tableau Hyper API). " +
      "Optionally includes an inventory of embedded images with dimensions. " +
      "Use with the extraction path from unpack_twbx tool.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get TWBX Data Profile"
    },

    callback: async (args: GetTwbxDataProfileParams): Promise<Ok<CallToolResult>> => {
      const { extractionPath, includeImageProfile, twbFilePath } = args;

      try {
        console.error(`[get_twbx_data_profile] Starting profile of: ${extractionPath}`);

        // Step 1: Validate extraction path exists
        const exists = await fileExists(extractionPath);
        if (!exists) {
          return createErrorResult(
            "Extraction path not found",
            {
              extractionPath,
              suggestion: "Use unpack_twbx to extract a TWBX file first"
            }
          );
        }

        // Step 2: Check it's a directory
        const stats = await fs.stat(extractionPath);
        if (!stats.isDirectory()) {
          return createErrorResult(
            "Path is not a directory",
            {
              extractionPath,
              suggestion: "Provide the extraction directory path, not a file path"
            }
          );
        }

        // Step 3: List all files in the extraction directory
        const files = await listFilesRecursive(extractionPath);
        const fileList = files.filter(f => !f.isDirectory);

        // Step 4: Categorize files by type
        const csvFiles: string[] = [];
        const excelFiles: string[] = [];
        const jsonFiles: string[] = [];
        const imageFiles: string[] = [];
        const unsupportedFiles: UnsupportedFile[] = [];

        for (const file of fileList) {
          const fullPath = path.join(extractionPath, file.path);
          const ext = path.extname(file.path).toLowerCase();
          const category = categorizeFile(file.path);

          if (ext === ".csv") {
            csvFiles.push(fullPath);
          } else if (ext === ".xlsx" || ext === ".xls") {
            excelFiles.push(fullPath);
          } else if (ext === ".json") {
            jsonFiles.push(fullPath);
          } else if (ext === ".hyper") {
            unsupportedFiles.push({
              fileName: path.basename(file.path),
              filePath: fullPath,
              format: "hyper",
              reason: "Hyper files require the Tableau Hyper API to read. " +
                "These are Tableau's proprietary columnar data format."
            });
          } else if (ext === ".tde") {
            unsupportedFiles.push({
              fileName: path.basename(file.path),
              filePath: fullPath,
              format: "tde",
              reason: "TDE files are Tableau's legacy data extract format. " +
                "They require the Tableau SDK to read."
            });
          } else if (category === "image") {
            imageFiles.push(fullPath);
          }
        }

        console.error(`[get_twbx_data_profile] Found: ${csvFiles.length} CSV, ${excelFiles.length} Excel, ${jsonFiles.length} JSON, ${imageFiles.length} images, ${unsupportedFiles.length} unsupported`);

        // Step 5: Profile data files
        const csvProfiles = await profileCsvFiles(csvFiles);
        const excelProfiles = profileExcelFiles(excelFiles);
        const jsonProfiles = await profileJsonFiles(jsonFiles);

        const dataFiles: DataFileProfiles = {
          csv: csvProfiles,
          excel: excelProfiles,
          json: jsonProfiles,
          unsupported: unsupportedFiles
        };

        // Step 6: Profile images if requested
        let imageInventory = undefined;
        if (includeImageProfile && imageFiles.length > 0) {
          imageInventory = await profileImageFiles(imageFiles);
        }

        // Step 7: Build summary
        const summary: DataProfileSummary = {
          dataFileCount: csvFiles.length + excelFiles.length + jsonFiles.length + unsupportedFiles.length,
          imageFileCount: imageFiles.length,
          csvCount: csvProfiles.length,
          excelCount: excelProfiles.length,
          jsonCount: jsonProfiles.length,
          unsupportedCount: unsupportedFiles.length
        };

        // Step 8: Build result
        const result: DataProfileResult = {
          success: true,
          extractionPath,
          summary,
          dataFiles
        };

        if (imageInventory) {
          result.imageInventory = imageInventory;
        }

        // TODO: Implement field mapping when twbFilePath is provided
        if (twbFilePath) {
          console.error(`[get_twbx_data_profile] Field mapping requested but not yet implemented`);
        }

        console.error(`[get_twbx_data_profile] Profile complete`);

        return createSuccessResult(result);

      } catch (error) {
        return createErrorResult(
          "Unexpected error during profiling",
          {
            extractionPath,
            error: error instanceof Error ? error.message : String(error)
          }
        );
      }
    }
  });
}
