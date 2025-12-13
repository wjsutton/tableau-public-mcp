/**
 * Tests for getWorkbookThumbnail tool
 */

import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookThumbnailTool } from "./getWorkbookThumbnail.js";

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
      workbookUrl: "sales-dashboard",
      viewName: "Dashboard1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("thumbnailUrl");
    expect(responseText).toContain("https://public.tableau.com/thumb/views/sales-dashboard/Dashboard1");
    expect(responseText).toContain('"pathType": "thumb"');
  });

  it("should generate static path URL when requested", async () => {
    const result = await tool.callback({
      workbookUrl: "sales-dashboard",
      viewName: "Dashboard1",
      useStaticPath: true
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("https://public.tableau.com/static/images/sa/sales-dashboard/Dashboard1/4_3.png");
    expect(responseText).toContain('"pathType": "static"');
  });

  it("should derive canonical name by removing numeric suffix", async () => {
    const result = await tool.callback({
      workbookUrl: "olympic_ages_17646104017530",
      viewName: "TheAgeofOlympians",
      useStaticPath: true
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].text;
    // Should use canonical name without suffix
    expect(responseText).toContain("https://public.tableau.com/static/images/ol/olympic_ages/TheAgeofOlympians/4_3.png");
    expect(responseText).toContain('"canonicalWorkbookName": "olympic_ages"');
  });

  it("should use explicit workbookName when provided", async () => {
    const result = await tool.callback({
      workbookUrl: "olympic_ages_17646104017530",
      viewName: "TheAgeofOlympians",
      workbookName: "my_custom_name",
      useStaticPath: true
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].text;
    // Should use the explicitly provided workbookName
    expect(responseText).toContain("https://public.tableau.com/static/images/my/my_custom_name/TheAgeofOlympians/4_3.png");
    expect(responseText).toContain('"canonicalWorkbookName": "my_custom_name"');
  });

  it("should include workbook and view information", async () => {
    const result = await tool.callback({
      workbookUrl: "user/workbook",
      viewName: "Sheet1"
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].text;
    expect(responseText).toContain("user/workbook");
    expect(responseText).toContain("Sheet1");
    expect(responseText).toContain("description");
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
