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
 * This is the temp-based fallback location, used when writing beside the
 * input .twbx is not possible (e.g. a read-only source directory).
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
 * Generates the default extraction directory for a .twbx file, placed beside
 * the input file at `<directory of the .twbx>/extracted/<workbook-name>`.
 *
 * Extracting beside the input means any caller that can read the .twbx can
 * also read the extracted .twb/.hyper — unlike the %TEMP% fallback, which is
 * invisible to sandboxed callers (e.g. Cowork). The workbook name is used
 * verbatim (not sanitized) since it already came from a valid filename.
 *
 * @param twbxFilePath - Full path to the input .twbx file
 * @returns Path for the extraction directory beside the input file
 */
export function getDefaultExtractionPath(twbxFilePath: string): string {
  const baseName = path.basename(twbxFilePath, path.extname(twbxFilePath));
  return path.join(path.dirname(twbxFilePath), "extracted", baseName);
}

/**
 * Resolves a path to its canonical long form, avoiding Windows 8.3 short
 * paths (e.g. `WILLSU~1`). Falls back to the input path if it cannot be
 * resolved (e.g. the path does not exist yet).
 *
 * @param targetPath - Path to resolve
 * @returns The long-form (canonical) path, or the original on failure
 */
export async function toLongPath(targetPath: string): Promise<string> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return targetPath;
  }
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
 * Resolves a caller-supplied output path to an absolute path.
 *
 * Absolute paths are returned unchanged. RELATIVE paths are resolved against
 * `baseDir` — deliberately NOT `process.cwd()`, because sandboxed hosts (e.g.
 * Cowork) launch the server with an unrelated cwd (often C:\windows\system32),
 * which would otherwise make relative paths unwritable/unreadable.
 *
 * @param outputPath - Caller-supplied path (absolute or relative)
 * @param baseDir - Base directory for resolving relative paths
 * @returns Absolute path
 */
export function resolveOutputPath(outputPath: string, baseDir: string): string {
  return path.isAbsolute(outputPath) ? outputPath : path.resolve(baseDir, outputPath);
}

/**
 * Generates the download path for a TWBX file inside a caller-supplied
 * directory, resolving relative directories against `baseDir` (never cwd).
 *
 * Downloading beside the caller's outputs — rather than to %TEMP% — means a
 * sandboxed/containerised caller can actually read the resulting file, mirroring
 * the default-beside-input behaviour of unpack_twbx.
 *
 * @param workbookName - Name of the workbook
 * @param baseDir - Base directory used when outputDir is omitted or relative
 * @param outputDir - Optional directory to save into (absolute or relative)
 * @returns Absolute path where the TWBX file should be saved
 */
export function getDownloadPathIn(workbookName: string, baseDir: string, outputDir?: string): string {
  const safeName = workbookName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = outputDir ? resolveOutputPath(outputDir, baseDir) : baseDir;
  return path.join(dir, `${safeName}.twbx`);
}

/**
 * Generates the file path for a saved workbook image
 *
 * @param workbookUrl - The workbook repository URL
 * @param viewName - The view name
 * @param format - Image format (jpeg, webp, png)
 * @returns Path where the image should be saved
 */
export function getImagePath(
  workbookUrl: string,
  viewName: string,
  format: "jpeg" | "webp" | "png"
): string {
  const timestamp = Date.now();
  const safeWorkbook = workbookUrl.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeView = viewName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const extension = format === "jpeg" ? "jpg" : format;

  return path.join(
    TABLEAU_TEMP_DIR,
    "images",
    `${safeWorkbook}_${safeView}_${timestamp}.${extension}`
  );
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
