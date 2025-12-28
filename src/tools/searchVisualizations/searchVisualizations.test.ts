/**
 * Tests for searchVisualizations tool
 *
 * Tests the search functionality against the Tableau Public BFF API.
 * The API endpoint is: /public/apis/bff/v1/search/query-workbooks
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

/**
 * Mock response matching the actual Tableau Public BFF API structure
 */
function createMockSearchResponse(workbooks: Array<{
  authorProfileName: string;
  authorDisplayName: string;
  title: string;
  description?: string;
  workbookRepoUrl: string;
  defaultViewRepoUrl: string;
  viewCount: number;
  numberOfFavorites: number;
}>) {
  return {
    results: workbooks.map(wb => ({
      type: "WORKBOOKS",
      workbook: {
        authorProfileName: wb.authorProfileName,
        authorDisplayName: wb.authorDisplayName,
        title: wb.title,
        description: wb.description || "",
        workbookRepoUrl: wb.workbookRepoUrl,
        defaultViewRepoUrl: wb.defaultViewRepoUrl,
        showInProfile: true,
        viewCount: wb.viewCount,
        numberOfFavorites: wb.numberOfFavorites,
        reactionCounts: {
          FAVORITE: wb.numberOfFavorites,
          LOVE: 0,
          SAD: 0,
          NOMINATE: 0,
          INSIGHTFUL: 0
        }
      }
    })),
    totalHits: workbooks.length,
    facets: {
      entityType: {
        WORKBOOKS: workbooks.length
      }
    }
  };
}

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

  describe("tool metadata", () => {
    it("should have correct name and description", () => {
      expect(tool.name).toBe("search_visualizations");
      expect(tool.description).toContain("search");
      expect(tool.description).toContain("Tableau Public");
    });

    it("should have correct annotations", () => {
      expect(tool.annotations?.title).toBe("Search Visualizations");
    });
  });

  describe("searching for visualizations (vizzes)", () => {
    it("should search and return workbook results with correct structure", async () => {
      const mockResponse = createMockSearchResponse([
        {
          authorProfileName: "tableau.user",
          authorDisplayName: "Tableau User",
          title: "COVID-19 Dashboard",
          description: "Interactive COVID-19 tracking dashboard",
          workbookRepoUrl: "tableau.user/COVID-19Dashboard",
          defaultViewRepoUrl: "tableau.user/COVID-19Dashboard/Overview",
          viewCount: 15000,
          numberOfFavorites: 250
        },
        {
          authorProfileName: "data.analyst",
          authorDisplayName: "Data Analyst",
          title: "COVID Analysis by Region",
          description: "Regional breakdown of COVID cases",
          workbookRepoUrl: "data.analyst/COVIDAnalysis",
          defaultViewRepoUrl: "data.analyst/COVIDAnalysis/RegionalView",
          viewCount: 8500,
          numberOfFavorites: 120
        }
      ]);

      vi.mocked(cachedGet).mockResolvedValueOnce(mockResponse);

      const result = await tool.callback({ query: "COVID" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(false);

      // Verify response contains workbook data
      const responseText = value.content[0].text;
      expect(responseText).toContain("COVID-19 Dashboard");
      expect(responseText).toContain("COVID Analysis by Region");

      // Verify correct API endpoint and parameters
      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        {
          query: "COVID",
          type: "vizzes",
          count: 20,
          start: 0,
          language: "en-us"
        }
      );
    });

    it("should handle empty search results", async () => {
      const mockResponse = createMockSearchResponse([]);

      vi.mocked(cachedGet).mockResolvedValueOnce(mockResponse);

      const result = await tool.callback({ query: "xyznonexistent123" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(false);

      // Response should indicate no results
      const responseText = value.content[0].text;
      expect(responseText).toContain("[]"); // Empty results array
    });
  });

  describe("searching for authors", () => {
    it("should search for authors with correct type parameter", async () => {
      const mockResponse = {
        results: [
          {
            type: "AUTHORS",
            author: {
              profileName: "dataviz.expert",
              displayName: "Data Viz Expert",
              bio: "Tableau Public Ambassador",
              followerCount: 5000,
              workbookCount: 45
            }
          }
        ],
        totalHits: 1,
        facets: {
          entityType: {
            AUTHORS: 1
          }
        }
      };

      vi.mocked(cachedGet).mockResolvedValueOnce(mockResponse);

      const result = await tool.callback({ query: "data visualization", type: "authors" });

      expect(result.isOk()).toBe(true);

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        {
          query: "data visualization",
          type: "authors",
          count: 20,
          start: 0,
          language: "en-us"
        }
      );
    });
  });

  describe("pagination", () => {
    it("should support custom start index for pagination", async () => {
      vi.mocked(cachedGet).mockResolvedValueOnce(createMockSearchResponse([]));

      await tool.callback({
        query: "sales",
        start: 40
      });

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        expect.objectContaining({
          query: "sales",
          start: 40,
          count: 20 // default count
        })
      );
    });

    it("should support custom count parameter", async () => {
      vi.mocked(cachedGet).mockResolvedValueOnce(createMockSearchResponse([]));

      await tool.callback({
        query: "finance",
        count: 50
      });

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        expect.objectContaining({
          query: "finance",
          count: 50,
          start: 0 // default start
        })
      );
    });

    it("should support both start and count for full pagination control", async () => {
      vi.mocked(cachedGet).mockResolvedValueOnce(createMockSearchResponse([]));

      await tool.callback({
        query: "healthcare",
        start: 100,
        count: 25
      });

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        {
          query: "healthcare",
          type: "vizzes",
          count: 25,
          start: 100,
          language: "en-us"
        }
      );
    });
  });

  describe("language support", () => {
    it("should use default language (en-us) when not specified", async () => {
      vi.mocked(cachedGet).mockResolvedValueOnce(createMockSearchResponse([]));

      await tool.callback({ query: "test" });

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        expect.objectContaining({
          language: "en-us"
        })
      );
    });

    it("should support custom language parameter", async () => {
      vi.mocked(cachedGet).mockResolvedValueOnce(createMockSearchResponse([]));

      await tool.callback({
        query: "ventas",
        language: "es-es"
      });

      expect(cachedGet).toHaveBeenCalledWith(
        "/public/apis/bff/v1/search/query-workbooks",
        expect.objectContaining({
          query: "ventas",
          language: "es-es"
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle 400 Bad Request errors", async () => {
      const error = {
        response: {
          status: 400,
          statusText: "Bad Request"
        },
        config: { url: "/public/apis/bff/v1/search/query-workbooks" },
        isAxiosError: true
      };

      vi.mocked(cachedGet).mockRejectedValueOnce(error);

      const result = await tool.callback({ query: "test" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(true);
    });

    it("should handle 404 Not Found errors", async () => {
      const error = {
        response: {
          status: 404,
          statusText: "Not Found"
        },
        config: { url: "/public/apis/bff/v1/search/query-workbooks" },
        isAxiosError: true
      };

      vi.mocked(cachedGet).mockRejectedValueOnce(error);

      const result = await tool.callback({ query: "test" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(true);
    });

    it("should handle 500 Server errors", async () => {
      const error = {
        response: {
          status: 500,
          statusText: "Internal Server Error"
        },
        config: { url: "/public/apis/bff/v1/search/query-workbooks" },
        isAxiosError: true
      };

      vi.mocked(cachedGet).mockRejectedValueOnce(error);

      const result = await tool.callback({ query: "test" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(true);
    });

    it("should handle network/timeout errors", async () => {
      const error = {
        code: "ECONNABORTED",
        message: "timeout of 30000ms exceeded",
        isAxiosError: true
      };

      vi.mocked(cachedGet).mockRejectedValueOnce(error);

      const result = await tool.callback({ query: "test" });

      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.isError).toBe(true);
    });
  });
});
