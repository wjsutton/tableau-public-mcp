/**
 * Excel Profiler
 *
 * Extracts sheet names and column names from Excel files.
 */

import * as path from "path";
import * as XLSX from "xlsx";
import { ExcelProfile, ExcelSheet } from "./types.js";

/**
 * Profile an Excel file to extract sheet names and column names
 *
 * @param filePath - Path to the Excel file (.xlsx, .xls)
 * @returns ExcelProfile with sheets and column names, or null if parsing fails
 */
export function profileExcel(filePath: string): ExcelProfile | null {
  try {
    // Read the workbook
    const workbook = XLSX.readFile(filePath, {
      sheetRows: 1 // Only read first row (headers)
    });

    const sheets: ExcelSheet[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];

      // Get the range of the sheet
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

      // Extract column names from the first row
      const columns: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = sheet[cellAddress];

        if (cell && cell.v !== undefined && cell.v !== null) {
          columns.push(String(cell.v));
        } else {
          // Use column letter as fallback for empty headers
          columns.push(`Column_${XLSX.utils.encode_col(col)}`);
        }
      }

      sheets.push({
        name: sheetName,
        columns
      });
    }

    return {
      fileName: path.basename(filePath),
      filePath,
      sheets
    };
  } catch (error) {
    console.error(`[excelProfiler] Failed to profile ${filePath}:`, error);
    return null;
  }
}

/**
 * Profile multiple Excel files
 *
 * @param filePaths - Array of paths to Excel files
 * @returns Array of ExcelProfile objects
 */
export function profileExcelFiles(filePaths: string[]): ExcelProfile[] {
  const profiles: ExcelProfile[] = [];

  for (const filePath of filePaths) {
    const profile = profileExcel(filePath);
    if (profile) {
      profiles.push(profile);
    }
  }

  return profiles;
}
