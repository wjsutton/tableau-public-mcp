/**
 * Get TWBX Calculation Dependencies Tool
 *
 * Builds a dependency graph showing which calculations depend on which,
 * helping users understand calculation hierarchy and find root/leaf calculations.
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
  extractFieldReferences
} from "../../utils/twbParser.js";

/**
 * Parameter schema for getTwbxCalculationDependencies tool
 */
const paramsSchema = z.object({
  twbFilePath: z.string()
    .min(1, "TWB file path cannot be empty")
    .describe("Full path to the .twb file (from unpack_twbx extraction)"),
  includeSourceFields: z.boolean()
    .optional()
    .default(false)
    .describe("Include source/raw fields as roots in the dependency tree (default: false)")
});

type GetTwbxCalculationDependenciesParams = z.infer<typeof paramsSchema>;

/**
 * Internal calculation node for building dependency graph
 */
interface CalcNode {
  name: string;
  caption: string;
  formula: string;
  datasource: string;
  allReferences: string[];
  dependsOnCalcs: string[];
  dependsOnSource: string[];
  dependsOnParams: string[];
  usedBy: string[];
  depth: number;
  isCircular: boolean;
}

/**
 * Output structure for each calculation
 */
interface CalculationOutput {
  name: string;
  caption: string;
  formula: string;
  datasource: string;
  depth: number;
  dependsOn: {
    calculations: string[];
    sourceFields: string[];
    parameters: string[];
  };
  usedBy: string[];
  isRoot: boolean;
  isLeaf: boolean;
  isCircular: boolean;
}

/**
 * Circular dependency info
 */
interface CircularDependency {
  cycle: string[];
  explanation: string;
}

/**
 * Extract all calculations and parameters from workbook
 */
function extractCalculations(workbook: Record<string, unknown>): {
  calculations: Map<string, CalcNode>;
  parameters: Set<string>;
  sourceFields: Set<string>;
} {
  const calculations = new Map<string, CalcNode>();
  const parameters = new Set<string>();
  const sourceFields = new Set<string>();

  const datasourcesContainer = workbook.datasources as Record<string, unknown> | undefined;
  const datasources = ensureArray(datasourcesContainer?.datasource);

  for (const ds of datasources) {
    if (!ds || typeof ds !== "object") continue;
    const dsObj = ds as Record<string, unknown>;
    const dsName = (dsObj["@_name"] as string) || "";
    const columns = ensureArray(dsObj["column"]);

    // Handle Parameters datasource
    if (dsName === "Parameters") {
      for (const col of columns) {
        if (!col || typeof col !== "object") continue;
        const colObj = col as Record<string, unknown>;
        const paramName = (colObj["@_caption"] as string) || (colObj["@_name"] as string) || "";
        if (paramName) {
          parameters.add(paramName);
          // Also add the internal name format
          const internalName = (colObj["@_name"] as string) || "";
          if (internalName) {
            parameters.add(internalName.replace(/[\[\]]/g, ""));
          }
        }
      }
      continue;
    }

    // Process regular datasource columns
    for (const col of columns) {
      if (!col || typeof col !== "object") continue;
      const colObj = col as Record<string, unknown>;

      const name = ((colObj["@_name"] as string) || "").replace(/[\[\]]/g, "");
      const caption = (colObj["@_caption"] as string) || name;

      const calculation = colObj["calculation"] as Record<string, unknown> | undefined;

      if (calculation && calculation["@_formula"]) {
        // It's a calculated field
        const formula = decodeHtmlEntities((calculation["@_formula"] as string) || "");
        const allReferences = extractFieldReferences(formula);

        calculations.set(caption, {
          name,
          caption,
          formula,
          datasource: dsName,
          allReferences,
          dependsOnCalcs: [],
          dependsOnSource: [],
          dependsOnParams: [],
          usedBy: [],
          depth: -1,
          isCircular: false
        });
      } else {
        // It's a source field
        sourceFields.add(caption);
        sourceFields.add(name);
      }
    }
  }

  return { calculations, parameters, sourceFields };
}

/**
 * Resolve dependencies - classify each reference as calc, param, or source
 */
function resolveDependencies(
  calculations: Map<string, CalcNode>,
  parameters: Set<string>,
  _sourceFields: Set<string>
): void {
  const calcNames = new Set<string>();
  for (const [caption, node] of calculations) {
    calcNames.add(caption);
    calcNames.add(node.name);
  }

  for (const [, node] of calculations) {
    for (const ref of node.allReferences) {
      // Check if it's a parameter
      if (parameters.has(ref)) {
        if (!node.dependsOnParams.includes(ref)) {
          node.dependsOnParams.push(ref);
        }
        continue;
      }

      // Check if it's another calculation
      let isCalc = false;
      for (const [caption, calcNode] of calculations) {
        if (ref === caption || ref === calcNode.name) {
          if (!node.dependsOnCalcs.includes(caption)) {
            node.dependsOnCalcs.push(caption);
          }
          isCalc = true;
          break;
        }
      }

      if (!isCalc) {
        // It's a source field
        if (!node.dependsOnSource.includes(ref)) {
          node.dependsOnSource.push(ref);
        }
      }
    }
  }
}

