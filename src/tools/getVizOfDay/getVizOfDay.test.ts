/**
 * Tests for getVizOfDay tool
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { getVizOfDayTool } from "./getVizOfDay.js";
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

describe("getVizOfDay", () => {
  let server: Server;
  let tool: ReturnType<typeof getVizOfDayTool>;

  beforeEach(() => {
    server = new Server(
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    tool = getVizOfDayTool(server);
    vi.clearAllMocks();
  });

  it("should have correct metadata", () => {
    expect(tool.name).toBe("get_viz_of_day");
    expect(tool.description).toContain("Visualization of the Day");
    expect(tool.annotations?.title).toBe("Get Viz of the Day");
  });

  it("should fetch VOTD winners successfully", async () => {
    // API returns array directly, not { vizzes: [...] }
    const mockVotd = [
      { title: "Amazing Dashboard", authorDisplayName: "user1", curatedAt: "2024-01-01T00:00:00.000Z" },
      { title: "Beautiful Viz", authorDisplayName: "user2", curatedAt: "2024-01-02T00:00:00.000Z" }
    ];

    vi.mocked(cachedGet).mockResolvedValueOnce(mockVotd);

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(false);
    const responseText = value.content[0].text;
    expect(responseText).toContain("Amazing Dashboard");

    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
      { page: 0, limit: 12 }
    );
  });

  it("should support pagination", async () => {
    vi.mocked(cachedGet).mockResolvedValueOnce([]);

    await tool.callback({
      page: 2,
      limit: 10 // Should still use 12 since API requires it
    });

    // API always uses limit=12 regardless of requested limit
    expect(cachedGet).toHaveBeenCalledWith(
      "/public/apis/bff/discover/v1/vizzes/viz-of-the-day",
      { page: 2, limit: 12 }
    );
  });

  it("should handle errors", async () => {
    const error = {
      response: {
        status: 500,
        statusText: "Internal Server Error"
      },
      config: { url: "/public/apis/bff/discover/v1/vizzes/viz-of-the-day" },
      isAxiosError: true
    };

    vi.mocked(cachedGet).mockRejectedValueOnce(error);

    const result = await tool.callback({});

    expect(result.isOk()).toBe(true);
    const value = result.unwrap();
    expect(value.isError).toBe(true);
  });
});
