/**
 * Download Workbook TWBX Tool
 *
 * Downloads a Tableau Public workbook as a .twbx file for offline analysis.
 * Checks the allowDataAccess flag before attempting download.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as fs from "fs/promises";
import { Tool } from "../tool.js";
import { cachedGet } from "../../utils/cachedApiClient.js";
import { apiClient } from "../../utils/apiClient.js";
import { createSuccessResult, createErrorResult, handleApiError } from "../../utils/errorHandling.js";
import { getConfig } from "../../config.js";
import { ensureTempSubdir, getDownloadPath, formatFileSize } from "../../utils/fileSystem.js";

/**
 * Response shape from the single_workbook API
 */
interface WorkbookDetailsResponse {
  allowDataAccess?: boolean;
  title?: string;
  authorDisplayName?: string;
  viewCount?: number;
  defaultViewRepoUrl?: string;
  [key: string]: unknown;
}

/**
 * Parameter schema for downloadWorkbookTwbx tool
 */
const paramsSchema = z.object({
  workbookName: z.string()
    .min(1, "Workbook name cannot be empty")
    .describe("The workbook name from the Tableau Public URL (e.g., 'RacialBiasinFootballCommentary')")
});

type DownloadWorkbookTwbxParams = z.infer<typeof paramsSchema>;

/**
 * Factory function to create the downloadWorkbookTwbx tool
 *
 * This tool downloads a Tableau Public workbook as a .twbx file:
 * 1. First checks if data access is allowed via the single_workbook API
 * 2. If allowed, downloads the .twbx file from /workbooks/{name}.twb
 * 3. Saves the file to a temporary directory
 * 4. Returns the file path and metadata
 *
 * @param server - The MCP server instance
 * @returns Configured Tool instance
 *
 * @example
 * ```typescript
 * // Request
 * {
 *   "workbookName": "RacialBiasinFootballCommentary"
 * }
 *
 * // Response includes file path and metadata
 * ```
 */
export function downloadWorkbookTwbxTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "download_workbook_twbx",
    description: "Downloads a Tableau Public workbook as a .twbx file for offline analysis. " +
      "First verifies that the workbook allows data access (allowDataAccess flag). " +
      "The .twbx file contains the workbook definition (XML), data extracts, and embedded assets. " +
      "Returns the file path where the .twbx is saved. " +
      "Use the unpack_twbx tool to extract and analyze the contents.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Download Workbook TWBX"
    },

    callback: async (args: DownloadWorkbookTwbxParams): Promise<Ok<CallToolResult>> => {
      const { workbookName } = args;

      try {
        console.error(`[download_workbook_twbx] Starting download for: ${workbookName}`);

        // Step 1: Fetch workbook details to check allowDataAccess
        console.error(`[download_workbook_twbx] Checking data access permission...`);

        let workbookDetails: WorkbookDetailsResponse;
        try {
          workbookDetails = await cachedGet<WorkbookDetailsResponse>(
            `/profile/api/single_workbook/${workbookName}`
          );
        } catch (error) {
          return handleApiError(error, `fetching workbook details for '${workbookName}'`);
        }

        // Step 2: Check if data access is allowed
        if (!workbookDetails.allowDataAccess) {
          console.error(`[download_workbook_twbx] Data access not allowed for: ${workbookName}`);
          return createErrorResult(
            "Data download not allowed for this workbook",
            {
              workbookName,
              allowDataAccess: workbookDetails.allowDataAccess ?? false,
              reason: "The workbook author has disabled data downloads",
              suggestion: "Contact the workbook author or try a different workbook that allows data access"
            }
          );
        }

        console.error(`[download_workbook_twbx] Data access allowed, proceeding with download...`);

        // Step 3: Download the .twbx file
        const config = getConfig();
        const downloadUrl = `${config.baseURL}/workbooks/${workbookName}.twb`;

        console.error(`[download_workbook_twbx] Downloading from: ${downloadUrl}`);

        let twbxBuffer: Buffer;
        try {
          const response = await apiClient.get(downloadUrl, {
            responseType: "arraybuffer",
            timeout: 120000, // 2 minute timeout for large files
            headers: {
              "Accept": "*/*"
            }
          });
          twbxBuffer = Buffer.from(response.data);
        } catch (error) {
          return handleApiError(error, `downloading TWBX file for '${workbookName}'`);
        }

        console.error(`[download_workbook_twbx] Downloaded ${formatFileSize(twbxBuffer.length)}`);

        // Step 4: Save to temp directory
        await ensureTempSubdir("downloads");
        const filePath = getDownloadPath(workbookName);

        try {
          await fs.writeFile(filePath, twbxBuffer);
        } catch (error) {
          return createErrorResult(
            "Failed to save TWBX file",
            {
              workbookName,
              filePath,
              error: error instanceof Error ? error.message : String(error)
            }
          );
        }

        console.error(`[download_workbook_twbx] Saved to: ${filePath}`);

        // Step 5: Return success with metadata
        const result = {
          success: true,
          filePath,
          workbookName,
          fileSize: twbxBuffer.length,
          fileSizeFormatted: formatFileSize(twbxBuffer.length),
          downloadedAt: new Date().toISOString(),
          metadata: {
            title: workbookDetails.title || workbookName,
            authorDisplayName: workbookDetails.authorDisplayName || "Unknown",
            viewCount: workbookDetails.viewCount || 0,
            defaultViewRepoUrl: workbookDetails.defaultViewRepoUrl
          },
          nextStep: "Use the unpack_twbx tool with this filePath to extract and analyze the contents"
        };

        console.error(`[download_workbook_twbx] Download complete for ${workbookName}`);

        return createSuccessResult(result);

      } catch (error) {
        return handleApiError(error, `downloading TWBX for '${workbookName}'`);
      }
    }
  });
}
