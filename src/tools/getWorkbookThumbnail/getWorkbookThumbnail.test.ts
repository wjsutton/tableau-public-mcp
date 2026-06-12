/**
 * Tests for getWorkbookThumbnail tool (inline-first contract)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookThumbnailTool } from "./getWorkbookThumbnail.js";

vi.mock("../../utils/imageProcessing.js", () => ({
  fetchImageForResponse: vi.fn(),
  encodeFullResolution: vi.fn(),
  formatFromExtension: vi.fn(() => "png")
}));

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

import { fetchImageForResponse, encodeFullResolution } from "../../utils/imageProcessing.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

const THUMB_BYTES = Buffer.from("THUMBNAIL-IMAGE-BYTES");
const FULL_RES_SAVED_BYTES = Buffer.from("FULL-RES-THUMBNAIL-FOR-SAVE");

// A "real" thumbnail is comfortably above the placeholder threshold (5 KB).
function thumbResult(overrides = {}) {
  return {
    data: "BASE64THUMBDATA",
    mimeType: "image/png",
    fullBuffer: THUMB_BYTES,
    inlineSize: THUMB_BYTES.length,
    inlineWidth: 320,
    inlineHeight: 240,
    fullSize: THUMB_BYTES.length,
    fullWidth: 320,
    fullHeight: 240,
    originalSize: 178000,
    originalWidth: 320,
    originalHeight: 240,
    wasResized: false,
    wasDownscaledForLimit: false,
    originalBuffer: THUMB_BYTES,
    ...overrides
  };
}

describe("getWorkbookThumbnail", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookThumbnailTool>;
  let workDir: string;

  beforeEach(async () => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookThumbnailTool(server);
    vi.clearAllMocks();
    vi.mocked(fetchImageForResponse).mockResolvedValue(thumbResult());
    vi.mocked(encodeFullResolution).mockResolvedValue({
      buffer: FULL_RES_SAVED_BYTES,
      mimeType: "image/png",
      width: 320,
      height: 240
    });
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "gwt-test-")));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("should have correct metadata stating the inline-first contract", () => {
    expect(tool.name).toBe("get_workbook_thumbnail");
    expect(tool.description).toContain("INLINE");
    expect(tool.description).toContain("save_path");
    expect(tool.annotations?.title).toBe("Get Workbook Thumbnail");
  });

  it("returns a visible image block and writes nothing with only the workbook (viewName auto-resolved)", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ defaultViewName: "Rivalry" });

    const result = await tool.callback({ workbookUrl: "DjokovicNadalrivalry" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);

    // Visible image block
    expect(value.content[0].type).toBe("image");
    expect((value.content[0] as { data: string }).data).toBe("BASE64THUMBDATA");
    expect((value.content[0] as { mimeType: string }).mimeType).toBe("image/png");

    // Nothing written to disk
    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.savedPath).toBeNull();
    expect(metadata.viewName).toBe("Rivalry");
    expect(metadata.viewNameAutoResolved).toBe(true);

    // Fetched from the thumb-path URL
    expect(fetchImageForResponse).toHaveBeenCalledWith(
      expect.stringContaining("/thumb/views/DjokovicNadalrivalry/Rivalry"),
      expect.objectContaining({ maxInlineBytes: expect.any(Number) })
    );
  });

  it("writes the thumbnail to save_path when provided and still returns inline", async () => {
    const savePath = path.join(workDir, "thumbs", "preview.png");

    const result = await tool.callback({
      workbookUrl: "sales-dashboard",
      viewName: "Dashboard1",
      save_path: savePath
    });

    const value = result.unwrap();
    expect(value.isError).toBe(false);
    expect(value.content[0].type).toBe("image");

    const written = await fs.readFile(savePath);
    expect(written.equals(FULL_RES_SAVED_BYTES)).toBe(true);

    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.savedPath).not.toBeNull();
    expect(metadata.savedPath).not.toContain("tableau-public-mcp");
  });

  it("uses the static path URL when requested", async () => {
    await tool.callback({
      workbookUrl: "sales-dashboard",
      viewName: "Dashboard1",
      useStaticPath: true
    });

    expect(fetchImageForResponse).toHaveBeenCalledWith(
      expect.stringContaining("/static/images/sa/sales-dashboard/Dashboard1/4_3.png"),
      expect.anything()
    );
  });

  // Bug 1: suffix-stripping could pick a non-existent name; Tableau serves a tiny
  // grey placeholder (HTTP 200) for it, so we must try the full name first and
  // prefer a real (non-placeholder) image.
  it("tries the full suffixed name first and keeps it when it returns a real image", async () => {
    vi.mocked(fetchImageForResponse).mockResolvedValueOnce(
      thumbResult({ originalSize: 178000 }) // full name returns a real image
    );

    const result = await tool.callback({
      workbookUrl: "FinancialConsumerComplaintsDashboard_17718710866110",
      viewName: "Overview"
    });

    const value = result.unwrap();
    const metadata = JSON.parse((value.content[1] as { text: string }).text);

    // Only the full (suffixed) candidate was needed; no placeholder warning.
    expect(fetchImageForResponse).toHaveBeenCalledTimes(1);
    expect(metadata.canonicalWorkbookName).toBe("FinancialConsumerComplaintsDashboard_17718710866110");
    expect(metadata.warning).toBeUndefined();
  });

  it("falls back to the stripped name when the full name returns a placeholder", async () => {
    vi.mocked(fetchImageForResponse)
      .mockResolvedValueOnce(thumbResult({ originalSize: 2700 }))   // full -> placeholder
      .mockResolvedValueOnce(thumbResult({ originalSize: 178000 })); // stripped -> real

    const result = await tool.callback({
      workbookUrl: "SomeWorkbook_17718710866110",
      viewName: "Overview"
    });

    const value = result.unwrap();
    const metadata = JSON.parse((value.content[1] as { text: string }).text);

    expect(fetchImageForResponse).toHaveBeenCalledTimes(2);
    expect(metadata.canonicalWorkbookName).toBe("SomeWorkbook"); // stripped name chosen
    expect(metadata.warning).toBeUndefined();
  });

  it("warns when every candidate returns only a placeholder", async () => {
    vi.mocked(fetchImageForResponse).mockResolvedValue(thumbResult({ originalSize: 2700 }));

    const result = await tool.callback({
      workbookUrl: "Nonexistent_17718710866110",
      viewName: "Overview"
    });

    const value = result.unwrap();
    expect(value.isError).toBe(false); // still returns the (placeholder) image
    const metadata = JSON.parse((value.content[1] as { text: string }).text);
    expect(metadata.warning).toContain("placeholder");
  });

  it("validates required parameters", () => {
    const schema = tool.paramsSchema;
    expect(() => z.object(schema).parse({ workbookUrl: "" })).toThrow();
  });
});
