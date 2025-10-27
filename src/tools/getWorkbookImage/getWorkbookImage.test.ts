/**
 * Tests for getWorkbookImage tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookImageTool } from "./getWorkbookImage.js";

describe("getWorkbookImage", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookImageTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookImageTool(server);
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_image");
    expect(tool.description).toContain("PNG image");
    expect(tool.annotations?.title).toBe("Get Workbook Image");
  });

  it("should generate image URL successfully", async () => {
    const result = await tool.callback({
      workbookUrl: "testuser/sales-dashboard",
      viewName: "Dashboard1"
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("imageUrl");
      expect(responseText).toContain("https://public.tableau.com/views/testuser/sales-dashboard/Dashboard1.png");
      expect(responseText).toContain("display_static_image=y");
      expect(responseText).toContain("showVizHome=n");
    }
  });

  it("should include workbook and view information in response", async () => {
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
