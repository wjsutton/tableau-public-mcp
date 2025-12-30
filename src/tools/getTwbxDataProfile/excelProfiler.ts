/**
 * Excel Profiler
 *
 * Extracts sheet names and column names from Excel files.
 */

import * as path from "path";
import ExcelJS from "exceljs";
import { ExcelProfile, ExcelSheet } from "./types.js";

/**
 * Convert column number to Excel column letter
 * 1 -> A, 2 -> B, 26 -> Z, 27 -> AA, etc.
 *
 * @param col - Column number (1-based)
 * @returns Column letter (A, B, AA, etc.)
 */
function getColumnLetter(col: number): string {
  let letter = "";
  while (col > 0) {
    const remainder = (col - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

/**
 * Profile an Excel file to extract sheet names and column names
 *
 * @param filePath - Path to the Excel file (.xlsx, .xls)
 * @returns ExcelProfile with sheets and column names, or null if parsing fails
 */
export async function profileExcel(filePath: string): Promise<ExcelProfile | null> {
  try {
    // Create a new workbook instance
    const workbook = new ExcelJS.Workbook();

    // Read the workbook (async operation)
    await workbook.xlsx.readFile(filePath);

    const sheets: ExcelSheet[] = [];

    // Iterate through all worksheets
    workbook.eachSheet((worksheet) => {
      const columns: string[] = [];

      // Get the first row (headers)
      const firstRow = worksheet.getRow(1);

      // Get column count from worksheet dimensions
      const colCount = worksheet.columnCount || 0;

      // Extract column values from first row
      for (let col = 1; col <= colCount; col++) {
        const cell = firstRow.getCell(col);

        if (cell && cell.value !== null && cell.value !== undefined) {
          // Handle different cell value types
          let cellValue: string;

          if (typeof cell.value === 'object' && cell.value !== null && 'text' in cell.value) {
            // Rich text cell
            cellValue = cell.value.text;
          } else if (typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value) {
            // Formula cell
            cellValue = String(cell.value.result);
          } else {
            // Simple value
            cellValue = String(cell.value);
          }

          columns.push(cellValue);
        } else {
          // Use column letter as fallback for empty headers
          columns.push(`Column_${getColumnLetter(col)}`);
        }
      }

      sheets.push({
        name: worksheet.name,
        columns
      });
    });

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
export async function profileExcelFiles(filePaths: string[]): Promise<ExcelProfile[]> {
  const profiles: ExcelProfile[] = [];

  for (const filePath of filePaths) {
    const profile = await profileExcel(filePath);
    if (profile) {
      profiles.push(profile);
    }
  }

  return profiles;
}
