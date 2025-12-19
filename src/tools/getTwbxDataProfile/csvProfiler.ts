/**
 * CSV Profiler
 *
 * Extracts column names from CSV files by parsing the header row.
 */

import * as fs from "fs/promises";
import * as path from "path";
import Papa from "papaparse";
import { CsvProfile } from "./types.js";

/**
 * Profile a CSV file to extract column names
 *
 * @param filePath - Path to the CSV file
 * @returns CsvProfile with column names, or null if parsing fails
 */
export async function profileCsv(filePath: string): Promise<CsvProfile | null> {
  try {
    // Read only the first few lines to get the header
    const content = await fs.readFile(filePath, "utf-8");

    // Parse just enough to get headers
    const result = Papa.parse(content, {
      header: true,
      preview: 1, // Only parse first data row to get headers
      skipEmptyLines: true
    });

    if (result.errors.length > 0 && result.meta.fields?.length === 0) {
      console.error(`[csvProfiler] Errors parsing ${filePath}:`, result.errors);
      return null;
    }

    const columns = result.meta.fields || [];

    return {
      fileName: path.basename(filePath),
      filePath,
      columns
    };
  } catch (error) {
    console.error(`[csvProfiler] Failed to profile ${filePath}:`, error);
    return null;
  }
}

/**
 * Profile multiple CSV files
 *
 * @param filePaths - Array of paths to CSV files
 * @returns Array of CsvProfile objects
 */
export async function profileCsvFiles(filePaths: string[]): Promise<CsvProfile[]> {
  const profiles: CsvProfile[] = [];

  for (const filePath of filePaths) {
    const profile = await profileCsv(filePath);
    if (profile) {
      profiles.push(profile);
    }
  }

  return profiles;
}
