/**
 * File system utilities for TWBX operations
 *
 * Provides helper functions for managing temporary directories,
 * file extraction, and file categorization for Tableau workbook files.
 */

import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";

/**
 * Base directory for all Tableau Public MCP temporary files
 */
export const TABLEAU_TEMP_DIR = path.join(os.tmpdir(), "tableau-public-mcp");

/**
 * Information about a file in the extracted TWBX
 */
export interface FileInfo {
  /** Relative path from extraction root */
  path: string;
  /** File size in bytes */
  size: number;
  /** File extension (lowercase, with dot) */
  extension: string;
  /** File category based on path and extension */
  category: FileCategory;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * Categories for files found in TWBX archives
 */
export type FileCategory = "twb" | "data" | "image" | "other";

/**
 * Ensures the Tableau temp directory exists
 *
 * @returns Path to the temp directory
 */
export async function ensureTempDir(): Promise<string> {
  await fs.mkdir(TABLEAU_TEMP_DIR, { recursive: true });
  return TABLEAU_TEMP_DIR;
}

/**
 * Ensures a subdirectory exists within the Tableau temp directory
 *
 * @param subdir - Subdirectory name
 * @returns Full path to the subdirectory
 */
export async function ensureTempSubdir(subdir: string): Promise<string> {
  const fullPath = path.join(TABLEAU_TEMP_DIR, subdir);
  await fs.mkdir(fullPath, { recursive: true });
  return fullPath;
}

/**
 * Generates a unique extraction directory path for a workbook
 *
 * @param workbookName - Name of the workbook
 * @returns Path for extraction directory
 */
export function getExtractionPath(workbookName: string): string {
  const timestamp = Date.now();
  const safeName = workbookName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(TABLEAU_TEMP_DIR, "extracted", `${safeName}_${timestamp}`);
}

/**
 * Generates the download path for a TWBX file
 *
 * @param workbookName - Name of the workbook
 * @returns Path where the TWBX file should be saved
 */
export function getDownloadPath(workbookName: string): string {
  const safeName = workbookName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(TABLEAU_TEMP_DIR, "downloads", `${safeName}.twbx`);
}

/**
 * Categorizes a file based on its path and extension
 *
 * Categories:
 * - "twb": Tableau workbook XML files
 * - "data": Data extracts (.hyper, .tde, files in Data/ folder)
 * - "image": Image files (.png, .jpg, etc., or in Image/ folder)
 * - "other": Everything else
 *
 * @param filePath - Path to the file (can be relative or absolute)
 * @returns The file category
 */
export function categorizeFile(filePath: string): FileCategory {
  const ext = path.extname(filePath).toLowerCase();
  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();

  // TWB files (main workbook XML)
  if (ext === ".twb") {
    return "twb";
  }

  // Data files - by extension or folder
  const dataExtensions = [".hyper", ".tde", ".csv", ".xlsx", ".xls", ".json"];
  if (dataExtensions.includes(ext) || normalizedPath.includes("/data/")) {
    return "data";
  }

  // Image files - by extension or folder
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".ico"];
  if (imageExtensions.includes(ext) || normalizedPath.includes("/image/")) {
    return "image";
  }

  return "other";
}

/**
 * Recursively lists all files in a directory with metadata
 *
 * @param dir - Directory to scan
 * @param baseDir - Base directory for relative path calculation (defaults to dir)
 * @returns Array of file information objects
 */
export async function listFilesRecursive(
  dir: string,
  baseDir?: string
): Promise<FileInfo[]> {
  const base = baseDir || dir;
  const results: FileInfo[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(base, fullPath);

      if (entry.isDirectory()) {
        // Add directory entry
        results.push({
          path: relativePath,
          size: 0,
          extension: "",
          category: "other",
          isDirectory: true
        });

        // Recursively process subdirectory
        const subFiles = await listFilesRecursive(fullPath, base);
        results.push(...subFiles);
      } else {
        // Get file stats
        const stats = await fs.stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase();

        results.push({
          path: relativePath,
          size: stats.size,
          extension: ext,
          category: categorizeFile(relativePath),
          isDirectory: false
        });
      }
    }
  } catch (error) {
    // If we can't read a directory, just skip it
    console.error(`[fileSystem] Error reading directory ${dir}:`, error);
  }

  return results;
}

/**
 * Formats a file size in bytes to a human-readable string
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Checks if a file exists and is readable
 *
 * @param filePath - Path to check
 * @returns True if file exists and is readable
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
