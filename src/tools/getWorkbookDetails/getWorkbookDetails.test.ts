
/**
 * Tests for getWorkbookDetails tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getWorkbookDetailsTool } from "./getWorkbookDetails.js";
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

describe("getWorkbookDetails", () => {
  let server: Server;
  let tool: ReturnType<typeof getWorkbookDetailsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getWorkbookDetailsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_workbook_details");
    expect(tool.description).toContain("detailed metadata");
    expect(tool.annotations?.title).toBe("Get Workbook Details");
  });

  it("should fetch workbook details successfully", async () => {
    const mockDetails = {
      title: "Sales Dashboard",
      description: "A comprehensive sales analysis",
      views: ["Dashboard", "Summary"],
      author: "testuser"
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockDetails);

    const result = await tool.callback({ workbookName: "SalesDashboard_12345" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Sales Dashboard");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/single_workbook/SalesDashboard_12345"
    );
  });

  it("should include directUrl in workbook details", async () => {
    const mockDetails = {
      title: "Marketing Dashboard",
      authorProfileName: "tableau.user",
      workbookRepoUrl: "MarketingDashboard_17164464702070",
      defaultViewRepoUrl: "MarketingDashboard_17164464702070/sheets/Overview",
      description: "Marketing performance analysis"
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockDetails);

    const result = await tool.callback({ workbookName: "MarketingDashboard_17164464702070" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].type === 'text' ? value.content[0].text : '';
    const parsedResponse = JSON.parse(responseText);

    // Verify directUrl is present and correctly formatted
    expect(parsedResponse.directUrl).toBe(
      "https://public.tableau.com/app/profile/tableau.user/viz/MarketingDashboard_17164464702070/Overview"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/single_workbook/NonexistentWorkbook" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookName: "NonexistentWorkbook" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
