/**
 * Tool factory registry
 *
 * Central registry of all tool factories. Import and add new tool
 * factory functions here to make them available to the MCP server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Tool } from "./tool.js";

// User Profile Tools
import { getUserProfileTool } from "./getUserProfile/getUserProfile.js";
import { getUserProfileCategoriesTool } from "./getUserProfileCategories/getUserProfileCategories.js";
import { getUserProfileBasicTool } from "./getUserProfileBasic/getUserProfileBasic.js";

// Workbook Tools
import { getWorkbooksListTool } from "./getWorkbooksList/getWorkbooksList.js";
import { getWorkbookDetailsTool } from "./getWorkbookDetails/getWorkbookDetails.js";
import { getWorkbookContentsTool } from "./getWorkbookContents/getWorkbookContents.js";
import { getRelatedWorkbooksTool } from "./getRelatedWorkbooks/getRelatedWorkbooks.js";

// Social Tools
import { getFollowersTool } from "./getFollowers/getFollowers.js";
import { getFollowingTool } from "./getFollowing/getFollowing.js";
import { getFavoritesTool } from "./getFavorites/getFavorites.js";

// Discovery Tools
import { searchVisualizationsTool } from "./searchVisualizations/searchVisualizations.js";
import { getVizOfDayTool } from "./getVizOfDay/getVizOfDay.js";
import { getFeaturedAuthorsTool } from "./getFeaturedAuthors/getFeaturedAuthors.js";

// Media Tools
import { getWorkbookImageTool } from "./getWorkbookImage/getWorkbookImage.js";
import { getWorkbookThumbnailTool } from "./getWorkbookThumbnail/getWorkbookThumbnail.js";

// TWBX Tools
import { downloadWorkbookTwbxTool } from "./downloadWorkbookTwbx/downloadWorkbookTwbx.js";
import { unpackTwbxTool } from "./unpackTwbx/unpackTwbx.js";
import { getTwbxCalculatedFieldsTool } from "./getTwbxCalculatedFields/getTwbxCalculatedFields.js";
import { getTwbxWorkbookStructureTool } from "./getTwbxWorkbookStructure/getTwbxWorkbookStructure.js";
import { getTwbxCalculationDependenciesTool } from "./getTwbxCalculationDependencies/getTwbxCalculationDependencies.js";
import { getTwbxLodExpressionsTool } from "./getTwbxLodExpressions/getTwbxLodExpressions.js";
import { getTwbxDataProfileTool } from "./getTwbxDataProfile/getTwbxDataProfile.js";

/**
 * Type definition for tool factory functions
 *
 * A tool factory is a function that takes a Server instance and
 * returns a configured Tool instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolFactory = (server: Server) => Tool<any>;

/**
 * Array of all tool factory functions
 *
 * When implementing a new tool:
 * 1. Create the tool directory with implementation and tests
 * 2. Import the tool factory function above
 * 3. Add the factory function to this array
 *
 * The server will automatically register all tools in this array.
 */
export const toolFactories: ToolFactory[] = [
  // User Profile Tools (3)
  getUserProfileTool,
  getUserProfileCategoriesTool,
  getUserProfileBasicTool,

  // Workbook Tools (4)
  getWorkbooksListTool,
  getWorkbookDetailsTool,
  getWorkbookContentsTool,
  getRelatedWorkbooksTool,

  // Social Tools (3)
  getFollowersTool,
  getFollowingTool,
  getFavoritesTool,

  // Discovery Tools (3)
  searchVisualizationsTool,
  getVizOfDayTool,
  getFeaturedAuthorsTool,

  // Media Tools (2)
  getWorkbookImageTool,
  getWorkbookThumbnailTool,

  // TWBX Tools (7)
  downloadWorkbookTwbxTool,
  unpackTwbxTool,
  getTwbxCalculatedFieldsTool,
  getTwbxWorkbookStructureTool,
  getTwbxCalculationDependenciesTool,
  getTwbxLodExpressionsTool,
  getTwbxDataProfileTool
];

/**
 * Gets the total number of registered tools
 *
 * @returns The count of tool factories
 */
export function getToolCount(): number {
  return toolFactories.length;
}
