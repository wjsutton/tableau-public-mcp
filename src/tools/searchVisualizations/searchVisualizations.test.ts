/**
 * Tests for searchVisualizations tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { searchVisualizationsTool } from "./searchVisualizations.js";
import { apiClient } from "../../utils/apiClient.js";

vi.mock("../../utils/apiClient.js", () => ({
  apiClient: {
    get: vi.fn()
  }
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

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockResults,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    const result = await tool.callback({ query: "COVID" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(false);
      const responseText = result.value.content[0].text;
      expect(responseText).toContain("COVID Dashboard");
    }

    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/search/query",
      {
        params: {
          query: "COVID",
          type: "vizzes",
          count: 20,
          start: 0,
          language: "en-us"
        }
      }
    );
  });

  it("should search for authors", async () => {
    const mockResults = {
      results: [
        { displayName: "Data Viz Expert", username: "dvexpert" }
      ]
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockResults,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({ query: "data viz", type: "authors" });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/search/query",
      {
        params: {
          query: "data viz",
          type: "authors",
          count: 20,
          start: 0,
          language: "en-us"
        }
      }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { results: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any
    });

    await tool.callback({
      query: "test",
      start: 20,
      count: 10
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/search/query",
      {
        params: {
          query: "test",
          type: "vizzes",
          count: 10,
          start: 20,
          language: "en-us"
        }
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

    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const result = await tool.callback({ query: "test" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isError).toBe(true);
    }
  });
});
