/**
 * Type definitions for TWBX Data Profile tool
 */

/**
 * Profile of a CSV file
 */
export interface CsvProfile {
  fileName: string;
  filePath: string;
  columns: string[];
}

/**
 * Profile of an Excel sheet
 */
export interface ExcelSheet {
  name: string;
  columns: string[];
}

/**
 * Profile of an Excel file
 */
export interface ExcelProfile {
  fileName: string;
  filePath: string;
  sheets: ExcelSheet[];
}

/**
 * Profile of a JSON file
 */
export interface JsonProfile {
  fileName: string;
  filePath: string;
  structure: "array" | "object" | "primitive";
  keys: string[];
}

/**
 * Profile of an unsupported data file (.hyper, .tde)
 */
export interface UnsupportedFile {
  fileName: string;
  filePath: string;
  format: "hyper" | "tde" | "unknown";
  reason: string;
}

/**
 * Collection of data file profiles by type
 */
export interface DataFileProfiles {
  csv: CsvProfile[];
  excel: ExcelProfile[];
  json: JsonProfile[];
  unsupported: UnsupportedFile[];
}

/**
 * Profile of an image file
 */
export interface ImageProfile {
  fileName: string;
  filePath: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Image inventory summary
 */
export interface ImageInventory {
  totalCount: number;
  images: ImageProfile[];
}

/**
 * Mapping of a column to its usage in calculated fields
 */
export interface ColumnUsage {
  columnName: string;
  usedInCalculations: string[];
}

/**
 * Summary statistics for the data profile
 */
export interface DataProfileSummary {
  dataFileCount: number;
  imageFileCount: number;
  csvCount: number;
  excelCount: number;
  jsonCount: number;
  unsupportedCount: number;
}

/**
 * Complete data profile result
 */
export interface DataProfileResult {
  success: true;
  extractionPath: string;
  summary: DataProfileSummary;
  dataFiles: DataFileProfiles;
  imageInventory?: ImageInventory;
  columnUsageMap?: ColumnUsage[];
}
