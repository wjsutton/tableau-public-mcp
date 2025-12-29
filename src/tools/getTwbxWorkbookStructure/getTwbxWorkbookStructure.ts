/**
 * Get TWBX Workbook Structure Tool
 *
 * Extracts complete workbook architecture to help users understand
 * what's in a Tableau workbook and how it's organized.
 */

import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import * as fs from "fs/promises";
import * as path from "path";
import { Tool } from "../tool.js";
import { createSuccessResult, createErrorResult } from "../../utils/errorHandling.js";
import { fileExists } from "../../utils/fileSystem.js";
import {
  parseTwbContent,
  ensureArray,
  extractWorkbookMetadata,
  extractMarkType,
  parseShelfContent,
  parseEncodings,
  containsLodExpression,
  EncodingInfo
} from "../../utils/twbParser.js";

/**
 * Parameter schema for getTwbxWorkbookStructure tool
 */
const paramsSchema = z.object({
  twbFilePath: z.string()
    .min(1, "TWB file path cannot be empty")
    .describe("Full path to the .twb file (from unpack_twbx extraction)"),
  includeFieldDetails: z.coerce.boolean()
    .optional()
    .default(false)
    .describe("Include detailed field lists for worksheets (default: false to keep output concise)")
});

type GetTwbxWorkbookStructureParams = z.infer<typeof paramsSchema>;

/**
 * Data source output structure
 */
interface DataSourceOutput {
  name: string;
  caption: string;
  connectionType: string;
  tables: string[];
  hasCustomSql: boolean;
  joinCount: number;
  fieldCount: number;
}

/**
 * Worksheet output structure
 */
interface WorksheetOutput {
  name: string;
  chartType: string;
  dataSource: string;
  rowShelf: string[];
  colShelf: string[];
  colorBy: string | null;
  sizeBy: string | null;
  detailFields: string[];
  filterCount: number;
  filtersApplied: string[];
}

/**
 * Dashboard output structure
 */
interface DashboardOutput {
  name: string;
  size: { width: number; height: number } | null;
  worksheetsIncluded: string[];
  textElementCount: number;
  imageCount: number;
  filterCount: number;
}

/**
 * Parameter output structure
 */
interface ParameterOutput {
  name: string;
  datatype: string;
  domainType: string;
  currentValue: string;
}

/**
 * Parse data sources from workbook
 */
function parseDataSources(datasources: unknown): {
  dataSources: DataSourceOutput[];
  parameters: ParameterOutput[];
  calculatedFieldCount: number;
  hasLodCalculations: boolean;
} {
  const result: DataSourceOutput[] = [];
  const parameters: ParameterOutput[] = [];
  let calculatedFieldCount = 0;
  let hasLodCalculations = false;

  const dsArray = ensureArray(datasources);

  for (const ds of dsArray) {
    if (!ds || typeof ds !== "object") continue;
    const dsObj = ds as Record<string, unknown>;
    const dsName = (dsObj["@_name"] as string) || "";
    const dsCaption = (dsObj["@_caption"] as string) || dsName;

    // Handle Parameters datasource separately
    if (dsName === "Parameters") {
      const columns = ensureArray(dsObj["column"]);
      for (const col of columns) {
        if (!col || typeof col !== "object") continue;
        const colObj = col as Record<string, unknown>;
        parameters.push({
          name: (colObj["@_caption"] as string) || (colObj["@_name"] as string) || "",
          datatype: (colObj["@_datatype"] as string) || "unknown",
          domainType: (colObj["@_param-domain-type"] as string) || "all",
          currentValue: (colObj["@_value"] as string) || ""
        });
      }
      continue;
    }

    // Parse connection info
    const connection = dsObj["connection"] as Record<string, unknown> | undefined;
    const connectionType = connection?.["@_class"] as string || "unknown";

    // Parse tables
    const tables: string[] = [];
    let customSqlCount = 0;
    let joinCount = 0;

    const parseRelations = (rel: unknown): void => {
      if (!rel || typeof rel !== "object") return;
      const relObj = rel as Record<string, unknown>;
      const relType = relObj["@_type"] as string;
      const relName = relObj["@_name"] as string;

      if (relType === "table" && relName) {
        tables.push(relName);
      } else if (relType === "text") {
        customSqlCount++;
      } else if (relType === "join") {
        joinCount++;
        // Parse nested relations in join
        const nestedRels = ensureArray(relObj["relation"]);
        for (const nested of nestedRels) {
          parseRelations(nested);
        }
      }
    };

    if (connection) {
      const relations = ensureArray(connection["relation"]);
      for (const rel of relations) {
        parseRelations(rel);
      }
    }

    // Count fields and check for LOD calculations
    const columns = ensureArray(dsObj["column"]);
    let fieldCount = 0;

    for (const col of columns) {
      if (!col || typeof col !== "object") continue;
      const colObj = col as Record<string, unknown>;
      fieldCount++;

      const calculation = colObj["calculation"] as Record<string, unknown> | undefined;
      if (calculation) {
        const formula = (calculation["@_formula"] as string) || "";
        if (formula) {
          calculatedFieldCount++;
          if (containsLodExpression(formula)) {
            hasLodCalculations = true;
          }
        }
      }
    }

    result.push({
      name: dsName,
      caption: dsCaption,
      connectionType,
      tables,
      hasCustomSql: customSqlCount > 0,
      joinCount,
      fieldCount
    });
  }

  return { dataSources: result, parameters, calculatedFieldCount, hasLodCalculations };
}

