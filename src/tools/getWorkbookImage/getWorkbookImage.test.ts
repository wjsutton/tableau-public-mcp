/**
 * Tests for getWorkbookImage tool (inline-first contract)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookImageTool } from "./getWorkbookImage.js";

vi.mock("../../utils/imageProcessing.js", () => ({
  fetchImageForResponse: vi.fn(),
  encodeFullResolution: vi.fn(),
  formatFromExtension: vi.fn(() => "png")
}));

import { fetchImageForResponse, encodeFullResolution } from "../../utils/imageProcessing.js";

const OPTIMIZED_BYTES = Buffer.from("OPTIMIZED-INLINE-IMAGE-BYTES");
const ORIGINAL_BYTES = Buffer.from("ORIGINAL-SOURCE-IMAGE-BYTES");
const FULL_RES_SAVED_BYTES = Buffer.from("FULL-RESOLUTION-ENCODED-FOR-SAVE");

function baseResult(overrides = {}) {
  return {
    data: "BASE64INLINEDATA",
    mimeType: "image/jpeg",
    fullBuffer: OPTIMIZED_BYTES,
    inlineSize: OPTIMIZED_BYTES.length,
    inlineWidth: 768,
    inlineHeight: 600,
    fullSize: OPTIMIZED_BYTES.length,
    fullWidth: 768,
    fullHeight: 600,
    originalSize: 500000,
    originalWidth: 1920,
    originalHeight: 1080,
    wasResized: true,
    wasDownscaledForLimit: false,
    originalBuffer: ORIGINAL_BYTES,
    ...overrides
  };
}

describe("getWorkbookImage", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookImageTool>;
  let workDir: string;

  beforeEach(async () => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookImageTool(server);
    vi.clearAllMocks();
    vi.mocked(fetchImageForResponse).mockResolvedValue(baseResult());
    vi.mocked(encodeFullResolution).mockResolvedValue({
      buffer: FULL_RES_SAVED_BYTES,
      mimeType: "image/png",
      width: 1920,
      height: 1080
    });
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "gwi-test-")));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("should have correct metadata stating the inline-first contract", () => {
    expect(tool.name).toBe("get_workbook_image");
    expect(tool.description).toContain("INLINE");
    expect(tool.description).toContain("save_path");
    expect(tool.annotations?.title).toBe("Get Workbook Image");
  });

  it("returns the image inline and writes nothing when save_path is omitted", async () => {
    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);

    // First block is the inline image
    expect(value.content[0].type).toBe("image");
    expect((value.content[0] as { data: string }).data).toBe("BASE64INLINEDATA");
    expect((value.content[0] as { mimeType: string }).mimeType).toBe("image/jpeg");

    // Second block is metadata; nothing was saved to disk
    expect(value.content[1].type).toBe("text");
    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.delivery).toBe("inline");
    expect(metadata.savedPath).toBeNull();
    expect(metadata.workbookUrl).toBe("testuser/sales-dashboard");
  });

  it("writes the full-resolution file when save_path is provided and still returns inline", async () => {
    const savePath = path.join(workDir, "verification", "dashboard.png");

    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1",
      save_path: savePath
    });

    const value = result.unwrap();
    expect(value.isError).toBe(false);

    // Inline image still returned
    expect(value.content[0].type).toBe("image");

    // The file written is the FULL-RESOLUTION encode, NOT the optimized inline copy (Bug 3)
    const written = await fs.readFile(savePath);
    expect(written.equals(FULL_RES_SAVED_BYTES)).toBe(true);
    expect(written.equals(OPTIMIZED_BYTES)).toBe(false);

    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.savedPath).toBeDefined();
    expect(metadata.savedPath).not.toBeNull();
    expect(metadata.savedFullResolution.dimensions).toBe("1920x1080");
    // Never the host temp directory
    expect(metadata.savedPath).not.toContain("tableau-public-mcp");
    expect(metadata.savedPath).not.toContain("~");
  });

  it("returns a friendly error (not a raw ZodError) for invalid parameters", async () => {
    const result = await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1",
      maxWidth: 99999 // exceeds the allowed max
    } as never);

    const value = result.unwrap();
    expect(value.isError).toBe(true);
    expect((value.content[0] as { text: string }).text).toContain("Invalid parameters");
  });

  it("surfaces a downscale note when the inline copy was shrunk to fit the limit", async () => {
    vi.mocked(fetchImageForResponse).mockResolvedValue(baseResult({
      inlineWidth: 384,
      inlineHeight: 300,
      inlineSize: 900000,
      fullWidth: 2000,
      fullHeight: 1560,
      fullSize: 3000000,
      wasDownscaledForLimit: true
    }));

    const result = await tool.callback({
      workbookUrl: "big/workbook",
      viewName: "Dashboard1"
    });

    const value = result.unwrap();
    expect(value.isError).toBe(false);
    expect(value.content[0].type).toBe("image"); // still succeeds, no failure
    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.image.wasDownscaledForResponseLimit).toBe(true);
    expect(metadata.note).toContain("downscaled");
  });

  it("passes optimization options and the configured inline limit through", async () => {
    await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1",
      maxWidth: 400,
      maxHeight: 300,
      quality: 70,
      format: "webp"
    });

    expect(fetchImageForResponse).toHaveBeenCalledWith(
      expect.stringContaining("user/workbook/Sheet1.png"),
      expect.objectContaining({
        maxWidth: 400,
        maxHeight: 300,
        quality: 70,
        format: "webp",
        maxInlineBytes: expect.any(Number)
      })
    );
  });

  it("handles 404 errors gracefully", async () => {
    vi.mocked(fetchImageForResponse).mockRejectedValueOnce(new Error("404 Not Found"));

    const result = await tool.callback({
      workbookUrl: "nonexistent/workbook",
      viewName: "Sheet1"
    });

    const value = result.unwrap();
    expect(value.isError).toBe(true);
    expect((value.content[0] as { text: string }).text).toContain("Image not found");
  });

  it("validates required parameters", () => {
    const schema = tool.paramsSchema;
    expect(() => z.object(schema).parse({ workbookUrl: "", viewName: "test" })).toThrow();
    expect(() => z.object(schema).parse({ workbookUrl: "test/workbook", viewName: "" })).toThrow();
  });
});
