/**
 * Tests for getWorkbookContents tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookContentsTool } from "./getWorkbookContents.js";
import { cachedGet } from "../../utils/cachedApiClient.js";

vi.mock("../../utils/cachedApiClient.js", () => ({
  cachedGet: vi.fn()
}));

vi.mock("../../config.js", () => ({
  getConfig: vi.fn(() => ({
    logLevel: "info",
    cacheEnabled: true,
    maxResultLimit: 1000,
    apiTimeout: 30000,
    baseURL: "https://public.tableau.com",
    cacheMaxEntries: 1000,
    cacheDefaultTTL: 300000,
    maxConcurrency: 3,
    batchDelayMs: 100,
  }))
}));

describe("getWorkbookContents", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookContentsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookContentsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_contents");
    expect(tool.description).toContain("structure");
    expect(tool.annotations?.title).toBe("Get Workbook Contents");
  });

  it("should fetch workbook contents successfully", async () => {
    const mockContents = {
      sheets: [
        { name: "Dashboard 1", type: "dashboard" },
        { name: "Sheet 1", type: "sheet" }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockContents);

    const result = await tool.callback({ workbookName: "TestWorkbook_12345" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Dashboard 1");
    expect(responseText).toContain("Sheet 1");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/workbook/TestWorkbook_12345"
    );
  });

  it("should include directUrl for each sheet when workbook context is available", async () => {
    const mockContents = {
      authorProfileName: "tableau.user",
      workbookRepoUrl: "SalesWorkbook_17164464702070",
      sheets: [
        {
          name: "Dashboard",
          type: "dashboard",
          sheetRepoUrl: "SalesWorkbook_17164464702070/sheets/Dashboard"
        },
        {
          name: "Summary",
          type: "sheet",
          sheetRepoUrl: "SalesWorkbook_17164464702070/sheets/Summary"
        }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockContents);

    const result = await tool.callback({ workbookName: "SalesWorkbook_17164464702070" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].type === 'text' ? value.content[0].text : '';
    const parsedResponse = JSON.parse(responseText);

    // Verify directUrl is present for each sheet
    expect(parsedResponse.sheets[0].directUrl).toBe(
      "https://public.tableau.com/app/profile/tableau.user/viz/SalesWorkbook_17164464702070/Dashboard"
    );
    expect(parsedResponse.sheets[1].directUrl).toBe(
      "https://public.tableau.com/app/profile/tableau.user/viz/SalesWorkbook_17164464702070/Summary"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/workbook/NonexistentWorkbook" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookName: "NonexistentWorkbook" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
