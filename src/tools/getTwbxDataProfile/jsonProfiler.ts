/**
 * JSON Profiler
 *
 * Extracts structure and keys from JSON files.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { JsonProfile } from "./types.js";

/**
 * Profile a JSON file to extract structure and keys
 *
 * @param filePath - Path to the JSON file
 * @returns JsonProfile with structure and keys, or null if parsing fails
 */
export async function profileJson(filePath: string): Promise<JsonProfile | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);

    let structure: "array" | "object" | "primitive";
    let keys: string[] = [];

    if (Array.isArray(data)) {
      structure = "array";
      // If array of objects, get keys from first object
      if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
        keys = Object.keys(data[0]);
      }
    } else if (typeof data === "object" && data !== null) {
      structure = "object";
      keys = Object.keys(data);
    } else {
      structure = "primitive";
    }

    return {
      fileName: path.basename(filePath),
      filePath,
      structure,
      keys
    };
  } catch (error) {
    console.error(`[jsonProfiler] Failed to profile ${filePath}:`, error);
    return null;
  }
}

/**
 * Profile multiple JSON files
 *
 * @param filePaths - Array of paths to JSON files
 * @returns Array of JsonProfile objects
 */
export async function profileJsonFiles(filePaths: string[]): Promise<JsonProfile[]> {
  const profiles: JsonProfile[] = [];

  for (const filePath of filePaths) {
    const profile = await profileJson(filePath);
    if (profile) {
      profiles.push(profile);
    }
  }

  return profiles;
}
