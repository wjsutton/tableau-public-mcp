/**
 * Tests for getWorkbookThumbnail tool
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookThumbnailTool } from "./getWorkbookThumbnail.js";
import { z } from "zod";

describe("getWorkbookThumbnail", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookThumbnailTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookThumbnailTool(server);
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_thumbnail");
    expect(tool.description).toContain("thumbnail");
    expect(tool.annotations?.title).toBe("Get Workbook Thumbnail");
  });

  it("should generate thumb path URL by default", async () => {
    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("thumbnailUrl");
      expect(responseText).toContain("https://public.tableau.com/thumb/views/testuser/sales-dashboard/Dashboard1");
      expect(responseText).toContain('"pathType": "thumb"');
    }
  });

  it("should generate static path URL when requested", async () => {
    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1",
      useStaticPath: true
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("https://public.tableau.com/static/images/te/testuser/sales-dashboard/Dashboard1/4_3.png");
      expect(responseText).toContain('"pathType": "static"');
    }
  });

  it("should include workbook and view information", async () => {
    const result = await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("user/workbook");
      expect(responseText).toContain("Sheet1");
      expect(responseText).toContain("description");
    }
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
});
