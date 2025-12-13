/**
 * Tests for getWorkbookImage tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookImageTool } from "./getWorkbookImage.js";

// Mock the image processing module
vi.mock("../../utils/imageProcessing.js", () => ({
  fetchAndOptimizeImage: vi.fn().mockResolvedValue({
    data: "base64EncodedImageData",
    mimeType: "image/jpeg",
    originalSize: 500000,
    processedSize: 50000,
    width: 800,
    height: 600,
    estimatedTokens: 16625,
    compressionRatio: 10
  })
}));

describe("getWorkbookImage", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookImageTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookImageTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_image");
    expect(tool.description).toContain("Fetches and optimizes");
    expect(tool.description).toContain("MCP token limits");
    expect(tool.annotations?.title).toBe("Get Workbook Image");
  });

  it("should fetch and return optimized image successfully", async () => {
    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);

    // Should have image content
    expect(value.content[0].type).toBe("image");
    expect((value.content[0] as { data: string }).data).toBe("base64EncodedImageData");

    // Should have metadata text content
    expect(value.content[1].type).toBe("text");
    const metadataText = (value.content[1] as { text: string }).text;
    expect(metadataText).toContain("testuser/sales-dashboard");
    expect(metadataText).toContain("Dashboard1");
    expect(metadataText).toContain("optimization");
  });

  it("should accept custom optimization parameters", async () => {
    const { fetchAndOptimizeImage } = await import("../../utils/imageProcessing.js");

    await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1",
      maxWidth: 400,
      maxHeight: 300,
      quality: 70,
      format: "webp"
    });

    expect(fetchAndOptimizeImage).toHaveBeenCalledWith(
      expect.stringContaining("user/workbook/Sheet1.png"),
      {
        maxWidth: 400,
        maxHeight: 300,
        quality: 70,
        format: "webp"
      }
    );
  });

  it("should use default optimization values when not specified", async () => {
    const { fetchAndOptimizeImage } = await import("../../utils/imageProcessing.js");

    await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1"
    });

    expect(fetchAndOptimizeImage).toHaveBeenCalledWith(
      expect.any(String),
      {
        maxWidth: 800,
        maxHeight: 600,
        quality: 80,
        format: "jpeg"
      }
    );
  });

  it("should include token information in response metadata", async () => {
    const result = await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const metadataText = (value.content[1] as { text: string }).text;
    const metadata = JSON.parse(metadataText);

    expect(metadata.tokenInfo).toBeDefined();
    expect(metadata.tokenInfo.estimatedTokens).toBe(16625);
    expect(metadata.tokenInfo.mcpLimit).toBe(25000);
    expect(metadata.tokenInfo.withinLimit).toBe(true);
  });

  it("should validate required parameters", () => {
    const schema = tool.paramsSchema;

    // Should reject empty workbookUrl
    expect(() => {
      z.object(schema).parse({ workbookUrl: "", viewName: "test" });
    }).toThrow();

    // Should reject empty viewName
    expect(() => {
      z.object(schema).parse({ workbookUrl: "test/workbook", viewName: "" });
    }).toThrow();
  });

  it("should validate optional parameter constraints", () => {
    const schema = tool.paramsSchema;

    // maxWidth must be >= 100
    expect(() => {
      z.object(schema).parse({
        workbookUrl: "test",
        viewName: "test",
        maxWidth: 50
      });
    }).toThrow();

    // maxWidth must be <= 1200
    expect(() => {
      z.object(schema).parse({
        workbookUrl: "test",
        viewName: "test",
        maxWidth: 2000
      });
    }).toThrow();

    // quality must be 10-100
    expect(() => {
      z.object(schema).parse({
        workbookUrl: "test",
        viewName: "test",
        quality: 5
      });
    }).toThrow();

    // format must be valid enum
    expect(() => {
      z.object(schema).parse({
        workbookUrl: "test",
        viewName: "test",
        format: "gif"
      });
    }).toThrow();
  });

  it("should handle 404 errors gracefully", async () => {
    const { fetchAndOptimizeImage } = await import("../../utils/imageProcessing.js");
    vi.mocked(fetchAndOptimizeImage).mockRejectedValueOnce(new Error("404 Not Found"));

    const result = await tool.callback({
      workbookUrl: "nonexistent/workbook",
      viewName: "Sheet1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
    const errorText = (value.content[0] as { text: string }).text;
    expect(errorText).toContain("Image not found");
  });

  it("should handle timeout errors gracefully", async () => {
    const { fetchAndOptimizeImage } = await import("../../utils/imageProcessing.js");
    vi.mocked(fetchAndOptimizeImage).mockRejectedValueOnce(new Error("timeout exceeded"));

    const result = await tool.callback({
      workbookUrl: "slow/workbook",
      viewName: "Sheet1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
    const errorText = (value.content[0] as { text: string }).text;
    expect(errorText).toContain("Image fetch timed out");
  });
});
