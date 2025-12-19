/**
 * TWB XML Parsing Utilities
 *
 * Provides shared helpers for parsing Tableau workbook (.twb) XML files.
 * Used by multiple TWBX analysis tools for consistent parsing behavior.
 */

import { XMLParser } from "fast-xml-parser";

// ============================================
// INTERFACES
// ============================================

/** Workbook metadata from root element */
export interface WorkbookMetadata {
  version: string;
  sourcePlatform: string;
  sourceBuild: string;
  locale: string;
}

/** Parsed data source information */
export interface ParsedDataSource {
  name: string;
  caption: string;
  connectionType: string | null;
  isInline: boolean;
  tables: string[];
  customSqlCount: number;
  joins: JoinInfo[];
  fieldCount: number;
}

/** Join relationship information */
export interface JoinInfo {
  type: string;
  leftTable: string;
  rightTable: string;
}

/** Filter information */
export interface FilterInfo {
  column: string;
  filterClass: string;
  datasource: string;
}

/** Mark encoding information */
export interface EncodingInfo {
  color: string | null;
  size: string | null;
  detail: string[];
  tooltip: string[];
  shape: string | null;
  text: string | null;
}

/** Parsed worksheet information */
export interface ParsedWorksheet {
  name: string;
  dataSources: string[];
  markType: string | null;
  rowFields: string[];
  colFields: string[];
  filters: FilterInfo[];
  encodings: EncodingInfo;
  fieldsUsed: string[];
}

/** Parsed dashboard information */
export interface ParsedDashboard {
  name: string;
  width: number | null;
  height: number | null;
  worksheets: string[];
  textZones: number;
  imageZones: number;
  webZones: number;
  filterZones: number;
}

/** Parsed parameter information */
export interface ParsedParameter {
  name: string;
  caption: string;
  datatype: string;
  domainType: string;
  currentValue: string;
  range: { min: string; max: string; granularity: string } | null;
  allowedValues: string[];
}

/** Calculation with parsed formula */
export interface ParsedCalculation {
  name: string;
  caption: string;
  formula: string;
  datatype: string;
  role: string;
  hidden: boolean;
  datasource: string;
  fieldReferences: string[];
  isLodExpression: boolean;
}

/** LOD expression details */
export interface LodExpression {
  name: string;
  caption: string;
  fullFormula: string;
  lodType: "FIXED" | "INCLUDE" | "EXCLUDE";
  dimensions: string[];
  aggregation: string | null;
  aggregatedExpression: string;
  hasNestedLod: boolean;
  datasource: string;
}

/** Dependency node for calculation graph */
export interface DependencyNode {
  name: string;
  caption: string;
  formula: string;
  dependsOn: {
    calculations: string[];
    sourceFields: string[];
    parameters: string[];
  };
  usedBy: string[];
  depth: number;
  isCircular: boolean;
}

// ============================================
// PARSER CONFIGURATION
// ============================================

/** Standard XML parser options for TWB files */
export const TWB_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,       // Handle <?xml ...?> declarations
  processEntities: false         // Don't process HTML entities (we do it manually)
};

/** Creates configured XMLParser instance */
export function createTwbParser(): XMLParser {
  return new XMLParser(TWB_PARSER_OPTIONS);
}