/**
 * Parse worksheets from workbook
 */
function parseWorksheets(worksheets: unknown, includeFieldDetails: boolean): WorksheetOutput[] {
  const result: WorksheetOutput[] = [];
  const wsArray = ensureArray(worksheets);

  for (const ws of wsArray) {
    if (!ws || typeof ws !== "object") continue;
    const wsObj = ws as Record<string, unknown>;
    const wsName = (wsObj["@_name"] as string) || "";

    const table = wsObj["table"] as Record<string, unknown> | undefined;
    const view = table?.["view"] as Record<string, unknown> | undefined;

    // Get mark/chart type
    let chartType = extractMarkType(table) || "Automatic";

    // Get data sources used
    const dataSources: string[] = [];
    if (view) {
      const viewDs = view["datasources"] as Record<string, unknown> | undefined;
      if (viewDs) {
        const dsList = ensureArray(viewDs["datasource"]);
        for (const d of dsList) {
          if (d && typeof d === "object") {
            const name = (d as Record<string, unknown>)["@_name"] as string;
            if (name) dataSources.push(name);
          }
        }
      }
    }

    // Get shelf contents
    const rowShelf = view ? parseShelfContent(view["rows"] as string | undefined) : [];
    const colShelf = view ? parseShelfContent(view["cols"] as string | undefined) : [];

    // Get encodings
    const encodings: EncodingInfo = view
      ? parseEncodings(view["encodings"])
      : { color: null, size: null, detail: [], tooltip: [], shape: null, text: null };

    // Get filters
    const filters: string[] = [];
    if (view) {
      const filterElements = ensureArray(view["filter"]);
      for (const f of filterElements) {
        if (f && typeof f === "object") {
          const col = (f as Record<string, unknown>)["@_column"] as string;
          if (col) {
            // Extract field name from [DataSource].[field] format
            const match = col.match(/\.\[([^\]]+)\]$/);
            filters.push(match ? match[1] : col);
          }
        }
      }
    }

    result.push({
      name: wsName,
      chartType,
      dataSource: dataSources[0] || "unknown",
      rowShelf: includeFieldDetails ? rowShelf : rowShelf.slice(0, 3),
      colShelf: includeFieldDetails ? colShelf : colShelf.slice(0, 3),
      colorBy: encodings.color,
      sizeBy: encodings.size,
      detailFields: includeFieldDetails ? encodings.detail : encodings.detail.slice(0, 3),
      filterCount: filters.length,
      filtersApplied: includeFieldDetails ? filters : filters.slice(0, 5)
    });
  }

  return result;
}

/**
 * Parse dashboards from workbook
 */
function parseDashboards(dashboards: unknown): DashboardOutput[] {
  const result: DashboardOutput[] = [];
  const dbArray = ensureArray(dashboards);

  for (const db of dbArray) {
    if (!db || typeof db !== "object") continue;
    const dbObj = db as Record<string, unknown>;
    const dbName = (dbObj["@_name"] as string) || "";

    // Get size
    const sizeEl = dbObj["size"] as Record<string, unknown> | undefined;
    const size = sizeEl ? {
      width: parseInt(sizeEl["@_maxwidth"] as string || sizeEl["@_width"] as string || "0", 10),
      height: parseInt(sizeEl["@_maxheight"] as string || sizeEl["@_height"] as string || "0", 10)
    } : null;

    // Count zone types
    const worksheets: string[] = [];
    let textCount = 0;
    let imageCount = 0;
    let filterCount = 0;

    const countZones = (zones: unknown): void => {
      const zoneArray = ensureArray(zones);
      for (const zone of zoneArray) {
        if (!zone || typeof zone !== "object") continue;
        const zoneObj = zone as Record<string, unknown>;
        const zoneType = zoneObj["@_type"] as string;
        const zoneName = zoneObj["@_name"] as string;

        if (zoneType === "worksheet" && zoneName) {
          worksheets.push(zoneName);
        } else if (zoneType === "text") {
          textCount++;
        } else if (zoneType === "bitmap" || zoneType === "image") {
          imageCount++;
        } else if (zoneType === "filter" || zoneObj["@_is-filter"] === "true") {
          filterCount++;
        }

        // Recurse into nested zones
        if (zoneObj["zone"]) {
          countZones(zoneObj["zone"]);
        }
      }
    };

    const zones = dbObj["zones"] as Record<string, unknown> | undefined;
    if (zones) {
      countZones(zones["zone"]);
    }

    result.push({
      name: dbName,
      size,
      worksheetsIncluded: worksheets,
      textElementCount: textCount,
      imageCount,
      filterCount
    });
  }

  return result;
}

