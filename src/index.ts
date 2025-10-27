#!/usr/bin/env node

/**
 * Tableau Public MCP Server - Entry Point
 *
 * This is the main entry point for the Tableau Public MCP server.
 * It creates the server instance and connects it to stdio transport
 * for communication with MCP clients like Claude Desktop.
 *
 * The server provides tools for accessing Tableau Public APIs:
 * - User profiles and metadata
 * - Workbook discovery and details
 * - Social connections (followers, following, favorites)
 * - Content discovery (search, featured content)
 * - Visualization media (images, thumbnails)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

/**
 * Main entry point for the MCP server
 *
 * Performs the following steps:
 * 1. Creates the MCP server with all registered tools
 * 2. Creates a stdio transport for client communication
 * 3. Connects the server to the transport
 * 4. Handles errors and exits gracefully on failure
 */
async function main(): Promise<void> {
  try {
    console.error("[Main] Starting Tableau Public MCP Server...");

    // Create the MCP server with all tools registered
    const server = createServer();
    console.error("[Main] Server created successfully");

    // Create stdio transport for communication
    const transport = new StdioServerTransport();
    console.error("[Main] Transport created");

    // Connect server to transport
    await server.connect(transport);
    console.error("[Main] Tableau Public MCP Server running on stdio");
    console.error("[Main] Ready to accept requests from MCP clients");

  } catch (error) {
    // Log error to stderr (stdout is reserved for MCP protocol)
    console.error("[Main] Failed to start server:", error);

    if (error instanceof Error) {
      console.error("[Main] Error details:", {
        message: error.message,
        stack: error.stack
      });
    }

    // Exit with error code
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions gracefully
 */
process.on("uncaughtException", (error: Error) => {
  console.error("[Main] Uncaught exception:", error);
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason: unknown) => {
  console.error("[Main] Unhandled rejection:", reason);
  process.exit(1);
});

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C)
 */
process.on("SIGINT", () => {
  console.error("[Main] Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

/**
 * Handle graceful shutdown on SIGTERM
 */
process.on("SIGTERM", () => {
  console.error("[Main] Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Start the server
main();