/**
 * Build reverse dependencies (usedBy)
 */
function buildReverseDependencies(calculations: Map<string, CalcNode>): void {
  for (const [caption, node] of calculations) {
    for (const depCaption of node.dependsOnCalcs) {
      const depNode = calculations.get(depCaption);
      if (depNode && !depNode.usedBy.includes(caption)) {
        depNode.usedBy.push(caption);
      }
    }
  }
}

/**
 * Calculate depths using modified DFS with cycle detection
 */
function calculateDepths(calculations: Map<string, CalcNode>): CircularDependency[] {
  const circularDependencies: CircularDependency[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(caption: string, path: string[]): number {
    // Cycle detection
    if (inStack.has(caption)) {
      const cycleStart = path.indexOf(caption);
      const cycle = [...path.slice(cycleStart), caption];

      // Mark all nodes in cycle as circular
      for (const name of cycle) {
        const node = calculations.get(name);
        if (node) node.isCircular = true;
      }

      circularDependencies.push({
        cycle,
        explanation: `Circular dependency detected: ${cycle.join(" -> ")}`
      });

      return 0; // Return 0 depth for circular refs to avoid infinite loop
    }

    if (visited.has(caption)) {
      const node = calculations.get(caption);
      return node?.depth ?? 0;
    }

    const node = calculations.get(caption);
    if (!node) return 0;

    inStack.add(caption);
    let maxChildDepth = -1;

    for (const dep of node.dependsOnCalcs) {
      const childDepth = visit(dep, [...path, caption]);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    inStack.delete(caption);
    visited.add(caption);

    node.depth = maxChildDepth + 1;
    return node.depth;
  }

  // Visit all calculations
  for (const caption of calculations.keys()) {
    if (!visited.has(caption)) {
      visit(caption, []);
    }
  }

  return circularDependencies;
}

/**
 * Generate ASCII tree visualization
 */
function generateDependencyTree(calculations: Map<string, CalcNode>): string {
  const lines: string[] = [];

  // Find leaf calculations (nothing depends on them) - start from these
  const leaves = Array.from(calculations.values())
    .filter(node => node.usedBy.length === 0 && !node.isCircular)
    .sort((a, b) => b.depth - a.depth);

  if (leaves.length === 0) {
    return "No leaf calculations found (possible circular dependencies)";
  }

  const printed = new Set<string>();

  function printNode(caption: string, indent: string, isLast: boolean, visited: Set<string>): void {
    if (visited.has(caption)) {
      lines.push(`${indent}${isLast ? "└── " : "├── "}${caption} (circular ref)`);
      return;
    }

    const node = calculations.get(caption);
    if (!node) return;

    const prefix = isLast ? "└── " : "├── ";
    const depthLabel = node.depth >= 0 ? ` [depth: ${node.depth}]` : "";
    lines.push(`${indent}${prefix}${caption}${depthLabel}`);

    printed.add(caption);
    visited.add(caption);

    const childIndent = indent + (isLast ? "    " : "│   ");
    const deps = node.dependsOnCalcs;

    for (let i = 0; i < deps.length; i++) {
      printNode(deps[i], childIndent, i === deps.length - 1, new Set(visited));
    }

    // Show source fields at the bottom
    if (node.dependsOnSource.length > 0) {
      const sourceLabel = node.dependsOnSource.slice(0, 3).join(", ");
      const suffix = node.dependsOnSource.length > 3 ? ` (+${node.dependsOnSource.length - 3} more)` : "";
      lines.push(`${childIndent}└── [source: ${sourceLabel}${suffix}]`);
    }
  }

  // Print top 10 leaf calculations as trees
  for (let i = 0; i < Math.min(leaves.length, 10); i++) {
    const leaf = leaves[i];
    if (!printed.has(leaf.caption)) {
      lines.push(`\n${leaf.caption} (leaf calculation)`);
      const deps = leaf.dependsOnCalcs;
      for (let j = 0; j < deps.length; j++) {
        printNode(deps[j], "", j === deps.length - 1, new Set([leaf.caption]));
      }
      if (leaf.dependsOnSource.length > 0) {
        const sourceLabel = leaf.dependsOnSource.slice(0, 3).join(", ");
        lines.push(`└── [source: ${sourceLabel}]`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Factory function to create the getTwbxCalculationDependencies tool
 */
export function getTwbxCalculationDependenciesTool(server: Server): Tool<typeof paramsSchema.shape> {
  return new Tool({
    server,
    name: "get_twbx_calculation_dependencies",
    description: "Builds a dependency graph showing which calculations depend on which in a Tableau workbook. " +
      "Shows calculation hierarchy with depth levels, identifies root calculations (depend only on source fields), " +
      "leaf calculations (nothing depends on them), and detects circular dependencies. " +
      "Includes an ASCII tree visualization. Ideal for understanding complex calculation chains. " +
      "Use with the mainTwbPath from unpack_twbx output.",
    paramsSchema: paramsSchema.shape,
    annotations: {
      title: "Get TWBX Calculation Dependencies"
    },

    callback: async (args: GetTwbxCalculationDependenciesParams): Promise<Ok<CallToolResult>> => {
      const { twbFilePath, includeSourceFields = false } = args;

      try {
        console.error(`[get_twbx_calculation_dependencies] Parsing: ${twbFilePath}`);

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

        // Extract calculations and metadata
        const { calculations, parameters, sourceFields } = extractCalculations(workbook);

        if (calculations.size === 0) {
          return createSuccessResult({
            success: true,
            sourceFile: twbFilePath,
            message: "No calculated fields found in this workbook",
            summary: {
              totalCalculations: 0,
              parameterCount: parameters.size,
              sourceFieldCount: sourceFields.size
            }
          });
        }

        // Resolve dependencies
        resolveDependencies(calculations, parameters, sourceFields);

        // Build reverse dependencies
        buildReverseDependencies(calculations);

        // Calculate depths and detect cycles
        const circularDependencies = calculateDepths(calculations);

        // Group by depth level
        const depthLevels: Record<string, CalculationOutput[]> = {};
        let maxDepth = 0;

        const calculationOutputs: CalculationOutput[] = [];

        for (const [caption, node] of calculations) {
          const output: CalculationOutput = {
            name: node.name,
            caption,
            formula: node.formula,
            datasource: node.datasource,
            depth: node.depth,
            dependsOn: {
              calculations: node.dependsOnCalcs,
              sourceFields: includeSourceFields ? node.dependsOnSource : node.dependsOnSource.slice(0, 5),
              parameters: node.dependsOnParams
            },
            usedBy: node.usedBy,
            isRoot: node.dependsOnCalcs.length === 0,
            isLeaf: node.usedBy.length === 0,
            isCircular: node.isCircular
          };

          calculationOutputs.push(output);

          // Group by depth
          const levelKey = node.isCircular ? "circular" : `level${node.depth}`;
          if (!depthLevels[levelKey]) {
            depthLevels[levelKey] = [];
          }
          depthLevels[levelKey].push(output);

          if (!node.isCircular && node.depth > maxDepth) {
            maxDepth = node.depth;
          }
        }

        // Sort calculations by depth
        calculationOutputs.sort((a, b) => a.depth - b.depth);

        // Count roots, leaves, intermediates
        const rootCount = calculationOutputs.filter(c => c.isRoot && !c.isCircular).length;
        const leafCount = calculationOutputs.filter(c => c.isLeaf && !c.isCircular).length;
        const intermediateCount = calculationOutputs.filter(c => !c.isRoot && !c.isLeaf && !c.isCircular).length;

        // Generate tree visualization
        const dependencyTree = generateDependencyTree(calculations);

        // Build result
        const result = {
          success: true,
          sourceFile: twbFilePath,

          summary: {
            totalCalculations: calculations.size,
            maxDependencyDepth: maxDepth,
            rootCalculations: rootCount,
            leafCalculations: leafCount,
            intermediateCalculations: intermediateCount,
            circularDependencies: circularDependencies.length,
            parameterCount: parameters.size
          },

          depthLevels: Object.fromEntries(
            Object.entries(depthLevels).map(([key, calcs]) => [
              key,
              calcs.map(c => ({
                caption: c.caption,
                formula: c.formula.substring(0, 100) + (c.formula.length > 100 ? "..." : ""),
                usedBy: c.usedBy.slice(0, 5)
              }))
            ])
          ),

          calculations: calculationOutputs.slice(0, 50), // Limit for readability

          circularDependencies: circularDependencies.length > 0 ? circularDependencies : undefined,

          dependencyTree: {
            text: dependencyTree
          }
        };

        console.error(`[get_twbx_calculation_dependencies] Found ${calculations.size} calculations, max depth: ${maxDepth}`);

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
