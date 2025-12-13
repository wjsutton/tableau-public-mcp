/**
 * Tests for searchVisualizations tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { searchVisualizationsTool } from "./searchVisualizations.js";
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

describe("searchVisualizations", () => {
  let server: Server;
  let tool: ReturnType<typeof searchVisualizationsTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = searchVisualizationsTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("search_visualizations");
    expect(tool.description).toContain("search");
    expect(tool.annotations?.title).toBe("Search Visualizations");
  });

  it("should search for vizzes successfully", async () => {
    const mockResults = {
      results: [
        { title: "COVID Dashboard", author: "user1", views: 1000 },
        { title: "COVID Analysis", author: "user2", views: 500 }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockResults);

    const result = await tool.callback({ query: "COVID" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("COVID Dashboard");

    expect(cachedGet).toHaveBeenCalledWith(
      "/api/search/query",
      {
        query: "COVID",
        type: "vizzes",
        count: 20,
        start: 0,
        language: "en-us"
      }
    );
  });

  it("should search for authors", async () => {
    const mockResults = {
      results: [
        { displayName: "Data Viz Expert", username: "dvexpert" }
      ]
    };

    vi.mocked(cachedGet).mockResolvedValueOnce(mockResults);

    await tool.callback({ query: "data viz", type: "authors" });

    expect(cachedGet).toHaveBeenCalledWith(
      "/api/search/query",
      {
        query: "data viz",
        type: "authors",
        count: 20,
        start: 0,
        language: "en-us"
      }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce({ results: [] });

    await tool.callback({
      query: "test",
      start: 20,
      count: 10
    });

    expect(cachedGet).toHaveBeenCalledWith(
      "/api/search/query",
      {
        query: "test",
        type: "vizzes",
        count: 10,
        start: 20,
        language: "en-us"
      }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 400,
        statusText: "Bad Request"
      },
      config: { url: "/api/search/query" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({ query: "test" });

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
