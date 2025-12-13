/**
 * Image Processing Utilities
 *
 * Provides functions for fetching, resizing, and compressing images
 * to optimize them for MCP tool responses.
 */

import sharp from "sharp";
import axios from "axios";

/**
 * Result of processing an image
 */
export interface ProcessedImage {
  /** Base64-encoded image data */
  data: string;
  /** MIME type of the processed image */
  mimeType: string;
  /** Original image size in bytes */
  originalSize: number;
  /** Processed image size in bytes */
  processedSize: number;
  /** Width of processed image */
  width: number;
  /** Height of processed image */
  height: number;
  /** Estimated token count for base64 data */
  estimatedTokens: number;
  /** Compression ratio achieved */
  compressionRatio: number;
}

/**
 * Options for image optimization
 */
export interface ImageOptimizationOptions {
  /** Maximum width in pixels (default: 800) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 600) */
  maxHeight?: number;
  /** JPEG/WebP quality 1-100 (default: 80) */
  quality?: number;
  /** Output format (default: 'jpeg') */
  format?: "jpeg" | "webp" | "png";
}

const DEFAULT_OPTIONS: Required<ImageOptimizationOptions> = {
  maxWidth: 800,
  maxHeight: 600,
  quality: 80,
  format: "jpeg",
};

/**
 * Fetches an image from a URL and optimizes it for MCP responses
 *
 * Resizes the image to fit within maxWidth/maxHeight while maintaining
 * aspect ratio, then compresses it to the specified format and quality.
 *
 * @param imageUrl - URL of the image to fetch
 * @param options - Optimization options
 * @returns Processed image with base64 data and metadata
 *
 * @example
 * ```typescript
 * const result = await fetchAndOptimizeImage(
 *   "https://public.tableau.com/views/...",
 *   { maxWidth: 800, maxHeight: 600, quality: 80 }
 * );
 * console.log(`Compressed from ${result.originalSize} to ${result.processedSize}`);
 * ```
 */
export async function fetchAndOptimizeImage(
  imageUrl: string,
  options?: ImageOptimizationOptions
): Promise<ProcessedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Fetch the image
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const originalBuffer = Buffer.from(response.data);
  const originalSize = originalBuffer.length;

  // Process with Sharp
  let sharpInstance = sharp(originalBuffer);

  // Resize to fit within bounds while maintaining aspect ratio
  sharpInstance = sharpInstance.resize(opts.maxWidth, opts.maxHeight, {
    fit: "inside",
    withoutEnlargement: true,
  });

  // Apply format-specific compression
  let processedBuffer: Buffer;
  let mimeType: string;

  switch (opts.format) {
    case "webp":
      processedBuffer = await sharpInstance.webp({ quality: opts.quality }).toBuffer();
      mimeType = "image/webp";
      break;
    case "png":
      processedBuffer = await sharpInstance.png({ compressionLevel: 9 }).toBuffer();
      mimeType = "image/png";
      break;
    case "jpeg":
    default:
      processedBuffer = await sharpInstance.jpeg({ quality: opts.quality, mozjpeg: true }).toBuffer();
      mimeType = "image/jpeg";
      break;
  }

  // Get processed dimensions
  const processedMetadata = await sharp(processedBuffer).metadata();
  const processedSize = processedBuffer.length;

  // Calculate estimated tokens (base64 adds ~33% overhead, ~4 chars per token)
  const base64Size = Math.ceil(processedSize * 1.33);
  const estimatedTokens = Math.ceil(base64Size / 4);

  // Convert to base64
  const base64Data = processedBuffer.toString("base64");

  return {
    data: base64Data,
    mimeType,
    originalSize,
    processedSize,
    width: processedMetadata.width || opts.maxWidth,
    height: processedMetadata.height || opts.maxHeight,
    estimatedTokens,
    compressionRatio: originalSize / processedSize,
  };
}

/**
 * Checks if an image size is within MCP token limits
 *
 * @param sizeBytes - Image size in bytes
 * @param tokenLimit - Token limit (default: 25000)
 * @returns Whether the image fits within the limit
 */
export function isWithinTokenLimit(sizeBytes: number, tokenLimit = 25000): boolean {
  const base64Size = Math.ceil(sizeBytes * 1.33);
  const estimatedTokens = Math.ceil(base64Size / 4);
  return estimatedTokens <= tokenLimit;
}

/**
 * Calculates the optimal quality setting to fit within a token limit
 *
 * @param originalSize - Original image size in bytes
 * @param targetTokens - Target token count (default: 20000)
 * @returns Suggested quality setting (10-100)
 */
export function suggestQualityForTokenLimit(
  originalSize: number,
  targetTokens = 20000
): number {
  // Target bytes = targetTokens * 4 / 1.33 (reverse of token calculation)
  const targetBytes = Math.floor((targetTokens * 4) / 1.33);

  // Rough estimate: quality scales somewhat linearly with file size
  // for JPEG compression in the 50-90 range
  const compressionNeeded = originalSize / targetBytes;

  if (compressionNeeded <= 1) return 90;
  if (compressionNeeded <= 2) return 80;
  if (compressionNeeded <= 4) return 60;
  if (compressionNeeded <= 8) return 40;
  return 20;
}