/** Strip UTF-8 BOM (Byte Order Mark) from string if present */
export function stripBom(content: string): string {
  // UTF-8 BOM is represented as \uFEFF at the start of a string
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/** Result type for parseTwbContent */
export type ParseTwbResult = {
  success: true;
  data: Record<string, unknown>;
} | {
  success: false;
  error: string;
  preview: string;
};

/**
 * Parse TWB XML content with proper preprocessing
 *
 * Handles common issues like UTF-8 BOM and provides enhanced error messages.
 *
 * @param content - Raw file content from fs.readFile
 * @returns Parse result with either data or error details
 */
export function parseTwbContent(content: string): ParseTwbResult {
  try {
    // 1. Strip BOM if present
    const cleaned = stripBom(content);

    // 2. Create parser and parse
    const parser = createTwbParser();
    const parsed = parser.parse(cleaned) as Record<string, unknown>;

    return { success: true, data: parsed };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      preview: content.substring(0, 200).replace(/\n/g, "\\n")
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Decode HTML entities in formula text */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r");
}

/** Extract field references [field] from formula */
export function extractFieldReferences(formula: string): string[] {
  const references: string[] = [];
  const fieldPattern = /\[([^\]]+)\]/g;
  let match;
  while ((match = fieldPattern.exec(formula)) !== null) {
    const ref = match[1];
    // Skip pure Parameters prefix, keep the actual parameter name
    if (ref !== "Parameters" && !references.includes(ref)) {
      references.push(ref);
    }
  }
  return references;
}

/** Parse field reference format [DataSource].[prefix:FieldName:suffix] */
export function parseFieldReference(reference: string): {
  datasource: string | null;
  prefix: string | null;
  fieldName: string;
  suffix: string | null;
} {
  // Remove surrounding brackets if present
  const cleaned = reference.replace(/^\[|\]$/g, "");

  // Pattern: [DataSource].[prefix:FieldName:suffix]
  const dsMatch = cleaned.match(/^\[?([^\]]+)\]?\.\[?([^\]]+)\]?$/);
  if (dsMatch) {
    const [, datasource, fieldPart] = dsMatch;
    const parts = fieldPart.split(":");
    if (parts.length === 3) {
      return {
        datasource,
        prefix: parts[0] || null,
        fieldName: parts[1],
        suffix: parts[2] || null
      };
    }
    return { datasource, prefix: null, fieldName: fieldPart, suffix: null };
  }

  // Simple [FieldName] reference
  return { datasource: null, prefix: null, fieldName: cleaned, suffix: null };
}

/** Extract human-readable field name from Tableau field reference */
export function extractFieldName(reference: string): string {
  const parsed = parseFieldReference(reference);
  return parsed.fieldName;
}

/** Ensure value is an array */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extract mark type from worksheet table element */
export function extractMarkType(table: unknown): string | null {
  if (!table || typeof table !== "object") return null;
  const tableObj = table as Record<string, unknown>;

  // Look in panes/pane/mark
  const panes = tableObj["panes"];
  if (panes && typeof panes === "object") {
    const panesObj = panes as Record<string, unknown>;
    const paneArray = ensureArray(panesObj["pane"]);
    for (const pane of paneArray) {
      if (pane && typeof pane === "object") {
        const paneObj = pane as Record<string, unknown>;
        const mark = paneObj["mark"];
        if (mark && typeof mark === "object") {
          const markClass = (mark as Record<string, unknown>)["@_class"] as string;
          if (markClass) return markClass;
        }
      }
    }
  }

  // Also check style-rule for mark element
  const style = tableObj["style"];
  if (style && typeof style === "object") {
    const styleRules = ensureArray((style as Record<string, unknown>)["style-rule"]);
    for (const rule of styleRules) {
      if (rule && typeof rule === "object") {
        const ruleObj = rule as Record<string, unknown>;
        if (ruleObj["@_element"] === "mark") {
          const format = ruleObj["format"];
          if (format && typeof format === "object") {
            const markType = (format as Record<string, unknown>)["@_attr"];
            if (markType === "mark") {
              return (format as Record<string, unknown>)["@_value"] as string || null;
            }
          }
        }
      }
    }
  }

  return null;
}

// ============================================
// LOD EXPRESSION HELPERS
// ============================================

/** LOD regex pattern - matches {FIXED|INCLUDE|EXCLUDE [dims] : expr} */
export const LOD_PATTERN = /\{(FIXED|INCLUDE|EXCLUDE)\s*([^:]*):([^}]+)\}/gi;

/** Check if formula contains LOD expression */
export function containsLodExpression(formula: string): boolean {
  LOD_PATTERN.lastIndex = 0;
  return LOD_PATTERN.test(formula);
}

