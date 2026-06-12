/**
 * Image Processing Utilities
 *
 * Provides functions for fetching, resizing, and compressing images
 * to optimize them for MCP tool responses.
 */

import sharp from "sharp";
import axios from "axios";
import * as fs from "fs/promises";

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
 * Result of processing and saving an image to disk
 */
export interface SavedImage {
  /** Absolute path to the saved file */
  filePath: string;
  /** MIME type of the saved image */
  mimeType: string;
  /** Original image size in bytes */
  originalSize: number;
  /** Processed image size in bytes */
  processedSize: number;
  /** Width of processed image */
  width: number;
  /** Height of processed image */
  height: number;
  /** Original width before processing */
  originalWidth: number;
  /** Original height before processing */
  originalHeight: number;
  /** Compression ratio achieved */
  compressionRatio: number;
  /** Whether image was resized (vs just compressed) */
  wasResized: boolean;
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
 * Result of fetching an image for an inline MCP response
 */
export interface InlineImageResult {
  /** Base64-encoded data of the version embedded inline (may be downscaled to fit the response limit) */
  data: string;
  /** MIME type of the image */
  mimeType: string;
  /** Buffer of the full-resolution optimized image (suitable for saving to disk) */
  fullBuffer: Buffer;
  /** Byte size of the inline version */
  inlineSize: number;
  /** Width of the inline version */
  inlineWidth: number;
  /** Height of the inline version */
  inlineHeight: number;
  /** Byte size of the full-resolution optimized image */
  fullSize: number;
  /** Width of the full-resolution optimized image */
  fullWidth: number;
  /** Height of the full-resolution optimized image */
  fullHeight: number;
  /** Original source image size in bytes */
  originalSize: number;
  /** Original source image width */
  originalWidth: number;
  /** Original source image height */
  originalHeight: number;
  /** Whether the source was resized to honour maxWidth/maxHeight */
  wasResized: boolean;
  /** Whether the inline version was further downscaled to fit the response byte limit */
  wasDownscaledForLimit: boolean;
  /** Raw original source image bytes (full resolution, original format) — for saving to disk */
  originalBuffer: Buffer;
}

/** Encodes a buffer to the requested format/quality, returning buffer + mime type. */
async function encodeImage(
  instance: sharp.Sharp,
  format: Required<ImageOptimizationOptions>["format"],
  quality: number
): Promise<{ buffer: Buffer; mimeType: string }> {
  switch (format) {
    case "webp":
      return { buffer: await instance.webp({ quality }).toBuffer(), mimeType: "image/webp" };
    case "png":
      return { buffer: await instance.png({ compressionLevel: 9 }).toBuffer(), mimeType: "image/png" };
    case "jpeg":
    default:
      return { buffer: await instance.jpeg({ quality, mozjpeg: true }).toBuffer(), mimeType: "image/jpeg" };
  }
}

/**
 * Fetches an image and prepares it for an inline MCP image-content response.
 *
 * The image is resized to fit within maxWidth/maxHeight (preserving aspect
 * ratio) and compressed. If the encoded result still exceeds `maxInlineBytes`,
 * it is progressively downscaled (again preserving aspect ratio) until it fits,
 * so the response is never rejected for size. The full-resolution optimized
 * buffer is returned separately so callers can persist it via `save_path`.
 *
 * Nothing is written to disk here — the caller decides whether to persist.
 *
 * @param imageUrl - URL of the image to fetch
 * @param options - Optimization options plus the inline byte limit
 * @returns Inline image result with both inline and full-resolution data
 */
export async function fetchImageForResponse(
  imageUrl: string,
  options?: ImageOptimizationOptions & { maxInlineBytes?: number }
): Promise<InlineImageResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxInlineBytes = options?.maxInlineBytes ?? 1048576; // 1 MB default

  // Fetch the image
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const originalBuffer = Buffer.from(response.data);
  const originalSize = originalBuffer.length;

  const originalMetadata = await sharp(originalBuffer).metadata();
  const originalWidth = originalMetadata.width || 0;
  const originalHeight = originalMetadata.height || 0;