/**
 * Factory function to create the getTwbxWorkbookStructure tool
 */
export function getTwbxWorkbookStructureTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_twbx_workbook_structure",
    description: "Extracts complete workbook architecture from a Tableau workbook (.twb file). " +
      "Returns an overview of data sources (connections, tables, joins), worksheets (chart types, " +
      "fields on shelves, encodings, filters), dashboards (layout, contained worksheets), and parameters. " +
      "Ideal for understanding 'what's in this workbook' at a glance. " +
      "Use with the mainTwbPath from unpack_twbx output.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get TWBX Workbook Structure"
    },

    callback: async (args: GetTwbxWorkbookStructureParams): Promise<Ok<CallToolResult>> => {
      const { twbFilePath, includeFieldDetails = false } = args;

      try {
        console.error(`[get_twbx_workbook_structure] Parsing: ${twbFilePath}`);

        // Validate file exists
        const exists = await fileExists(twbFilePath);
        if (!exists) {
          return createErrorResult(
            "TWB file not found",
            {
              twbFilePath,
              suggestion: "Use unpack_twbx first to extract the workbook, then use the mainTwbPath from the result"
            }
          );
        }

        // Validate file extension
        const ext = path.extname(twbFilePath).toLowerCase();
        if (ext !== ".twb") {
          return createErrorResult(
            "Invalid file type",
            {
              twbFilePath,
              expected: ".twb",
              received: ext || "(no extension)",
              suggestion: "Provide the path to the .twb file inside the extracted TWBX"
            }
          );
        }

        // Read and parse the TWB file
        const twbContent = await fs.readFile(twbFilePath, "utf-8");
        const parseResult = parseTwbContent(twbContent);

        if (!parseResult.success) {
          return createErrorResult(
            "Failed to parse TWB XML",
            {
              twbFilePath,
              error: parseResult.error,
              filePreview: parseResult.preview
            }
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workbook = (parseResult.data as any)?.workbook;
        if (!workbook) {
          return createErrorResult(
            "Invalid TWB file structure",
            {
              twbFilePath,
              suggestion: "The file may be corrupted or not a valid Tableau workbook"
            }
          );
        }

        // Extract metadata
        const metadata = extractWorkbookMetadata(workbook);

        // Parse data sources and parameters
        const { dataSources, parameters, calculatedFieldCount, hasLodCalculations } =
          parseDataSources(workbook.datasources?.datasource);

        // Parse worksheets
        const worksheets = parseWorksheets(
          workbook.worksheets?.worksheet,
          includeFieldDetails
        );

        // Parse dashboards
        const dashboards = parseDashboards(workbook.dashboards?.dashboard);

        // Calculate insights
        const chartTypeCounts: Record<string, number> = {};
        for (const ws of worksheets) {
          chartTypeCounts[ws.chartType] = (chartTypeCounts[ws.chartType] || 0) + 1;
        }

        const dataSourceUsage: Record<string, number> = {};
        for (const ws of worksheets) {
          dataSourceUsage[ws.dataSource] = (dataSourceUsage[ws.dataSource] || 0) + 1;
        }
        const mostUsedDataSource = Object.entries(dataSourceUsage)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || "none";

        // Build result
        const result = {
          success: true,
          sourceFile: twbFilePath,

          metadata: {
            version: metadata.version,
            platform: metadata.sourcePlatform,
            build: metadata.sourceBuild,
            locale: metadata.locale
          },

          summary: {
            dataSourceCount: dataSources.length,
            worksheetCount: worksheets.length,
            dashboardCount: dashboards.length,
            parameterCount: parameters.length,
            calculatedFieldCount,
            totalFieldCount: dataSources.reduce((sum, ds) => sum + ds.fieldCount, 0)
          },

          dataSources,
          worksheets,
          dashboards,
          parameters,

          insights: {
            mostUsedDataSource,
            chartTypeDistribution: chartTypeCounts,
            hasLodCalculations,
            hasParameters: parameters.length > 0,
            hasMultipleDataSources: dataSources.length > 1
          }
        };

        console.error(`[get_twbx_workbook_structure] Found ${worksheets.length} worksheets, ${dashboards.length} dashboards`);

        return createSuccessResult(result);

      } catch (error) {
        return createErrorResult(
          "Unexpected error parsing TWB file",
          {
            twbFilePath,
            error: error instanceof Error ? error.message : String(error)
          }
        );
      }
    }
  });
}
