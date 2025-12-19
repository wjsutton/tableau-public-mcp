/**
 * Get TWBX LOD Expressions Tool
 *
 * Extracts and explains Level of Detail (LOD) expressions from a Tableau workbook.
 * Provides human-readable explanations to help users understand these complex calculations.
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
  decodeHtmlEntities,
  parseLodExpressions,
  generateLodExplanation,
  categorizeLodPattern
} from "../../utils/twbParser.js";

/**
 * Parameter schema for getTwbxLodExpressions tool
 */
const paramsSchema = z.object({
  twbFilePath: z.string()
    .min(1, "TWB file path cannot be empty")
    .describe("Full path to the .twb file (from unpack_twbx extraction)"),
  includeUsageContext: z.boolean()
    .optional()
    .default(true)
    .describe("Include information about where each LOD is used (default: true)")
});

type GetTwbxLodExpressionsParams = z.infer<typeof paramsSchema>;

/**
 * LOD expression output structure
 */
interface LodExpressionOutput {
  name: string;
  caption: string;
  fullFormula: string;
  datasource: string;
  hidden: boolean;

  lodDetails: {
    type: "FIXED" | "INCLUDE" | "EXCLUDE";
    dimensions: string[];
    aggregation: string | null;
    aggregatedExpression: string;
  };

  explanation: {
    brief: string;
    detailed: string;
    useCase: string;
  };

  hasNestedLod: boolean;
  nestedLods?: Array<{
    type: string;
    dimensions: string[];
    expression: string;
  }>;

  usageContext?: {
    usedInCalculations: string[];
    isHidden: boolean;
  };
}

/**
 * Pattern categorization results
 */
interface PatternCategories {
  percentOfTotal: string[];
  customerCohort: string[];
  runningTotal: string[];
  other: string[];
}

/**
 * Extract all calculations and find LOD expressions
 */
function extractLodExpressions(
  workbook: Record<string, unknown>,
  includeUsageContext: boolean
): {
  lodExpressions: LodExpressionOutput[];
  allCalculations: Map<string, { formula: string; caption: string }>;
} {
  const lodExpressions: LodExpressionOutput[] = [];
  const allCalculations = new Map<string, { formula: string; caption: string }>();

  const datasourcesContainer = workbook.datasources as Record<string, unknown> | undefined;
  const datasources = ensureArray(datasourcesContainer?.datasource);

  for (const ds of datasources) {
    if (!ds || typeof ds !== "object") continue;
    const dsObj = ds as Record<string, unknown>;
    const dsName = (dsObj["@_name"] as string) || "";

    // Skip Parameters datasource
    if (dsName === "Parameters") continue;

    const columns = ensureArray(dsObj["column"]);

    for (const col of columns) {
      if (!col || typeof col !== "object") continue;
      const colObj = col as Record<string, unknown>;

      const name = ((colObj["@_name"] as string) || "").replace(/[\[\]]/g, "");
      const caption = (colObj["@_caption"] as string) || name;
      const hidden = colObj["@_hidden"] === "true";

      const calculation = colObj["calculation"] as Record<string, unknown> | undefined;
      if (!calculation || !calculation["@_formula"]) continue;

      const formula = decodeHtmlEntities((calculation["@_formula"] as string) || "");

      // Store all calculations for usage context
      allCalculations.set(caption, { formula, caption });

      // Check for LOD expressions
      const lodMatches = parseLodExpressions(formula);

      if (lodMatches.length > 0) {
        for (const match of lodMatches) {
          const explanation = generateLodExplanation(
            match.lodType,
            match.dimensions,
            match.aggregation,
            match.aggregatedExpression
          );

          // Parse nested LODs if present
          let nestedLods: LodExpressionOutput["nestedLods"] = undefined;
          if (match.hasNestedLod) {
            const nestedMatches = parseLodExpressions(match.aggregatedExpression);
            if (nestedMatches.length > 0) {
              nestedLods = nestedMatches.map(n => ({
                type: n.lodType,
                dimensions: n.dimensions,
                expression: n.aggregatedExpression
              }));
            }
          }

          lodExpressions.push({
            name,
            caption,
            fullFormula: formula,
            datasource: dsName,
            hidden,
            lodDetails: {
              type: match.lodType,
              dimensions: match.dimensions,
              aggregation: match.aggregation,
              aggregatedExpression: match.aggregatedExpression
            },
            explanation,
            hasNestedLod: match.hasNestedLod,
            nestedLods,
            usageContext: includeUsageContext ? {
              usedInCalculations: [], // Will be populated later
              isHidden: hidden
            } : undefined
          });
        }
      }
    }
  }

  return { lodExpressions, allCalculations };
}

/**
 * Find where each LOD expression is used
 */
function findUsageContext(
  lodExpressions: LodExpressionOutput[],
  allCalculations: Map<string, { formula: string; caption: string }>
): void {
  for (const lod of lodExpressions) {
    if (!lod.usageContext) continue;

    const usedIn: string[] = [];

    for (const [calcCaption, calc] of allCalculations) {
      // Skip self
      if (calcCaption === lod.caption) continue;

      // Check if this calculation references the LOD field
      if (calc.formula.includes(`[${lod.caption}]`) ||
          calc.formula.includes(`[${lod.name}]`)) {
        usedIn.push(calcCaption);
      }
    }

    lod.usageContext.usedInCalculations = usedIn;
  }
}

/**
 * Categorize LOD expressions into common patterns
 */