  // Produce the full-resolution optimized image (honouring requested bounds)
  const full = await encodeImage(
    sharp(originalBuffer).resize(opts.maxWidth, opts.maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    }),
    opts.format,
    opts.quality
  );
  const fullMeta = await sharp(full.buffer).metadata();
  const fullWidth = fullMeta.width || opts.maxWidth;
  const fullHeight = fullMeta.height || opts.maxHeight;
  const wasResized = originalWidth > opts.maxWidth || originalHeight > opts.maxHeight;

  // If the full-resolution version already fits, use it inline as-is.
  let inlineBuffer = full.buffer;
  let inlineWidth = fullWidth;
  let inlineHeight = fullHeight;
  let wasDownscaledForLimit = false;

  // Otherwise, progressively downscale (preserving aspect ratio) until it fits.
  let targetMaxDim = Math.max(fullWidth, fullHeight);
  let attempts = 0;
  while (inlineBuffer.length > maxInlineBytes && attempts < 12) {
    wasDownscaledForLimit = true;
    // Estimate the linear scale needed (area scales ~quadratically with bytes).
    const ratio = Math.sqrt(maxInlineBytes / inlineBuffer.length);
    targetMaxDim = Math.max(64, Math.floor(targetMaxDim * Math.min(ratio, 0.9)));

    const encoded = await encodeImage(
      sharp(originalBuffer).resize(targetMaxDim, targetMaxDim, {
        fit: "inside",
        withoutEnlargement: true,
      }),
      opts.format,
      opts.quality
    );
    inlineBuffer = encoded.buffer;
    const meta = await sharp(inlineBuffer).metadata();
    inlineWidth = meta.width || targetMaxDim;
    inlineHeight = meta.height || targetMaxDim;
    attempts++;

    if (targetMaxDim <= 64) break; // floor reached; accept whatever we have
  }

  return {
    data: inlineBuffer.toString("base64"),
    mimeType: full.mimeType,
    fullBuffer: full.buffer,
    inlineSize: inlineBuffer.length,
    inlineWidth,
    inlineHeight,
    fullSize: full.buffer.length,
    fullWidth,
    fullHeight,
    originalSize,
    originalWidth,
    originalHeight,
    wasResized,
    wasDownscaledForLimit,
    originalBuffer,
  };
}

/**
 * Result of encoding a full-resolution image for saving to disk
 */
export interface FullResolutionImage {
  /** Encoded bytes */
  buffer: Buffer;
  /** MIME type of the encoded image */
  mimeType: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
}

/**
 * Maps a file extension to an image format, defaulting to the supplied format
 * when the extension is unknown/absent.
 *
 * @param filePath - Destination file path (its extension drives the format)
 * @param fallback - Format to use when the extension is not a known image type
 */
export function formatFromExtension(
  filePath: string,
  fallback: Required<ImageOptimizationOptions>["format"]
): Required<ImageOptimizationOptions>["format"] {
  const ext = filePath.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "jpg":
    case "jpeg":
      return "jpeg";
    default:
      return fallback;
  }
}

/**
 * Re-encodes the original (full-resolution) source bytes to the requested
 * format WITHOUT resizing, for writing a true full-resolution file to disk.
 *
 * This is distinct from the inline/optimized copy returned in the response —
 * `save_path` should always receive the full-resolution image, honouring the
 * destination extension's format so the bytes match the filename.
 *
 * @param originalBuffer - Raw original source image bytes
 * @param format - Target image format
 * @param quality - Quality for lossy formats (kept high for archival output)
 * @returns Encoded full-resolution image plus its dimensions
 */
export async function encodeFullResolution(
  originalBuffer: Buffer,
  format: Required<ImageOptimizationOptions>["format"],
  quality = 95
): Promise<FullResolutionImage> {
  const encoded = await encodeImage(sharp(originalBuffer), format, quality);
  const meta = await sharp(encoded.buffer).metadata();
  return {
    buffer: encoded.buffer,
    mimeType: encoded.mimeType,
    width: meta.width || 0,
    height: meta.height || 0,
  };
}

/**
 * Fetches an image, optimizes it, and saves it to the filesystem
 *
 * Similar to fetchAndOptimizeImage but saves to disk instead of returning base64.
 * More efficient for large images and integrates with file-based workflows.
 *
 * @param imageUrl - URL of the image to fetch
 * @param outputPath - Absolute path where the image should be saved
 * @param options - Optimization options
 * @returns Saved image metadata including file path and compression stats
 *
 * @example
 * ```typescript
 * const result = await fetchResizeAndSave(
 *   "https://public.tableau.com/views/...",
 *   "/tmp/tableau-public-mcp/images/viz_123.jpeg",
 *   { maxWidth: 768, maxHeight: 768, quality: 85, format: "jpeg" }
 * );
 * console.log(`Saved to ${result.filePath}`);
 * ```
 */
export async function fetchResizeAndSave(
  imageUrl: string,
  outputPath: string,
  options?: ImageOptimizationOptions
): Promise<SavedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Fetch the image
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const originalBuffer = Buffer.from(response.data);
  const originalSize = originalBuffer.length;

  // Get original image metadata
  const originalMetadata = await sharp(originalBuffer).metadata();
  const originalWidth = originalMetadata.width || 0;
  const originalHeight = originalMetadata.height || 0;

  // Process with Sharp
  let sharpInstance = sharp(originalBuffer);

  // Resize to fit within bounds while maintaining aspect ratio
  // fit: "inside" ensures aspect ratio is preserved
  // withoutEnlargement: true prevents upscaling small images
  sharpInstance = sharpInstance.resize(opts.maxWidth, opts.maxHeight, {
    fit: "inside",
    withoutEnlargement: true,
  });

  // Determine if image was actually resized
  const wasResized = originalWidth > opts.maxWidth || originalHeight > opts.maxHeight;

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

  // Save to filesystem
  await fs.writeFile(outputPath, processedBuffer);

  return {
    filePath: outputPath,
    mimeType,
    originalSize,
    processedSize,
    width: processedMetadata.width || opts.maxWidth,
    height: processedMetadata.height || opts.maxHeight,
    originalWidth,
    originalHeight,
    compressionRatio: originalSize / processedSize,
    wasResized,
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
