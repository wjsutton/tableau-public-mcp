/**
 * MCP Server setup and configuration
 *
 * Creates and configures the MCP server instance, registering all
 * available tools from the tool factory registry.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { toolFactories } from "./tools/tools.js";

/**
 * Creates and configures the MCP server instance
 *
 * This function:
 * 1. Initializes the MCP server with metadata
 * 2. Declares tool capabilities
 * 3. Registers all tools from the factory registry
 *
 * @returns Configured Server instance ready to connect to a transport
 *
 * @example
 * ```typescript
 * const server = createServer();
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 * ```
 */
export function createServer(): Server {
  // Create server with metadata
  const server = new Server(
    {
      name: "tableau-public-mcp-server",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Register all tools
  registerTools(server);

  return server;
}

/**
 * Registers all tools with the MCP server
 *
 * Iterates through the tool factory registry, instantiates each tool,
 * and registers request handlers for listing and calling tools.
 *
 * @param server - The MCP server instance to register tools with
 *
 * @throws Will log errors to stderr if tool registration fails
 */
function registerTools(server: Server): void {
  try {
    // Instantiate all tools from their factory functions
    const tools = toolFactories.map(factory => factory(server));
    console.error(`[Server] Instantiated ${tools.length} tools`);

    // Register list tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: "object" as const,
            properties: tool.paramsSchema,
            required: Object.keys(tool.paramsSchema || {})
          }
        }))
      };
    });

    // Register call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const tool = tools.find(t => t.name === toolName);

      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      console.error(`[Server] Calling tool: ${toolName}`);

      const result = await tool.callback(request.params.arguments || {});
      return result.value;
    });

    console.error(`[Server] Successfully registered ${tools.length} tools`);
  } catch (error) {
    console.error("[Server] Failed to register tools:", error);
    throw error;
  }
}