/** Parse LOD expressions from a formula */
export function parseLodExpressions(formula: string): Array<{
  lodType: "FIXED" | "INCLUDE" | "EXCLUDE";
  dimensions: string[];
  aggregation: string | null;
  aggregatedExpression: string;
  hasNestedLod: boolean;
}> {
  const results: Array<{
    lodType: "FIXED" | "INCLUDE" | "EXCLUDE";
    dimensions: string[];
    aggregation: string | null;
    aggregatedExpression: string;
    hasNestedLod: boolean;
  }> = [];

  LOD_PATTERN.lastIndex = 0;
  let match;

  while ((match = LOD_PATTERN.exec(formula)) !== null) {
    const [, lodType, dimensionsPart, expression] = match;

    // Parse dimensions (comma-separated field names in brackets)
    const dimensions: string[] = [];
    const dimPattern = /\[([^\]]+)\]/g;
    let dimMatch;
    while ((dimMatch = dimPattern.exec(dimensionsPart)) !== null) {
      dimensions.push(dimMatch[1]);
    }

    // Extract aggregation function
    const aggMatch = expression.trim().match(/^(SUM|AVG|COUNT|COUNTD|MIN|MAX|MEDIAN|ATTR|STDEV|STDEVP|VAR|VARP)\s*\(/i);

    // Check for nested LOD
    const innerLodPattern = /\{(FIXED|INCLUDE|EXCLUDE)/i;
    const hasNestedLod = innerLodPattern.test(expression);

    results.push({
      lodType: lodType.toUpperCase() as "FIXED" | "INCLUDE" | "EXCLUDE",
      dimensions,
      aggregation: aggMatch ? aggMatch[1].toUpperCase() : null,
      aggregatedExpression: expression.trim(),
      hasNestedLod
    });
  }

  return results;
}

/** Generate human-readable explanation for LOD expression */
export function generateLodExplanation(
  lodType: string,
  dimensions: string[],
  aggregation: string | null,
  expression: string
): { brief: string; detailed: string; useCase: string } {
  const dimList = dimensions.length > 0
    ? dimensions.join(", ")
    : "no dimensions";

  const aggExpr = aggregation
    ? `${aggregation}(...)`
    : expression.substring(0, 50) + (expression.length > 50 ? "..." : "");

  switch (lodType.toUpperCase()) {
    case "FIXED":
      if (dimensions.length === 0) {
        return {
          brief: `Table-level calculation: ${aggExpr}`,
          detailed: `This calculates the expression at the entire table level, ignoring ALL dimensions in the view. The result is the same for every row, making it useful for grand totals or percent-of-total calculations.`,
          useCase: "Percent of total, grand totals, table-level benchmarks"
        };
      }

      // Check for customer/user cohort patterns
      const hasCustomerDim = dimensions.some(d =>
        /customer|user|client|account|member/i.test(d)
      );
      if (hasCustomerDim) {
        return {
          brief: `Customer-level ${aggregation || "calculation"} by ${dimList}`,
          detailed: `This calculates the expression at the ${dimList} level, regardless of what other dimensions are shown in the view. Perfect for customer metrics that shouldn't change when drilling down.`,
          useCase: "Customer lifetime value, first purchase date, customer cohort analysis"
        };
      }

      return {
        brief: `Fixed calculation at ${dimList} level`,
        detailed: `This calculates the expression fixed at the level of ${dimList}. The result stays constant for each unique combination of ${dimList}, ignoring other dimensions in the view.`,
        useCase: "Calculations that need to stay at a specific granularity"
      };

    case "INCLUDE":
      return {
        brief: `Include ${dimList} in calculation`,
        detailed: `This calculates the expression INCLUDING ${dimList} in addition to whatever dimensions are in the view. It adds granularity, computing at a more detailed level than the visualization.`,
        useCase: "Getting detailed values before aggregating up (e.g., average of daily totals)"
      };

    case "EXCLUDE":
      return {
        brief: `Exclude ${dimList} from calculation`,
        detailed: `This calculates the expression EXCLUDING ${dimList} from the view's level of detail. It removes granularity, computing at a higher level than the visualization shows.`,
        useCase: "Subtotals, group-level averages, removing a dimension's effect"
      };

    default:
      return {
        brief: `LOD calculation: ${lodType}`,
        detailed: `LOD expression with type ${lodType}`,
        useCase: "Custom level of detail calculation"
      };
  }
}

/** Categorize LOD expression into common patterns */
export function categorizeLodPattern(
  lodType: string,
  dimensions: string[],
  aggregation: string | null
): string {
  const upperType = lodType.toUpperCase();
  const upperAgg = aggregation?.toUpperCase();

  // Table-scoped FIXED (no dimensions)
  if (upperType === "FIXED" && dimensions.length === 0) {
    return "percentOfTotal";
  }

  // Customer cohort patterns
  const hasCustomerDim = dimensions.some(d =>
    /customer|user|client|account|member/i.test(d)
  );
  const hasDateAgg = upperAgg === "MIN" || upperAgg === "MAX";
  if (upperType === "FIXED" && hasCustomerDim && hasDateAgg) {
    return "customerCohort";
  }

  // Running totals (FIXED with SUM and date dimension)
  const hasDateDim = dimensions.some(d =>
    /date|month|year|quarter|week|day/i.test(d)
  );
  if (upperType === "FIXED" && upperAgg === "SUM" && hasDateDim) {
    return "runningTotal";
  }

  return "other";
}

// ============================================
// WORKBOOK PARSING HELPERS
// ============================================

/** Extract workbook metadata from root element */
export function extractWorkbookMetadata(workbook: Record<string, unknown>): WorkbookMetadata {
  return {
    version: (workbook["@_version"] as string) || "unknown",
    sourcePlatform: (workbook["@_source-platform"] as string) || "unknown",
    sourceBuild: (workbook["@_source-build"] as string) || "unknown",
    locale: (workbook["@_locale"] as string) || "unknown"
  };
}

/** Parse shelf content (rows/cols) into readable field names */
export function parseShelfContent(shelfContent: string | undefined): string[] {
  if (!shelfContent || typeof shelfContent !== "string") return [];

  const fields: string[] = [];
  // Match patterns like [DataSource].[prefix:FieldName:suffix]
  const pattern = /\[([^\]]+)\]\.\[([^\]]+)\]/g;
  let match;

  while ((match = pattern.exec(shelfContent)) !== null) {
    const fieldPart = match[2];
    // Extract just the field name from prefix:name:suffix
    const parts = fieldPart.split(":");
    const fieldName = parts.length === 3 ? parts[1] : fieldPart;
    if (!fields.includes(fieldName)) {
      fields.push(fieldName);
    }
  }

  return fields;
}

