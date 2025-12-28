/**
 * Image Profiler
 *
 * Extracts metadata (dimensions, format) from image files.
 */

import * as path from "path";
import sharp from "sharp";
import { ImageProfile, ImageInventory } from "./types.js";

/**
 * Profile an image file to extract metadata
 *
 * @param filePath - Path to the image file
 * @returns ImageProfile with dimensions and format, or null if parsing fails
 */
export async function profileImage(filePath: string): Promise<ImageProfile | null> {
  try {
    const metadata = await sharp(filePath).metadata();

    return {
      fileName: path.basename(filePath),
      filePath,
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || "unknown"
    };
  } catch (error) {
    console.error(`[imageProfiler] Failed to profile ${filePath}:`, error);
    return null;
  }
}

/**
 * Profile multiple image files and create an inventory
 *
 * @param filePaths - Array of paths to image files
 * @returns ImageInventory with all image profiles
 */
export async function profileImageFiles(filePaths: string[]): Promise<ImageInventory> {
  const images: ImageProfile[] = [];

  for (const filePath of filePaths) {
    const profile = await profileImage(filePath);
    if (profile) {
      images.push(profile);
    }
  }

  return {
    totalCount: images.length,
    images
  };
}
