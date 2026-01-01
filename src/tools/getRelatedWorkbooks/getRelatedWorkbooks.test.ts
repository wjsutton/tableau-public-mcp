/**
 * Tests for getRelatedWorkbooks tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getRelatedWorkbooksTool } from "./getRelatedWorkbooks.js";
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

describe("getRelatedWorkbooks", () => {
  let server: Server;
  let tool: ReturnType<typeof getRelatedWorkbooksTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getRelatedWorkbooksTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_related_workbooks");
    expect(tool.description).toContain("related");
    expect(tool.annotations?.title).toBe("Get Related Workbooks");
  });

  it("should fetch related workbooks successfully", async () => {
    const mockRelated = [
      { title: "Similar Dashboard 1", author: "user1" },
      { title: "Similar Dashboard 2", author: "user2" }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockRelated);

    const result = await tool.callback({
      workbookUrl: "testuser/workbook",
      count: 2
    });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Similar Dashboard 1");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/workbooks/v2/testuser/workbook/recommended-workbooks",
      { count: 2 }
    );
  });

  it("should use default count parameter", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce([]);

    await tool.callback({ workbookUrl: "testuser/workbook" });

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/workbooks/v2/testuser/workbook/recommended-workbooks",
      { count: 10 }
    );
  });

  it("should include directUrl in related workbooks", async () => {
    const mockRelated = [
      {
        title: "Related Sales Dashboard",
        authorProfileName: "tableau.user",
        workbookRepoUrl: "SalesDashboard_17164464702070",
        defaultViewRepoUrl: "SalesDashboard_17164464702070/sheets/Dashboard"
      }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockRelated);

    const result = await tool.callback({ workbookUrl: "testuser/workbook" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].type === 'text' ? value.content[0].text : '';
    const parsedResponse = JSON.parse(responseText);

    // Verify directUrl is present and correctly formatted
    expect(parsedResponse[0].directUrl).toBe(
      "https://public.tableau.com/app/profile/tableau.user/viz/SalesDashboard_17164464702070/Dashboard"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/public/apis/bff/workbooks/v2/testuser/nonexistent/recommended-workbooks" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ workbookUrl: "testuser/nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