/** Parse encodings from worksheet view */
export function parseEncodings(encodings: unknown): EncodingInfo {
  const result: EncodingInfo = {
    color: null,
    size: null,
    detail: [],
    tooltip: [],
    shape: null,
    text: null
  };

  if (!encodings || typeof encodings !== "object") return result;
  const enc = encodings as Record<string, unknown>;

  // Color encoding
  const color = enc["color"];
  if (color && typeof color === "object") {
    const colorCol = (color as Record<string, unknown>)["@_column"] as string;
    if (colorCol) {
      result.color = extractFieldName(colorCol);
    }
  }

  // Size encoding
  const size = enc["size"];
  if (size && typeof size === "object") {
    const sizeCol = (size as Record<string, unknown>)["@_column"] as string;
    if (sizeCol) {
      result.size = extractFieldName(sizeCol);
    }
  }

  // Detail (lod) encoding
  const lod = ensureArray(enc["lod"]);
  for (const item of lod) {
    if (item && typeof item === "object") {
      const col = (item as Record<string, unknown>)["@_column"] as string;
      if (col) {
        result.detail.push(extractFieldName(col));
      }
    }
  }

  // Tooltip encoding
  const tooltip = ensureArray(enc["tooltip"]);
  for (const item of tooltip) {
    if (item && typeof item === "object") {
      const col = (item as Record<string, unknown>)["@_column"] as string;
      if (col) {
        result.tooltip.push(extractFieldName(col));
      }
    }
  }

  // Shape encoding
  const shape = enc["shape"];
  if (shape && typeof shape === "object") {
    const shapeCol = (shape as Record<string, unknown>)["@_column"] as string;
    if (shapeCol) {
      result.shape = extractFieldName(shapeCol);
    }
  }

  // Text/label encoding
  const text = enc["text"];
  if (text && typeof text === "object") {
    const textCol = (text as Record<string, unknown>)["@_column"] as string;
    if (textCol) {
      result.text = extractFieldName(textCol);
    }
  }

  return result;
}
