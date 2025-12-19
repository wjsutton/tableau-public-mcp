/**
 * Base Tool class for MCP server tools
 *
 * Provides the foundation for all Tableau Public MCP tools with
 * type-safe parameter validation using Zod schemas.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ok } from "ts-results-es";
import { z, ZodRawShape, ZodObject } from "zod";

/**
 * Parameters for constructing a Tool instance
 *
 * @template Args - Zod schema shape for tool parameters
 */
export interface ToolParams<Args extends ZodRawShape | undefined> {
  /**
   * MCP server instance
   */
  server: Server;

  /**
   * Unique name for the tool (e.g., "get_user_profile")
   */
  name: string;

  /**
   * Human-readable description of what the tool does
   */
  description: string;

  /**
   * Zod schema shape for validating tool parameters
   */
  paramsSchema: Args;

  /**
   * Optional metadata annotations for the tool
   */
  annotations?: {
    title?: string;
    [key: string]: unknown;
  };

  /**
   * Callback function that implements the tool's logic
   *
   * @param args - Validated parameters matching the schema
   * @returns Promise resolving to a CallToolResult
   */
  callback: (
    args: Args extends ZodRawShape ? z.infer<z.ZodObject<Args>> : never
  ) => Promise<Ok<CallToolResult>>;
}

/**
 * Base class for all MCP tools
 *
 * Encapsulates tool metadata and execution logic with type-safe
 * parameter validation. Each tool follows the factory pattern where
 * a factory function creates and returns a configured Tool instance.
 *
 * @template Args - Zod schema shape for tool parameters
 *
 * @example
 * ```typescript
 * const paramsSchema = z.object({
 *   username: z.string().describe("Tableau Public username")
 * });
 *
 * export function getUserProfileTool(server: Server) {
 *   return new Tool({
 *     server,
 *     name: "get_user_profile",
 *     description: "Get user profile information",
 *     paramsSchema: paramsSchema.shape,
 *     callback: async (args) => {
 *       // Implementation
 *       return createSuccessResult(data);
 *     }
 *   });
 * }
 * ```
 */
export class Tool<Args extends ZodRawShape | undefined> {
  /**
   * MCP server instance this tool is registered with
   */
  public readonly server: Server;

  /**
   * Unique identifier for this tool
   */
  public readonly name: string;

  /**
   * Human-readable description shown in tool listings
   */
  public readonly description: string;

  /**
   * Zod schema for parameter validation
   */
  public readonly paramsSchema: Args;

  /**
   * Optional metadata for the tool
   */
  public readonly annotations?: Record<string, unknown>;

  /**
   * Function that executes the tool's logic
   */
  public readonly callback: (
    args: Args extends ZodRawShape ? z.infer<z.ZodObject<Args>> : never
  ) => Promise<Ok<CallToolResult>>;

  /**
   * Full Zod schema for validating and coercing input parameters.
   * Created from the paramsSchema shape to enable runtime validation.
   */
  private readonly zodSchema: Args extends ZodRawShape ? ZodObject<Args> : null;

  /**
   * Constructs a new Tool instance
   *
   * @param params - Tool configuration parameters
   */
  constructor(params: ToolParams<Args>) {
    this.server = params.server;
    this.name = params.name;
    this.description = params.description;
    this.paramsSchema = params.paramsSchema;
    this.annotations = params.annotations;
    this.callback = params.callback;

    // Create full Zod schema from shape for runtime validation
    this.zodSchema = (params.paramsSchema
      ? z.object(params.paramsSchema as ZodRawShape)
      : null) as Args extends ZodRawShape ? ZodObject<Args> : null;
  }

  /**
   * Parses and validates input arguments using the Zod schema.
   * Performs type coercion (e.g., string "800" -> number 800) when
   * the schema uses z.coerce types.
   *
   * @param args - Raw input arguments from MCP request
   * @returns Validated and coerced arguments
   * @throws ZodError if validation fails
   */
  public parseArgs(args: unknown): Args extends ZodRawShape ? z.infer<ZodObject<Args>> : Record<string, never> {
    if (!this.zodSchema) {
      return {} as Args extends ZodRawShape ? z.infer<ZodObject<Args>> : Record<string, never>;
    }
    return this.zodSchema.parse(args) as Args extends ZodRawShape ? z.infer<ZodObject<Args>> : Record<string, never>;
  }

  /**
   * Executes the tool with the provided arguments
   *
   * The MCP server handles parameter validation using the Zod schema,
   * so this method can safely assume parameters are valid.
   *
   * @param args - Tool arguments (validated by MCP server)
   * @returns Promise resolving to the tool execution result
   */
  async execute(
    args: Args extends ZodRawShape ? z.infer<z.ZodObject<Args>> : never
  ): Promise<Ok<CallToolResult>> {
    return this.callback(args);
  }
}
