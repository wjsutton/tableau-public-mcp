/**
 * Tool name definitions and type guards
 *
 * Centralizes all tool names for type safety and runtime validation.
 * Add new tool names here when implementing new tools.
 */

/**
 * Array of all available tool names
 *
 * This ensures type safety across the codebase and enables
 * runtime validation of tool names.
 */
export const TOOL_NAMES = [
  // User Profile Tools
  "get_user_profile",
  "get_user_profile_categories",
  "get_user_profile_basic",

  // Workbook Tools
  "get_workbooks_list",
  "get_workbook_details",
  "get_workbook_contents",
  "get_related_workbooks",
  "get_shared_workbook",

  // Social Tools
  "get_followers",
  "get_following",
  "get_favorites",

  // Discovery Tools
  "search_visualizations",
  "get_viz_of_day",
  "get_featured_authors",

  // Media Tools
  "get_workbook_image",
  "get_workbook_thumbnail",

  // TWBX Tools
  "download_workbook_twbx",
  "unpack_twbx",
  "get_twbx_calculated_fields",
  "get_twbx_workbook_structure",
  "get_twbx_calculation_dependencies",
  "get_twbx_lod_expressions"
] as const;

/**
 * Union type of all valid tool names
 *
 * @example
 * ```typescript
 * const toolName: ToolName = "get_user_profile"; // Valid
 * const invalid: ToolName = "invalid_tool"; // Type error
 * ```
 */
export type ToolName = typeof TOOL_NAMES[number];

/**
 * Type guard to check if a string is a valid tool name
 *
 * @param value - The string to check
 * @returns True if the value is a valid ToolName
 *
 * @example
 * ```typescript
 * if (isToolName(userInput)) {
 *   console.log(`Valid tool: ${userInput}`);
 * } else {
 *   console.log("Invalid tool name");
 * }
 * ```
 */
export function isToolName(value: string): value is ToolName {
  return TOOL_NAMES.includes(value as ToolName);
}

/**
 * Gets a human-readable title for a tool name
 *
 * @param toolName - The tool name to get a title for
 * @returns A formatted title string
 *
 * @example
 * ```typescript
 * getToolTitle("get_user_profile"); // Returns "Get User Profile"
 * ```
 */
export function getToolTitle(toolName: ToolName): string {
  return toolName
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