function categorizeLodExpressions(lodExpressions: LodExpressionOutput[]): PatternCategories {
  const categories: PatternCategories = {
    percentOfTotal: [],
    customerCohort: [],
    runningTotal: [],
    other: []
  };

  for (const lod of lodExpressions) {
    const category = categorizeLodPattern(
      lod.lodDetails.type,
      lod.lodDetails.dimensions,
      lod.lodDetails.aggregation
    );

    switch (category) {
      case "percentOfTotal":
        categories.percentOfTotal.push(lod.caption);
        break;
      case "customerCohort":
        categories.customerCohort.push(lod.caption);
        break;
      case "runningTotal":
        categories.runningTotal.push(lod.caption);
        break;
      default:
        categories.other.push(lod.caption);
    }
  }

  return categories;
}

/**
 * Generate learning resources about LOD expressions
 */
function generateLearningResources(): {
  introduction: string;
  typeSummary: {
    fixed: string;
    include: string;
    exclude: string;
  };
  tips: string[];
} {
  return {
    introduction: "LOD (Level of Detail) expressions let you compute aggregations at a different " +
      "granularity than the visualization. They're powerful for calculations that need to " +
      "ignore, add, or remove dimensions from the view's level of detail.",

    typeSummary: {
      fixed: "FIXED computes at a specific level regardless of the view. " +
        "Use FIXED when you need values that stay constant (e.g., customer's first purchase date). " +
        "FIXED with no dimensions computes at the table level (grand total).",

      include: "INCLUDE adds dimensions to the view's level of detail, computing at a MORE detailed level. " +
        "Use INCLUDE when you need to aggregate pre-computed detailed values " +
        "(e.g., average of daily totals when viewing by month).",

      exclude: "EXCLUDE removes dimensions from the view's level of detail, computing at a LESS detailed level. " +
        "Use EXCLUDE for subtotals or when you want to ignore certain dimensions " +
        "(e.g., category total while viewing by sub-category)."
    },

    tips: [
      "FIXED LODs are computed before dimension filters (except context filters)",
      "INCLUDE and EXCLUDE LODs are computed after dimension filters",
      "Table-scoped FIXED { : SUM([Sales]) } is great for percent-of-total calculations",
      "Nested LODs are possible but can impact performance - use sparingly",
      "Use FIXED [Customer] : MIN([Order Date]) to find each customer's first purchase"
    ]
  };
}

/**
 * Factory function to create the getTwbxLodExpressions tool
 */
export function getTwbxLodExpressionsTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_twbx_lod_expressions",
    description: "Extracts and explains Level of Detail (LOD) expressions from a Tableau workbook. " +
      "LOD expressions ({FIXED}, {INCLUDE}, {EXCLUDE}) are powerful but complex calculations. " +
      "This tool parses each LOD, provides human-readable explanations of what they do, " +
      "categorizes them by common patterns (percent of total, customer cohort, etc.), " +
      "and includes learning resources. Ideal for understanding and learning from existing LOD calculations. " +
      "Use with the mainTwbPath from unpack_twbx output.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get TWBX LOD Expressions"
    },

    callback: async (args: GetTwbxLodExpressionsParams): Promise<Ok<CallToolResult>> => {
      const { twbFilePath, includeUsageContext = true } = args;

      try {
        console.error(`[get_twbx_lod_expressions] Parsing: ${twbFilePath}`);

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

        // Extract LOD expressions
        const { lodExpressions, allCalculations } = extractLodExpressions(
          workbook,
          includeUsageContext
        );

        // Find usage context
        if (includeUsageContext) {
          findUsageContext(lodExpressions, allCalculations);
        }

        // Handle no LOD expressions found
        if (lodExpressions.length === 0) {
          return createSuccessResult({
            success: true,
            sourceFile: twbFilePath,
            message: "No LOD expressions found in this workbook",
            summary: {
              totalLodExpressions: 0,
              totalCalculations: allCalculations.size
            },
            learningResources: generateLearningResources()
          });
        }

        // Categorize LOD expressions
        const patterns = categorizeLodExpressions(lodExpressions);

        // Count by type
        const byType = {
          fixed: lodExpressions.filter(l => l.lodDetails.type === "FIXED").length,
          include: lodExpressions.filter(l => l.lodDetails.type === "INCLUDE").length,
          exclude: lodExpressions.filter(l => l.lodDetails.type === "EXCLUDE").length
        };

        // Count special cases
        const tableScopedFixed = lodExpressions.filter(
          l => l.lodDetails.type === "FIXED" && l.lodDetails.dimensions.length === 0
        ).length;

        const nestedLodCount = lodExpressions.filter(l => l.hasNestedLod).length;

        // Build result
        const result = {
          success: true,
          sourceFile: twbFilePath,

          summary: {
            totalLodExpressions: lodExpressions.length,
            byType,
            nestedLodCount,
            tableScopedFixedCount: tableScopedFixed,
            hiddenCount: lodExpressions.filter(l => l.hidden).length
          },

          lodExpressions: lodExpressions.map(lod => ({
            caption: lod.caption,
            fullFormula: lod.fullFormula,
            datasource: lod.datasource,
            lodDetails: lod.lodDetails,
            explanation: lod.explanation,
            hasNestedLod: lod.hasNestedLod,
            nestedLods: lod.nestedLods,
            usageContext: lod.usageContext
          })),

          patterns: {
            percentOfTotal: patterns.percentOfTotal.length > 0 ? patterns.percentOfTotal : undefined,
            customerCohort: patterns.customerCohort.length > 0 ? patterns.customerCohort : undefined,
            runningTotal: patterns.runningTotal.length > 0 ? patterns.runningTotal : undefined,
            other: patterns.other.length > 0 ? patterns.other : undefined
          },

          learningResources: generateLearningResources()
        };

        console.error(`[get_twbx_lod_expressions] Found ${lodExpressions.length} LOD expressions`);

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
