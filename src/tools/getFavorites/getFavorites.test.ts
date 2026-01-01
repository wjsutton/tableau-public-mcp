/**
 * Tests for getFavorites tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getFavoritesTool } from "./getFavorites.js";
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

describe("getFavorites", () => {
  let server: Server;
  let tool: ReturnType<typeof getFavoritesTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getFavoritesTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_favorites");
    expect(tool.description).toContain("favorited");
    expect(tool.annotations?.title).toBe("Get Favorites");
  });

  it("should fetch favorites successfully", async () => {
    const mockFavorites = [
      "user1/dashboard-1",
      "user2/dashboard-2",
      "user3/dashboard-3"
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockFavorites);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("user1/dashboard-1");
    expect(responseText).toContain("user2/dashboard-2");

    expect(cachedGet).toHaveBeenCalledWith(
      "/profile/api/favorite/testuser/workbook"
    );
  });

  it("should handle empty favorites list", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce([]);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
  });

  it("should include directUrl when favorites are objects with required fields", async () => {
    const mockFavorites = [
      {
        title: "Favorited Dashboard",
        authorProfileName: "tableau.user",
        workbookRepoUrl: "Dashboard_17164464702070",
        defaultViewRepoUrl: "Dashboard_17164464702070/sheets/Main"
      }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockFavorites);

    const result = await tool.callback({ username: "testuser" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    const responseText = value.content[0].type === 'text' ? value.content[0].text : '';
    const parsedResponse = JSON.parse(responseText);

    // Verify directUrl is present and correctly formatted
    expect(parsedResponse[0].directUrl).toBe(
      "https://public.tableau.com/app/profile/tableau.user/viz/Dashboard_17164464702070/Main"
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 404,
        statusText: "Not Found"
      },
      config: { url: "/profile/api/favorite/nonexistent/workbook" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ username: "nonexistent" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
