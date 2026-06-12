/**
 * Tests for image processing utilities, focused on the inline-response path
 * (fetchImageForResponse) and its downscale-to-fit guard.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import sharp from "sharp";

// Mock axios so we can feed a deterministic source image without a network call.
vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import axios from "axios";
import { fetchImageForResponse, encodeFullResolution, formatFromExtension } from "./imageProcessing.js";

/** Builds a busy (poorly-compressible) PNG of the given size so it is "large". */
async function makeNoisyPng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  // Deterministic high-entropy noise via xorshift32 (no Math.random needed) so
  // the PNG does NOT compress to a tiny size.
  let s = 0x12345678 >>> 0;
  for (let i = 0; i < raw.length; i++) {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    raw[i] = s & 0xff;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("fetchImageForResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the optimized image inline without downscaling when it fits the limit", async () => {
    const src = await makeNoisyPng(200, 200);
    vi.mocked(axios.get).mockResolvedValueOnce({ data: src });

    const result = await fetchImageForResponse("https://example.com/img.png", {
      maxWidth: 800,
      maxHeight: 800,
      format: "png",
      maxInlineBytes: 10 * 1024 * 1024, // generous: no downscale needed
    });

    expect(result.wasDownscaledForLimit).toBe(false);
    expect(result.inlineWidth).toBe(result.fullWidth);
    expect(result.inlineHeight).toBe(result.fullHeight);
    expect(result.data.length).toBeGreaterThan(0);
    // Inline base64 decodes to the full buffer when not downscaled.
    expect(result.inlineSize).toBe(result.fullSize);
  });

  it("downscales the inline copy to fit the response limit instead of failing", async () => {
    const src = await makeNoisyPng(500, 500);
    vi.mocked(axios.get).mockResolvedValueOnce({ data: src });

    const limit = 40 * 1024; // 40 KB — smaller than the full-res encoded image
    const result = await fetchImageForResponse("https://example.com/img.png", {
      maxWidth: 800,
      maxHeight: 800,
      format: "png",
      maxInlineBytes: limit,
    });

    // The full-resolution buffer is preserved (and exceeds the limit)...
    expect(result.fullSize).toBeGreaterThan(limit);
    // ...while the inline copy was downscaled to fit.
    expect(result.wasDownscaledForLimit).toBe(true);
    expect(result.inlineSize).toBeLessThanOrEqual(limit);
    expect(result.inlineWidth).toBeLessThan(result.fullWidth);
    // Aspect ratio (square here) preserved.
    expect(result.inlineWidth).toBe(result.inlineHeight);
  });

  it("preserves aspect ratio when resizing to the requested bounds", async () => {
    const src = await makeNoisyPng(1000, 500); // 2:1
    vi.mocked(axios.get).mockResolvedValueOnce({ data: src });

    const result = await fetchImageForResponse("https://example.com/img.png", {
      maxWidth: 400,
      maxHeight: 400,
      format: "png",
      maxInlineBytes: 10 * 1024 * 1024,
    });

    expect(result.wasResized).toBe(true);
    // 2:1 aspect ratio maintained -> 400x200
    expect(result.fullWidth).toBe(400);
    expect(result.fullHeight).toBe(200);
  });

  it("returns the original full-resolution source buffer for saving", async () => {
    const src = await makeNoisyPng(1000, 800);
    vi.mocked(axios.get).mockResolvedValueOnce({ data: src });

    const result = await fetchImageForResponse("https://example.com/img.png", {
      maxWidth: 400, // forces the inline/optimized copy to be smaller than source
      maxHeight: 400,
      format: "jpeg",
      maxInlineBytes: 10 * 1024 * 1024,
    });

    // originalBuffer is the untouched source (still 1000x800), distinct from the optimized copy
    expect(result.originalBuffer.equals(src)).toBe(true);
    expect(result.originalWidth).toBe(1000);
    expect(result.originalHeight).toBe(800);
    expect(result.fullWidth).toBeLessThan(result.originalWidth);
  });
});

describe("encodeFullResolution", () => {
  it("re-encodes the original at full resolution in the requested format", async () => {
    const src = await makeNoisyPng(640, 480);
    const png = await encodeFullResolution(src, "png");
    expect(png.mimeType).toBe("image/png");
    expect(png.width).toBe(640);
    expect(png.height).toBe(480);

    const jpeg = await encodeFullResolution(src, "jpeg", 95);
    expect(jpeg.mimeType).toBe("image/jpeg");
    expect(jpeg.width).toBe(640); // full resolution preserved (no resize)
    expect(jpeg.height).toBe(480);
  });
});

describe("formatFromExtension", () => {
  it("derives the format from the file extension, honouring the fallback", () => {
    expect(formatFromExtension("C:/x/dashboard.png", "jpeg")).toBe("png");
    expect(formatFromExtension("/a/b/c.JPG", "png")).toBe("jpeg");
    expect(formatFromExtension("./out.webp", "jpeg")).toBe("webp");
    expect(formatFromExtension("/no/extension", "jpeg")).toBe("jpeg"); // fallback
  });
});
