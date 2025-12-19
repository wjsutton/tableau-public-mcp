/**
 * Get TWBX Calculated Fields Tool
 *
 * Extracts calculated fields, parameters, and field definitions from a Tableau workbook.
 * Analyzes the TWB XML to provide insights into how visualizations are built.
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
  createTwbParser,
  decodeHtmlEntities,
  extractFieldReferences,
  ensureArray
} from "../../utils/twbParser.js";

/**
 * Represents a calculated field extracted from the workbook
 */
interface CalculatedField {
  name: string;
  caption: string;
  formula: string;
  datatype: string;
  role: string;
  type: string;
  hidden: boolean;
  datasource: string;
  dependencies: string[];
}

/**
 * Represents a parameter from the workbook
 */
interface Parameter {
  name: string;
  caption: string;
  datatype: string;
  currentValue: string;
  allowedValues: string[];
}

/**
 * Represents a default/source field
 */
interface SourceField {
  name: string;
  caption: string;
  datatype: string;
  role: string;
  datasource: string;
}

/**
 * Parameter schema for getTwbxCalculatedFields tool
 */
const paramsSchema = z.object({
  twbFilePath: z.string()
    .min(1, "TWB file path cannot be empty")
    .describe("Full path to the .twb file (from unpack_twbx extraction)"),
  includeHidden: z.boolean()
    .optional()
    .default(true)
    .describe("Include hidden calculated fields (default: true)"),
  includeDependencies: z.boolean()
    .optional()
    .default(true)
    .describe("Analyze field dependencies (default: true)")
});

type GetTwbxCalculatedFieldsParams = z.infer<typeof paramsSchema>;

/**
 * Parse columns from a datasource
 */
function parseColumns(
  columns: unknown,
  datasourceName: string,
  includeHidden: boolean
): { calculatedFields: CalculatedField[]; sourceFields: SourceField[] } {
  const calculatedFields: CalculatedField[] = [];
  const sourceFields: SourceField[] = [];

  if (!columns) return { calculatedFields, sourceFields };

  // Ensure columns is an array
  const columnArray = ensureArray(columns);

  for (const col of columnArray) {
    if (!col || typeof col !== "object") continue;
    const colObj = col as Record<string, unknown>;

    const name = (colObj["@_name"] as string) || "";
    const caption = (colObj["@_caption"] as string) || name;
    const datatype = (colObj["@_datatype"] as string) || "unknown";
    const role = (colObj["@_role"] as string) || "unknown";
    const type = (colObj["@_type"] as string) || "unknown";
    const hidden = colObj["@_hidden"] === "true";

    // Skip if hidden and not including hidden
    if (hidden && !includeHidden) continue;

    // Check if it has a calculation
    const calculation = colObj["calculation"] as Record<string, unknown> | undefined;
    if (calculation) {
      const formula = (calculation["@_formula"] as string) || "";
      if (formula) {
        calculatedFields.push({
          name: name.replace(/[\[\]]/g, ""),
          caption,
          formula: decodeHtmlEntities(formula),
          datatype,
          role,
          type,
          hidden,
          datasource: datasourceName,
          dependencies: extractFieldReferences(formula)
        });
      }
    } else {
      // It's a source field
      sourceFields.push({
        name: name.replace(/[\[\]]/g, ""),
        caption,
        datatype,
        role,
        datasource: datasourceName
      });
    }
  }

  return { calculatedFields, sourceFields };
}

/**
 * Parse parameters from Parameters datasource
 */
function parseParameters(columns: unknown): Parameter[] {
  const parameters: Parameter[] = [];

  if (!columns) return parameters;

  const columnArray = ensureArray(columns);

  for (const col of columnArray) {
    if (!col || typeof col !== "object") continue;
    const colObj = col as Record<string, unknown>;

    const name = (colObj["@_name"] as string) || "";
    const caption = (colObj["@_caption"] as string) || name;
    const datatype = (colObj["@_datatype"] as string) || "unknown";
    const value = (colObj["@_value"] as string) || "";

    // Get allowed values from members
    const allowedValues: string[] = [];
    const membersContainer = colObj["members"] as Record<string, unknown> | undefined;
    const members = membersContainer?.["member"];
    if (members) {
      const memberArray = ensureArray(members);
      for (const member of memberArray) {
        if (!member || typeof member !== "object") continue;
        const memberObj = member as Record<string, unknown>;
        const alias = (memberObj["@_alias"] as string) || (memberObj["@_value"] as string) || "";
        if (alias && !allowedValues.includes(alias)) {
          allowedValues.push(alias);
        }
      }
    }

    parameters.push({
      name: name.replace(/[\[\]]/g, ""),
      caption,
      datatype,
      currentValue: decodeHtmlEntities(value),
      allowedValues
    });
  }

  return parameters;
}

/**
 * Factory function to create the getTwbxCalculatedFields tool
 */
export function getTwbxCalculatedFieldsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_twbx_calculated_fields",
    description: "Extracts calculated fields, parameters, and field definitions from a Tableau workbook (.twb file). " +
      "Returns formulas, data types, and field dependencies to understand how visualizations are built. " +
      "Use with the mainTwbPath from unpack_twbx output. " +
      "Ideal for learning Tableau techniques from existing visualizations.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get TWBX Calculated Fields"
    },

    callback: async (args: GetTwbxCalculatedFieldsParams): Promise<Ok<CallToolResult>> => {
      const { twbFilePath, includeHidden = true, includeDependencies = true } = args;

      try {
        console.error(`[get_twbx_calculated_fields] Parsing: ${twbFilePath}`);

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
        const parser = createTwbParser();

        let parsed;
        try {
          parsed = parser.parse(twbContent);
        } catch (parseError) {
          return createErrorResult(
            "Failed to parse TWB XML",
            {
              twbFilePath,
              error: parseError instanceof Error ? parseError.message : String(parseError)
            }
          );
        }

        const workbook = parsed?.workbook;
        if (!workbook) {
          return createErrorResult(
            "Invalid TWB file structure",
            {
              twbFilePath,
              suggestion: "The file may be corrupted or not a valid Tableau workbook"
            }
          );
        }

        // Extract data from datasources
        const allCalculatedFields: CalculatedField[] = [];
        const allSourceFields: SourceField[] = [];
        const allParameters: Parameter[] = [];

        const datasources = workbook.datasources?.datasource;
        if (datasources) {
          const dsArray = ensureArray(datasources);

          for (const ds of dsArray) {
            const dsName = ds["@_name"] || ds["@_caption"] || "Unknown";
            const columns = ds.column;

            if (dsName === "Parameters") {
              // Parse parameters
              const params = parseParameters(columns);
              allParameters.push(...params);
            } else {
              // Parse regular datasource columns
              const { calculatedFields, sourceFields } = parseColumns(
                columns,
                dsName,
                includeHidden
              );
              allCalculatedFields.push(...calculatedFields);
              allSourceFields.push(...sourceFields);
            }
          }
        }

        console.error(`[get_twbx_calculated_fields] Found ${allCalculatedFields.length} calculated fields, ${allParameters.length} parameters, ${allSourceFields.length} source fields`);

        // Build dependency analysis if requested
        let dependencyAnalysis = undefined;
        if (includeDependencies && allCalculatedFields.length > 0) {
          // Find fields that depend on other calculated fields
          const calcFieldNames = new Set(allCalculatedFields.map(f => f.name));
          const fieldDependencies: Record<string, string[]> = {};

          for (const field of allCalculatedFields) {
            const calcDeps = field.dependencies.filter(dep =>
              calcFieldNames.has(dep) || dep.includes(".")
            );
            if (calcDeps.length > 0) {
              fieldDependencies[field.caption || field.name] = calcDeps;
            }
          }

          // Find root fields (calculated fields that only depend on source fields)
          const rootFields = allCalculatedFields.filter(f =>
            f.dependencies.every(dep => !calcFieldNames.has(dep))
          ).map(f => f.caption || f.name);

          // Find leaf fields (calculated fields that nothing depends on)
          const usedFields = new Set(
            allCalculatedFields.flatMap(f => f.dependencies)
          );
          const leafFields = allCalculatedFields.filter(f =>
            !usedFields.has(f.name)
          ).map(f => f.caption || f.name);

          dependencyAnalysis = {
            fieldDependencies,
            rootFields: rootFields.slice(0, 20), // Limit for readability
            leafFields: leafFields.slice(0, 20),
            totalDependencyChains: Object.keys(fieldDependencies).length
          };
        }

        // Build result
        const result = {
          success: true,
          sourceFile: twbFilePath,
          summary: {
            calculatedFieldCount: allCalculatedFields.length,
            parameterCount: allParameters.length,
            sourceFieldCount: allSourceFields.length,
            hiddenFieldCount: allCalculatedFields.filter(f => f.hidden).length
          },
          parameters: allParameters.map(p => ({
            caption: p.caption,
            datatype: p.datatype,
            currentValue: p.currentValue,
            allowedValues: p.allowedValues.length > 0 ? p.allowedValues : undefined
          })),
          calculatedFields: allCalculatedFields.map(f => ({
            caption: f.caption,
            formula: f.formula,
            datatype: f.datatype,
            role: f.role,
            hidden: f.hidden || undefined,
            datasource: f.datasource,
            dependencies: includeDependencies && f.dependencies.length > 0
              ? f.dependencies
              : undefined
          })),
          sourceFields: allSourceFields.slice(0, 50).map(f => ({
            caption: f.caption,
            datatype: f.datatype,
            role: f.role,
            datasource: f.datasource
          })),
          dependencyAnalysis
        };

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
